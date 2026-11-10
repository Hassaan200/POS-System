import { pool, withTransaction } from '../config/db.js';
import { r2 } from '../utils/money.js';
import { conflict, notFound } from '../utils/errors.js';
import { audit, findByKey, isDuplicateKeyError } from './common.js';

const clearingSql = `
  SELECT id, payment_date, agent_name, description, amount, status, created_at FROM clearing_payments`;

export async function listClearing({ from, to }) {
  const where = [];
  const params = [];
  if (from) { where.push('payment_date >= ?'); params.push(from); }
  if (to) { where.push('payment_date <= ?'); params.push(to); }
  const [rows] = await pool.query(
    `${clearingSql} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY payment_date DESC, id DESC LIMIT 500`,
    params
  );
  return rows;
}

async function getClearing(db, id) {
  const [[row]] = await db.query(`${clearingSql} WHERE id = ?`, [id]);
  return row;
}

export async function createClearing(input, userId) {
  const existing = await findByKey(pool, 'clearing_payments', input.idempotency_key);
  if (existing) return { payment: await getClearing(pool, existing), duplicate: true };
  try {
    const id = await withTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO clearing_payments (payment_date, agent_name, description, amount, idempotency_key) VALUES (?, ?, ?, ?, ?)`,
        [input.payment_date, input.agent_name ?? null, input.description ?? null, input.amount, input.idempotency_key ?? null]
      );
      await audit(conn, userId, 'create', 'clearing_payment', result.insertId, `amount ${input.amount}`);
      return result.insertId;
    });
    return { payment: await getClearing(pool, id), duplicate: false };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const existingId = await findByKey(pool, 'clearing_payments', input.idempotency_key);
      if (existingId) return { payment: await getClearing(pool, existingId), duplicate: true };
    }
    throw err;
  }
}

export async function voidClearing(id, userId) {
  await withTransaction(async (conn) => {
    const [[row]] = await conn.query('SELECT * FROM clearing_payments WHERE id = ? FOR UPDATE', [id]);
    if (!row) throw notFound('Clearing payment not found');
    if (row.status === 'void') throw conflict('Clearing payment is already voided');
    await conn.query("UPDATE clearing_payments SET status = 'void' WHERE id = ?", [id]);
    await audit(conn, userId, 'void', 'clearing_payment', id, `amount ${r2(row.amount)}`);
  });
}

export async function clearingTotal(db, from, to) {
  const [[row]] = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM clearing_payments
     WHERE status = 'active' AND payment_date BETWEEN ? AND ?`,
    [from, to]
  );
  return r2(row.total);
}