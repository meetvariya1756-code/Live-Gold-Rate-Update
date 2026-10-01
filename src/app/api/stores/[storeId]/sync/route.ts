import { NextRequest } from 'next/server';
import { handler, json, Ctx } from '@/lib/api';
import { syncStore } from '@/lib/services';
import { requireStoreAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = handler(async (req: NextRequest, { params }: Ctx<{ storeId: string }>) => {
  const { storeId } = await params;
  const id = Number(storeId);
  await requireStoreAccess(id, req);
  const count = await syncStore(id);
  return json({ ok: true, products: count });
});
