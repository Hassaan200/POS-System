import { pool, withTransaction } from '../config/db.js';
import { conflict, notFound } from '../utils/errors.js';
import { audit, findByKey, isDuplicateKeyError } from './common.js';

const containerSql = `
  SELECT id, delivery_date, container_no, party_name, weight_kg, bales, status, created_at FROM containers`;

export async function listContainers({ from, to, search }) {
  const where = [];
  const params = [];
  if (from) { where.push('delivery_date >= ?'); params.push(from); }
  if (to) { where.push('delivery_date <= ?'); params.push(to); }
  if (search) { where.push('(container_no LIKE ? OR party_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  const [rows] = await pool.query(
    `${containerSql} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY delivery_date DESC, id DESC LIMIT 1000`,
    params
  );
  return rows;
}

async function getContainer(db, id) {
  const [[row]] = await db.query(`${containerSql} WHERE id = ?`, [id]);
  return row;
}

export async function createContainer(input, userId) {
  const existing = await findByKey(pool, 'containers', input.idempotency_key);
  if (existing) return { container: await getContainer(pool, existing), duplicate: true };
  try {
    const id = await withTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO containers (delivery_date, container_no, party_name, weight_kg, bales, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)`,
        [input.delivery_date, input.container_no, input.party_name, input.weight_kg, input.bales, input.idempotency_key ?? null]
      );
      await audit(conn, userId, 'create', 'container', result.insertId, input.container_no);
      return result.insertId;
    });
    return { container: await getContainer(pool, id), duplicate: false };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const existingId = await findByKey(pool, 'containers', input.idempotency_key);
      if (existingId) return { container: await getContainer(pool, existingId), duplicate: true };
    }
    throw err;
  }
}

export async function updateContainer(id, input, userId) {
  await withTransaction(async (conn) => {
    const [[row]] = await conn.query('SELECT * FROM containers WHERE id = ? FOR UPDATE', [id]);
    if (!row) throw notFound('Container not found');
    if (row.status === 'void') throw conflict('A voided container cannot be edited');
    await conn.query(
      'UPDATE containers SET delivery_date = ?, container_no = ?, party_name = ?, weight_kg = ?, bales = ? WHERE id = ?',
      [input.delivery_date, input.container_no, input.party_name, input.weight_kg, input.bales, id]
    );
    await audit(conn, userId, 'update', 'container', id, input.container_no);
  });
  return getContainer(pool, id);
}

export async function voidContainer(id, userId) {
  await withTransaction(async (conn) => {
    const [[row]] = await conn.query('SELECT * FROM containers WHERE id = ? FOR UPDATE', [id]);
    if (!row) throw notFound('Container not found');
    if (row.status === 'void') throw conflict('Container is already voided');
    await conn.query("UPDATE containers SET status = 'void' WHERE id = ?", [id]);
    await audit(conn, userId, 'void', 'container', id, row.container_no);
  });
}