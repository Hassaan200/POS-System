import { pool, withTransaction } from '../config/db.js';
import { computeCogs, r2 } from '../utils/money.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import {
  audit, findByKey, getSettings, insufficient, isDuplicateKeyError, lockParty, lockProducts, nextRef,
} from './common.js';

export async function getSale(db, id) {
  const [[sale]] = await db.query(
    `SELECT s.*, c.name AS customer_name,
       (SELECT COALESCE(SUM(amount), 0) FROM customer_payments WHERE sale_id = s.id AND status = 'active') AS received_amount
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
    [id]
  );
  if (!sale) throw notFound('Sale not found');
  const [lines] = await db.query(
    `SELECT sl.*, p.name AS product_name, p.code AS product_code
     FROM sale_lines sl JOIN products p ON p.id = sl.product_id WHERE sl.sale_id = ? ORDER BY sl.id`,
    [id]
  );
  return { ...sale, remaining_amount: r2(sale.total_amount - sale.received_amount), lines };
}

export async function listSales({ from, to, customer_id, search, limit = 200 }) {
  const where = [];
  const params = [];
  if (from) { where.push('s.sale_date >= ?'); params.push(from); }
  if (to) { where.push('s.sale_date <= ?'); params.push(to); }
  if (customer_id) { where.push('s.customer_id = ?'); params.push(customer_id); }
  if (search) { where.push('(s.ref LIKE ? OR c.name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  const [rows] = await pool.query(
    `SELECT s.id, s.ref, s.sale_date, s.customer_id, c.name AS customer_name, s.subtotal, s.discount, s.total_amount,
       s.status, s.notes,
       (SELECT COALESCE(SUM(amount), 0) FROM customer_payments WHERE sale_id = s.id AND status = 'active') AS received_amount,
       (SELECT GROUP_CONCAT(CONCAT(p.name, ' (', sl.quantity, ' yd)') SEPARATOR ', ')
          FROM sale_lines sl JOIN products p ON p.id = sl.product_id WHERE sl.sale_id = s.id) AS items
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY s.sale_date DESC, s.id DESC LIMIT ?`,
    [...params, Number(limit)]
  );
  return rows.map((r) => ({ ...r, remaining_amount: r2(r.total_amount - r.received_amount) }));
}

function allocateDiscount(lines, subtotal, discount) {
  if (discount <= 0 || subtotal <= 0) return lines.map(() => 0);
  let allocated = 0;
  return lines.map((line, index) => {
    if (index === lines.length - 1) return r2(discount - allocated);
    const share = r2((line.line_total / subtotal) * discount);
    allocated = r2(allocated + share);
    return share;
  });
}

export async function createSale(input, userId) {
  const existing = await findByKey(pool, 'sales', input.idempotency_key);
  if (existing) return { sale: await getSale(pool, existing), duplicate: true };

  try {
    const id = await withTransaction(async (conn) => {
      if (input.customer_id) await lockParty(conn, 'customers', input.customer_id, 'Customer');
      const products = await lockProducts(conn, input.lines.map((l) => l.product_id));
      const { allow_oversell: allowOversell } = await getSettings(conn);

      const lines = input.lines.map((l) => ({ ...l, line_total: r2(l.quantity * l.rate) }));
      const subtotal = r2(lines.reduce((sum, l) => sum + l.line_total, 0));
      if (input.discount > subtotal) throw badRequest('Discount cannot be more than the sale subtotal');
      const total = r2(subtotal - input.discount);
      if (input.received_amount > total) throw badRequest('Amount received cannot be more than the total sale amount');
      if (!input.customer_id && input.received_amount < total) {
        throw badRequest('Walk-in sales must be fully paid. Select a customer to record a credit sale');
      }

      const state = new Map([...products.entries()].map(([pid, p]) => [pid, {
        stockQty: p.stock_qty, stockValue: p.stock_value, lastCost: p.purchase_cost, product: p,
      }]));
      const shares = allocateDiscount(lines, subtotal, input.discount);

      lines.forEach((line, index) => {
        const s = state.get(line.product_id);
        if (!s.product.is_active) throw badRequest(`${s.product.name} is inactive`);
        if (!allowOversell && line.quantity > s.stockQty) throw insufficient(s.product, s.stockQty);
        line.cogs = computeCogs(s, line.quantity);
        line.discount_share = shares[index];
        s.stockQty = r2(s.stockQty - line.quantity);
        s.stockValue = r2(s.stockValue - line.cogs);
      });

      const ref = await nextRef(conn, 'sale', 'SL');
      const [result] = await conn.query(
        `INSERT INTO sales (ref, sale_date, customer_id, subtotal, discount, total_amount, notes, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [ref, input.sale_date, input.customer_id ?? null, subtotal, input.discount, total, input.notes ?? null,
          input.idempotency_key ?? null]
      );
      const saleId = result.insertId;

      for (const line of lines) {
        await conn.query(
          `INSERT INTO sale_lines (sale_id, product_id, quantity, rate, line_total, discount_share, cogs)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [saleId, line.product_id, line.quantity, line.rate, line.line_total, line.discount_share, line.cogs]
        );
        await conn.query(
          `INSERT INTO stock_movements (product_id, movement_type, quantity, value_change, ref_type, ref_id, movement_date)
           VALUES (?, 'sale', ?, ?, 'sale', ?, ?)`,
          [line.product_id, -line.quantity, -line.cogs, saleId, input.sale_date]
        );
      }
      for (const [pid, s] of state.entries()) {
        const sold = lines.filter((l) => l.product_id === pid).reduce((sum, l) => sum + l.quantity, 0);
        await conn.query(
          'UPDATE products SET stock_qty = ?, stock_value = ?, sold_qty = sold_qty + ? WHERE id = ?',
          [s.stockQty, s.stockValue, sold, pid]
        );
      }

      if (input.received_amount > 0) {
        await conn.query(
          `INSERT INTO customer_payments (customer_id, sale_id, payment_date, amount, notes)
           VALUES (?, ?, ?, ?, 'Received at sale')`,
          [input.customer_id ?? null, saleId, input.sale_date, input.received_amount]
        );
      }
      await audit(conn, userId, 'create', 'sale', saleId, `${ref} total ${total} received ${input.received_amount}`);
      return saleId;
    });
    return { sale: await getSale(pool, id), duplicate: false };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const existingId = await findByKey(pool, 'sales', input.idempotency_key);
      if (existingId) return { sale: await getSale(pool, existingId), duplicate: true };
    }
    throw err;
  }
}

export async function cancelSale(id, userId) {
  await withTransaction(async (conn) => {
    const [[sale]] = await conn.query('SELECT * FROM sales WHERE id = ? FOR UPDATE', [id]);
    if (!sale) throw notFound('Sale not found');
    if (sale.status === 'cancelled') throw conflict('Sale is already cancelled');

    const [lines] = await conn.query('SELECT * FROM sale_lines WHERE sale_id = ?', [id]);
    await lockProducts(conn, lines.map((l) => l.product_id));

    for (const line of lines) {
      await conn.query(
        `UPDATE products SET stock_qty = stock_qty + ?, stock_value = stock_value + ?,
           sold_qty = sold_qty - ? WHERE id = ?`,
        [line.quantity, line.cogs, line.quantity, line.product_id]
      );
      await conn.query(
        `INSERT INTO stock_movements (product_id, movement_type, quantity, value_change, ref_type, ref_id, movement_date)
         VALUES (?, 'sale_cancel', ?, ?, 'sale', ?, CURDATE())`,
        [line.product_id, line.quantity, line.cogs, id]
      );
    }
    await conn.query("UPDATE sales SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?", [id]);
    await conn.query("UPDATE customer_payments SET status = 'void' WHERE sale_id = ? AND status = 'active'", [id]);
    await audit(conn, userId, 'cancel', 'sale', id, sale.ref);
  });
  return getSale(pool, id);
}
