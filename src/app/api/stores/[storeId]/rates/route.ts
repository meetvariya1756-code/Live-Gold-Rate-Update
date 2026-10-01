import { NextRequest } from 'next/server';
import { q, tx } from '@/lib/db';
import { handler, json, err, Ctx } from '@/lib/api';
import { getRates, getStore, pushPrices } from '@/lib/services';

import { requireStoreAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';
type P = { storeId: string };

export const GET = handler(async (req: NextRequest, { params }: Ctx<P>) => {
  const { storeId } = await params;
  const id = Number(storeId);
  await requireStoreAccess(id, req);
  const rates = await getRates(id);
  const history = await q(
    `SELECT key, rate, created_at FROM rate_history WHERE store_id=$1 ORDER BY created_at DESC LIMIT 60`,
    [id],
  );
  return json({ rates, history });
});

// Body: { rates: [{key, rate, purity?, auto?, label?}], push?: boolean }
export const PUT = handler(async (req: NextRequest, { params }: Ctx<P>) => {
  const { storeId } = await params;
  const id = Number(storeId);
  await requireStoreAccess(id, req);
  if (!(await getStore(id))) return err('Store not found', 404);
  const body = await req.json();
  if (!Array.isArray(body.rates)) return err('rates[] required');
  const before = new Map((await getRates(id)).map((r) => [r.key, r.rate]));

  await tx(async (c) => {
    for (const r of body.rates) {
      const rate = Number(r.rate);
      if (!Number.isFinite(rate) || rate < 0) throw new Error(`Invalid rate for ${r.key}`);
      await c.query(
        `INSERT INTO metal_rates(store_id,key,label,metal,purity,rate,auto,sort,updated_at)
         VALUES($1,$2,COALESCE($3,$2),COALESCE($4,'gold'),COALESCE($5,1),$6,COALESCE($7,false),COALESCE($8,99),NOW())
         ON CONFLICT (store_id,key) DO UPDATE SET rate=EXCLUDED.rate,
           label=COALESCE($3,metal_rates.label), purity=COALESCE($5,metal_rates.purity),
           auto=COALESCE($7,metal_rates.auto), updated_at=NOW()`,
        [id, r.key, r.label ?? null, r.metal ?? null, r.purity ?? null, rate, typeof r.auto === 'boolean' ? r.auto : null, r.sort ?? null],
      );
    }
  });
  const after = await getRates(id);
  for (const r of after) {
    if (before.get(r.key) !== r.rate) await q('INSERT INTO rate_history(store_id,key,rate) VALUES($1,$2,$3)', [id, r.key, r.rate]);
  }
  let runId: string | null = null;
  // Automatically push prices to Shopify whenever rates are saved/updated
  if (body.push !== false) {
    const { runId: rid } = await pushPrices(id, 'rates_saved');
    runId = rid;
  }
  return json({ rates: after, runId });
});
