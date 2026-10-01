import { NextRequest, NextResponse } from 'next/server';
import { autoUpdateStoreRates } from '@/lib/rateFetcher';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GET or POST /api/cron/fetch-live-rates?secret=CRON_SECRET&storeId=123
export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const user = await getCurrentUser(req);

  const isCronAuthed = !!(process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
  const isUserAuthed = !!user;

  if (!isCronAuthed && !isUserAuthed) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 403 });
  }

  const storeIdParam = req.nextUrl.searchParams.get('storeId');
  const storeId = storeIdParam ? Number(storeIdParam) : undefined;

  const result = await autoUpdateStoreRates(storeId);
  return NextResponse.json(result);
}
