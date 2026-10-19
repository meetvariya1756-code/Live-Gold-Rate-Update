import { NextRequest, NextResponse } from 'next/server';
import { one } from '@/lib/db';
import { deriveRates } from '@/lib/pricing';
import { getRates } from '@/lib/services';

export const dynamic = 'force-dynamic';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors });
}

interface CachedRate {
  data: any;
  expires: number;
}
const rateCache = new Map<string, CachedRate>();

// GET /api/public/rates?shop=xyz.myshopify.com
export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop');
  if (!shop) return NextResponse.json({ error: 'shop required' }, { status: 400, headers: cors });

  const shopKey = shop.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const now = Date.now();
  const cached = rateCache.get(shopKey);
  if (cached && cached.expires > now) {
    return NextResponse.json(cached.data, { headers: cors });
  }

  const store = await one<{ id: number; currency: string; name: string }>(
    'SELECT id, currency, name FROM stores WHERE lower(shop_domain)=$1 LIMIT 1',
    [shopKey]
  );
  if (!store) return NextResponse.json({ error: 'unknown shop' }, { status: 404, headers: cors });

  const rawRates = await getRates(store.id);
  const derived = deriveRates(rawRates);

  // Return mapped clean rates for 24K, 22K, 18K, 14K
  const rates = derived
    .filter((r) => ['gold_24k', 'gold_22k', 'gold_18k', 'gold_14k'].includes(r.key))
    .map((r) => ({
      key: r.key,
      label: r.label,
      karat: r.key.replace('gold_', '').toUpperCase(),
      rate: r.rate,
      currency: store.currency,
    }));

  const payload = {
    currency: store.currency,
    rates,
    updated_at: new Date().toISOString(),
  };

  rateCache.set(shopKey, { data: payload, expires: now + 60000 }); // 60s memory cache

  return NextResponse.json(payload, { headers: cors });
}
