import { pool, withTransaction } from '../config/db.js';
import { r2 } from '../utils/money.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import {
  audit, findByKey, getSettings, insufficient, isDuplicateKeyError, lockParty, lockProducts, nextRef,
} from './common.js';

export async function getPurchase(db, id) {
  const [[purchase]] = await db.query(
    `SELECT p.*, s.name AS supplier_name,
       (SELECT COALESCE(SUM(amount), 0) FROM supplier_payments WHERE purchase_id = p.id AND status = 'active') AS paid_amount
     FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`,
    [id]
  );
  if (!purchase) throw notFound('Purchase not found');
  const [lines] = await db.query(
    `SELECT pl.*, pr.name AS product_name, pr.code AS product_code
     FROM purchase_lines pl JOIN products pr ON pr.id = pl.product_id WHERE pl.purchase_id = ? ORDER BY pl.id`,
    [id]
  );
  return { ...purchase, remaining_amount: r2(purchase.total_amount - purchase.paid_amount), lines };
}

export async function listPurchases({ from, to, supplier_id, limit = 200 }) {
  const where = [];
  const params = [];
  if (from) { where.push('p.purchase_date >= ?'); params.push(from); }
  if (to) { where.push('p.purchase_date <= ?'); params.push(to); }
  if (supplier_id) { where.push('p.supplier_id = ?'); params.push(supplier_id); }
  const [rows] = await pool.query(
    `SELECT p.id, p.ref, p.purchase_date, p.supplier_id, s.name AS supplier_name, p.total_amount, p.status, p.notes,
       (SELECT COALESCE(SUM(amount), 0) FROM supplier_payments WHERE purchase_id = p.id AND status = 'active') AS paid_amount,
       (SELECT GROUP_CONCAT(CONCAT(pr.name, ' (', pl.quantity, ' yd)') SEPARATOR ', ')
          FROM purchase_lines pl JOIN products pr ON pr.id = pl.product_id WHERE pl.purchase_id = p.id) AS items
     FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY p.purchase_date DESC, p.id DESC LIMIT ?`,
    [...params, Number(limit)]
  );
  return rows.map((r) => ({ ...r, remaining_amount: r2(r.total_amount - r.paid_amount) }));
}

export async function createPurchase(input, userId) {
  const existing = await findByKey(pool, 'purchases', input.idempotency_key);
  if (existing) return { purchase: await getPurchase(pool, existing), duplicate: true };

  try {
    const id = await withTransaction(async (conn) => {
      await lockParty(conn, 'suppliers', input.supplier_id, 'Supplier');
      const products = await lockProducts(conn, input.lines.map((l) => l.product_id));
      for (const product of products.values()) {
        if (!product.is_active) throw badRequest(`${product.name} is inactive`);
      }

      const lines = input.lines.map((l) => ({ ...l, line_total: r2(l.quantity * l.rate) }));
      const total = r2(lines.reduce((sum, l) => sum + l.line_total, 0));
      if (input.paid_amount > total) throw badRequest('Amount paid cannot be more than the total purchase amount');

      const ref = await nextRef(conn, 'purchase', 'PU');
      const [result] = await conn.query(
        `INSERT INTO purchases (ref, purchase_date, supplier_id, total_amount, notes, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [ref, input.purchase_date, input.supplier_id, total, input.notes ?? null, input.idempotency_key ?? null]
      );
      const purchaseId = result.insertId;

      for (const line of lines) {
        await conn.query(
          'INSERT INTO purchase_lines (purchase_id, product_id, quantity, rate, line_total) VALUES (?, ?, ?, ?, ?)',
          [purchaseId, line.product_id, line.quantity, line.rate, line.line_total]
        );
        await conn.query(
          `UPDATE products SET stock_qty = stock_qty + ?, stock_value = stock_value + ?,
             purchased_qty = purchased_qty + ?, purchase_cost = ? WHERE id = ?`,
          [line.quantity, line.line_total, line.quantity, line.rate, line.product_id]
        );
        await conn.query(
          `INSERT INTO stock_movements (product_id, movement_type, quantity, value_change, ref_type, ref_id, movement_date)
           VALUES (?, 'purchase', ?, ?, 'purchase', ?, ?)`,
          [line.product_id, line.quantity, line.line_total, purchaseId, input.purchase_date]
        );
      }

      if (input.paid_amount > 0) {
        await conn.query(
          `INSERT INTO supplier_payments (supplier_id, purchase_id, payment_date, amount, notes)
           VALUES (?, ?, ?, ?, 'Paid at purchase')`,
          [input.supplier_id, purchaseId, input.purchase_date, input.paid_amount]
        );
      }
      await audit(conn, userId, 'create', 'purchase', purchaseId, `${ref} total ${total} paid ${input.paid_amount}`);
      return purchaseId;
    });
    return { purchase: await getPurchase(pool, id), duplicate: false };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const existingId = await findByKey(pool, 'purchases', input.idempotency_key);
      if (existingId) return { purchase: await getPurchase(pool, existingId), duplicate: true };
    }
    throw err;
  }
}

export async function cancelPurchase(id, userId) {
  await withTransaction(async (conn) => {
    const [[purchase]] = await conn.query('SELECT * FROM purchases WHERE id = ? FOR UPDATE', [id]);
    if (!purchase) throw notFound('Purchase not found');
    if (purchase.status === 'cancelled') throw conflict('Purchase is already cancelled');

    const [lines] = await conn.query('SELECT * FROM purchase_lines WHERE purchase_id = ?', [id]);
    const products = await lockProducts(conn, lines.map((l) => l.product_id));
    const { allow_oversell: allowOversell } = await getSettings(conn);

    const remaining = new Map([...products.entries()].map(([pid, p]) => [pid, p.stock_qty]));
    for (const line of lines) {
      const product = products.get(line.product_id);
      const left = r2(remaining.get(line.product_id) - line.quantity);
      if (left < 0 && !allowOversell) throw insufficient(product, remaining.get(line.product_id));
      remaining.set(line.product_id, left);
    }

    for (const line of lines) {
      await conn.query(
        `UPDATE products SET stock_qty = stock_qty - ?, stock_value = stock_value - ?,
           purchased_qty = purchased_qty - ? WHERE id = ?`,
        [line.quantity, line.line_total, line.quantity, line.product_id]
      );
      await conn.query(
        `INSERT INTO stock_movements (product_id, movement_type, quantity, value_change, ref_type, ref_id, movement_date)
         VALUES (?, 'purchase_cancel', ?, ?, 'purchase', ?, CURDATE())`,
        [line.product_id, -line.quantity, -line.line_total, id]
      );
    }
    for (const pid of products.keys()) {
      await conn.query('UPDATE products SET stock_value = 0 WHERE id = ? AND stock_qty = 0', [pid]);
    }

    await conn.query("UPDATE purchases SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?", [id]);
    await conn.query("UPDATE supplier_payments SET status = 'void' WHERE purchase_id = ? AND status = 'active'", [id]);
    await audit(conn, userId, 'cancel', 'purchase', id, purchase.ref);
  });
  return getPurchase(pool, id);
}
