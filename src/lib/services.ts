// Server-side services: stores, rates, product sync, price push.
import 'server-only';
import { q, one, tx } from './db';
import { encrypt, decrypt } from './crypto';
import {
  ShopCreds,
  ShopifyProduct,
  iterateProducts,
  fetchProduct,
  bulkUpdateVariantPrices,
  ensureBreakupMetafieldDefinition,
  fetchAccessTokenWithClientCredentials,
  normalizeDomain,
  getShopInfo,
  VariantPriceUpdate,
} from './shopify';
import { MetalRate, DEFAULT_METALS, deriveRates, calculatePrice, VariantConfigInput } from './pricing';

export interface StoreRow {
  id: number;
  client_user_id: number | null;
  name: string;
  shop_domain: string;
  auth_type: 'client_credentials' | 'access_token';
  shopify_client_id_enc: string | null;
  shopify_client_secret_enc: string | null;
  access_token_enc: string | null;
  token_expires_at: string | null;
  currency: string;
  round_to: string;
  default_gst_pct: string;
  auto_push: boolean;
  metafield_ready: boolean;
  last_synced_at: string | null;
  last_pushed_at: string | null;
  created_at: string;
}

export function publicStore(s: StoreRow & { client_name?: string | null; client_username?: string | null }) {
  const { access_token_enc, shopify_client_id_enc, shopify_client_secret_enc, ...rest } = s;
  return {
    ...rest,
    round_to: Number(s.round_to),
    default_gst_pct: Number(s.default_gst_pct),
    has_oauth_keys: !!(s.shopify_client_id_enc && s.shopify_client_secret_enc),
    has_token: !!s.access_token_enc,
    token_expires_at: s.token_expires_at,
  };
}

export async function getStore(id: number | string) {
  return one<StoreRow>(
    `SELECT s.*, u.name as client_name, u.username as client_username
     FROM stores s
     LEFT JOIN users u ON u.id = s.client_user_id
     WHERE s.id=$1`,
    [Number(id)],
  );
}

/**
 * Returns fresh, valid Shopify API credentials for the store.
 * If the store uses client_credentials OAuth and the token is expired or
 * expiring within 10 minutes, it automatically generates a new token,
 * stores it encrypted in the database with the new expiry, and returns it.
 */
export async function getFreshCreds(storeOrId: StoreRow | number): Promise<ShopCreds> {
  const store = typeof storeOrId === 'number' ? await getStore(storeOrId) : storeOrId;
  if (!store) throw new Error('Store not found');

  const domain = normalizeDomain(store.shop_domain);

  // If client_credentials configured, check if we need to request / renew the token
  if (store.auth_type === 'client_credentials' || (store.shopify_client_id_enc && store.shopify_client_secret_enc)) {
    const expiresAt = store.token_expires_at ? new Date(store.token_expires_at).getTime() : 0;
    const isExpiredOrExpiringSoon = !store.access_token_enc || !expiresAt || expiresAt <= Date.now() + 600_000; // 10 min threshold

    if (isExpiredOrExpiringSoon) {
      if (!store.shopify_client_id_enc || !store.shopify_client_secret_enc) {
        throw new Error(`Store ${store.name} (${domain}) is missing Shopify Client ID or Client Secret.`);
      }

      const clientId = decrypt(store.shopify_client_id_enc);
      const clientSecret = decrypt(store.shopify_client_secret_enc);

      const tokenRes = await fetchAccessTokenWithClientCredentials(domain, clientId, clientSecret);
      const newToken = tokenRes.access_token;
      const expiresInSec = tokenRes.expires_in || 86400;
      const newExpiresAt = new Date(Date.now() + Math.max(0, expiresInSec - 300) * 1000); // 5 min safety buffer

      const tokenEnc = encrypt(newToken);
      await q(
        `UPDATE stores
         SET access_token_enc = $1, token_expires_at = $2
         WHERE id = $3`,
        [tokenEnc, newExpiresAt.toISOString(), store.id],
      );

      store.access_token_enc = tokenEnc;
      store.token_expires_at = newExpiresAt.toISOString();
      return { shop_domain: domain, access_token: newToken };
    }
  }

  if (!store.access_token_enc) {
    throw new Error(`Store ${store.name} has no valid Shopify access token. Please re-enter credentials.`);
  }

  return {
    shop_domain: domain,
    access_token: decrypt(store.access_token_enc),
  };
}

