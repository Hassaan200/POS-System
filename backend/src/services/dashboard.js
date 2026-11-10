import { pool } from '../config/db.js';
import { r2 } from '../utils/money.js';
import { monthStartIn, todayIn } from '../utils/dates.js';
import { getSettings } from './common.js';
import { listCustomers, listSuppliers } from './ledger.js';
import { expenseTotal } from './expenses.js';
import { clearingTotal } from './clearing.js';

export async function getDashboard({ from, to } = {}) {
  const { timezone, currency, cny_pkr_rate: cnyRate } = await getSettings();
  const today = todayIn(timezone);
  const periodFrom = from || monthStartIn(timezone);
  const periodTo = to || today;

  const [[stockTotal]] = await pool.query(
    'SELECT COALESCE(SUM(stock_qty), 0) AS yards, COALESCE(SUM(stock_value), 0) AS value FROM products'
  );
  const [byCategory] = await pool.query(
    `SELECT c.name AS category, COALESCE(SUM(p.stock_qty), 0) AS yards, COALESCE(SUM(p.stock_value), 0) AS value
     FROM categories c LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id ORDER BY c.name`
  );
  const [[todaySales]] = await pool.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total FROM sales
     WHERE sale_date = ? AND status = 'active'`, [today]
  );
  const [[todayPurchases]] = await pool.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount * exchange_rate), 0) AS total,
       COALESCE(SUM(CASE WHEN currency = 'CNY' THEN total_amount ELSE 0 END), 0) AS cny_total FROM purchases
     WHERE purchase_date = ? AND status = 'active'`, [today]
  );
  const [[profit]] = await pool.query(
    `SELECT COALESCE(SUM(sl.line_total - sl.discount_share), 0) AS revenue, COALESCE(SUM(sl.cogs), 0) AS cogs
     FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
     WHERE s.status = 'active' AND s.sale_date BETWEEN ? AND ?`, [periodFrom, periodTo]
  );

  const todayExpenses = await expenseTotal(pool, today, today);
  const periodExpenses = await expenseTotal(pool, periodFrom, periodTo);

  const periodClearing = await clearingTotal(pool, periodFrom, periodTo);

  const customers = await listCustomers();
  const suppliers = await listSuppliers();

  return {
    currency,
    today,
    stock: { total_yards: stockTotal.yards, total_value: r2(stockTotal.value), by_category: byCategory },
    today_sales: { count: todaySales.count, total: r2(todaySales.total) },
    today_purchases: { count: todayPurchases.count, total: r2(todayPurchases.total), cny_total: r2(todayPurchases.cny_total) },
    today_expenses: todayExpenses,
    receivable: r2(customers.reduce((sum, c) => sum + c.balance, 0)),
    payable: r2(suppliers.reduce((sum, s) => sum + s.balance * (s.currency === 'CNY' ? cnyRate : 1), 0)),
    payable_cny: r2(suppliers.filter((s) => s.currency === 'CNY').reduce((sum, s) => sum + s.balance, 0)),
    cny_pkr_rate: cnyRate,
    profit: {
      from: periodFrom,
      to: periodTo,
      revenue: r2(profit.revenue),
      cogs: r2(profit.cogs),
      gross_profit: r2(profit.revenue - profit.cogs),
      expenses: periodExpenses.total,
      clearing: periodClearing,
      net_profit: r2(profit.revenue - profit.cogs - periodExpenses.total - periodClearing),
    },
  };
}