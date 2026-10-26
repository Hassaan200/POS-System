import { pool } from '../config/db.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';

export async function getSettings(db = pool) {
  const [rows] = await db.query('SELECT setting_key, setting_value FROM settings');
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  return {
    shop_name: map.shop_name,
    currency: map.currency,
    timezone: map.timezone,
    allow_oversell: map.allow_oversell === '1',
  };
}

export async function nextRef(conn, name, prefix) {
  await conn.query('UPDATE sequences SET value = LAST_INSERT_ID(value + 1) WHERE name = ?', [name]);
  const [[row]] = await conn.query('SELECT LAST_INSERT_ID() AS n');
  return `${prefix}-${String(row.n).padStart(5, '0')}`;
}

export async function audit(conn, userId, action, entity, entityId, details = null) {
  await conn.query(
    'INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [userId ?? null, action, entity, entityId ?? null, details ? String(details).slice(0, 500) : null]
  );
}

export async function lockProducts(conn, ids) {
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  const map = new Map();
  for (const id of unique) {
    const [[product]] = await conn.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [id]);
    if (!product) throw notFound(`Product ${id} not found`);
    map.set(id, product);
  }
  return map;
}

export async function lockParty(conn, table, id, label) {
  const [[row]] = await conn.query(`SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
  if (!row) throw notFound(`${label} not found`);
  if (!row.is_active) throw badRequest(`${label} is inactive`);
  return row;
}

export async function findByKey(conn, table, key) {
  if (!key) return null;
  const [[row]] = await conn.query(`SELECT id FROM ${table} WHERE idempotency_key = ?`, [key]);
  return row ? row.id : null;
}

export function isDuplicateKeyError(err) {
  return err && err.code === 'ER_DUP_ENTRY' && /idempotency_key/.test(err.message);
}

export function insufficient(product, available) {
  return conflict(`Not enough stock for ${product.name}: available ${available} yards`);
}