export async function seedRates(storeId: number) {
  for (const m of DEFAULT_METALS) {
    await q(
      `INSERT INTO metal_rates(store_id,key,label,metal,purity,rate,auto,sort) VALUES($1,$2,$3,$4,$5,0,$6,$7)
       ON CONFLICT (store_id,key) DO NOTHING`,
      [storeId, m.key, m.label, m.metal, m.purity, m.auto, m.sort],
    );
  }
}

export async function getRates(storeId: number): Promise<MetalRate[]> {
  const rows = await q('SELECT key,label,metal,purity,rate,auto,sort,updated_at FROM metal_rates WHERE store_id=$1 ORDER BY sort,key', [storeId]);
  return deriveRates(
    rows.map((r) => ({ ...r, purity: Number(r.purity), rate: Number(r.rate) })),
  );
}

// ---------- Product sync ----------

async function upsertProduct(storeId: number, p: ShopifyProduct) {
  await tx(async (c) => {
    await c.query(
      `INSERT INTO products(store_id,gid,title,handle,status,image_url,options,synced_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (store_id,gid) DO UPDATE SET title=EXCLUDED.title, handle=EXCLUDED.handle, status=EXCLUDED.status,
         image_url=EXCLUDED.image_url, options=EXCLUDED.options, synced_at=NOW()`,
      [storeId, p.id, p.title, p.handle, p.status, p.featuredMedia?.preview?.image?.url ?? null, JSON.stringify(p.options)],
    );
    for (const v of p.variants.nodes) {
      await c.query(
        `INSERT INTO variants(store_id,gid,product_gid,title,sku,options,price,compare_at_price,position,synced_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (store_id,gid) DO UPDATE SET title=EXCLUDED.title, sku=EXCLUDED.sku,
           options=EXCLUDED.options, price=EXCLUDED.price, compare_at_price=EXCLUDED.compare_at_price,
           position=EXCLUDED.position, synced_at=NOW()`,
        [storeId, v.id, p.id, v.title, v.sku, JSON.stringify(v.selectedOptions), v.price, v.compareAtPrice, v.position],
      );
    }
  });
}

export async function syncStore(storeId: number) {
  const creds = await getFreshCreds(storeId);
  const store = (await getStore(storeId))!;
  const started = new Date();
  let count = 0;
  for await (const page of iterateProducts(creds)) {
    for (const p of page) {
      await upsertProduct(storeId, p);
      count++;
    }
  }
  // Remove products deleted in Shopify (configs are kept, they just stop showing)
  await q('DELETE FROM products WHERE store_id=$1 AND synced_at < $2', [storeId, started]);
  await q('DELETE FROM variants WHERE store_id=$1 AND synced_at < $2', [storeId, started]);
  await q('UPDATE stores SET last_synced_at=NOW() WHERE id=$1', [storeId]);
  if (!store.metafield_ready) {
    try {
      await ensureBreakupMetafieldDefinition(creds);
      await q('UPDATE stores SET metafield_ready=TRUE WHERE id=$1', [storeId]);
    } catch (e) {
      console.warn('metafield definition failed', e);
    }
  }
  return count;
}

export async function syncOneProduct(storeId: number, productGid: string) {
  const creds = await getFreshCreds(storeId);
  const p = await fetchProduct(creds, productGid);
  if (!p) {
    await q('DELETE FROM products WHERE store_id=$1 AND gid=$2', [storeId, productGid]);
    await q('DELETE FROM variants WHERE store_id=$1 AND product_gid=$2', [storeId, productGid]);
    return null;
  }
  await upsertProduct(storeId, p);
  return p;
}

// ---------- Variant configs ----------

export function rowToConfig(r: any): VariantConfigInput {
  return {
    metal_key: r.metal_key,
    metal_weight: Number(r.metal_weight),
    making_type: r.making_type,
    making_value: Number(r.making_value),
    wastage_pct: Number(r.wastage_pct),
    diamond_charge: Number(r.diamond_charge),
    gemstone_charge: Number(r.gemstone_charge),
    stones: r.stones || [],
    labour_charge: Number(r.labour_charge),
    hallmark_charge: Number(r.hallmark_charge),
    misc_charge: Number(r.misc_charge),
    markup_pct: Number(r.markup_pct),
    gst_pct: Number(r.gst_pct),
    compare_margin_pct: Number(r.compare_margin_pct),
    remarks: r.remarks,
  };
}

