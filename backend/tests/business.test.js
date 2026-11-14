import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { PASSWORD, createClient, resetDatabase, startServer, today } from './helpers.js';

let server;
let api;
const ids = {};

before(async () => {
  await resetDatabase();
  server = await startServer();
  api = createClient(server.base);
  const login = await api.login();
  assert.equal(login.status, 200);
});

after(async () => {
  await server.close();
});

const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 0.005, `${label}: expected ${expected}, got ${actual}`);

describe('authentication and access', () => {
  it('rejects unauthenticated access to protected routes', async () => {
    const anon = createClient(server.base);
    const res = await anon.get('/products');
    assert.equal(res.status, 401);
  });

  it('rejects a wrong password', async () => {
    const anon = createClient(server.base);
    const res = await anon.login('shop@example.com', 'wrong-password');
    assert.equal(res.status, 401);
  });

  it('lets both shop users sign in with the same shared account', async () => {
    const first = createClient(server.base);
    const second = createClient(server.base);
    assert.equal((await first.login()).status, 200);
    assert.equal((await second.login()).status, 200);
    assert.equal((await first.get('/products')).status, 200);
    assert.equal((await second.get('/products')).status, 200);
  });
});

describe('master data', () => {
  it('has default categories and Fancy sub-types, and allows adding more', async () => {
    const res = await api.get('/catalog');
    const fancy = res.data.find((c) => c.name === 'Fancy Fabric');
    const china = res.data.find((c) => c.name === 'China Fabric');
    assert.ok(fancy && china);
    assert.deepEqual(fancy.types.map((t) => t.name).sort(), ['Kardana', 'Leelan']);
    ids.fancy = fancy.id;
    ids.china = china.id;
    ids.kardana = fancy.types.find((t) => t.name === 'Kardana').id;
    const added = await api.post(`/catalog/categories/${fancy.id}/types`, { name: 'Banarsi' });
    assert.equal(added.status, 201);
  });

  it('creates suppliers, customers and products with opening values', async () => {
    const supplier = await api.post('/suppliers', { name: 'Ali Traders', mobile: '03001234567', opening_balance: 0, currency: 'PKR' });
    const customer = await api.post('/customers', { name: 'Bilal Boutique', mobile: '03111234567', opening_balance: 0 });
    assert.equal(supplier.status, 201);
    assert.equal(customer.status, 201);
    ids.supplier = supplier.data.id;
    ids.customer = customer.data.id;

    const fancy = await api.post('/products', {
      name: 'Kardana Red', code: 'KR-01', category_id: ids.fancy, fabric_type_id: ids.kardana,
      opening_stock: 10, purchase_cost: 100, selling_rate: 150,
    });
    assert.equal(fancy.status, 201);
    assert.equal(fancy.data.stock_qty, 10);
    ids.fancyProduct = fancy.data.id;

    const china = await api.post('/products', {
      name: 'China Silk', code: 'CH-01', category_id: ids.china, opening_stock: 0, purchase_cost: 0, selling_rate: 80,
    });
    assert.equal(china.status, 201);
    ids.chinaProduct = china.data.id;
  });

  it('rejects a type from a different category and a duplicate product code', async () => {
    const wrongType = await api.post('/products', {
      name: 'Bad', code: 'BAD-1', category_id: ids.china, fabric_type_id: ids.kardana,
    });
    assert.equal(wrongType.status, 400);
    const duplicate = await api.post('/products', { name: 'Dup', code: 'KR-01', category_id: ids.fancy });
    assert.equal(duplicate.status, 409);
  });
});

