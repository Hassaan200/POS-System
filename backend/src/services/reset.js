import { pool } from '../config/db.js';
import { audit } from './common.js';

const TABLES = [
  'purchase_cost_shares', 'purchase_costs', 'purchase_line_pieces', 'purchase_lines', 'purchases',
  'sale_lines', 'sales', 'customer_payments', 'supplier_payments', 'stock_movements', 'expenses',
  'products', 'suppliers', 'customers', 'audit_log',
];

export async function resetBusinessData(userId) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.beginTransaction();
    for (const table of TABLES) await conn.query(`DELETE FROM ${table}`);
    await conn.query('UPDATE sequences SET value = 0');
    await audit(conn, userId, 'reset', 'system', 0, 'All business data cleared');
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    conn.release();
  }
}