const { Client } = require('pg');

const INDEXES = [
  // Products table
  "CREATE INDEX IF NOT EXISTS products_store_idx ON products(store_id)",
  "CREATE INDEX IF NOT EXISTS products_title_idx ON products(store_id, lower(title))",
  "CREATE INDEX IF NOT EXISTS products_handle_idx ON products(store_id, handle)",

  // Variants table
  "CREATE INDEX IF NOT EXISTS variants_store_idx ON variants(store_id)",
  "CREATE INDEX IF NOT EXISTS variants_product_idx ON variants(store_id, product_gid)",
  "CREATE INDEX IF NOT EXISTS variants_sku_idx ON variants(store_id, lower(sku))",

  // Variant configs
  "CREATE INDEX IF NOT EXISTS variant_configs_store_idx ON variant_configs(store_id)",
  "CREATE INDEX IF NOT EXISTS variant_configs_product_idx ON variant_configs(store_id, product_gid)",
  "CREATE INDEX IF NOT EXISTS variant_configs_store_gid_idx ON variant_configs(store_id, variant_gid)",
  "CREATE INDEX IF NOT EXISTS variant_configs_metal_idx ON variant_configs(store_id, metal_key)",

  // Stores
  "CREATE INDEX IF NOT EXISTS stores_domain_lower_idx ON stores(lower(shop_domain))",
  "CREATE INDEX IF NOT EXISTS stores_client_user_idx ON stores(client_user_id)",

  // Users
  "CREATE INDEX IF NOT EXISTS users_username_lower_idx ON users(lower(username))",
  "CREATE INDEX IF NOT EXISTS users_role_idx ON users(role)",

  // Support
  "CREATE INDEX IF NOT EXISTS support_requests_store_idx ON support_requests(store_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS support_requests_status_idx ON support_requests(status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS support_requests_client_user_idx ON support_requests(client_user_id)",
  "CREATE INDEX IF NOT EXISTS support_requests_unread_idx ON support_requests(is_read_by_admin) WHERE is_read_by_admin = FALSE",
  "CREATE INDEX IF NOT EXISTS support_messages_req_idx ON support_messages(request_id, created_at ASC)",

  // Metal Rates & History
  "CREATE INDEX IF NOT EXISTS metal_rates_store_idx ON metal_rates(store_id)",
  "CREATE INDEX IF NOT EXISTS rate_history_store_idx ON rate_history(store_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS price_runs_store_idx ON price_runs(store_id, started_at DESC)",
];

(async () => {
  const c = new Client(process.env.DATABASE_URL);
  await c.connect();
  console.log('Connected. Creating performance indexes...');
  for (const sql of INDEXES) {
    try {
      await c.query(sql);
      console.log('✓', sql.split('ON ')[1]);
    } catch (e) {
      console.error('✗ Failed:', sql, e.message);
    }
  }

  // Analyze all tables so the PostgreSQL query planner has updated statistics
  await c.query('ANALYZE');
  console.log('✓ Database ANALYZE completed.');

  try {
    await c.query("ALTER DATABASE gold_pricer SET idle_session_timeout = '60s'");
    await c.query("ALTER DATABASE gold_pricer SET idle_in_transaction_session_timeout = '30s'");
    console.log('✓ Automatic idle connection reaper configured (60s limit).');
  } catch (e) {
    console.warn('Note on idle timeout:', e.message);
  }

  await c.end();
})();