describe('purchases', () => {
  it('purchase increases stock (decimal yards) and updates supplier payable', async () => {
    const res = await api.post('/purchases', {
      purchase_date: today(), supplier_id: ids.supplier,
      lines: [{ product_id: ids.fancyProduct, quantity: 20.5, rate: 120 }], paid_amount: 1000,
    });
    assert.equal(res.status, 201);
    near(res.data.total_amount, 2460, 'purchase total');
    near(res.data.remaining_amount, 1460, 'purchase remaining');

    const product = (await api.get(`/products/${ids.fancyProduct}`)).data;
    near(product.stock_qty, 30.5, 'stock after purchase');
    near(product.purchased_qty, 20.5, 'purchased qty');
    near(product.avg_cost, 113.4426, 'weighted average cost');

    const supplier = (await api.get(`/suppliers/${ids.supplier}`)).data;
    near(supplier.total_purchases, 2460, 'supplier purchases');
    near(supplier.total_paid, 1000, 'supplier paid');
    near(supplier.balance, 1460, 'supplier balance');
  });

  it('rejects paying more than the purchase total and invalid quantities', async () => {
    const over = await api.post('/purchases', {
      purchase_date: today(), supplier_id: ids.supplier,
      lines: [{ product_id: ids.fancyProduct, quantity: 1, rate: 10 }], paid_amount: 50,
    });
    assert.equal(over.status, 400);
    const negative = await api.post('/purchases', {
      purchase_date: today(), supplier_id: ids.supplier,
      lines: [{ product_id: ids.fancyProduct, quantity: -2, rate: 10 }], paid_amount: 0,
    });
    assert.equal(negative.status, 400);
    const threeDecimals = await api.post('/purchases', {
      purchase_date: today(), supplier_id: ids.supplier,
      lines: [{ product_id: ids.fancyProduct, quantity: 1.125, rate: 10 }], paid_amount: 0,
    });
    assert.equal(threeDecimals.status, 400);
  });

  it('requires an idempotency key', async () => {
    const res = await api.post('/purchases', {
      purchase_date: today(), supplier_id: ids.supplier,
      lines: [{ product_id: ids.fancyProduct, quantity: 1, rate: 10 }],
    }, { key: false });
    assert.equal(res.status, 400);
  });

  it('does not double-apply stock when the same request is repeated', async () => {
    const key = randomUUID();
    const body = {
      purchase_date: today(), supplier_id: ids.supplier,
      lines: [{ product_id: ids.chinaProduct, quantity: 5, rate: 50 }], paid_amount: 0,
    };
    const first = await api.post('/purchases', body, { key });
    const second = await api.post('/purchases', body, { key });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.data.duplicate, true);
    assert.equal(first.data.id, second.data.id);
    const product = (await api.get(`/products/${ids.chinaProduct}`)).data;
    near(product.stock_qty, 5, 'china stock after duplicate submit');
  });

  it('survives concurrent duplicate submissions', async () => {
    const key = randomUUID();
    const body = {
      purchase_date: today(), supplier_id: ids.supplier,
      lines: [{ product_id: ids.chinaProduct, quantity: 1, rate: 50 }], paid_amount: 0,
    };
    const results = await Promise.all([1, 2, 3].map(() => api.post('/purchases', body, { key })));
    assert.ok(results.every((r) => r.status === 200 || r.status === 201));
    assert.equal(new Set(results.map((r) => r.data.id)).size, 1);
    const product = (await api.get(`/products/${ids.chinaProduct}`)).data;
    near(product.stock_qty, 6, 'china stock after concurrent duplicate submit');
  });
});

