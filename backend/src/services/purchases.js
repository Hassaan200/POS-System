import { pool, withTransaction } from '../config/db.js';
import { r2 } from '../utils/money.js';
import { lineAmount } from '../utils/units.js';
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
    `SELECT pl.*, pr.name AS product_name, pr.code AS product_code, pr.set_name, pr.part
     FROM purchase_lines pl JOIN products pr ON pr.id = pl.product_id WHERE pl.purchase_id = ? ORDER BY pl.id`,
    [id]
  );
  const [pieces] = await db.query(
    `SELECT pp.purchase_line_id, pp.length FROM purchase_line_pieces pp
     JOIN purchase_lines pl ON pl.id = pp.purchase_line_id WHERE pl.purchase_id = ? ORDER BY pp.purchase_line_id, pp.seq`,
    [id]
  );
  const withPieces = lines.map((line) => ({
    ...line,
    pieces: pieces.filter((p) => p.purchase_line_id === line.id).map((p) => p.length),
  }));
  const [extraCosts] = await db.query(
    `SELECT id, cost_date, kind, description, amount, status FROM purchase_costs WHERE purchase_id = ? ORDER BY id`,
    [id]
  );
  return {
    ...purchase,
    remaining_amount: r2(purchase.total_amount - purchase.paid_amount),
    total_pkr: r2(purchase.total_amount * purchase.exchange_rate),
    landed_cost_pkr: r2(lines.reduce((sum, l) => sum + l.cost_pkr, 0)),
    lines: withPieces,
    extra_costs: extraCosts,
  };
}

export async function listPurchases({ from, to, supplier_id, limit = 200 }) {
  const where = [];
  const params = [];
  if (from) { where.push('p.purchase_date >= ?'); params.push(from); }
  if (to) { where.push('p.purchase_date <= ?'); params.push(to); }
  if (supplier_id) { where.push('p.supplier_id = ?'); params.push(supplier_id); }
  const [rows] = await pool.query(
    `SELECT p.id, p.ref, p.purchase_date, p.supplier_id, s.name AS supplier_name, p.total_amount, p.currency, p.exchange_rate,
       ROUND(p.total_amount * p.exchange_rate, 2) AS total_pkr, p.status, p.notes,
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
      const supplier = await lockParty(conn, 'suppliers', input.supplier_id, 'Supplier');
      const products = await lockProducts(conn, input.lines.map((l) => l.product_id));
      for (const product of products.values()) {
        if (!product.is_active) throw badRequest(`${product.name} is inactive`);
      }

      const exchangeRate = supplier.currency === 'PKR'
        ? 1
        : input.exchange_rate ?? (await getSettings(conn)).cny_pkr_rate;
      if (!(exchangeRate > 0)) throw badRequest('Enter the exchange rate (PKR for 1 yuan)');

      const lines = input.lines.map((l) => {
        const quantity = l.pieces ? r2(l.pieces.reduce((sum, p) => sum + p, 0)) : l.quantity;
        if (l.pieces && l.quantity !== undefined && Math.abs(l.quantity - quantity) > 0.01) {
          throw badRequest('Total yards does not match the sum of the thaan lengths');
        }
        const line_total = lineAmount(quantity, l.rate, l.rate_unit);
        return { ...l, quantity, line_total, cost_pkr: r2(line_total * exchangeRate) };
      });
      const total = r2(lines.reduce((sum, l) => sum + l.line_total, 0));
      if (input.paid_amount > total) throw badRequest('Amount paid cannot be more than the total purchase amount');

      const ref = await nextRef(conn, 'purchase', 'PU');
      const [result] = await conn.query(
        `INSERT INTO purchases (ref, purchase_date, supplier_id, currency, exchange_rate, total_amount, notes, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [ref, input.purchase_date, input.supplier_id, supplier.currency, exchangeRate, total, input.notes ?? null,
          input.idempotency_key ?? null]
      );
      const purchaseId = result.insertId;

      for (const line of lines) {
        const [lineResult] = await conn.query(
          'INSERT INTO purchase_lines (purchase_id, product_id, quantity, rate, rate_unit, line_total, cost_pkr) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [purchaseId, line.product_id, line.quantity, line.rate, line.rate_unit, line.line_total, line.cost_pkr]
        );
        for (const [seq, length] of (line.pieces ?? []).entries()) {
          await conn.query(
            'INSERT INTO purchase_line_pieces (purchase_line_id, seq, length) VALUES (?, ?, ?)',
            [lineResult.insertId, seq + 1, length]
          );
        }
        await conn.query(
          `UPDATE products SET stock_qty = stock_qty + ?, stock_value = stock_value + ?,
             purchased_qty = purchased_qty + ?, purchase_cost = ? WHERE id = ?`,
          [line.quantity, line.cost_pkr, line.quantity, r2(line.cost_pkr / line.quantity), line.product_id]
        );
        await conn.query(
          `INSERT INTO stock_movements (product_id, movement_type, quantity, value_change, ref_type, ref_id, movement_date)
           VALUES (?, 'purchase', ?, ?, 'purchase', ?, ?)`,
          [line.product_id, line.quantity, line.cost_pkr, purchaseId, input.purchase_date]
        );
      }

      if (input.paid_amount > 0) {
        await conn.query(
          `INSERT INTO supplier_payments (supplier_id, purchase_id, payment_date, amount, exchange_rate, notes)
           VALUES (?, ?, ?, ?, ?, 'Paid at purchase')`,
          [input.supplier_id, purchaseId, input.purchase_date, input.paid_amount, exchangeRate]
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
        [line.quantity, line.cost_pkr, line.quantity, line.product_id]
      );
      await conn.query(
        `INSERT INTO stock_movements (product_id, movement_type, quantity, value_change, ref_type, ref_id, movement_date)
         VALUES (?, 'purchase_cancel', ?, ?, 'purchase', ?, CURDATE())`,
        [line.product_id, -line.quantity, -line.cost_pkr, id]
      );
    }
    for (const pid of products.keys()) {
      await conn.query('UPDATE products SET stock_value = 0 WHERE id = ? AND stock_qty = 0', [pid]);
    }

    await conn.query("UPDATE purchases SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?", [id]);
    await conn.query("UPDATE supplier_payments SET status = 'void' WHERE purchase_id = ? AND status = 'active'", [id]);
    await conn.query("UPDATE purchase_costs SET status = 'void' WHERE purchase_id = ? AND status = 'active'", [id]);
    await audit(conn, userId, 'cancel', 'purchase', id, purchase.ref);
  });
  return getPurchase(pool, id);
}

