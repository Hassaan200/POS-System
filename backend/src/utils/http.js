import { z } from 'zod';

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const validate = (schema, source = 'body') => (req, res, next) => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) return next(parsed.error);
  req[source] = parsed.data;
  next();
};

const hasMax2Decimals = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

export const qtySchema = z.coerce
  .number({ invalid_type_error: 'Quantity must be a number' })
  .positive('Quantity must be greater than 0')
  .max(1000000)
  .refine(hasMax2Decimals, 'Quantity can have at most 2 decimals');

export const moneySchema = z.coerce
  .number({ invalid_type_error: 'Amount must be a number' })
  .min(0, 'Amount cannot be negative')
  .max(1000000000)
  .refine(hasMax2Decimals, 'Amount can have at most 2 decimals');

export const positiveMoneySchema = moneySchema.refine((v) => v > 0, 'Amount must be greater than 0');

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'Invalid date');

export const idSchema = z.coerce.number().int().positive();

export const idempotencySchema = z.string().min(8).max(64).optional();

export const optionalText = (max = 255) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
