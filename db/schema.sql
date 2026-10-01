-- Gold Rate Pricer schema (PostgreSQL). Safe to run multiple times.

-- Multi-Tenant Users (Admins and Clients)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,          -- client_id / login username / email
  name          TEXT NOT NULL,                 -- Display name (e.g. "Acme Jewellers")
  password_hash TEXT NOT NULL,                 -- salt + scrypt hash
  role          TEXT NOT NULL DEFAULT 'client',-- 'admin' | 'client'
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_username_idx ON users(lower(username));

-- Stores Table
CREATE TABLE IF NOT EXISTS stores (
  id                        SERIAL PRIMARY KEY,
  client_user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name                      TEXT NOT NULL,
  shop_domain               TEXT NOT NULL UNIQUE,          -- xyz.myshopify.com
  auth_type                 TEXT NOT NULL DEFAULT 'client_credentials', -- 'client_credentials' | 'access_token'
  shopify_client_id_enc     TEXT,                          -- AES-256-GCM encrypted Shopify Client ID
  shopify_client_secret_enc TEXT,                          -- AES-256-GCM encrypted Shopify Client Secret
  access_token_enc          TEXT,                          -- AES-256-GCM encrypted Active Access Token
  token_expires_at          TIMESTAMPTZ,                   -- Expiration timestamp for automatic renewal
  currency                  TEXT NOT NULL DEFAULT 'INR',
  round_to                  NUMERIC(12,2) NOT NULL DEFAULT 1,   -- 0 = no rounding, 1, 10, 100 ...
  default_gst_pct           NUMERIC(6,3) NOT NULL DEFAULT 3,
  auto_push                 BOOLEAN NOT NULL DEFAULT FALSE,     -- cron endpoint pushes prices for this store
  metafield_ready           BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at            TIMESTAMPTZ,
  last_pushed_at            TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column additions for existing installations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='client_user_id') THEN
    ALTER TABLE stores ADD COLUMN client_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='auth_type') THEN
    ALTER TABLE stores ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'client_credentials';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='shopify_client_id_enc') THEN
    ALTER TABLE stores ADD COLUMN shopify_client_id_enc TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='shopify_client_secret_enc') THEN
    ALTER TABLE stores ADD COLUMN shopify_client_secret_enc TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='token_expires_at') THEN
    ALTER TABLE stores ADD COLUMN token_expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- One row per metal / purity per store. rate = price per gram in store currency.
CREATE TABLE IF NOT EXISTS metal_rates (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,                  -- gold_24k, gold_22k, gold_18k, gold_14k, silver ...
  label       TEXT NOT NULL,
  metal       TEXT NOT NULL,                  -- gold | silver | platinum
  purity      NUMERIC(7,4) NOT NULL,          -- 0.5833 for 14K
  rate        NUMERIC(14,4) NOT NULL DEFAULT 0,
  auto        BOOLEAN NOT NULL DEFAULT TRUE,  -- auto-derive from base (24K / 999) rate
  sort        INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, key)
);

CREATE TABLE IF NOT EXISTS rate_history (
  id          BIGSERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  rate        NUMERIC(14,4) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rate_history_store_idx ON rate_history(store_id, created_at DESC);

-- Cache of Shopify products / variants (source of truth stays Shopify)
CREATE TABLE IF NOT EXISTS products (
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  gid         TEXT NOT NULL,
  title       TEXT NOT NULL,
  handle      TEXT,
  status      TEXT,
  image_url   TEXT,
  options     JSONB NOT NULL DEFAULT '[]',     -- [{name, values:[...]}]
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, gid)
);
CREATE INDEX IF NOT EXISTS products_title_idx ON products(store_id, lower(title));

CREATE TABLE IF NOT EXISTS variants (
  store_id          INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  gid               TEXT NOT NULL,
  product_gid       TEXT NOT NULL,
  title             TEXT NOT NULL,
  sku               TEXT,
  options           JSONB NOT NULL DEFAULT '[]', -- [{name, value}]
  price             NUMERIC(14,2),
  compare_at_price  NUMERIC(14,2),
  position          INTEGER NOT NULL DEFAULT 0,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, gid)
);
CREATE INDEX IF NOT EXISTS variants_product_idx ON variants(store_id, product_gid);

-- Pricing configuration per variant (the part only we know)
CREATE TABLE IF NOT EXISTS variant_configs (
  store_id            INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  variant_gid         TEXT NOT NULL,
  product_gid         TEXT NOT NULL,
  metal_key           TEXT NOT NULL,
  metal_weight        NUMERIC(12,4) NOT NULL DEFAULT 0,   -- grams
  making_type         TEXT NOT NULL DEFAULT 'per_gram',   -- per_gram | percent | fixed
  making_value        NUMERIC(14,4) NOT NULL DEFAULT 0,
  wastage_pct         NUMERIC(8,4)  NOT NULL DEFAULT 0,
  diamond_charge      NUMERIC(14,2) NOT NULL DEFAULT 0,
  gemstone_charge     NUMERIC(14,2) NOT NULL DEFAULT 0,
  stones              JSONB NOT NULL DEFAULT '[]',        -- [{type,name,carat,pricePerCarat,qty}]
  labour_charge       NUMERIC(14,2) NOT NULL DEFAULT 0,
  hallmark_charge     NUMERIC(14,2) NOT NULL DEFAULT 0,
  misc_charge         NUMERIC(14,2) NOT NULL DEFAULT 0,
  markup_pct          NUMERIC(8,4)  NOT NULL DEFAULT 0,
  gst_pct             NUMERIC(8,4)  NOT NULL DEFAULT 3,
  compare_margin_pct  NUMERIC(8,4)  NOT NULL DEFAULT 0,
  remarks             TEXT,
  last_calc_price     NUMERIC(14,2),
  last_pushed_price   NUMERIC(14,2),
  last_pushed_at      TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, variant_gid)
);
CREATE INDEX IF NOT EXISTS variant_configs_product_idx ON variant_configs(store_id, product_gid);

CREATE TABLE IF NOT EXISTS price_runs (
  id           BIGSERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  trigger      TEXT NOT NULL,                 -- manual | rates_saved | cron | product
  status       TEXT NOT NULL DEFAULT 'running', -- running | done | failed
  total        INTEGER NOT NULL DEFAULT 0,
  updated      INTEGER NOT NULL DEFAULT 0,
  failed       INTEGER NOT NULL DEFAULT 0,
  message      TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS price_runs_store_idx ON price_runs(store_id, started_at DESC);
