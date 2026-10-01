import { NextRequest } from 'next/server';
import { q } from '@/lib/db';
import { handler, json, Ctx } from '@/lib/api';
import { requireStoreAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET ?search=&filter=all|done|partial|pending&page=1
export const GET = handler(async (req: NextRequest, { params }: Ctx<{ storeId: string }>) => {
  const { storeId } = await params;
  const id = Number(storeId);
  await requireStoreAccess(id, req);
  const sp = req.nextUrl.searchParams;
  const search = (sp.get('search') || '').trim().toLowerCase();
  const filter = sp.get('filter') || 'all';
  const page = Math.max(1, Number(sp.get('page') || 1));
  const size = 25;

  const having =
    filter === 'done' ? 'WHERE configured = variant_count AND variant_count > 0'
    : filter === 'partial' ? 'WHERE configured > 0 AND configured < variant_count'
    : filter === 'pending' ? 'WHERE configured = 0'
    : '';

  const rows = await q(
    `WITH x AS (
       SELECT p.gid, p.title, p.handle, p.status, p.image_url,
         (SELECT COUNT(*) FROM variants v WHERE v.store_id=p.store_id AND v.product_gid=p.gid)::int AS variant_count,
         (SELECT COUNT(*) FROM variant_configs c JOIN variants v ON v.store_id=c.store_id AND v.gid=c.variant_gid
            WHERE c.store_id=p.store_id AND v.product_gid=p.gid)::int AS configured,
         (SELECT MIN(price) FROM variants v WHERE v.store_id=p.store_id AND v.product_gid=p.gid) AS min_price,
         (SELECT MAX(price) FROM variants v WHERE v.store_id=p.store_id AND v.product_gid=p.gid) AS max_price
       FROM products p
       WHERE p.store_id=$1 AND ($2 = '' OR lower(p.title) LIKE '%'||$2||'%' OR lower(p.handle) LIKE '%'||$2||'%'
         OR EXISTS (SELECT 1 FROM variants v WHERE v.store_id=p.store_id AND v.product_gid=p.gid AND lower(v.sku) LIKE '%'||$2||'%'))
     )
     SELECT *, COUNT(*) OVER()::int AS total_count FROM x ${having}
     ORDER BY title LIMIT $3 OFFSET $4`,
    [Number(storeId), search, size, (page - 1) * size],
  );
  return json({
    products: rows.map(({ total_count, ...r }) => r),
    total: rows[0]?.total_count ?? 0,
    page,
    pageSize: size,
  });
});
