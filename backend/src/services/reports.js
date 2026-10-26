import { pool } from '../config/db.js';
import { r2 } from '../utils/money.js';
import { badRequest } from '../utils/errors.js';
import { customerStatement, listCustomers, listSuppliers, supplierStatement } from './ledger.js';
import { listProducts } from './products.js';

const col = (key, label, type = 'text') => ({ key, label, type });

function range(column, { from, to }) {
  const where = [];
  const params = [];
  if (from) { where.push(`${column} >= ?`); params.push(from); }
  if (to) { where.push(`${column} <= ?`); params.push(to); }
  return { where, params };
}

function sumTotals(rows, keys) {
  const totals = {};
  for (const key of keys) totals[key] = r2(rows.reduce((sum, r) => sum + Number(r[key] || 0), 0));
  return totals;
}

const periodLabel = ({ from, to }) => (from || to ? ` (${from || 'start'} to ${to || 'today'})` : '');

async function stock() {
  const rows = (await listProducts()).map((p) => ({
    code: p.code, name: p.name, category: p.category_name, type: p.type_name || '-',
    opening: p.opening_stock, purchased: p.purchased_qty, sold: p.sold_qty, current: p.stock_qty,
    avg_cost: p.avg_cost, value: p.stock_value,
  }));
  return {
    title: 'Current Stock by Fabric',
    columns: [col('code', 'Code'), col('name', 'Fabric'), col('category', 'Category'), col('type', 'Type'),
      col('opening', 'Opening', 'qty'), col('purchased', 'Purchased', 'qty'), col('sold', 'Sold', 'qty'),
      col('current', 'Current Yards', 'qty'), col('avg_cost', 'Avg Cost', 'money'), col('value', 'Stock Value', 'money')],
    rows,
    totals: sumTotals(rows, ['opening', 'purchased', 'sold', 'current', 'value']),
  };
}

async function stockByCategory(params) {
  const [rows] = await pool.query(
    `SELECT c.name AS category, COUNT(p.id) AS products, COALESCE(SUM(p.stock_qty), 0) AS current,
       COALESCE(SUM(p.stock_value), 0) AS value
     FROM categories c LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id ORDER BY c.name`
  );
  const { where, params: p } = range('s.sale_date', params);
  const [sold] = await pool.query(
    `SELECT pr.category_id, COALESCE(SUM(sl.quantity), 0) AS yards_sold,
       COALESCE(SUM(sl.line_total - sl.discount_share), 0) AS sales
     FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id JOIN products pr ON pr.id = sl.product_id
     WHERE s.status = 'active' ${where.length ? `AND ${where.join(' AND ')}` : ''} GROUP BY pr.category_id`,
    p
  );
  const [cats] = await pool.query('SELECT id, name FROM categories');
  const soldByName = new Map(sold.map((s) => [cats.find((c) => c.id === s.category_id)?.name, s]));
  const data = rows.map((r) => ({
    ...r,
    yards_sold: soldByName.get(r.category)?.yards_sold || 0,
    sales: r2(soldByName.get(r.category)?.sales || 0),
  }));
  return {
    title: `Stock and Sales by Category${periodLabel(params)}`,
    columns: [col('category', 'Category'), col('products', 'Products', 'int'), col('current', 'Current Yards', 'qty'),
      col('value', 'Stock Value', 'money'), col('yards_sold', 'Yards Sold', 'qty'), col('sales', 'Net Sales', 'money')],
    rows: data,
    totals: sumTotals(data, ['current', 'value', 'yards_sold', 'sales']),
  };
}

async function salesByDate(params) {
  const { where, params: p } = range('s.sale_date', params);
  const [rows] = await pool.query(
    `SELECT s.sale_date AS date, COUNT(*) AS bills,
       (SELECT COALESCE(SUM(sl.quantity), 0) FROM sale_lines sl JOIN sales s2 ON s2.id = sl.sale_id
          WHERE s2.sale_date = s.sale_date AND s2.status = 'active') AS yards,
       SUM(s.subtotal) AS gross, SUM(s.discount) AS discount, SUM(s.total_amount) AS net
     FROM sales s WHERE s.status = 'active' ${where.length ? `AND ${where.join(' AND ')}` : ''}
     GROUP BY s.sale_date ORDER BY s.sale_date DESC`,
    p
  );
  return {
    title: `Sales by Date${periodLabel(params)}`,
    columns: [col('date', 'Date', 'date'), col('bills', 'Sales', 'int'), col('yards', 'Yards', 'qty'),
      col('gross', 'Gross', 'money'), col('discount', 'Discount', 'money'), col('net', 'Net Sales', 'money')],
    rows,
    totals: sumTotals(rows, ['bills', 'yards', 'gross', 'discount', 'net']),
  };
}

