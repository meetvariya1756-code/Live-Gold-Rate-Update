import { NextRequest, NextResponse } from 'next/server';
import { q, one } from '@/lib/db';
import { encrypt, hashPassword } from '@/lib/crypto';
import {
  normalizeDomain,
  getAppBaseUrl,
  exchangeOAuthCodeForAccessToken,
  verifyShopifyHmac,
  getShopInfo,
  ensureBreakupMetafieldDefinition,
} from '@/lib/shopify';
import { seedRates, syncStore } from '@/lib/services';
import { createSessionToken, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawShop = searchParams.get('shop');
  const code = searchParams.get('code');
  const host = searchParams.get('host') || '';

  if (!rawShop || !code) {
    return NextResponse.json({ error: 'Missing required shop or code parameter' }, { status: 400 });
  }

  const domain = normalizeDomain(rawShop);
  const secret = process.env.SHOPIFY_API_SECRET?.trim() || '';

  // 1. Verify HMAC if secret is configured
  if (secret && !verifyShopifyHmac(searchParams, secret)) {
    console.warn(`[OAuth Callback] HMAC validation failed for ${domain}`);
    return NextResponse.json({ error: 'Shopify HMAC verification failed' }, { status: 400 });
  }

  try {
    // 2. Exchange authorization code for permanent access token
    const tokenData = await exchangeOAuthCodeForAccessToken(domain, code);
    const accessToken = tokenData.access_token;
    const encryptedToken = encrypt(accessToken);
    const encryptedRefreshToken = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null;
    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + Math.max(0, tokenData.expires_in - 300) * 1000).toISOString()
      : null;

    const creds = { shop_domain: domain, access_token: accessToken };

    // 3. Fetch store details from Shopify
    let shopName = domain.replace('.myshopify.com', '');
    let shopCurrency = 'INR';

    try {
      const shopInfo = await getShopInfo(creds);
      if (shopInfo?.name) shopName = shopInfo.name;
      if (shopInfo?.currencyCode) shopCurrency = shopInfo.currencyCode;
    } catch (e) {
      console.warn(`[OAuth Callback] Could not fetch shop info:`, e);
    }

    const shopHandle = domain.replace('.myshopify.com', '');

    // 4. Check or create client user account
    let user = await one<{ id: number; username: string; name: string; role: string }>(
      'SELECT id, username, name, role FROM users WHERE lower(username) = lower($1)',
      [domain],
    );

    if (!user) {
      const tempPass = await hashPassword(`ShopifyOAuth_${domain}_${Date.now()}`);
      user = await one<{ id: number; username: string; name: string; role: string }>(
        `INSERT INTO users (username, name, password_hash, role, is_active)
         VALUES ($1, $2, $3, 'client', TRUE)
         RETURNING id, username, name, role`,
        [domain, shopName, tempPass],
      );
    }

    const clientUserId = user!.id;

    // 5. Upsert store record
    let store = await one<{ id: number; name: string; shop_domain: string; client_user_id: number }>(
      'SELECT id, name, shop_domain, client_user_id FROM stores WHERE lower(shop_domain) = lower($1)',
      [domain],
    );

    if (store) {
      // Update existing store with new active access token & refresh token
      await q(
        `UPDATE stores
         SET access_token_enc = $1,
             refresh_token_enc = COALESCE($2, refresh_token_enc),
             token_expires_at = $3,
             auth_type = 'access_token',
             name = COALESCE(NULLIF($4, ''), name),
             currency = $5,
             client_user_id = COALESCE(client_user_id, $6)
         WHERE id = $7`,
        [encryptedToken, encryptedRefreshToken, tokenExpiresAt, shopName, shopCurrency, clientUserId, store.id],
      );
    } else {
      // Create new store
      store = await one<{ id: number; name: string; shop_domain: string; client_user_id: number }>(
        `INSERT INTO stores (client_user_id, name, shop_domain, auth_type, access_token_enc, refresh_token_enc, token_expires_at, currency, default_gst_pct, round_to)
         VALUES ($1, $2, $3, 'access_token', $4, $5, $6, $7, 3, 1)
         RETURNING id, name, shop_domain, client_user_id`,
        [clientUserId, shopName, domain, encryptedToken, encryptedRefreshToken, tokenExpiresAt, shopCurrency],
      );

      // Seed metal rates
      if (store?.id) {
        await seedRates(store.id);
      }
    }

    const storeId = store!.id;

    // 6. Ensure price breakup metafield definition exists in Shopify
    try {
      await ensureBreakupMetafieldDefinition(creds);
      await q('UPDATE stores SET metafield_ready = TRUE WHERE id = $1', [storeId]);
    } catch (e) {
      console.warn(`[OAuth Callback] Metafield registration skipped/failed:`, e);
    }

    // 7. CRITICAL: Automatically synchronize catalog products directly on install
    // We launch it right away so products start populating immediately!
    syncStore(storeId).catch((err) => {
      console.error(`[OAuth Callback] Automatic product sync error for store #${storeId}:`, err);
    });

    // 8. Create session token
    const sessionToken = await createSessionToken({
      userId: user!.id,
      username: user!.username,
      role: 'client',
      name: shopName,
    });

    // 9. Redirect merchant directly to their Shopify Admin embedded app URL!
    let adminAppUrl = `https://${domain}/admin/apps/gold-rate-price`;
    if (host) {
      try {
        const decodedHost = Buffer.from(host, 'base64').toString('ascii');
        if (decodedHost.includes('admin.shopify.com')) {
          adminAppUrl = `https://${decodedHost}/apps/gold-rate-price`;
        }
      } catch {}
    }

    const fallbackUrl = new URL(`/stores/${storeId}`, getAppBaseUrl(req));
    if (host) fallbackUrl.searchParams.set('host', host);
    fallbackUrl.searchParams.set('shop', domain);
    fallbackUrl.searchParams.set('installed', 'true');
    fallbackUrl.searchParams.set('authed', '1');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Connected — Loading Store...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #0b0f19;
      color: #f1f5f9;
    }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      padding: 32px 40px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      max-width: 440px;
    }
    .spinner {
      border: 3px solid rgba(255, 215, 0, 0.15);
      border-top-color: #ffd700;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { margin: 0 0 10px; font-size: 19px; font-weight: 600; color: #fff; }
    p { margin: 0 0 16px; font-size: 14px; color: #94a3b8; line-height: 1.5; }
  </style>
  <script>
    (function() {
      var adminUrl = ${JSON.stringify(adminAppUrl)};
      var fallback = ${JSON.stringify(fallbackUrl.toString())};
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = adminUrl;
        } else {
          window.location.href = adminUrl;
        }
      } catch (e) {
        window.location.href = fallback;
      }
    })();
  </script>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Store Connected Successfully!</h2>
    <p>Synchronizing your catalog products and live gold rates now. Opening Shopify Admin…</p>
  </div>
</body>
</html>`;

    const res = new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "frame-ancestors 'self' https://*.myshopify.com https://admin.shopify.com",
      },
    });

    res.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      path: '/',
      maxAge: 30 * 86400, // 30 days
    });

    return res;
  } catch (err: any) {
    console.error(`[OAuth Callback] Fatal error:`, err);
    return NextResponse.json(
      { error: `Shopify OAuth connection failed: ${err.message || 'Unknown error'}` },
      { status: 500 },
    );
  }
}
