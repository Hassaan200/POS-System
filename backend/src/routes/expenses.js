import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, dateSchema, idSchema, idempotencySchema, positiveMoneySchema, validate } from '../utils/http.js';
import { badRequest } from '../utils/errors.js';
import {
  EXPENSE_CATEGORIES, createExpense, getDailyBook, listExpenses, voidExpense,
} from '../services/expenses.js';

const withKey = (req, res, next) => {
  const key = req.get('Idempotency-Key');
  if (!key) return next(badRequest('Idempotency-Key header is required'));
  req.body = { ...req.body, idempotency_key: key };
  next();
};

const categorySchema = z.enum(EXPENSE_CATEGORIES);

const listQuery = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  category: categorySchema.optional(),
});

const expenseSchema = z.object({
  expense_date: dateSchema,
  category: categorySchema,
  description: z.string().trim().min(1, 'Write what the money was spent on').max(255),
  amount: positiveMoneySchema,
  idempotency_key: idempotencySchema,
});

export const expensesRouter = Router();

expensesRouter.get('/', asyncHandler(async (req, res) => res.json(await listExpenses(listQuery.parse(req.query)))));

expensesRouter.get('/daily-book', asyncHandler(async (req, res) => {
  const { date } = z.object({ date: dateSchema }).parse(req.query);
  res.json(await getDailyBook(date));
}));

expensesRouter.post('/', withKey, validate(expenseSchema), asyncHandler(async (req, res) => {
  const { expense, duplicate } = await createExpense(req.body, req.user.id);
  res.status(duplicate ? 200 : 201).json({ ...expense, duplicate });
}));

expensesRouter.post('/:id/void', asyncHandler(async (req, res) => {
  await voidExpense(idSchema.parse(req.params.id), req.user.id);
  res.json({ ok: true });
}));