import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { normalizeDomain, verifyShopifyWebhookHmac } from '@/lib/shopify';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
    const secret = process.env.SHOPIFY_API_SECRET?.trim() || '';

    // Verify HMAC if secret is configured
    if (secret && hmacHeader && !verifyShopifyWebhookHmac(rawBody, hmacHeader, secret)) {
      console.warn('[Webhook app/uninstalled] HMAC signature verification failed');
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
      console.log(`[Webhook] App uninstalled from store: ${shopDomain}`);
      // Mark store as inactive by clearing access token
      await q('UPDATE stores SET access_token_enc = NULL WHERE lower(shop_domain) = lower($1)', [shopDomain]);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Webhook app/uninstalled] Error:', err);
    return NextResponse.json({ ok: true }); // Always return 200 so Shopify does not retry
  }
}
