import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

async function setup() {
  const adminClient = new pg.Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres'
  });
  
  await adminClient.connect();
  const checkDb = await adminClient.query("SELECT 1 FROM pg_database WHERE datname='gold_pricer'");
  if (checkDb.rowCount === 0) {
    await adminClient.query('CREATE DATABASE gold_pricer');
    console.log('Created database "gold_pricer".');
  } else {
    console.log('Database "gold_pricer" already exists.');
  }
  await adminClient.end();

  // Generate .env if not exists
  const envPath = path.resolve('.env');
  if (!fs.existsSync(envPath)) {
    const encKey = crypto.randomBytes(32).toString('hex');
    const sessionSecret = crypto.randomBytes(32).toString('hex');
    const cronSecret = crypto.randomBytes(16).toString('hex');

    const envContent = `# PostgreSQL connection
DATABASE_URL=postgres://postgres:postgres@localhost:5432/gold_pricer

# Login password for this admin panel
ADMIN_PASSWORD=admin123

# Random 32+ char string used to sign the login cookie
SESSION_SECRET=${sessionSecret}

# 64 hex chars (32 bytes) used to encrypt Shopify access tokens at rest
ENCRYPTION_KEY=${encKey}

# Shopify Admin API version
SHOPIFY_API_VERSION=2025-10

# Secret for the cron endpoint: GET /api/cron/update-prices?secret=...
CRON_SECRET=${cronSecret}
`;
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('Created .env with secure random keys.');
  } else {
    console.log('.env already exists.');
  }
}

setup().catch(err => {
  console.error('Setup error:', err);
  process.exit(1);
});
