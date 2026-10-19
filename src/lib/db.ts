import { Pool, PoolClient, QueryResultRow } from 'pg';

const g = globalThis as unknown as { __pgPool?: Pool };

export const pool: Pool =
  g.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '15', 10),
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    keepAlive: true,
    statement_timeout: 30000, // 30s query timeout to prevent hanging connections
  });

// Always attach error listener so idle client disconnects don't crash Node process (502 trigger)
pool.on('error', (err) => {
  console.error('[PostgreSQL Pool] Unexpected idle client error (recovering):', err.message);
});

// Always cache pool on globalThis across all environments to prevent connection leaks
g.__pgPool = pool;

export async function q<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query<T>(text, params as any[]);
  return res.rows;
}

export async function one<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
