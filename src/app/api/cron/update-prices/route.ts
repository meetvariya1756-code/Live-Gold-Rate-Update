import { NextRequest } from 'next/server';
import { q } from '@/lib/db';
import { handler, json, err } from '@/lib/api';
import { pushPrices } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GET /api/cron/update-prices?secret=CRON_SECRET  (or header Authorization: Bearer CRON_SECRET)
// Recalculates and pushes prices for every store with auto_push enabled.
export const GET = handler(async (req: NextRequest) => {
  const secret = req.nextUrl.searchParams.get('secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) return err('Unauthorized', 401);
  const stores = await q('SELECT id FROM stores WHERE auto_push = TRUE');
  const out = [];
  for (const s of stores) {
    try {
      const { runId, done } = await pushPrices(s.id, 'cron');
      await done;
      out.push({ store: s.id, runId });
    } catch (e: any) {
      out.push({ store: s.id, error: e.message });
    }
  }
  return json({ ok: true, stores: out });
});
