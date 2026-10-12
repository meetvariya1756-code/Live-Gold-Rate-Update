const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:root@localhost:5433/gold_pricer',
  connectionTimeoutMillis: 5000,
});

async function run() {
  try {
    const t0 = Date.now();
    const ping = await pool.query('SELECT 1 as ping');
    console.log(`Ping response time: ${Date.now() - t0}ms`);

    const maxConn = await pool.query('SHOW max_connections');
    console.log('PostgreSQL max_connections:', maxConn.rows[0].max_connections);

    const totalConns = await pool.query('SELECT count(*) as total FROM pg_stat_activity');
    console.log('Total active connections in DB:', totalConns.rows[0].total);

    const connsByApp = await pool.query(`
      SELECT application_name, client_addr, state, count(*) as count
      FROM pg_stat_activity
      GROUP BY application_name, client_addr, state
      ORDER BY count DESC
    `);
    console.log('\nConnections grouped by app and state:');
    console.table(connsByApp.rows);

    const locks = await pool.query(`
      SELECT blocked_locks.pid AS blocked_pid,
             blocked_activity.usename AS blocked_user,
             blocking_locks.pid AS blocking_pid,
             blocking_activity.usename AS blocking_user,
             blocked_activity.query AS blocked_statement,
             blocking_activity.query AS current_statement_in_blocking_process
      FROM pg_catalog.pg_locks blocked_locks
      JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
      JOIN pg_catalog.pg_locks blocking_locks 
          ON blocking_locks.locktype = blocked_locks.locktype
          AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
          AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
          AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
          AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
          AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
          AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
          AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
          AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
          AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
          AND blocking_locks.pid != blocked_locks.pid
      JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
      WHERE NOT blocked_locks.granted;
    `);
    console.log('\nBlocked locks:', locks.rows.length);
    if (locks.rows.length > 0) {
      console.table(locks.rows);
    }

    const slowQueries = await pool.query(`
      SELECT pid, now() - query_start AS duration, query, state
      FROM pg_stat_activity
      WHERE state != 'idle' AND (now() - query_start) > interval '2 seconds'
      ORDER BY duration DESC
    `);
    console.log('\nQueries running longer than 2 seconds:', slowQueries.rows.length);
    if (slowQueries.rows.length > 0) {
      console.table(slowQueries.rows);
    }

  } catch (err) {
    console.error('Error running diagnostics:', err);
  } finally {
    await pool.end();
  }
}

run();
