import { pool, withTransaction } from '../config/db.js';
import { r2 } from '../utils/money.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { audit, findByKey, isDuplicateKeyError, lockParty } from './common.js';
import { getCustomer, getSupplier, purchaseDue, saleDue } from './ledger.js';

const customerPaymentSql = `
  SELECT p.id, p.customer_id, c.name AS customer_name, p.sale_id, s.ref AS sale_ref, p.payment_date, p.amount,
    p.notes, p.status, p.created_at
  FROM customer_payments p
  LEFT JOIN customers c ON c.id = p.customer_id
  LEFT JOIN sales s ON s.id = p.sale_id`;

const supplierPaymentSql = `
  SELECT p.id, p.supplier_id, sp.name AS supplier_name, p.purchase_id, pu.ref AS purchase_ref, p.payment_date,
    p.amount, p.notes, p.status, p.created_at
  FROM supplier_payments p
  JOIN suppliers sp ON sp.id = p.supplier_id
  LEFT JOIN purchases pu ON pu.id = p.purchase_id`;

function filters({ from, to, party_id }, partyColumn) {
  const where = [];
  const params = [];
  if (from) { where.push('p.payment_date >= ?'); params.push(from); }
  if (to) { where.push('p.payment_date <= ?'); params.push(to); }
  if (party_id) { where.push(`p.${partyColumn} = ?`); params.push(party_id); }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export async function listCustomerPayments(query) {
  const { clause, params } = filters(query, 'customer_id');
  const [rows] = await pool.query(
    `${customerPaymentSql} ${clause} ORDER BY p.payment_date DESC, p.id DESC LIMIT 500`, params
  );
  return rows;
}

export async function listSupplierPayments(query) {
  const { clause, params } = filters(query, 'supplier_id');
  const [rows] = await pool.query(
    `${supplierPaymentSql} ${clause} ORDER BY p.payment_date DESC, p.id DESC LIMIT 500`, params
  );
  return rows;
}

export async function createCustomerPayment(input, userId) {
  const existing = await findByKey(pool, 'customer_payments', input.idempotency_key);
  if (existing) return { id: existing, duplicate: true, customer: await getCustomer(pool, input.customer_id) };

  try {
    const id = await withTransaction(async (conn) => {
      await lockParty(conn, 'customers', input.customer_id, 'Customer');
      const customer = await getCustomer(conn, input.customer_id);
      if (input.amount > customer.balance) {
        throw badRequest(`Payment is more than the outstanding balance (${customer.balance})`);
      }
      if (input.sale_id) {
        const [[sale]] = await conn.query('SELECT customer_id, status FROM sales WHERE id = ? FOR UPDATE', [input.sale_id]);
        if (!sale || sale.customer_id !== input.customer_id) throw badRequest('Sale does not belong to this customer');
        if (sale.status !== 'active') throw badRequest('Sale is cancelled');
        const due = await saleDue(conn, input.sale_id);
        if (input.amount > due) throw badRequest(`Payment is more than the remaining amount on this sale (${due})`);
      }
      const [result] = await conn.query(
        `INSERT INTO customer_payments (customer_id, sale_id, payment_date, amount, notes, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.customer_id, input.sale_id ?? null, input.payment_date, input.amount, input.notes ?? null,
          input.idempotency_key ?? null]
      );
      await audit(conn, userId, 'create', 'customer_payment', result.insertId, `customer ${input.customer_id} amount ${input.amount}`);
      return result.insertId;
    });
    return { id, duplicate: false, customer: await getCustomer(pool, input.customer_id) };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const existingId = await findByKey(pool, 'customer_payments', input.idempotency_key);
      if (existingId) return { id: existingId, duplicate: true, customer: await getCustomer(pool, input.customer_id) };
    }
    throw err;
  }
}

export async function createSupplierPayment(input, userId) {
  const existing = await findByKey(pool, 'supplier_payments', input.idempotency_key);
  if (existing) return { id: existing, duplicate: true, supplier: await getSupplier(pool, input.supplier_id) };

  try {
    const id = await withTransaction(async (conn) => {
      await lockParty(conn, 'suppliers', input.supplier_id, 'Supplier');
      const supplier = await getSupplier(conn, input.supplier_id);
      if (input.amount > supplier.balance) {
        throw badRequest(`Payment is more than the outstanding payable (${supplier.balance})`);
      }
      if (input.purchase_id) {
        const [[purchase]] = await conn.query('SELECT supplier_id, status FROM purchases WHERE id = ? FOR UPDATE', [input.purchase_id]);
        if (!purchase || purchase.supplier_id !== input.supplier_id) throw badRequest('Purchase does not belong to this supplier');
        if (purchase.status !== 'active') throw badRequest('Purchase is cancelled');
        const due = await purchaseDue(conn, input.purchase_id);
        if (input.amount > due) throw badRequest(`Payment is more than the remaining amount on this purchase (${due})`);
      }
      const [result] = await conn.query(
        `INSERT INTO supplier_payments (supplier_id, purchase_id, payment_date, amount, notes, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.supplier_id, input.purchase_id ?? null, input.payment_date, input.amount, input.notes ?? null,
          input.idempotency_key ?? null]
      );
      await audit(conn, userId, 'create', 'supplier_payment', result.insertId, `supplier ${input.supplier_id} amount ${input.amount}`);
      return result.insertId;
    });
    return { id, duplicate: false, supplier: await getSupplier(pool, input.supplier_id) };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const existingId = await findByKey(pool, 'supplier_payments', input.idempotency_key);
      if (existingId) return { id: existingId, duplicate: true, supplier: await getSupplier(pool, input.supplier_id) };
    }
    throw err;
  }
}

export async function voidPayment(kind, id, userId) {
  const table = kind === 'customer' ? 'customer_payments' : 'supplier_payments';
  await withTransaction(async (conn) => {
    const [[payment]] = await conn.query(`SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
    if (!payment) throw notFound('Payment not found');
    if (payment.status === 'void') throw conflict('Payment is already voided');
    await conn.query(`UPDATE ${table} SET status = 'void' WHERE id = ?`, [id]);
    await audit(conn, userId, 'void', `${kind}_payment`, id, `amount ${r2(payment.amount)}`);
  });
}
