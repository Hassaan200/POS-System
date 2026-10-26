import { pool, withTransaction } from '../config/db.js';
import { r2 } from '../utils/money.js';
import { audit } from './common.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { todayIn } from '../utils/dates.js';
import { getSettings } from './common.js';

const productSelect = `
  SELECT p.id, p.name, p.code, p.category_id, c.name AS category_name, p.fabric_type_id, t.name AS type_name,
    p.opening_stock, p.purchase_cost, p.selling_rate, p.purchased_qty, p.sold_qty, p.stock_qty, p.stock_value,
    CASE WHEN p.stock_qty > 0 THEN ROUND(p.stock_value / p.stock_qty, 4) ELSE p.purchase_cost END AS avg_cost,
    p.is_active
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN fabric_types t ON t.id = p.fabric_type_id`;

export async function listProducts({ search, category_id, active } = {}) {
  const where = [];
  const params = [];
  if (search) { where.push('(p.name LIKE ? OR p.code LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (category_id) { where.push('p.category_id = ?'); params.push(category_id); }
  if (active !== undefined) { where.push('p.is_active = ?'); params.push(active ? 1 : 0); }
  const [rows] = await pool.query(
    `${productSelect} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.name, p.name`, params
  );
  return rows;
}

export async function getProduct(db, id) {
  const [[row]] = await db.query(`${productSelect} WHERE p.id = ?`, [id]);
  if (!row) throw notFound('Product not found');
  return row;
}

async function checkTypeBelongsToCategory(conn, typeId, categoryId) {
  if (!typeId) return;
  const [[type]] = await conn.query('SELECT category_id FROM fabric_types WHERE id = ?', [typeId]);
  if (!type) throw badRequest('Fabric type not found');
  if (type.category_id !== categoryId) throw badRequest('Fabric type does not belong to the selected category');
}

export async function createProduct(input, userId) {
  const id = await withTransaction(async (conn) => {
    const [[category]] = await conn.query('SELECT id FROM categories WHERE id = ?', [input.category_id]);
    if (!category) throw badRequest('Category not found');
    await checkTypeBelongsToCategory(conn, input.fabric_type_id, input.category_id);

    const openingValue = r2(input.opening_stock * input.purchase_cost);
    const [result] = await conn.query(
      `INSERT INTO products (name, code, category_id, fabric_type_id, opening_stock, purchase_cost, selling_rate,
         stock_qty, stock_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.name, input.code, input.category_id, input.fabric_type_id ?? null, input.opening_stock,
        input.purchase_cost, input.selling_rate, input.opening_stock, openingValue]
    );
    if (input.opening_stock > 0) {
      const { timezone } = await getSettings(conn);
      await conn.query(
        `INSERT INTO stock_movements (product_id, movement_type, quantity, value_change, ref_type, ref_id, movement_date)
         VALUES (?, 'opening', ?, ?, 'product', ?, ?)`,
        [result.insertId, input.opening_stock, openingValue, result.insertId, todayIn(timezone)]
      );
    }
    await audit(conn, userId, 'create', 'product', result.insertId, input.code);
    return result.insertId;
  });
  return getProduct(pool, id);
}

export async function updateProduct(id, input, userId) {
  await withTransaction(async (conn) => {
    const [[product]] = await conn.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [id]);
    if (!product) throw notFound('Product not found');

    const categoryId = input.category_id ?? product.category_id;
    const typeId = input.fabric_type_id === undefined ? product.fabric_type_id : input.fabric_type_id;
    await checkTypeBelongsToCategory(conn, typeId, categoryId);

    const [[{ moves }]] = await conn.query(
      "SELECT COUNT(*) AS moves FROM stock_movements WHERE product_id = ? AND movement_type <> 'opening'", [id]
    );
    const openingChanged = input.opening_stock !== undefined && input.opening_stock !== product.opening_stock;
    if (openingChanged && moves > 0) {
      throw conflict('Opening stock cannot be changed after purchases or sales exist for this product');
    }

    const next = {
      name: input.name ?? product.name,
      code: input.code ?? product.code,
      category_id: categoryId,
      fabric_type_id: typeId,
      selling_rate: input.selling_rate ?? product.selling_rate,
      purchase_cost: input.purchase_cost ?? product.purchase_cost,
      is_active: input.is_active === undefined ? product.is_active : input.is_active ? 1 : 0,
      opening_stock: input.opening_stock ?? product.opening_stock,
    };

    if (openingChanged) {
      const openingValue = r2(next.opening_stock * next.purchase_cost);
      await conn.query('DELETE FROM stock_movements WHERE product_id = ? AND movement_type = ?', [id, 'opening']);
      if (next.opening_stock > 0) {
        const { timezone } = await getSettings(conn);
        await conn.query(
          `INSERT INTO stock_movements (product_id, movement_type, quantity, value_change, ref_type, ref_id, movement_date)
           VALUES (?, 'opening', ?, ?, 'product', ?, ?)`,
          [id, next.opening_stock, openingValue, id, todayIn(timezone)]
        );
      }
      await conn.query('UPDATE products SET stock_qty = ?, stock_value = ? WHERE id = ?', [next.opening_stock, openingValue, id]);
    }

    await conn.query(
      `UPDATE products SET name = ?, code = ?, category_id = ?, fabric_type_id = ?, selling_rate = ?,
         purchase_cost = ?, is_active = ?, opening_stock = ? WHERE id = ?`,
      [next.name, next.code, next.category_id, next.fabric_type_id, next.selling_rate, next.purchase_cost,
        next.is_active, next.opening_stock, id]
    );
    await audit(conn, userId, 'update', 'product', id, next.code);
  });
  return getProduct(pool, id);
}

export async function checkStockIntegrity() {
  const [rows] = await pool.query(
    `SELECT p.id, p.code, p.stock_qty, p.stock_value,
       COALESCE(SUM(m.quantity), 0) AS ledger_qty, COALESCE(SUM(m.value_change), 0) AS ledger_value
     FROM products p LEFT JOIN stock_movements m ON m.product_id = p.id
     GROUP BY p.id HAVING ABS(p.stock_qty - ledger_qty) > 0.005 OR ABS(p.stock_value - ledger_value) > 0.5`
  );
  return rows;
}
