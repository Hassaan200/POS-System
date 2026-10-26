process.env.DB_NAME = process.env.TEST_DB_NAME || 'fabric_shop_test';
process.env.NODE_ENV = 'test';

import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

const { env } = await import('../src/config/env.js');
const { runMigrations } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/config/db.js');
const { todayIn } = await import('../src/utils/dates.js');

export const EMAIL = 'shop@example.com';
export const PASSWORD = 'SharedPass123';
export const today = () => todayIn('Asia/Karachi');

export async function resetDatabase() {
  const conn = await mysql.createConnection({
    host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password, database: env.db.database,
  });
  const [tables] = await conn.query('SHOW TABLES');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const row of tables) await conn.query(`DROP TABLE IF EXISTS \`${Object.values(row)[0]}\``);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
  await runMigrations();
  await pool.query('INSERT INTO users (email, password_hash) VALUES (?, ?)', [EMAIL, await bcrypt.hash(PASSWORD, 4)]);
}

export async function startServer() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return {
    base,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    },
  };
}

export function createClient(base) {
  let token = null;
  async function request(method, path, body, { key = true, raw = false } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (key === true && method === 'POST' && body) headers['idempotency-key'] = randomUUID();
    else if (typeof key === 'string') headers['idempotency-key'] = key;
    const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (raw) return res;
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }
  return {
    request,
    get: (path) => request('GET', path),
    post: (path, body, opts) => request('POST', path, body ?? {}, opts),
    put: (path, body) => request('PUT', path, body),
    setToken: (t) => { token = t; },
    async login(email = EMAIL, password = PASSWORD) {
      const res = await request('POST', '/auth/login', { email, password }, { key: false });
      if (res.data?.token) token = res.data.token;
      return res;
    },
  };
}
