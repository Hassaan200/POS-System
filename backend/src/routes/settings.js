import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { asyncHandler, validate } from '../utils/http.js';
import { getSettings } from '../services/common.js';
import { checkStockIntegrity } from '../services/products.js';

const router = Router();

const settingsSchema = z.object({
  shop_name: z.string().trim().min(1).max(100).optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  allow_oversell: z.boolean().optional(),
  timezone: z.string().trim().refine((tz) => {
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
  }, 'Invalid timezone').optional(),
});

router.get('/', asyncHandler(async (req, res) => res.json(await getSettings())));

router.put('/', validate(settingsSchema), asyncHandler(async (req, res) => {
  const updates = Object.entries(req.body).map(([key, value]) => [key, typeof value === 'boolean' ? (value ? '1' : '0') : value]);
  for (const [key, value] of updates) {
    await pool.query(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [key, value]
    );
  }
  res.json(await getSettings());
}));

router.get('/integrity', asyncHandler(async (req, res) => {
  const problems = await checkStockIntegrity();
  res.json({ ok: problems.length === 0, problems });
}));

export default router;
