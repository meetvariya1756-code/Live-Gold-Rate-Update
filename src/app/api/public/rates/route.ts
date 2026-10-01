import { NextRequest, NextResponse } from 'next/server';
import { one } from '@/lib/db';
import { deriveRates } from '@/lib/pricing';
import { getRates } from '@/lib/services';

export const dynamic = 'force-dynamic';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=60',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors });
}

// GET /api/public/rates?shop=xyz.myshopify.com
export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop');
  if (!shop) return NextResponse.json({ error: 'shop required' }, { status: 400, headers: cors });

  const store = await one('SELECT id, currency, name FROM stores WHERE shop_domain=$1', [shop.toLowerCase()]);
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

  return NextResponse.json({
    currency: store.currency,
    rates,
    updated_at: new Date().toISOString(),
  }, { headers: cors });
}
