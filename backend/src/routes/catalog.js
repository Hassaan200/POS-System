import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { asyncHandler, idSchema, validate } from '../utils/http.js';
import { notFound } from '../utils/errors.js';

const router = Router();
const nameSchema = z.object({ name: z.string().trim().min(1).max(80) });

async function loadCatalog() {
  const [categories] = await pool.query('SELECT id, name FROM categories ORDER BY name');
  const [types] = await pool.query('SELECT id, category_id, name FROM fabric_types ORDER BY name');
  return categories.map((c) => ({ ...c, types: types.filter((t) => t.category_id === c.id) }));
}

router.get('/', asyncHandler(async (req, res) => res.json(await loadCatalog())));

router.post('/categories', validate(nameSchema), asyncHandler(async (req, res) => {
  await pool.query('INSERT INTO categories (name) VALUES (?)', [req.body.name]);
  res.status(201).json(await loadCatalog());
}));

router.post('/categories/:id/types', validate(nameSchema), asyncHandler(async (req, res) => {
  const categoryId = idSchema.parse(req.params.id);
  const [[category]] = await pool.query('SELECT id FROM categories WHERE id = ?', [categoryId]);
  if (!category) throw notFound('Category not found');
  await pool.query('INSERT INTO fabric_types (category_id, name) VALUES (?, ?)', [categoryId, req.body.name]);
  res.status(201).json(await loadCatalog());
}));

export default router;
