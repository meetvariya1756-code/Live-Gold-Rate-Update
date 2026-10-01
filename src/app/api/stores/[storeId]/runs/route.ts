import { NextRequest } from 'next/server';
import { q } from '@/lib/db';
import { handler, json, Ctx } from '@/lib/api';
import { requireStoreAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: NextRequest, { params }: Ctx<{ storeId: string }>) => {
  const { storeId } = await params;
  const id = Number(storeId);
  await requireStoreAccess(id, req);
  const runs = await q('SELECT * FROM price_runs WHERE store_id=$1 ORDER BY started_at DESC LIMIT 15', [id]);
  return json(runs);
});
