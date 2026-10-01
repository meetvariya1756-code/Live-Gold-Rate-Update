import { NextRequest } from 'next/server';
import { q } from '@/lib/db';
import { handler, json, err, Ctx } from '@/lib/api';
import { sanitizeConfig, saveVariantConfig } from '@/lib/services';
import { requireStoreAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';
type P = { storeId: string };

// PUT { items: [{ variant_gid, config }] } — save one or many variant configs (group save / copy to all)
export const PUT = handler(async (req: NextRequest, { params }: Ctx<P>) => {
  const { storeId } = await params;
  const id = Number(storeId);
  await requireStoreAccess(id, req);
  const body = await req.json();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return err('items[] required');
  const results = [];
  for (const it of items) {
    const cfg = sanitizeConfig(it.config);
    if (cfg.metal_weight <= 0) return err(`Metal weight is required (${it.variant_gid})`);
    const price = await saveVariantConfig(id, String(it.variant_gid), cfg);
    results.push({ variant_gid: it.variant_gid, price });
  }
  return json({ results });
});

// DELETE { variant_gids: [] } — remove pricing config (variant goes back to "not set")
export const DELETE = handler(async (req: NextRequest, { params }: Ctx<P>) => {
  const { storeId } = await params;
  const body = await req.json();
  await q('DELETE FROM variant_configs WHERE store_id=$1 AND variant_gid = ANY($2::text[])', [Number(storeId), body.variant_gids || []]);
  return json({ ok: true });
});
