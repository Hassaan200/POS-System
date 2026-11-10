import { Router } from 'express';
import { z } from 'zod';
import {
  asyncHandler, dateSchema, idSchema, idempotencySchema, optionalText, positiveMoneySchema, validate,
} from '../utils/http.js';
import { badRequest } from '../utils/errors.js';
import { createClearing, listClearing, voidClearing } from '../services/clearing.js';

const withKey = (req, res, next) => {
  const key = req.get('Idempotency-Key');
  if (!key) return next(badRequest('Idempotency-Key header is required'));
  req.body = { ...req.body, idempotency_key: key };
  next();
};

const listQuery = z.object({ from: dateSchema.optional(), to: dateSchema.optional() });

const clearingSchema = z.object({
  payment_date: dateSchema,
  agent_name: optionalText(120),
  description: optionalText(),
  amount: positiveMoneySchema,
  idempotency_key: idempotencySchema,
});

export const clearingRouter = Router();

clearingRouter.get('/', asyncHandler(async (req, res) => res.json(await listClearing(listQuery.parse(req.query)))));

clearingRouter.post('/', withKey, validate(clearingSchema), asyncHandler(async (req, res) => {
  const { payment, duplicate } = await createClearing(req.body, req.user.id);
  res.status(duplicate ? 200 : 201).json({ ...payment, duplicate });
}));

clearingRouter.post('/:id/void', asyncHandler(async (req, res) => {
  await voidClearing(idSchema.parse(req.params.id), req.user.id);
  res.json({ ok: true });
}));