describe('sales and profit', () => {
  it('sale decreases stock, uses weighted-average cost, and records the customer balance', async () => {
    const res = await api.post('/sales', {
      sale_date: today(), customer_id: ids.customer,
      lines: [{ product_id: ids.fancyProduct, quantity: 3.25, rate: 150 }], discount: 7.5, received_amount: 200,
    });
    assert.equal(res.status, 201);
    ids.sale = res.data.id;
    near(res.data.subtotal, 487.5, 'subtotal');
    near(res.data.total_amount, 480, 'total after discount');
    near(res.data.remaining_amount, 280, 'sale remaining');
    near(res.data.lines[0].cogs, 368.69, 'cost of goods sold');

    const product = (await api.get(`/products/${ids.fancyProduct}`)).data;
    near(product.stock_qty, 27.25, 'stock after sale');
    near(product.sold_qty, 3.25, 'sold qty');

    const customer = (await api.get(`/customers/${ids.customer}`)).data;
    near(customer.total_charged, 480, 'customer charged');
    near(customer.total_received, 200, 'customer received');
    near(customer.balance, 280, 'customer balance');
  });

  it('gross profit uses net sales (after discount) minus cost of goods sold', async () => {
    const report = (await api.get('/reports/profit-by-product')).data;
    const row = report.rows.find((r) => r.label === 'Kardana Red');
    near(row.revenue, 480, 'net revenue');
    near(row.cogs, 368.69, 'cogs');
    near(row.profit, 111.31, 'gross profit');
  });

  it('weighted average changes correctly after a second purchase at a different rate', async () => {
    await api.post('/purchases', {
      purchase_date: today(), supplier_id: ids.supplier,
      lines: [{ product_id: ids.fancyProduct, quantity: 10, rate: 200 }], paid_amount: 0,
    });
    const product = (await api.get(`/products/${ids.fancyProduct}`)).data;
    const expectedValue = 3460 - 368.69 + 2000;
    near(product.stock_value, expectedValue, 'stock value');
    near(product.stock_qty, 37.25, 'stock qty');
    near(product.avg_cost, expectedValue / 37.25, 'avg cost');
  });

  it('rejects a sale larger than available stock', async () => {
    const res = await api.post('/sales', {
      sale_date: today(), customer_id: ids.customer,
      lines: [{ product_id: ids.chinaProduct, quantity: 500, rate: 80 }], received_amount: 0,
    });
    assert.equal(res.status, 409);
    near((await api.get(`/products/${ids.chinaProduct}`)).data.stock_qty, 6, 'china stock unchanged');
  });

  it('rolls back everything when a later line fails', async () => {
    const before = (await api.get(`/products/${ids.fancyProduct}`)).data.stock_qty;
    const res = await api.post('/sales', {
      sale_date: today(), customer_id: ids.customer,
      lines: [
        { product_id: ids.fancyProduct, quantity: 1, rate: 150 },
        { product_id: ids.chinaProduct, quantity: 999, rate: 80 },
      ],
      received_amount: 0,
    });
    assert.equal(res.status, 409);
    near((await api.get(`/products/${ids.fancyProduct}`)).data.stock_qty, before, 'fancy stock after failed sale');
  });

  it('rejects a credit sale without a customer but accepts a fully paid walk-in sale', async () => {
    const credit = await api.post('/sales', {
      sale_date: today(), lines: [{ product_id: ids.chinaProduct, quantity: 1, rate: 80 }], received_amount: 10,
    });
    assert.equal(credit.status, 400);
    const walkIn = await api.post('/sales', {
      sale_date: today(), lines: [{ product_id: ids.chinaProduct, quantity: 2, rate: 80 }], received_amount: 160,
    });
    assert.equal(walkIn.status, 201);
    assert.equal(walkIn.data.customer_id, null);
    near((await api.get(`/products/${ids.chinaProduct}`)).data.stock_qty, 4, 'china stock after walk-in sale');
  });

  it('allows overselling only when the setting is enabled', async () => {
    await api.put('/settings', { allow_oversell: true });
    const res = await api.post('/sales', {
      sale_date: today(), lines: [{ product_id: ids.chinaProduct, quantity: 5, rate: 80 }], received_amount: 400,
    });
    assert.equal(res.status, 201);
    await api.put('/settings', { allow_oversell: false });
    near((await api.get(`/products/${ids.chinaProduct}`)).data.stock_qty, -1, 'negative stock under override');
    await api.post('/purchases', {
      purchase_date: today(), supplier_id: ids.supplier,
      lines: [{ product_id: ids.chinaProduct, quantity: 10, rate: 50 }], paid_amount: 0,
    });
  });
});

describe('payments', () => {
  it('customer payment reduces the outstanding balance and stays in history', async () => {
    const res = await api.post('/payments/customer', {
      customer_id: ids.customer, payment_date: today(), amount: 100, notes: 'Cash',
    });
    assert.equal(res.status, 201);
    near(res.data.customer.balance, 180, 'balance after payment');
    const list = (await api.get(`/payments/customer?customer_id=${ids.customer}`)).data;
    assert.equal(list.length, 2);
  });

  it('rejects paying more than the outstanding balance', async () => {
    const res = await api.post('/payments/customer', { customer_id: ids.customer, payment_date: today(), amount: 5000 });
    assert.equal(res.status, 400);
  });

  it('repeated payment submission is recorded only once', async () => {
    const key = randomUUID();
    const body = { customer_id: ids.customer, payment_date: today(), amount: 30 };
    const first = await api.post('/payments/customer', body, { key });
    const second = await api.post('/payments/customer', body, { key });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    near((await api.get(`/customers/${ids.customer}`)).data.balance, 150, 'balance after repeated submit');
  });

  it('supplier payment reduces the payable balance', async () => {
    const res = await api.post('/payments/supplier', { supplier_id: ids.supplier, payment_date: today(), amount: 460 });
    assert.equal(res.status, 201);
    const supplier = (await api.get(`/suppliers/${ids.supplier}`)).data;
    near(supplier.total_paid, 1460, 'supplier paid after payment');
    near(supplier.balance, supplier.total_purchases - 1460, 'supplier balance');
  });

  it('customer statement running balance matches the stored balance', async () => {
    const statement = (await api.get(`/customers/${ids.customer}/statement`)).data;
    const last = statement.rows.at(-1);
    near(last.balance, statement.customer.balance, 'statement closing balance');
    assert.ok(statement.rows.some((r) => r.kind === 'sale'));
    assert.ok(statement.rows.some((r) => r.kind === 'payment'));
  });

  it('opening balances are included in balances', async () => {
    const customer = await api.post('/customers', { name: 'Old Customer', opening_balance: 5000 });
    near(customer.data.balance, 5000, 'opening balance');
    const pay = await api.post('/payments/customer', { customer_id: customer.data.id, payment_date: today(), amount: 2000 });
    near(pay.data.customer.balance, 3000, 'after paying opening balance');
  });
});

