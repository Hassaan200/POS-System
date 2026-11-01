import { pool, withTransaction } from '../config/db.js';
import { r2 } from '../utils/money.js';
import { conflict, notFound } from '../utils/errors.js';
import { audit, findByKey, isDuplicateKeyError } from './common.js';
import { listSales } from './sales.js';

export const EXPENSE_CATEGORIES = ['food_tea', 'salary', 'advance', 'rent', 'utilities', 'transport', 'other'];

const expenseSql = `
  SELECT id, expense_date, category, description, amount, status, created_at FROM expenses`;

export async function listExpenses({ from, to, category }) {
  const where = [];
  const params = [];
  if (from) { where.push('expense_date >= ?'); params.push(from); }
  if (to) { where.push('expense_date <= ?'); params.push(to); }
  if (category) { where.push('category = ?'); params.push(category); }
  const [rows] = await pool.query(
    `${expenseSql} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY expense_date DESC, id DESC LIMIT 500`,
    params
  );
  return rows;
}

async function getExpense(db, id) {
  const [[row]] = await db.query(`${expenseSql} WHERE id = ?`, [id]);
  return row;
}

export async function createExpense(input, userId) {
  const existing = await findByKey(pool, 'expenses', input.idempotency_key);
  if (existing) return { expense: await getExpense(pool, existing), duplicate: true };

  try {
    const id = await withTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO expenses (expense_date, category, description, amount, idempotency_key) VALUES (?, ?, ?, ?, ?)`,
        [input.expense_date, input.category, input.description, input.amount, input.idempotency_key ?? null]
      );
      await audit(conn, userId, 'create', 'expense', result.insertId, `${input.category} ${input.amount}`);
      return result.insertId;
    });
    return { expense: await getExpense(pool, id), duplicate: false };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const existingId = await findByKey(pool, 'expenses', input.idempotency_key);
      if (existingId) return { expense: await getExpense(pool, existingId), duplicate: true };
    }
    throw err;
  }
}

export async function voidExpense(id, userId) {
  await withTransaction(async (conn) => {
    const [[expense]] = await conn.query('SELECT * FROM expenses WHERE id = ? FOR UPDATE', [id]);
    if (!expense) throw notFound('Expense not found');
    if (expense.status === 'void') throw conflict('Expense is already voided');
    await conn.query("UPDATE expenses SET status = 'void' WHERE id = ?", [id]);
    await audit(conn, userId, 'void', 'expense', id, `amount ${r2(expense.amount)}`);
  });
}

export async function expenseTotal(db, from, to) {
  const [[row]] = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM expenses
     WHERE status = 'active' AND expense_date BETWEEN ? AND ?`,
    [from, to]
  );
  return { total: r2(row.total), count: row.count };
}

export async function getDailyBook(date) {
  const sales = await listSales({ from: date, to: date, limit: 500 });
  const expenses = await listExpenses({ from: date, to: date });
  const [[cash]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM customer_payments WHERE payment_date = ? AND status = 'active'`,
    [date]
  );
  const salesTotal = r2(sales.filter((s) => s.status === 'active').reduce((sum, s) => sum + Number(s.total_amount), 0));
  const expensesTotal = r2(expenses.filter((e) => e.status === 'active').reduce((sum, e) => sum + Number(e.amount), 0));
  return {
    date,
    sales,
    expenses,
    totals: {
      sales: salesTotal,
      expenses: expensesTotal,
      balance: r2(salesTotal - expensesTotal),
      cash_received: r2(cash.total),
    },
  };
}