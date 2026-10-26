import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { env } from '../src/config/env.js';

const outDir = process.env.BACKUP_DIR || path.resolve('backups');
fs.mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join(outDir, `${env.db.database}-${stamp}.sql.gz`);

const args = [
  `--host=${env.db.host}`,
  `--port=${env.db.port}`,
  `--user=${env.db.user}`,
  '--single-transaction',
  '--routines',
  env.db.database,
];
if (env.db.ssl) args.unshift('--ssl');

const dump = spawn('mysqldump', args, { env: { ...process.env, MYSQL_PWD: env.db.password } });
const out = fs.createWriteStream(file);
dump.stdout.pipe(zlib.createGzip()).pipe(out);
dump.stderr.on('data', (chunk) => process.stderr.write(chunk));

dump.on('close', (code) => {
  if (code !== 0) {
    fs.rmSync(file, { force: true });
    console.error('Backup failed');
    process.exit(1);
  }
  out.on('finish', () => console.log(`Backup saved: ${file}`));
});