describe('cancellation keeps books consistent', () => {
  it('cancelling a sale restores stock and removes its charge and payment', async () => {
    const created = await api.post('/sales', {
      sale_date: today(), customer_id: ids.customer,
      lines: [{ product_id: ids.fancyProduct, quantity: 2, rate: 150 }], received_amount: 100,
    });
    const stockBefore = (await api.get(`/products/${ids.fancyProduct}`)).data;
    const balanceBefore = (await api.get(`/customers/${ids.customer}`)).data.balance;
    const cancelled = await api.post(`/sales/${created.data.id}/cancel`, {}, { key: false });
    assert.equal(cancelled.status, 200);
    const stockAfter = (await api.get(`/products/${ids.fancyProduct}`)).data;
    near(stockAfter.stock_qty, stockBefore.stock_qty + 2, 'stock restored');
    near(stockAfter.stock_value, stockBefore.stock_value + created.data.lines[0].cogs, 'stock value restored');
    near((await api.get(`/customers/${ids.customer}`)).data.balance, balanceBefore - 300 + 100, 'customer balance after cancel');
    assert.equal((await api.post(`/sales/${created.data.id}/cancel`, {}, { key: false })).status, 409);
  });

  it('cannot cancel a purchase whose stock was already sold', async () => {
    const purchase = await api.post('/purchases', {
      purchase_date: today(), supplier_id: ids.supplier,
      lines: [{ product_id: ids.chinaProduct, quantity: 3, rate: 60 }], paid_amount: 0,
    });
    const product = (await api.get(`/products/${ids.chinaProduct}`)).data;
    await api.post('/sales', {
      sale_date: today(), lines: [{ product_id: ids.chinaProduct, quantity: product.stock_qty, rate: 80 }],
      received_amount: product.stock_qty * 80,
    });
    const res = await api.post(`/purchases/${purchase.data.id}/cancel`, {}, { key: false });
    assert.equal(res.status, 409);
  });

  it('stock quantities and values still match the movement ledger', async () => {
    const res = await api.get('/settings/integrity');
    assert.equal(res.data.ok, true, JSON.stringify(res.data.problems));
  });
});

describe('dashboard and reports', () => {
  it('dashboard totals match the recorded transactions', async () => {
    const dash = (await api.get('/dashboard')).data;
    const products = (await api.get('/products')).data;
    const customers = (await api.get('/customers')).data;
    const suppliers = (await api.get('/suppliers')).data;
    const sales = (await api.get(`/sales?from=${today()}&to=${today()}`)).data.filter((s) => s.status === 'active');
    const purchases = (await api.get(`/purchases?from=${today()}&to=${today()}`)).data.filter((p) => p.status === 'active');

    near(dash.stock.total_yards, products.reduce((s, p) => s + p.stock_qty, 0), 'total stock');
    near(dash.today_sales.total, sales.reduce((s, x) => s + x.total_amount, 0), "today's sales");
    near(dash.today_purchases.total, purchases.reduce((s, x) => s + x.total_amount, 0), "today's purchases");
    near(dash.receivable, customers.reduce((s, c) => s + c.balance, 0), 'receivable');
    near(dash.payable, suppliers.reduce((s, c) => s + c.balance, 0), 'payable');

    const fancy = dash.stock.by_category.find((c) => c.category === 'Fancy Fabric');
    const china = dash.stock.by_category.find((c) => c.category === 'China Fabric');
    near(fancy.yards, products.filter((p) => p.category_name === 'Fancy Fabric').reduce((s, p) => s + p.stock_qty, 0), 'fancy yards');
    near(china.yards, products.filter((p) => p.category_name === 'China Fabric').reduce((s, p) => s + p.stock_qty, 0), 'china yards');
  });

  it('dashboard gross profit equals revenue minus cost across the period', async () => {
    const dash = (await api.get('/dashboard')).data;
    const byDate = (await api.get('/reports/profit-by-date')).data;
    near(dash.profit.gross_profit, byDate.totals.profit, 'dashboard vs report profit');
    near(dash.profit.gross_profit, dash.profit.revenue - dash.profit.cogs, 'profit formula');
  });

  it('Fancy and China fabric reports stay separate', async () => {
    const report = (await api.get('/reports/profit-by-category')).data;
    const fancy = report.rows.find((r) => r.label === 'Fancy Fabric');
    const china = report.rows.find((r) => r.label === 'China Fabric');
    assert.ok(fancy && china);
    const fancyOnly = (await api.get('/reports/profit-by-product')).data.rows.filter((r) => r.extra === 'Fancy Fabric');
    near(fancy.revenue, fancyOnly.reduce((s, r) => s + r.revenue, 0), 'fancy revenue is only Fancy fabrics');
    const stock = (await api.get('/reports/stock-by-category')).data;
    assert.equal(stock.rows.length >= 2, true);
  });

  it('date filters exclude records outside the range', async () => {
    const report = (await api.get('/reports/sales-by-date?from=2000-01-01&to=2000-01-31')).data;
    assert.equal(report.rows.length, 0);
    const bad = await api.get('/reports/sales-by-date?from=not-a-date');
    assert.equal(bad.status, 400);
  });

  it('records persist: a fresh client sees the same data', async () => {
    const fresh = createClient(server.base);
    await fresh.login();
    const product = (await fresh.get(`/products/${ids.fancyProduct}`)).data;
    near(product.stock_qty, (await api.get(`/products/${ids.fancyProduct}`)).data.stock_qty, 'stock after refresh');
  });
});

