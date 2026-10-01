import { NextRequest } from 'next/server';
import Papa from 'papaparse';
import { q } from '@/lib/db';
import { handler, Ctx } from '@/lib/api';
import { CSV_FIELDS } from '@/lib/csv';
import { requireStoreAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Downloads every variant with its current config — fill in Excel and re-import for bulk setup.
export const GET = handler(async (req: NextRequest, { params }: Ctx<{ storeId: string }>) => {
  const { storeId } = await params;
  const id = Number(storeId);
  await requireStoreAccess(id, req);
  const rows = await q(
    `SELECT c.*, p.title AS product_title, v.title AS variant_title, v.sku, v.gid AS variant_gid, v.price AS current_price
     FROM variants v JOIN products p ON p.store_id=v.store_id AND p.gid=v.product_gid
     LEFT JOIN variant_configs c ON c.store_id=v.store_id AND c.variant_gid=v.gid
     WHERE v.store_id=$1 ORDER BY p.title, v.position`,
    [Number(storeId)],
  );
  const data = rows.map((r) => {
    const o: Record<string, unknown> = {
      product_title: r.product_title, variant_title: r.variant_title, sku: r.sku ?? '', variant_gid: r.variant_gid,
      current_price: r.current_price,
    };
    for (const f of CSV_FIELDS) o[f] = r[f] ?? '';
    return o;
  });
  const csv = Papa.unparse(data, { columns: ['product_title', 'variant_title', 'sku', 'variant_gid', 'current_price', ...CSV_FIELDS] });
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="variant-pricing-store-${storeId}.csv"`,
    },
  });
});
