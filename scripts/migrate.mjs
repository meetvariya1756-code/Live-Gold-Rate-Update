// Applies db/schema.sql. Usage: npm run db:migrate  (reads DATABASE_URL from env or .env)
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.resolve(f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
const sql = fs.readFileSync(path.resolve('db/schema.sql'), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(sql);
await client.end();
console.log('Database schema is up to date.');