describe('exports', () => {
  it('Excel export contains the filtered database rows', async () => {
    const res = await api.request('GET', `/reports/sales-by-product/export?format=xlsx&from=${today()}&to=${today()}`, null, { raw: true });
    assert.equal(res.status, 200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await res.arrayBuffer()));
    const sheet = workbook.worksheets[0];
    const cells = [];
    sheet.eachRow((row) => cells.push(row.values.slice(1).join('|')));
    const json = (await api.get(`/reports/sales-by-product?from=${today()}&to=${today()}`)).data;
    assert.ok(cells.some((line) => line.includes('Kardana Red')));
    assert.equal(cells.filter((line) => json.rows.some((r) => line.includes(r.name))).length, json.rows.length);
  });

  it('Excel export for an empty date range has no data rows', async () => {
    const res = await api.request('GET', '/reports/sales-by-product/export?format=xlsx&from=2000-01-01&to=2000-01-02', null, { raw: true });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await res.arrayBuffer()));
    const text = [];
    workbook.worksheets[0].eachRow((row) => text.push(row.values.join('|')));
    assert.ok(!text.some((line) => line.includes('Kardana Red')));
  });

  it('PDF export returns a valid PDF', async () => {
    const res = await api.request('GET', '/reports/stock/export?format=pdf', null, { raw: true });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    const buffer = Buffer.from(await res.arrayBuffer());
    assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
    assert.ok(buffer.length > 800);
  });
});

describe('expenses and daily book', () => {
  let expenseId;

  it('records an expense and lists it', async () => {
    const res = await api.post('/expenses', {
      expense_date: today(), category: 'food_tea', description: 'Chai and cold drinks', amount: 200,
    });
    assert.equal(res.status, 201);
    expenseId = res.data.id;
    near(res.data.amount, 200, 'expense amount');
    const list = (await api.get(`/expenses?from=${today()}&to=${today()}`)).data;
    assert.ok(list.some((e) => e.id === expenseId));
  });

  it('repeated expense submission is recorded only once', async () => {
    const key = randomUUID();
    const body = { expense_date: today(), category: 'advance', description: 'Advance to Ali', amount: 500 };
    const first = await api.post('/expenses', body, { key });
    const second = await api.post('/expenses', body, { key });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(first.data.id, second.data.id);
  });

  it('rejects zero amount, unknown category and empty description', async () => {
    const base = { expense_date: today(), category: 'rent', description: 'Shop rent', amount: 1000 };
    assert.equal((await api.post('/expenses', { ...base, amount: 0 })).status, 400);
    assert.equal((await api.post('/expenses', { ...base, category: 'gambling' })).status, 400);
    assert.equal((await api.post('/expenses', { ...base, description: '   ' })).status, 400);
  });

  it('daily book shows sales and expenses side by side with correct balance', async () => {
    const book = (await api.get(`/expenses/daily-book?date=${today()}`)).data;
    const sales = (await api.get(`/sales?from=${today()}&to=${today()}`)).data.filter((s) => s.status === 'active');
    near(book.totals.sales, sales.reduce((s, x) => s + x.total_amount, 0), 'book sales');
    near(book.totals.expenses, 700, 'book expenses');
    near(book.totals.balance, book.totals.sales - 700, 'book balance');
    assert.equal(book.expenses.length, 2);
  });

  it('voided expense stays in history but leaves the totals', async () => {
    const res = await api.post(`/expenses/${expenseId}/void`, {});
    assert.equal(res.status, 200);
    const again = await api.post(`/expenses/${expenseId}/void`, {});
    assert.equal(again.status, 409);
    const book = (await api.get(`/expenses/daily-book?date=${today()}`)).data;
    near(book.totals.expenses, 500, 'expenses after void');
    assert.equal(book.expenses.length, 2);
    assert.ok(book.expenses.some((e) => e.id === expenseId && e.status === 'void'));
  });

  it('dashboard net profit is gross profit minus expenses', async () => {
    const dash = (await api.get('/dashboard')).data;
    near(dash.today_expenses.total, 500, "today's expenses");
    near(dash.profit.expenses, 500, 'period expenses');
    near(dash.profit.net_profit, dash.profit.gross_profit - 500, 'net profit');
  });
});