function allocate(amount, weights) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let left = amount;
  return weights.map((weight, index) => {
    const share = index === weights.length - 1 ? left : r2((amount * (total > 0 ? weight / total : 1 / weights.length)));
    left = r2(left - share);
    return share;
  });
}

export async function addPurchaseCost(purchaseId, input, userId) {
  const existing = await findByKey(pool, 'purchase_costs', input.idempotency_key);
  if (existing) return getPurchase(pool, purchaseId);

  try {
    await withTransaction(async (conn) => {
      const [[purchase]] = await conn.query('SELECT * FROM purchases WHERE id = ? FOR UPDATE', [purchaseId]);
      if (!purchase) throw notFound('Purchase not found');
      if (purchase.status !== 'active') throw conflict('Purchase is cancelled');

      const [lines] = await conn.query('SELECT id, product_id, cost_pkr FROM purchase_lines WHERE purchase_id = ? ORDER BY id', [purchaseId]);
      const products = await lockProducts(conn, lines.map((l) => l.product_id));
      const eligible = lines.filter((l) => products.get(l.product_id).stock_qty > 0);
      if (eligible.length === 0) {
        throw conflict('All fabric from this purchase is already sold, so this cost cannot be added to stock');
      }

      const [result] = await conn.query(
        `INSERT INTO purchase_costs (purchase_id, cost_date, kind, description, amount, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [purchaseId, input.cost_date, input.kind, input.description ?? null, input.amount, input.idempotency_key ?? null]
      );
      const shares = allocate(input.amount, eligible.map((l) => l.cost_pkr));
      for (const [index, line] of eligible.entries()) {
        const share = shares[index];
        await conn.query('INSERT INTO purchase_cost_shares (cost_id, purchase_line_id, amount) VALUES (?, ?, ?)', [result.insertId, line.id, share]);
        await conn.query('UPDATE purchase_lines SET cost_pkr = cost_pkr + ? WHERE id = ?', [share, line.id]);
        await conn.query('UPDATE products SET stock_value = stock_value + ? WHERE id = ?', [share, line.product_id]);
        await conn.query(
          `INSERT INTO stock_movements (product_id, movement_type, quantity, value_change, ref_type, ref_id, movement_date)
           VALUES (?, 'cost_add', 0, ?, 'purchase_cost', ?, ?)`,
          [line.product_id, share, result.insertId, input.cost_date]
        );
      }
      await audit(conn, userId, 'create', 'purchase_cost', result.insertId, `${purchase.ref} ${input.kind} ${input.amount}`);
    });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }
  return getPurchase(pool, purchaseId);
}

export async function voidPurchaseCost(costId, userId) {
  let purchaseId;
  await withTransaction(async (conn) => {
    const [[cost]] = await conn.query('SELECT * FROM purchase_costs WHERE id = ? FOR UPDATE', [costId]);
    if (!cost) throw notFound('Cost not found');
    if (cost.status === 'void') throw conflict('Cost is already removed');
    purchaseId = cost.purchase_id;

    const [shares] = await conn.query(
      `SELECT cs.amount, cs.purchase_line_id, pl.product_id
       FROM purchase_cost_shares cs JOIN purchase_lines pl ON pl.id = cs.purchase_line_id WHERE cs.cost_id = ?`,
      [costId]
    );
    await lockProducts(conn, shares.map((s) => s.product_id));
    for (const share of shares) {
      await conn.query('UPDATE purchase_lines SET cost_pkr = cost_pkr - ? WHERE id = ?', [share.amount, share.purchase_line_id]);
      await conn.query('UPDATE products SET stock_value = stock_value - ? WHERE id = ?', [share.amount, share.product_id]);
      const [[product]] = await conn.query('SELECT stock_value FROM products WHERE id = ?', [share.product_id]);
      if (product.stock_value < 0) throw conflict('Part of this stock is already sold, so this cost can no longer be removed');
      await conn.query(
        `INSERT INTO stock_movements (product_id, movement_type, quantity, value_change, ref_type, ref_id, movement_date)
         VALUES (?, 'cost_void', 0, ?, 'purchase_cost', ?, CURDATE())`,
        [share.product_id, -share.amount, costId]
      );
    }
    await conn.query("UPDATE purchase_costs SET status = 'void' WHERE id = ?", [costId]);
    await audit(conn, userId, 'void', 'purchase_cost', costId, `amount ${r2(cost.amount)}`);
  });
  return getPurchase(pool, purchaseId);
}