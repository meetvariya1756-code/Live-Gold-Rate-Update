import { NextRequest } from 'next/server';
import { q, one } from '@/lib/db';
import { handler, json, err, Ctx } from '@/lib/api';
import { getRates, getStore, publicStore, rowToConfig, syncOneProduct } from '@/lib/services';
import { requireStoreAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';
type P = { storeId: string; productId: string };

// productId is the numeric part of the Shopify GID (gid://shopify/Product/<id>)
// GET ?refresh=1 re-pulls the product from Shopify first.
export const GET = handler(async (req: NextRequest, { params }: Ctx<P>) => {
  const { storeId, productId } = await params;
  const id = Number(storeId);
  await requireStoreAccess(id, req);
  const gid = `gid://shopify/Product/${productId}`;
  const store = await getStore(id);
  if (!store) return err('Store not found', 404);
  if (req.nextUrl.searchParams.get('refresh') === '1') await syncOneProduct(id, gid);

  const product = await one('SELECT * FROM products WHERE store_id=$1 AND gid=$2', [id, gid]);
  if (!product) return err('Product not found — try Sync products', 404);
  const variants = await q('SELECT * FROM variants WHERE store_id=$1 AND product_gid=$2 ORDER BY position', [id, gid]);
  const configs = await q('SELECT * FROM variant_configs WHERE store_id=$1 AND product_gid=$2', [id, gid]);
  const cfgMap = new Map(configs.map((c) => [c.variant_gid, c]));
  return json({
    store: publicStore(store),
    product,
    rates: await getRates(id),
    variants: variants.map((v) => {
      const c = cfgMap.get(v.gid);
      return {
        ...v,
        price: v.price != null ? Number(v.price) : null,
        compare_at_price: v.compare_at_price != null ? Number(v.compare_at_price) : null,
        config: c ? rowToConfig(c) : null,
        last_pushed_price: c?.last_pushed_price != null ? Number(c.last_pushed_price) : null,
        last_pushed_at: c?.last_pushed_at ?? null,
      };
    }),
  });
});
