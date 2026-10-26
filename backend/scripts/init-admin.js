import readline from 'node:readline/promises';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/db.js';

async function ask(question, hidden = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    rl._writeToOutput = (text) => {
      if (text.includes(question)) rl.output.write(text);
    };
  }
  const answer = await rl.question(question);
  rl.close();
  if (hidden) console.log('');
  return answer.trim();
}

async function main() {
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM users');
  if (count > 0) {
    console.log('An account already exists. Use Settings > Change password inside the app to change it.');
    return;
  }

  const email = (process.env.ADMIN_EMAIL || (await ask('Login email: '))).toLowerCase();
  const password = process.env.ADMIN_PASSWORD || (await ask('Password (min 10 characters): ', true));

  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Invalid email');
  if (password.length < 10) throw new Error('Password must be at least 10 characters');

  const hash = await bcrypt.hash(password, 12);
  await pool.query('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, hash]);
  console.log(`Shared login created for ${email}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
