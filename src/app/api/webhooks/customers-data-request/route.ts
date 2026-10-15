import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyWebhookHmac } from '@/lib/shopify';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
    const secret = process.env.SHOPIFY_API_SECRET?.trim() || '';

    if (secret && hmacHeader && !verifyShopifyWebhookHmac(rawBody, hmacHeader, secret)) {
      return NextResponse.json({ error: 'HMAC verification failed' }, { status: 401 });
    }

    // LiveGold Feed does not store end-customer personal data (only products, variants, and rates).
    return NextResponse.json({ ok: true, message: 'No customer data stored by LiveGold Feed' });
  } catch (err) {
    return NextResponse.json({ ok: true });
  }
}
