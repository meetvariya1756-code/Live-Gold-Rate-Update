import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { normalizeDomain, verifyShopifyWebhookHmac } from '@/lib/shopify';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
    const secret = process.env.SHOPIFY_API_SECRET?.trim() || '';

    if (secret && hmacHeader && !verifyShopifyWebhookHmac(rawBody, hmacHeader, secret)) {
      return NextResponse.json({ error: 'HMAC verification failed' }, { status: 401 });
    }

    const shopHeader = req.headers.get('x-shopify-shop-domain');
    let shopDomain = shopHeader ? normalizeDomain(shopHeader) : '';

    if (!shopDomain) {
      try {
        const payload = JSON.parse(rawBody);
        if (payload?.myshopify_domain) shopDomain = normalizeDomain(payload.myshopify_domain);
      } catch {}
    }

    if (shopDomain) {
      console.log(`[Webhook shop/redact] Purging store data for: ${shopDomain}`);
      // Remove encrypted token and sensitive credentials upon store redaction request
      await q('UPDATE stores SET access_token_enc = NULL, shopify_client_id_enc = NULL, shopify_client_secret_enc = NULL WHERE lower(shop_domain) = lower($1)', [shopDomain]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: true });
  }
}
