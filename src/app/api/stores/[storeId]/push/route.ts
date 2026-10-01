import { NextRequest } from 'next/server';
import { handler, json, Ctx } from '@/lib/api';
import { pushPrices } from '@/lib/services';
import { requireStoreAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST { product_gids?: string[], wait?: boolean }
// Without product_gids: recalculates + pushes every configured variant of the store (runs in background).
export const POST = handler(async (req: NextRequest, { params }: Ctx<{ storeId: string }>) => {
  const { storeId } = await params;
  const id = Number(storeId);
  await requireStoreAccess(id, req);
  const body = await req.json().catch(() => ({}));
  const gids: string[] | undefined = Array.isArray(body.product_gids) && body.product_gids.length ? body.product_gids : undefined;
  const { runId, done } = await pushPrices(id, gids ? 'product' : 'manual', gids);
  if (body.wait || gids) await done;
  return json({ runId });
});
