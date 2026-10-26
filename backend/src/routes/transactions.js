import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import {
  asyncHandler, dateSchema, idSchema, idempotencySchema, moneySchema, optionalText, positiveMoneySchema, qtySchema, validate,
} from '../utils/http.js';
import { badRequest } from '../utils/errors.js';
import { cancelPurchase, createPurchase, getPurchase, listPurchases } from '../services/purchases.js';
import { cancelSale, createSale, getSale, listSales } from '../services/sales.js';
import {
  createCustomerPayment, createSupplierPayment, listCustomerPayments, listSupplierPayments, voidPayment,
} from '../services/payments.js';

const withKey = (req, res, next) => {
  const key = req.get('Idempotency-Key');
  if (!key) return next(badRequest('Idempotency-Key header is required'));
  req.body = { ...req.body, idempotency_key: key };
  next();
};

const listQuery = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  supplier_id: idSchema.optional(),
  customer_id: idSchema.optional(),
  party_id: idSchema.optional(),
  search: z.string().max(60).optional(),
});

const lineSchema = z.object({ product_id: idSchema, quantity: qtySchema, rate: moneySchema });

const purchaseSchema = z.object({
  purchase_date: dateSchema,
  supplier_id: idSchema,
  lines: z.array(lineSchema).min(1, 'Add at least one fabric line').max(50),
  paid_amount: moneySchema.default(0),
  notes: optionalText(),
  idempotency_key: idempotencySchema,
});

const saleSchema = z.object({
  sale_date: dateSchema,
  customer_id: idSchema.nullable().optional(),
  lines: z.array(lineSchema).min(1, 'Add at least one fabric line').max(50),
  discount: moneySchema.default(0),
  received_amount: moneySchema.default(0),
  notes: optionalText(),
  idempotency_key: idempotencySchema,
});

const customerPaymentSchema = z.object({
  customer_id: idSchema,
  sale_id: idSchema.nullable().optional(),
  payment_date: dateSchema,
  amount: positiveMoneySchema,
  notes: optionalText(),
  idempotency_key: idempotencySchema,
});

const supplierPaymentSchema = z.object({
  supplier_id: idSchema,
  purchase_id: idSchema.nullable().optional(),
  payment_date: dateSchema,
  amount: positiveMoneySchema,
  notes: optionalText(),
  idempotency_key: idempotencySchema,
});

export const purchasesRouter = Router();
purchasesRouter.get('/', asyncHandler(async (req, res) => res.json(await listPurchases(listQuery.parse(req.query)))));
purchasesRouter.get('/:id', asyncHandler(async (req, res) => res.json(await getPurchase(pool, idSchema.parse(req.params.id)))));
purchasesRouter.post('/', withKey, validate(purchaseSchema), asyncHandler(async (req, res) => {
  const { purchase, duplicate } = await createPurchase(req.body, req.user.id);
  res.status(duplicate ? 200 : 201).json({ ...purchase, duplicate });
}));
purchasesRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  res.json(await cancelPurchase(idSchema.parse(req.params.id), req.user.id));
}));

export const salesRouter = Router();
salesRouter.get('/', asyncHandler(async (req, res) => res.json(await listSales(listQuery.parse(req.query)))));
salesRouter.get('/:id', asyncHandler(async (req, res) => res.json(await getSale(pool, idSchema.parse(req.params.id)))));
salesRouter.post('/', withKey, validate(saleSchema), asyncHandler(async (req, res) => {
  const { sale, duplicate } = await createSale(req.body, req.user.id);
  res.status(duplicate ? 200 : 201).json({ ...sale, duplicate });
}));
salesRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  res.json(await cancelSale(idSchema.parse(req.params.id), req.user.id));
}));

export const paymentsRouter = Router();
paymentsRouter.get('/customer', asyncHandler(async (req, res) => {
  const q = listQuery.parse(req.query);
  res.json(await listCustomerPayments({ ...q, party_id: q.party_id ?? q.customer_id }));
}));
paymentsRouter.get('/supplier', asyncHandler(async (req, res) => {
  const q = listQuery.parse(req.query);
  res.json(await listSupplierPayments({ ...q, party_id: q.party_id ?? q.supplier_id }));
}));
paymentsRouter.post('/customer', withKey, validate(customerPaymentSchema), asyncHandler(async (req, res) => {
  const result = await createCustomerPayment(req.body, req.user.id);
  res.status(result.duplicate ? 200 : 201).json(result);
}));
paymentsRouter.post('/supplier', withKey, validate(supplierPaymentSchema), asyncHandler(async (req, res) => {
  const result = await createSupplierPayment(req.body, req.user.id);
  res.status(result.duplicate ? 200 : 201).json(result);
}));
paymentsRouter.post('/:kind/:id/void', asyncHandler(async (req, res) => {
  const kind = z.enum(['customer', 'supplier']).parse(req.params.kind);
  await voidPayment(kind, idSchema.parse(req.params.id), req.user.id);
  res.json({ ok: true });
}));
