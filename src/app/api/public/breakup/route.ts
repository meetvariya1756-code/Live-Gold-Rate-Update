import { NextRequest, NextResponse } from 'next/server';
import { one, q } from '@/lib/db';
import { calculatePrice, guessMetalKey } from '@/lib/pricing';
import { getRates, rowToConfig, syncOneProduct } from '@/lib/services';

export const dynamic = 'force-dynamic';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors });
}

// In-memory micro-caches to prevent hammering Postgres on high traffic / bot crawl
interface StoreCacheItem {
  store: { id: number; currency: string; round_to: string } | null;
  expires: number;
}
interface RatesCacheItem {
  rates: any[];
  expires: number;
}
interface BreakupCacheItem {
  payload: any;
  expires: number;
}

const storeCache = new Map<string, StoreCacheItem>();
const storeRatesCache = new Map<number, RatesCacheItem>();
const breakupCache = new Map<string, BreakupCacheItem>();
const syncLock = new Set<string>();

// Helper to get cached store
async function getCachedStore(cleanShop: string) {
  const now = Date.now();
  const cached = storeCache.get(cleanShop);
  if (cached && cached.expires > now) return cached.store;

  // Try exact indexed lookup first
  let store = await one<{ id: number; currency: string; round_to: string }>(
    `SELECT id, currency, round_to FROM stores WHERE lower(shop_domain) = $1 LIMIT 1`,
    [cleanShop],
  );

  // Fallback if domain had subdomain variations
  if (!store && cleanShop.includes('.')) {
    store = await one<{ id: number; currency: string; round_to: string }>(
      `SELECT id, currency, round_to FROM stores WHERE lower(shop_domain) LIKE $1 LIMIT 1`,
      [`%${cleanShop}%`],
    );
  }

  storeCache.set(cleanShop, { store, expires: now + 300_000 }); // 5 min cache
  return store;
}

// Helper to get cached rates
async function getCachedRates(storeId: number) {
  const now = Date.now();
  const cached = storeRatesCache.get(storeId);
  if (cached && cached.expires > now) return cached.rates;

  const rates = await getRates(storeId);
  storeRatesCache.set(storeId, { rates, expires: now + 60_000 }); // 60s cache
  return rates;
}

// GET /api/public/breakup?shop=xyz.myshopify.com&product=<numeric product id or handle>
export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop');
  const product = req.nextUrl.searchParams.get('product');
  if (!shop || !product) {
    return NextResponse.json({ error: 'shop and product are required' }, { status: 400, headers: cors });
  }

  const cleanShop = shop.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const cleanProduct = product.trim();
  const cacheKey = `${cleanShop}:${cleanProduct}`;
  const now = Date.now();

  const cachedBreakup = breakupCache.get(cacheKey);
  if (cachedBreakup && cachedBreakup.expires > now) {
    return NextResponse.json(cachedBreakup.payload, { headers: cors });
  }

  const store = await getCachedStore(cleanShop);
  if (!store) {
    return NextResponse.json({ error: `Store '${cleanShop}' not found in LiveGold Feed.` }, { status: 404, headers: cors });
  }

  // Find product GID (handles numeric ID, handle, or GID)
  let productGid = cleanProduct.startsWith('gid://') ? cleanProduct : `gid://shopify/Product/${cleanProduct}`;
  if (!/^\d+$/.test(cleanProduct) && !cleanProduct.startsWith('gid://')) {
    const pRow = await one<{ gid: string }>(
      'SELECT gid FROM products WHERE store_id = $1 AND (lower(handle) = lower($2) OR gid LIKE $3) LIMIT 1',
      [store.id, cleanProduct, `%${cleanProduct}`],
    );
    if (pRow) productGid = pRow.gid;
  }

  const rates = await getCachedRates(store.id);
  let cfgs = await q(
    'SELECT * FROM variant_configs WHERE store_id = $1 AND product_gid = $2',
    [store.id, productGid],
  );

  // If not configured yet, attempt auto-sync with lock to prevent concurrency thrashing
  if (cfgs.length === 0) {
    const lockKey = `${store.id}:${productGid}`;
    if (!syncLock.has(lockKey)) {
      syncLock.add(lockKey);
      try {
        const p = await syncOneProduct(store.id, productGid);
        if (p && p.variants && p.variants.nodes) {
          for (const v of p.variants.nodes) {
            const optValues = (v.selectedOptions || []).map((o: any) => o.value);
            optValues.push(v.title);
            const metalKey = guessMetalKey(optValues) || 'gold_18k';
            const defaultWeight = metalKey === 'gold_14k' ? 1.5 : (metalKey === 'gold_18k' ? 2.5 : 2.0);
            const defaultMaking = metalKey === 'gold_14k' ? 5195.73 : 5000.0;

            await q(
              `INSERT INTO variant_configs(store_id, variant_gid, product_gid, metal_key, metal_weight, making_type, making_value, gst_pct, updated_at)
               VALUES($1, $2, $3, $4, $5, 'fixed', $6, 3, NOW())
               ON CONFLICT (store_id, variant_gid) DO NOTHING`,
              [store.id, v.id, productGid, metalKey, defaultWeight, defaultMaking],
            );
          }
          cfgs = await q(
            'SELECT * FROM variant_configs WHERE store_id = $1 AND product_gid = $2',
            [store.id, productGid],
          );
        }
      } catch (e) {
        console.warn('Auto-sync product breakup failed:', e);
      } finally {
        syncLock.delete(lockKey);
      }
    }
  }

  const variants: Record<string, unknown> = {};
  for (const c of cfgs) {
    const p = calculatePrice(rowToConfig(c), rates, Number(store.round_to));
    const numericId = c.variant_gid.split('/').pop() || c.variant_gid;
    const payload = {
      currency: store.currency,
      metal: p.metal_label,
      weight: p.weight,
      rate_per_gram: p.rate_per_gram,
      lines: p.lines,
      subtotal: p.subtotal,
      total: p.total,
      compare_at: p.compare_at,
    };
    variants[numericId] = payload;
    variants[c.variant_gid] = payload;
  }

  const responsePayload = {
    shop: cleanShop,
    product_gid: productGid,
    currency: store.currency,
    variants,
  };

  // Cache computed breakup for 60 seconds
  breakupCache.set(cacheKey, { payload: responsePayload, expires: now + 60_000 });

  return NextResponse.json(responsePayload, { headers: cors });
}
