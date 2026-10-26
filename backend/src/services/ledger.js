import { pool } from '../config/db.js';
import { r2 } from '../utils/money.js';
import { notFound } from '../utils/errors.js';

const customerSelect = `
  SELECT c.id, c.name, c.mobile, c.opening_balance, c.is_active, c.created_at,
    (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'active') AS sales_count,
    (SELECT COALESCE(SUM(sl.quantity), 0) FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
       WHERE s.customer_id = c.id AND s.status = 'active') AS yards_bought,
    (SELECT COALESCE(SUM(s.total_amount), 0) FROM sales s
       WHERE s.customer_id = c.id AND s.status = 'active') AS total_charged,
    (SELECT COALESCE(SUM(p.amount), 0) FROM customer_payments p
       WHERE p.customer_id = c.id AND p.status = 'active') AS total_received
  FROM customers c`;

const supplierSelect = `
  SELECT s.id, s.name, s.mobile, s.opening_balance, s.is_active, s.created_at,
    (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id AND p.status = 'active') AS purchases_count,
    (SELECT COALESCE(SUM(pl.quantity), 0) FROM purchase_lines pl JOIN purchases p ON p.id = pl.purchase_id
       WHERE p.supplier_id = s.id AND p.status = 'active') AS yards_purchased,
    (SELECT GROUP_CONCAT(DISTINCT pr.name ORDER BY pr.name SEPARATOR ', ')
       FROM purchase_lines pl JOIN purchases p ON p.id = pl.purchase_id JOIN products pr ON pr.id = pl.product_id
       WHERE p.supplier_id = s.id AND p.status = 'active') AS fabrics,
    (SELECT COALESCE(SUM(p.total_amount), 0) FROM purchases p
       WHERE p.supplier_id = s.id AND p.status = 'active') AS total_purchases,
    (SELECT COALESCE(SUM(sp.amount), 0) FROM supplier_payments sp
       WHERE sp.supplier_id = s.id AND sp.status = 'active') AS total_paid
  FROM suppliers s`;

const withCustomerBalance = (row) => ({
  ...row,
  balance: r2(row.opening_balance + row.total_charged - row.total_received),
});

const withSupplierBalance = (row) => ({
  ...row,
  balance: r2(row.opening_balance + row.total_purchases - row.total_paid),
});

export async function listCustomers(db = pool, search) {
  const where = search ? 'WHERE c.name LIKE ? OR c.mobile LIKE ?' : '';
  const params = search ? [`%${search}%`, `%${search}%`] : [];
  const [rows] = await db.query(`${customerSelect} ${where} ORDER BY c.name`, params);
  return rows.map(withCustomerBalance);
}

export async function getCustomer(db = pool, id) {
  const [[row]] = await db.query(`${customerSelect} WHERE c.id = ?`, [id]);
  if (!row) throw notFound('Customer not found');
  return withCustomerBalance(row);
}

export async function listSuppliers(db = pool, search) {
  const where = search ? 'WHERE s.name LIKE ? OR s.mobile LIKE ?' : '';
  const params = search ? [`%${search}%`, `%${search}%`] : [];
  const [rows] = await db.query(`${supplierSelect} ${where} ORDER BY s.name`, params);
  return rows.map(withSupplierBalance);
}

export async function getSupplier(db = pool, id) {
  const [[row]] = await db.query(`${supplierSelect} WHERE s.id = ?`, [id]);
  if (!row) throw notFound('Supplier not found');
  return withSupplierBalance(row);
}

function sortAndRun(entries, opening) {
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at) || a.id - b.id);
  let running = opening;
  return entries.map((e) => {
    running = r2(running + e.debit - e.credit);
    return { ...e, balance: running };
  });
}

