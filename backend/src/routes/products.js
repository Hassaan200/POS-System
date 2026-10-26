import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { asyncHandler, idSchema, moneySchema, validate } from '../utils/http.js';
import { createProduct, getProduct, listProducts, updateProduct } from '../services/products.js';

const router = Router();

const baseShape = {
  name: z.string().trim().min(1).max(150),
  code: z.string().trim().min(1).max(50),
  category_id: idSchema,
  fabric_type_id: idSchema.nullable().optional(),
  opening_stock: moneySchema.default(0),
  purchase_cost: moneySchema.default(0),
  selling_rate: moneySchema.default(0),
};

const createSchema = z.object(baseShape);
const updateSchema = z.object({
  ...Object.fromEntries(Object.entries(baseShape).map(([k, v]) => [k, v.optional()])),
  opening_stock: moneySchema.optional(),
  purchase_cost: moneySchema.optional(),
  selling_rate: moneySchema.optional(),
  is_active: z.boolean().optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const { search, category_id, active } = req.query;
  res.json(await listProducts({
    search,
    category_id: category_id ? Number(category_id) : undefined,
    active: active === undefined ? undefined : active === 'true',
  }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getProduct(pool, idSchema.parse(req.params.id)));
}));

router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await createProduct(req.body, req.user.id));
}));

router.put('/:id', validate(updateSchema), asyncHandler(async (req, res) => {
  res.json(await updateProduct(idSchema.parse(req.params.id), req.body, req.user.id));
}));

export default router;
