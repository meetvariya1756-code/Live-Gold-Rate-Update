const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgres://postgres:root@localhost:5433/gold_pricer',
});

async function testAllTables() {
  console.log('Testing raw PostgreSQL table access times...\n');
  const tables = [
    'stores',
    'users',
    'products',
    'variants',
    'variant_configs',
    'daily_rates',
    'price_push_runs',
    'support_requests',
    'support_messages',
    'live_call_sessions',
    'schema_migrations',
  ];

  for (const t of tables) {
    try {
      const t0 = performance.now();
      const countRes = await pool.query(`SELECT count(*) FROM ${t}`);
      const tCount = performance.now();
      const sampleRes = await pool.query(`SELECT * FROM ${t} LIMIT 5`);
      const tSample = performance.now();

      console.log(`Table "${t}":`);
      console.log(`  Row count: ${countRes.rows[0].count}`);
      console.log(`  Count query time: ${(tCount - t0).toFixed(2)}ms`);
      console.log(`  Sample 5 rows time: ${(tSample - tCount).toFixed(2)}ms`);
    } catch (e) {
      console.log(`Table "${t}": ERROR ${e.message}`);
    }
  }

  await pool.end();
}

testAllTables();