export async function customerStatement(db = pool, id, { from, to } = {}) {
  const customer = await getCustomer(db, id);
  const [sales] = await db.query(
    `SELECT s.id, s.ref, s.sale_date AS date, s.total_amount, s.discount, s.created_at,
       GROUP_CONCAT(CONCAT(p.name, ' ', sl.quantity, 'yd @ ', sl.rate) ORDER BY sl.id SEPARATOR '; ') AS items
     FROM sales s JOIN sale_lines sl ON sl.sale_id = s.id JOIN products p ON p.id = sl.product_id
     WHERE s.customer_id = ? AND s.status = 'active' GROUP BY s.id`,
    [id]
  );
  const [payments] = await db.query(
    `SELECT p.id, p.payment_date AS date, p.amount, p.notes, p.created_at, s.ref AS sale_ref
     FROM customer_payments p LEFT JOIN sales s ON s.id = p.sale_id
     WHERE p.customer_id = ? AND p.status = 'active'`,
    [id]
  );
  const entries = [
    ...sales.map((s) => ({
      id: s.id, kind: 'sale', date: s.date, created_at: s.created_at, reference: s.ref,
      description: s.items + (s.discount > 0 ? ` (discount ${s.discount})` : ''), debit: s.total_amount, credit: 0,
    })),
    ...payments.map((p) => ({
      id: p.id, kind: 'payment', date: p.date, created_at: p.created_at, reference: p.sale_ref || '',
      description: p.notes || 'Payment received', debit: 0, credit: p.amount,
    })),
  ];
  const all = sortAndRun(entries, customer.opening_balance);
  const rows = all.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
  return { customer, opening_balance: customer.opening_balance, rows };
}

export async function supplierStatement(db = pool, id, { from, to } = {}) {
  const supplier = await getSupplier(db, id);
  const [purchases] = await db.query(
    `SELECT p.id, p.ref, p.purchase_date AS date, p.total_amount, p.created_at,
       GROUP_CONCAT(CONCAT(pr.name, ' ', pl.quantity, 'yd @ ', pl.rate) ORDER BY pl.id SEPARATOR '; ') AS items
     FROM purchases p JOIN purchase_lines pl ON pl.purchase_id = p.id JOIN products pr ON pr.id = pl.product_id
     WHERE p.supplier_id = ? AND p.status = 'active' GROUP BY p.id`,
    [id]
  );
  const [payments] = await db.query(
    `SELECT sp.id, sp.payment_date AS date, sp.amount, sp.notes, sp.created_at, p.ref AS purchase_ref
     FROM supplier_payments sp LEFT JOIN purchases p ON p.id = sp.purchase_id
     WHERE sp.supplier_id = ? AND sp.status = 'active'`,
    [id]
  );
  const entries = [
    ...purchases.map((p) => ({
      id: p.id, kind: 'purchase', date: p.date, created_at: p.created_at, reference: p.ref,
      description: p.items, debit: p.total_amount, credit: 0,
    })),
    ...payments.map((p) => ({
      id: p.id, kind: 'payment', date: p.date, created_at: p.created_at, reference: p.purchase_ref || '',
      description: p.notes || 'Payment made', debit: 0, credit: p.amount,
    })),
  ];
  const all = sortAndRun(entries, supplier.opening_balance);
  const rows = all.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
  return { supplier, opening_balance: supplier.opening_balance, rows };
}

export async function saleDue(db, saleId) {
  const [[row]] = await db.query(
    `SELECT s.total_amount,
       (SELECT COALESCE(SUM(amount), 0) FROM customer_payments WHERE sale_id = s.id AND status = 'active') AS paid
     FROM sales s WHERE s.id = ?`,
    [saleId]
  );
  return row ? r2(row.total_amount - row.paid) : 0;
}

export async function purchaseDue(db, purchaseId) {
  const [[row]] = await db.query(
    `SELECT p.total_amount,
       (SELECT COALESCE(SUM(amount), 0) FROM supplier_payments WHERE purchase_id = p.id AND status = 'active') AS paid
     FROM purchases p WHERE p.id = ?`,
    [purchaseId]
  );
  return row ? r2(row.total_amount - row.paid) : 0;
}
