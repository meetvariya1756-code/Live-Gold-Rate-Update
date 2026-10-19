import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { normalizeDomain, getAppBaseUrl } from '@/lib/shopify';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawShop = searchParams.get('shop');

  if (!rawShop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
  }

  const domain = normalizeDomain(rawShop);
  const clientId = process.env.SHOPIFY_API_KEY?.trim();
  const scopes = process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_metaobjects,write_metaobjects';
  const appUrl = getAppBaseUrl(req);
  const redirectUri = `${appUrl}/api/auth/callback`;

  if (!clientId) {
    return NextResponse.json({ error: 'SHOPIFY_API_KEY is not configured in server environment' }, { status: 500 });
  }

  // Cryptographic state nonce
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = `https://${domain}/admin/oauth/authorize?client_id=${encodeURIComponent(
    clientId,
  )}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}&state=${encodeURIComponent(state)}`;

  // If this request is loaded inside Shopify Admin (iframe), a standard 302 redirect is blocked by browsers.
  // We return an HTML breakout page with window.top.location.href to escape the iframe seamlessly.
  const isEmbedded = searchParams.get('embedded') === '1' || req.headers.get('sec-fetch-dest') === 'iframe';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Connecting to Shopify Store...</title>
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
    .btn-install {
      display: inline-block;
      background: linear-gradient(135deg, #ffd700, #b8860b);
      color: #0b0f19 !important;
      font-weight: 700;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      margin-top: 16px;
      box-shadow: 0 4px 12px rgba(255, 215, 0, 0.25);
      font-size: 14px;
      cursor: pointer;
    }
  </style>
  <script>
    (function() {
      var target = ${JSON.stringify(authUrl)};
      var isIframe = false;
      try {
        isIframe = window.top && window.top !== window.self;
        if (isIframe) {
          window.top.location.href = target;
        } else {
          window.location.href = target;
        }
      } catch (e) {
        // Top navigation blocked by sandbox without user activation. Show install button.
        var btn = document.getElementById('manual-btn');
        if (btn) btn.style.display = 'inline-block';
      }
    })();
  </script>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Install Live Gold Feed</h2>
    <p>Authorize access to synchronize live gold rates and update variant prices automatically.</p>
    <div>
      <a id="manual-btn" href="${authUrl}" target="_top" class="btn-install">
        👉 Click Here to Install & Authorize
      </a>
    </div>
  </div>
</body>
</html>`;

  const res = new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "frame-ancestors 'self' https://*.myshopify.com https://admin.shopify.com",
    },
  });

  res.cookies.set('shopify_oauth_state', state, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/',
    maxAge: 600, // 10 minutes
  });

  return res;
}
