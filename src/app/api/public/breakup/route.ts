import { NextRequest, NextResponse } from 'next/server';
import { one, q } from '@/lib/db';
import { calculatePrice, guessMetalKey } from '@/lib/pricing';
import { getRates, rowToConfig, syncOneProduct } from '@/lib/services';

export const dynamic = 'force-dynamic';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=60',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors });
}

// GET /api/public/breakup?shop=xyz.myshopify.com&product=<numeric product id or handle>
export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop');
  const product = req.nextUrl.searchParams.get('product');
  if (!shop || !product) {
    return NextResponse.json({ error: 'shop and product are required' }, { status: 400, headers: cors });
  }

  const cleanShop = shop.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const store = await one<{ id: number; currency: string; round_to: string }>(
    `SELECT id, currency, round_to FROM stores
     WHERE lower(shop_domain) = $1 OR lower(shop_domain) LIKE $2
     LIMIT 1`,
    [cleanShop, `%${cleanShop}%`],
  );

  if (!store) {
    return NextResponse.json({ error: `Store '${cleanShop}' not found in Gold Rate Pricer.` }, { status: 404, headers: cors });
  }

  // Find product GID (handles numeric ID, handle, or GID)
  let productGid = product.startsWith('gid://') ? product : `gid://shopify/Product/${product}`;
  if (!/^\d+$/.test(product) && !product.startsWith('gid://')) {
    const pRow = await one<{ gid: string }>(
      'SELECT gid FROM products WHERE store_id = $1 AND (lower(handle) = lower($2) OR gid LIKE $3) LIMIT 1',
      [store.id, product, `%${product}`],
    );
    if (pRow) productGid = pRow.gid;
  }

  const rates = await getRates(store.id);
  let cfgs = await q(
    'SELECT * FROM variant_configs WHERE store_id = $1 AND product_gid = $2',
    [store.id, productGid],
  );

  // If not configured yet, attempt auto-sync from Shopify live
  if (cfgs.length === 0) {
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
    variants[c.variant_gid] = payload; // Support both numeric ID and full GID
  }

  return NextResponse.json({
    shop: cleanShop,
    product_gid: productGid,
    currency: store.currency,
    variants,
  }, { headers: cors });
}
