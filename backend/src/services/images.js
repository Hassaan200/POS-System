import { pool } from '../config/db.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from './common.js';

export const MAX_IMAGES_PER_LINE = 3;
export const MAX_IMAGE_BYTES = 400 * 1024;

function detectMime(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export async function addLineImage(lineId, buffer, userId) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw badRequest('Send a JPEG, PNG or WebP image');
  if (buffer.length > MAX_IMAGE_BYTES) throw badRequest('Photo is too large (max 400 KB)');
  const mime = detectMime(buffer);
  if (!mime) throw badRequest('Only JPEG, PNG or WebP photos are allowed');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[line]] = await conn.query('SELECT id FROM purchase_lines WHERE id = ? FOR UPDATE', [lineId]);
    if (!line) throw notFound('Purchase line not found');
    const [[{ count }]] = await conn.query('SELECT COUNT(*) AS count FROM purchase_line_images WHERE purchase_line_id = ?', [lineId]);
    if (count >= MAX_IMAGES_PER_LINE) throw badRequest(`At most ${MAX_IMAGES_PER_LINE} photos per item`);
    const [result] = await conn.query('INSERT INTO purchase_line_images (purchase_line_id, mime, data) VALUES (?, ?, ?)', [lineId, mime, buffer]);
    await audit(conn, userId, 'create', 'purchase_image', result.insertId, `line ${lineId}`);
    await conn.commit();
    return { id: result.insertId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getImage(id) {
  const [[image]] = await pool.query('SELECT mime, data FROM purchase_line_images WHERE id = ?', [id]);
  if (!image) throw notFound('Photo not found');
  return image;
}

export async function deleteImage(id, userId) {
  const [result] = await pool.query('DELETE FROM purchase_line_images WHERE id = ?', [id]);
  if (!result.affectedRows) throw notFound('Photo not found');
  await audit(pool, userId, 'delete', 'purchase_image', id, '');
}

export async function imageIdsFor(db, lineIds) {
  const map = new Map();
  if (!lineIds.length) return map;
  const [rows] = await db.query('SELECT id, purchase_line_id FROM purchase_line_images WHERE purchase_line_id IN (?) ORDER BY id', [lineIds]);
  for (const row of rows) {
    if (!map.has(row.purchase_line_id)) map.set(row.purchase_line_id, []);
    map.get(row.purchase_line_id).push(row.id);
  }
  return map;
}