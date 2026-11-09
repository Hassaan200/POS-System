import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { asyncHandler, validate } from '../utils/http.js';
import { getSettings } from '../services/common.js';
import bcrypt from 'bcryptjs';
import { badRequest } from '../utils/errors.js';
import { checkStockIntegrity } from '../services/products.js';
import { resetBusinessData } from '../services/reset.js';

const router = Router();

const settingsSchema = z.object({
  shop_name: z.string().trim().min(1).max(100).optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  allow_oversell: z.boolean().optional(),
  cny_pkr_rate: z.coerce.number().min(0).max(100000).optional(),
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

const resetSchema = z.object({
  password: z.string().min(1),
  confirm: z.literal('DELETE ALL DATA', { errorMap: () => ({ message: 'Type DELETE ALL DATA to confirm' }) }),
});

router.post('/reset-data', validate(resetSchema), asyncHandler(async (req, res) => {
  const [[user]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) throw badRequest('Password is incorrect');
  await resetBusinessData(req.user.id);
  res.json({ ok: true });
}));

export default router;