async function salesByProduct(params) {
  const { where, params: p } = range('s.sale_date', params);
  const [rows] = await pool.query(
    `SELECT pr.code, pr.name, c.name AS category, SUM(sl.quantity) AS yards,
       SUM(sl.line_total - sl.discount_share) AS revenue
     FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id JOIN products pr ON pr.id = sl.product_id
     JOIN categories c ON c.id = pr.category_id
     WHERE s.status = 'active' ${where.length ? `AND ${where.join(' AND ')}` : ''}
     GROUP BY pr.id ORDER BY revenue DESC`,
    p
  );
  return {
    title: `Sales by Product${periodLabel(params)}`,
    columns: [col('code', 'Code'), col('name', 'Fabric'), col('category', 'Category'), col('yards', 'Yards Sold', 'qty'),
      col('revenue', 'Net Sales', 'money')],
    rows,
    totals: sumTotals(rows, ['yards', 'revenue']),
  };
}

async function purchaseHistory(params) {
  const { where, params: p } = range('p.purchase_date', params);
  const [rows] = await pool.query(
    `SELECT p.purchase_date AS date, p.ref, s.name AS supplier, pr.name AS fabric, pl.quantity, pl.rate, pl.line_total AS amount
     FROM purchase_lines pl JOIN purchases p ON p.id = pl.purchase_id JOIN suppliers s ON s.id = p.supplier_id
     JOIN products pr ON pr.id = pl.product_id
     WHERE p.status = 'active' ${where.length ? `AND ${where.join(' AND ')}` : ''}
     ORDER BY p.purchase_date DESC, p.id DESC`,
    p
  );
  return {
    title: `Purchase History${periodLabel(params)}`,
    columns: [col('date', 'Date', 'date'), col('ref', 'Ref'), col('supplier', 'Supplier'), col('fabric', 'Fabric'),
      col('quantity', 'Yards', 'qty'), col('rate', 'Rate', 'money'), col('amount', 'Amount', 'money')],
    rows,
    totals: sumTotals(rows, ['quantity', 'amount']),
  };
}

async function profit(groupBy, params) {
  const { where, params: p } = range('s.sale_date', params);
  const groups = {
    product: { select: 'pr.name AS label, c.name AS extra', group: 'pr.id', label: 'Fabric', extra: 'Category' },
    category: { select: 'c.name AS label', group: 'c.id', label: 'Category' },
    date: { select: 's.sale_date AS label', group: 's.sale_date', label: 'Date' },
  };
  const g = groups[groupBy];
  const [rows] = await pool.query(
    `SELECT ${g.select}, SUM(sl.quantity) AS yards, SUM(sl.line_total - sl.discount_share) AS revenue,
       SUM(sl.cogs) AS cogs, SUM(sl.line_total - sl.discount_share - sl.cogs) AS profit
     FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id JOIN products pr ON pr.id = sl.product_id
     JOIN categories c ON c.id = pr.category_id
     WHERE s.status = 'active' ${where.length ? `AND ${where.join(' AND ')}` : ''}
     GROUP BY ${g.group} ORDER BY ${groupBy === 'date' ? 's.sale_date DESC' : 'profit DESC'}`,
    p
  );
  const data = rows.map((r) => ({
    ...r,
    revenue: r2(r.revenue), cogs: r2(r.cogs), profit: r2(r.profit),
    margin: r.revenue > 0 ? r2((r.profit / r.revenue) * 100) : 0,
  }));
  const columns = [col('label', g.label, groupBy === 'date' ? 'date' : 'text')];
  if (g.extra) columns.push(col('extra', g.extra));
  columns.push(col('yards', 'Yards', 'qty'), col('revenue', 'Net Sales', 'money'), col('cogs', 'Cost of Goods', 'money'),
    col('profit', 'Gross Profit', 'money'), col('margin', 'Margin %', 'qty'));
  return {
    title: `Gross Profit by ${g.label}${periodLabel(params)}`,
    columns,
    rows: data,
    totals: sumTotals(data, ['yards', 'revenue', 'cogs', 'profit']),
  };
}

async function receivables() {
  const rows = (await listCustomers()).filter((c) => c.balance !== 0).map((c) => ({
    name: c.name, mobile: c.mobile || '-', charged: c.total_charged, received: c.total_received,
    opening: c.opening_balance, balance: c.balance,
  }));
  return {
    title: 'Customer Balances Receivable',
    columns: [col('name', 'Customer'), col('mobile', 'Mobile'), col('opening', 'Opening', 'money'),
      col('charged', 'Total Charged', 'money'), col('received', 'Received', 'money'), col('balance', 'Outstanding', 'money')],
    rows,
    totals: sumTotals(rows, ['opening', 'charged', 'received', 'balance']),
  };
}