const CFG_COLS = [
  'metal_key', 'metal_weight', 'making_type', 'making_value', 'wastage_pct',
  'diamond_charge', 'gemstone_charge', 'stones', 'labour_charge',
  'hallmark_charge', 'misc_charge', 'markup_pct', 'gst_pct', 'compare_margin_pct', 'remarks',
];

export function sanitizeConfig(input: any): VariantConfigInput {
  const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  return {
    metal_key: String(input?.metal_key || 'gold_14k'),
    metal_weight: Math.max(0, n(input?.metal_weight)),
    making_type: ['per_gram', 'percent', 'fixed'].includes(input?.making_type) ? input.making_type : 'per_gram',
    making_value: Math.max(0, n(input?.making_value)),
    wastage_pct: Math.max(0, n(input?.wastage_pct)),
    diamond_charge: Math.max(0, n(input?.diamond_charge)),
    gemstone_charge: Math.max(0, n(input?.gemstone_charge)),
    stones: Array.isArray(input?.stones)
      ? input.stones.map((s: any) => ({
          type: ['diamond', 'gemstone', 'moissanite', 'other'].includes(s?.type) ? s.type : 'other',
          name: s?.name ? String(s.name).slice(0, 80) : undefined,
          carat: Math.max(0, n(s?.carat)),
          pricePerCarat: Math.max(0, n(s?.pricePerCarat)),
          qty: s?.qty ? Math.max(0, parseInt(s.qty, 10)) : undefined,
        }))
      : [],
    labour_charge: Math.max(0, n(input?.labour_charge)),
    hallmark_charge: Math.max(0, n(input?.hallmark_charge)),
    misc_charge: Math.max(0, n(input?.misc_charge)),
    markup_pct: Math.max(0, n(input?.markup_pct)),
    gst_pct: Math.max(0, n(input?.gst_pct)),
    compare_margin_pct: Math.max(0, n(input?.compare_margin_pct)),
    remarks: input?.remarks ? String(input.remarks).slice(0, 500) : null,
  };
}

export async function saveVariantConfig(storeId: number, variantGid: string, cfg: VariantConfigInput) {
  const v = await one('SELECT product_gid FROM variants WHERE store_id=$1 AND gid=$2', [storeId, variantGid]);
  if (!v) throw new Error(`Variant not found: ${variantGid}`);
  const rates = await getRates(storeId);
  if (!rates.some((r) => r.key === cfg.metal_key)) throw new Error(`Unknown metal: ${cfg.metal_key}`);
  const store = (await getStore(storeId))!;
  const price = calculatePrice(cfg, rates, Number(store.round_to));
  const vals = CFG_COLS.map((c) => (c === 'stones' ? JSON.stringify(cfg.stones) : (cfg as any)[c]));
  const cols = ['store_id', 'variant_gid', 'product_gid', ...CFG_COLS, 'last_calc_price'];
  const ph = cols.map((_, i) => `$${i + 1}`).join(',');
  const upd = [...CFG_COLS, 'last_calc_price', 'product_gid'].map((c) => `${c}=EXCLUDED.${c}`).join(',');
  await q(
    `INSERT INTO variant_configs(${cols.join(',')}) VALUES(${ph})
     ON CONFLICT (store_id,variant_gid) DO UPDATE SET ${upd}, updated_at=NOW()`,
    [storeId, variantGid, v.product_gid, ...vals, price.total],
  );
  return price;
}

// ---------- Push prices to Shopify ----------

