import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, dateSchema, idSchema, idempotencySchema, validate } from '../utils/http.js';
import { badRequest } from '../utils/errors.js';
import { createContainer, listContainers, updateContainer, voidContainer } from '../services/containers.js';

const withKey = (req, res, next) => {
  const key = req.get('Idempotency-Key');
  if (!key) return next(badRequest('Idempotency-Key header is required'));
  req.body = { ...req.body, idempotency_key: key };
  next();
};

const listQuery = z.object({ from: dateSchema.optional(), to: dateSchema.optional(), search: z.string().max(60).optional() });

const containerFields = {
  delivery_date: dateSchema,
  container_no: z.string().trim().min(1, 'Enter the container number').max(40).transform((v) => v.toUpperCase()),
  party_name: z.string().trim().min(1, 'Enter the name').max(120),
  weight_kg: z.coerce.number().min(0).max(10000000).transform((v) => Math.round(v * 100) / 100),
  bales: z.coerce.number().int().min(0).max(100000),
};
const containerSchema = z.object({ ...containerFields, idempotency_key: idempotencySchema });
const containerUpdateSchema = z.object(containerFields);

export const containersRouter = Router();

containersRouter.get('/', asyncHandler(async (req, res) => res.json(await listContainers(listQuery.parse(req.query)))));

containersRouter.post('/', withKey, validate(containerSchema), asyncHandler(async (req, res) => {
  const { container, duplicate } = await createContainer(req.body, req.user.id);
  res.status(duplicate ? 200 : 201).json({ ...container, duplicate });
}));

containersRouter.put('/:id', validate(containerUpdateSchema), asyncHandler(async (req, res) => {
  res.json(await updateContainer(idSchema.parse(req.params.id), req.body, req.user.id));
}));

containersRouter.post('/:id/void', asyncHandler(async (req, res) => {
  await voidContainer(idSchema.parse(req.params.id), req.user.id);
  res.json({ ok: true });
}));