async function payables() {
  const rows = (await listSuppliers()).filter((s) => s.balance !== 0).map((s) => ({
    name: s.name, mobile: s.mobile || '-', purchases: s.total_purchases, paid: s.total_paid,
    opening: s.opening_balance, balance: s.balance,
  }));
  return {
    title: 'Supplier Balances Payable',
    columns: [col('name', 'Supplier'), col('mobile', 'Mobile'), col('opening', 'Opening', 'money'),
      col('purchases', 'Total Purchases', 'money'), col('paid', 'Paid', 'money'), col('balance', 'Outstanding', 'money')],
    rows,
    totals: sumTotals(rows, ['opening', 'purchases', 'paid', 'balance']),
  };
}

async function paymentHistory(params) {
  const c = range('p.payment_date', params);
  const [received] = await pool.query(
    `SELECT p.payment_date AS date, 'Received' AS direction, COALESCE(cu.name, 'Walk-in') AS party,
       COALESCE(s.ref, '') AS reference, p.amount, p.notes, p.status, p.id
     FROM customer_payments p LEFT JOIN customers cu ON cu.id = p.customer_id LEFT JOIN sales s ON s.id = p.sale_id
     ${c.where.length ? `WHERE ${c.where.join(' AND ')}` : ''}`,
    c.params
  );
  const [paid] = await pool.query(
    `SELECT p.payment_date AS date, 'Paid' AS direction, su.name AS party, COALESCE(pu.ref, '') AS reference,
       p.amount, p.notes, p.status, p.id
     FROM supplier_payments p JOIN suppliers su ON su.id = p.supplier_id LEFT JOIN purchases pu ON pu.id = p.purchase_id
     ${c.where.length ? `WHERE ${c.where.join(' AND ')}` : ''}`,
    c.params
  );
  const rows = [...received, ...paid]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .map((r) => ({ ...r, notes: r.notes || '' }));
  const active = rows.filter((r) => r.status === 'active');
  return {
    title: `Payment History${periodLabel(params)}`,
    columns: [col('date', 'Date', 'date'), col('direction', 'Type'), col('party', 'Party'), col('reference', 'Reference'),
      col('amount', 'Amount', 'money'), col('status', 'Status'), col('notes', 'Notes')],
    rows,
    totals: {
      received: r2(active.filter((r) => r.direction === 'Received').reduce((s, r) => s + r.amount, 0)),
      paid: r2(active.filter((r) => r.direction === 'Paid').reduce((s, r) => s + r.amount, 0)),
    },
  };
}

const statementColumns = [col('date', 'Date', 'date'), col('reference', 'Reference'), col('description', 'Details'),
  col('debit', 'Charged', 'money'), col('credit', 'Paid', 'money'), col('balance', 'Balance', 'money')];

async function customerStatementReport({ customer_id, from, to }) {
  if (!customer_id) throw badRequest('customer_id is required');
  const st = await customerStatement(pool, customer_id, { from, to });
  return {
    title: `Customer Statement - ${st.customer.name}${periodLabel({ from, to })}`,
    columns: statementColumns,
    rows: st.rows,
    totals: { debit: r2(st.rows.reduce((s, r) => s + r.debit, 0)), credit: r2(st.rows.reduce((s, r) => s + r.credit, 0)),
      balance: st.customer.balance },
    meta: { opening_balance: st.opening_balance },
  };
}

async function supplierStatementReport({ supplier_id, from, to }) {
  if (!supplier_id) throw badRequest('supplier_id is required');
  const st = await supplierStatement(pool, supplier_id, { from, to });
  return {
    title: `Supplier Statement - ${st.supplier.name}${periodLabel({ from, to })}`,
    columns: statementColumns.map((c) => (c.key === 'debit' ? col('debit', 'Purchased', 'money') : c)),
    rows: st.rows,
    totals: { debit: r2(st.rows.reduce((s, r) => s + r.debit, 0)), credit: r2(st.rows.reduce((s, r) => s + r.credit, 0)),
      balance: st.supplier.balance },
    meta: { opening_balance: st.opening_balance },
  };
}

export const reportBuilders = {
  stock,
  'stock-by-category': stockByCategory,
  'sales-by-date': salesByDate,
  'sales-by-product': salesByProduct,
  purchases: purchaseHistory,
  'profit-by-product': (p) => profit('product', p),
  'profit-by-category': (p) => profit('category', p),
  'profit-by-date': (p) => profit('date', p),
  receivables,
  payables,
  payments: paymentHistory,
  'customer-statement': customerStatementReport,
  'supplier-statement': supplierStatementReport,
};

export async function buildReport(name, params) {
  const builder = reportBuilders[name];
  if (!builder) throw badRequest('Unknown report');
  return builder(params);
}