function breakupPayload(price: ReturnType<typeof calculatePrice>, currency: string) {
  return JSON.stringify({
    currency,
    metal: price.metal_label,
    weight: price.weight,
    rate_per_gram: price.rate_per_gram,
    lines: price.lines,
    subtotal: price.subtotal,
    total: price.total,
    compare_at: price.compare_at,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Recalculates all configured variants (optionally limited to some products) with today's rates
 * and pushes price, compare-at price and breakup metafield to Shopify.
 */
export async function pushPrices(storeId: number, trigger: string, productGids?: string[]) {
  const store = await getStore(storeId);
  if (!store) throw new Error('Store not found');
  const running = await one<{ id: string }>(
    `SELECT id FROM price_runs WHERE store_id=$1 AND status='running' AND started_at > NOW() - INTERVAL '2 minutes' ORDER BY id DESC LIMIT 1`,
    [storeId]
  );
  if (running && !productGids) {
    return { runId: running.id, done: Promise.resolve({ updated: 0, failed: 0, messages: [] }) };
  }

  const run = (await one<{ id: string }>(
    `INSERT INTO price_runs(store_id,trigger) VALUES($1,$2) RETURNING id`,
    [storeId, trigger],
  ))!;

  const exec = async () => {
    let updated = 0;
    let failed = 0;
    const messages: string[] = [];
    try {
      const creds = await getFreshCreds(storeId);
      const rates = await getRates(storeId);
      const roundStep = Number(store.round_to);
      const rows = await q(
        `SELECT c.* FROM variant_configs c JOIN variants v ON v.store_id=c.store_id AND v.gid=c.variant_gid
         WHERE c.store_id=$1 ${productGids ? 'AND c.product_gid = ANY($2::text[])' : ''} ORDER BY c.product_gid`,
        productGids ? [storeId, productGids] : [storeId],
      );
      await q('UPDATE price_runs SET total=$2 WHERE id=$1', [run.id, rows.length]);

      const byProduct = new Map<string, any[]>();
      for (const r of rows) {
        if (!byProduct.has(r.product_gid)) byProduct.set(r.product_gid, []);
        byProduct.get(r.product_gid)!.push(r);
      }

      for (const [productGid, cfgRows] of byProduct) {
        const updates: (VariantPriceUpdate & { total: number })[] = cfgRows.map((r) => {
          const price = calculatePrice(rowToConfig(r), rates, roundStep);
          return {
            id: r.variant_gid,
            price: price.total.toFixed(2),
            compareAtPrice: price.compare_at ? price.compare_at.toFixed(2) : null,
            breakupJson: breakupPayload(price, store.currency),
            total: price.total,
          };
        });
        const valid = updates.filter((u) => u.total > 0);
        failed += updates.length - valid.length;
        if (updates.length !== valid.length) messages.push(`${productGid}: ${updates.length - valid.length} variant(s) skipped (price 0 — rate or weight missing)`);
        if (!valid.length) continue;
        try {
          const errs = await bulkUpdateVariantPrices(creds, productGid, valid);
          const badIds = new Set(errs.map((e) => e.id).filter(Boolean));
          if (errs.length) messages.push(...errs.slice(0, 3).map((e) => `${productGid}: ${e.message}`));
          for (const u of valid) {
            if (badIds.has(u.id) || (errs.length && !badIds.size)) {
              failed++;
              continue;
            }
            updated++;
            await q(
              `UPDATE variant_configs SET last_calc_price=$3, last_pushed_price=$3, last_pushed_at=NOW() WHERE store_id=$1 AND variant_gid=$2`,
              [storeId, u.id, u.total],
            );
            await q(`UPDATE variants SET price=$3, compare_at_price=$4 WHERE store_id=$1 AND gid=$2`, [storeId, u.id, u.price, u.compareAtPrice]);
          }
        } catch (e: any) {
          failed += valid.length;
          messages.push(`${productGid}: ${e.message}`);
        }
        await q('UPDATE price_runs SET updated=$2, failed=$3 WHERE id=$1', [run.id, updated, failed]);
      }
      await q(
        `UPDATE price_runs SET status='done', updated=$2, failed=$3, message=$4, finished_at=NOW() WHERE id=$1`,
        [run.id, updated, failed, messages.slice(0, 20).join('\n') || null],
      );
      await q('UPDATE stores SET last_pushed_at=NOW() WHERE id=$1', [storeId]);
    } catch (e: any) {
      await q(`UPDATE price_runs SET status='failed', updated=$2, failed=$3, message=$4, finished_at=NOW() WHERE id=$1`, [
        run.id, updated, failed, e.message,
      ]);
    }
  };

  return { runId: run.id, done: exec() };
}