describe('three-piece sets, thaan lengths and meter rates', () => {
  let parts;
  let purchase;

  it('creates a Front / Back / Dupatta set as three stock items', async () => {
    const res = await api.post('/products/set', { set_name: 'D-1', code: 'D1', category_id: ids.china });
    assert.equal(res.status, 201);
    assert.deepEqual(res.data.map((p) => p.part), ['front', 'back', 'dupatta']);
    assert.deepEqual(res.data.map((p) => p.code), ['D1-F', 'D1-B', 'D1-D']);
    parts = Object.fromEntries(res.data.map((p) => [p.part, p.id]));
    const again = await api.post('/products/set', { set_name: 'D-1', code: 'D1', category_id: ids.china });
    assert.equal(again.status, 409);
  });

  it('records each thaan length and prices the line per meter', async () => {
    const res = await api.post('/purchases', {
      purchase_date: today(),
      supplier_id: ids.supplier,
      lines: [
        { product_id: parts.front, pieces: Array(8).fill(16), rate: 28, rate_unit: 'meter' },
        { product_id: parts.back, pieces: [23.8, 16, 16, 16, 16, 16, 16, 16], rate: 6.5, rate_unit: 'meter' },
        { product_id: parts.dupatta, pieces: Array(8).fill(48), rate: 6.5, rate_unit: 'meter' },
      ],
      paid_amount: 0,
    });
    assert.equal(res.status, 201);
    purchase = res.data;
    const [front, back, dupatta] = purchase.lines;
    near(front.quantity, 128, 'front yards');
    near(front.line_total, 3277.21, 'front amount');
    assert.deepEqual(front.pieces, Array(8).fill(16));
    near(back.quantity, 135.8, 'back yards');
    near(back.line_total, 807.14, 'back amount');
    assert.equal(back.pieces[0], 23.8);
    near(dupatta.line_total, 2282.34, 'dupatta amount');
    near(purchase.total_amount, 6366.69, 'purchase total');
  });

  it('adds the yards to stock for each part separately', async () => {
    const front = (await api.get(`/products/${parts.front}`)).data;
    const dupatta = (await api.get(`/products/${parts.dupatta}`)).data;
    near(front.stock_qty, 128, 'front stock');
    near(front.stock_value, 3277.21, 'front stock value');
    near(dupatta.stock_qty, 384, 'dupatta stock');
  });

  it('rejects a yards total that disagrees with the thaan lengths', async () => {
    const res = await api.post('/purchases', {
      purchase_date: today(),
      supplier_id: ids.supplier,
      lines: [{ product_id: parts.front, quantity: 100, pieces: [16, 16], rate: 1 }],
      paid_amount: 0,
    });
    assert.equal(res.status, 400);
  });

  it('sells by meter rate and reverses a cancelled set purchase cleanly', async () => {
    const sale = await api.post('/sales', {
      sale_date: today(),
      customer_id: ids.customer,
      lines: [{ product_id: parts.front, quantity: 10, rate: 100, rate_unit: 'meter' }],
      received_amount: 0,
    });
    assert.equal(sale.status, 201);
    near(sale.data.total_amount, 914.4, 'sale total');
    assert.equal((await api.post(`/sales/${sale.data.id}/cancel`, {})).status, 200);
    assert.equal((await api.post(`/purchases/${purchase.id}/cancel`, {})).status, 200);
    const front = (await api.get(`/products/${parts.front}`)).data;
    near(front.stock_qty, 0, 'front stock after cancel');
    near(front.stock_value, 0, 'front value after cancel');
    const integrity = await api.get('/settings/integrity');
    assert.equal(integrity.data.ok, true, JSON.stringify(integrity.data.problems));
  });
});

