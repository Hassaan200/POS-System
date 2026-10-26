import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { asyncHandler, dateSchema, idSchema, moneySchema, validate } from '../utils/http.js';
import {
  customerStatement, getCustomer, getSupplier, listCustomers, listSuppliers, supplierStatement,
} from '../services/ledger.js';
import { audit } from '../services/common.js';

const partySchema = z.object({
  name: z.string().trim().min(1).max(150),
  mobile: z.string().trim().max(30).optional().nullable().transform((v) => v || null),
  opening_balance: moneySchema.default(0),
});
const partyUpdateSchema = partySchema.partial().extend({ is_active: z.boolean().optional() });
const statementQuery = z.object({ from: dateSchema.optional(), to: dateSchema.optional() });

function buildRouter({ table, list, get, statement }) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    res.json(await list(pool, req.query.search));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    res.json(await get(pool, idSchema.parse(req.params.id)));
  }));

  router.get('/:id/statement', asyncHandler(async (req, res) => {
    const query = statementQuery.parse(req.query);
    res.json(await statement(pool, idSchema.parse(req.params.id), query));
  }));

  router.post('/', validate(partySchema), asyncHandler(async (req, res) => {
    const { name, mobile, opening_balance: opening } = req.body;
    const [result] = await pool.query(
      `INSERT INTO ${table} (name, mobile, opening_balance) VALUES (?, ?, ?)`, [name, mobile, opening]
    );
    await audit(pool, req.user.id, 'create', table, result.insertId, name);
    res.status(201).json(await get(pool, result.insertId));
  }));

  router.put('/:id', validate(partyUpdateSchema), asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const current = await get(pool, id);
    const next = {
      name: req.body.name ?? current.name,
      mobile: req.body.mobile === undefined ? current.mobile : req.body.mobile,
      opening_balance: req.body.opening_balance ?? current.opening_balance,
      is_active: req.body.is_active === undefined ? current.is_active : req.body.is_active ? 1 : 0,
    };
    await pool.query(
      `UPDATE ${table} SET name = ?, mobile = ?, opening_balance = ?, is_active = ? WHERE id = ?`,
      [next.name, next.mobile, next.opening_balance, next.is_active, id]
    );
    await audit(pool, req.user.id, 'update', table, id, next.name);
    res.json(await get(pool, id));
  }));

  return router;
}

export const customersRouter = buildRouter({
  table: 'customers', list: listCustomers, get: getCustomer, statement: customerStatement,
});
export const suppliersRouter = buildRouter({
  table: 'suppliers', list: listSuppliers, get: getSupplier, statement: supplierStatement,
});