describe('yuan supplier, advance payment and landed cost', () => {
  let chinaSupplier;
  let front;
  let purchase;

  it('creates a Chinese supplier in yuan and refuses a purchase without an exchange rate', async () => {
    const supplier = await api.post('/suppliers', { name: 'Guangzhou Textile' });
    assert.equal(supplier.data.currency, 'CNY');
    chinaSupplier = supplier.data.id;
    const set = await api.post('/products/set', { set_name: 'D-2', code: 'D2', category_id: ids.china });
    front = set.data[0].id;
    const res = await api.post('/purchases', {
      purchase_date: today(), supplier_id: chinaSupplier, paid_amount: 0,
      lines: [{ product_id: front, pieces: Array(8).fill(16), rate: 28, rate_unit: 'meter' }],
    });
    assert.equal(res.status, 400);
  });

  it('keeps the bill and supplier balance in yuan and stock cost in rupees', async () => {
    const res = await api.post('/purchases', {
      purchase_date: today(), supplier_id: chinaSupplier, exchange_rate: 40, paid_amount: 0,
      lines: [{ product_id: front, pieces: Array(8).fill(16), rate: 28, rate_unit: 'meter' }],
    });
    assert.equal(res.status, 201);
    purchase = res.data;
    assert.equal(purchase.currency, 'CNY');
    near(purchase.total_amount, 3277.21, 'bill in yuan');
    near(purchase.total_pkr, 131088.4, 'bill in rupees');
    const product = (await api.get(`/products/${front}`)).data;
    near(product.stock_value, 131088.4, 'stock value in rupees');
    const supplier = (await api.get(`/suppliers/${chinaSupplier}`)).data;
    near(supplier.balance, 3277.21, 'supplier balance in yuan');
  });

  it('accepts an advance payment larger than the outstanding balance', async () => {
    const res = await api.post('/payments/supplier', {
      supplier_id: chinaSupplier, payment_date: today(), amount: 5000, exchange_rate: 40,
    });
    assert.equal(res.status, 201);
    const supplier = (await api.get(`/suppliers/${chinaSupplier}`)).data;
    near(supplier.balance, -1722.79, 'advance left with supplier');
  });

  it('adds shipping and tax to the stock cost without touching the yuan bill', async () => {
    const key = randomUUID();
    const body = { cost_date: today(), kind: 'shipping', description: 'Sea freight', amount: 10000 };
    const first = await api.post(`/purchases/${purchase.id}/costs`, body, { key });
    const second = await api.post(`/purchases/${purchase.id}/costs`, body, { key });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(second.data.extra_costs.length, 1);
    near(second.data.landed_cost_pkr, 141088.4, 'landed cost');
    near(second.data.total_amount, 3277.21, 'yuan bill unchanged');
    const product = (await api.get(`/products/${front}`)).data;
    near(product.stock_value, 141088.4, 'stock value with shipping');
    const integrity = (await api.get('/settings/integrity')).data;
    assert.equal(integrity.ok, true, JSON.stringify(integrity.problems));
  });

  it('removes an extra cost and cancels the purchase cleanly', async () => {
    const withCost = (await api.get(`/purchases/${purchase.id}`)).data;
    const costId = withCost.extra_costs[0].id;
    assert.equal((await api.post(`/purchases/costs/${costId}/void`, {})).status, 200);
    assert.equal((await api.post(`/purchases/costs/${costId}/void`, {})).status, 409);
    near((await api.get(`/products/${front}`)).data.stock_value, 131088.4, 'stock value after removing cost');
    assert.equal((await api.post(`/purchases/${purchase.id}/cancel`, {})).status, 200);
    const product = (await api.get(`/products/${front}`)).data;
    near(product.stock_qty, 0, 'stock after cancel');
    near(product.stock_value, 0, 'value after cancel');
    const integrity = (await api.get('/settings/integrity')).data;
    assert.equal(integrity.ok, true, JSON.stringify(integrity.problems));
  });

  it('shows what is owed to Chinese suppliers in yuan with a rupee estimate on the dashboard', async () => {
    await api.put('/settings', { cny_pkr_rate: 40 });
    const dash = (await api.get('/dashboard')).data;
    near(dash.payable_cny, -5000, 'yuan payable');
    near(dash.cny_pkr_rate, 40, 'rate');
  });
});

describe('clearing payments', () => {
  it('records a clearing payment, keeps it out of stock cost, and lowers net profit', async () => {
    const before = (await api.get('/dashboard')).data.profit;
    const res = await api.post('/clearing', { payment_date: today(), amount: 5000, agent_name: 'Port Agent', description: 'Container 1' });
    assert.equal(res.status, 201);
    const after = (await api.get('/dashboard')).data.profit;
    near(after.clearing - before.clearing, 5000, 'clearing in period');
    near(before.net_profit - after.net_profit, 5000, 'net profit drop');
    assert.equal((await api.get('/settings/integrity')).data.ok, true);
  });

  it('is idempotent and can be voided', async () => {
    const key = randomUUID();
    const body = { payment_date: today(), amount: 700 };
    const first = await api.post('/clearing', body, { key });
    const again = await api.post('/clearing', body, { key });
    assert.equal(again.data.id, first.data.id);
    assert.equal(again.data.duplicate, true);
    const voided = await api.post(`/clearing/${first.data.id}/void`);
    assert.equal(voided.status, 200);
    const twice = await api.post(`/clearing/${first.data.id}/void`);
    assert.equal(twice.status, 409);
  });
});

describe('supplier currency edit, clearing cost and data reset', () => {
  it('lets the currency change only before any purchase or payment', async () => {
    const fresh = await api.post('/suppliers', { name: 'Currency Mix-up Co', currency: 'PKR' });
    assert.equal(fresh.status, 201);
    const fixed = await api.put(`/suppliers/${fresh.data.id}`, { currency: 'CNY' });
    assert.equal(fixed.status, 200);
    assert.equal(fixed.data.currency, 'CNY');
    const pay = await api.post('/payments/supplier', {
      supplier_id: fresh.data.id, payment_date: today(), amount: 100, exchange_rate: 40,
    });
    assert.equal(pay.status, 201);
    const blocked = await api.put(`/suppliers/${fresh.data.id}`, { currency: 'PKR' });
    assert.equal(blocked.status, 409);
  });

  it('rejects a wrong password and a missing confirmation when deleting all data', async () => {
    const noPhrase = await api.post('/settings/reset-data', { password: 'x', confirm: 'yes' });
    assert.equal(noPhrase.status, 400);
    const wrong = await api.post('/settings/reset-data', { password: 'wrong-password', confirm: 'DELETE ALL DATA' });
    assert.equal(wrong.status, 400);
  });

  it('deletes all business data but keeps login and settings', async () => {
    const res = await api.post('/settings/reset-data', { password: PASSWORD, confirm: 'DELETE ALL DATA' });
    assert.equal(res.status, 200);
    assert.deepEqual((await api.get('/products')).data, []);
    assert.deepEqual((await api.get('/suppliers')).data, []);
    assert.deepEqual((await api.get('/purchases')).data, []);
    assert.deepEqual((await api.get('/clearing')).data, []);
    assert.equal((await api.get('/settings/integrity')).data.ok, true);
    assert.equal((await api.get('/auth/me')).status, 200);
  });
});

describe('container deliveries', () => {
  it('records a container with date, number, name, weight and bales', async () => {
    const res = await api.post('/containers', {
      delivery_date: today(), container_no: 'trhu5482542', party_name: 'Zia Durrani Khi', weight_kg: 245, bales: 4,
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.container_no, 'TRHU5482542');
    assert.equal(res.data.bales, 4);
    const second = await api.post('/containers', {
      delivery_date: today(), container_no: 'TRHU5482542', party_name: 'Zia Net', weight_kg: 180, bales: 3,
    });
    assert.equal(second.status, 201);
    const found = await api.get('/containers?search=TRHU5482542');
    assert.equal(found.data.length, 2);
  });

  it('is idempotent, editable and can be voided', async () => {
    const key = randomUUID();
    const body = { delivery_date: today(), container_no: 'EGSU0321326', party_name: 'Zia', weight_kg: 1753, bales: 17 };
    const first = await api.post('/containers', body, { key });
    const again = await api.post('/containers', body, { key });
    assert.equal(again.data.id, first.data.id);
    const edited = await api.put(`/containers/${first.data.id}`, { ...body, bales: 18 });
    assert.equal(edited.data.bales, 18);
    assert.equal((await api.post(`/containers/${first.data.id}/void`)).status, 200);
    assert.equal((await api.post(`/containers/${first.data.id}/void`)).status, 409);
    assert.equal((await api.put(`/containers/${first.data.id}`, body)).status, 409);
  });

  it('rejects a missing container number', async () => {
    const res = await api.post('/containers', { delivery_date: today(), container_no: ' ', party_name: 'Zia', weight_kg: 10, bales: 1 });
    assert.equal(res.status, 400);
  });
});