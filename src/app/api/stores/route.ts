import { NextRequest } from 'next/server';
import { q, one } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { handler, json, err } from '@/lib/api';
import { getShopInfo, normalizeDomain, fetchAccessTokenWithClientCredentials } from '@/lib/shopify';
import { publicStore, seedRates, syncStore, StoreRow } from '@/lib/services';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: NextRequest) => {
  const user = await getCurrentUser(req);
  if (!user) return err('Unauthorized', 401);

  let whereClause = '';
  const params: any[] = [];

  // Clients only see their own assigned stores
  if (user.role !== 'admin') {
    whereClause = 'WHERE s.client_user_id = $1';
    params.push(user.userId);
  }

  const rows = await q<StoreRow & { products: number; configured: number; client_name?: string; client_username?: string }>(
    `SELECT s.*,
       u.name as client_name,
       u.username as client_username,
       (SELECT COUNT(*) FROM products p WHERE p.store_id=s.id)::int AS products,
       (SELECT COUNT(*) FROM variant_configs c JOIN variants v ON v.store_id=c.store_id AND v.gid=c.variant_gid WHERE c.store_id=s.id)::int AS configured,
       (SELECT COUNT(*) FROM variants v WHERE v.store_id=s.id)::int AS variants
     FROM stores s
     LEFT JOIN users u ON u.id = s.client_user_id
     ${whereClause}
     ORDER BY s.name`,
    params,
  );

  return json(rows.map((r: any) => ({
    ...publicStore(r),
    client_name: r.client_name,
    client_username: r.client_username,
    products: r.products,
    variants: r.variants,
    configured: r.configured,
  })));
});

// Connect a new store
export const POST = handler(async (req: NextRequest) => {
  const user = await getCurrentUser(req);
  if (!user) return err('Unauthorized', 401);

  const body = await req.json();
  if (!body.shop_domain) return err('Shop domain is required');
  const shop_domain = normalizeDomain(body.shop_domain);

  if (await one('SELECT id FROM stores WHERE shop_domain=$1', [shop_domain])) {
    return err('This store is already connected', 409);
  }

  const authType = body.auth_type || (body.client_id && body.client_secret ? 'client_credentials' : 'access_token');
  let accessToken = '';
  let tokenExpiresAt: string | null = null;
  let clientIdEnc: string | null = null;
  let clientSecretEnc: string | null = null;

  if (authType === 'client_credentials') {
    const clientId = String(body.client_id || '').trim();
    const clientSecret = String(body.client_secret || '').trim();

    if (!clientId || !clientSecret) {
      return err('Shopify Client ID and Client Secret are required');
    }

    try {
      const tokenRes = await fetchAccessTokenWithClientCredentials(shop_domain, clientId, clientSecret);
      accessToken = tokenRes.access_token;
      const expiresInSec = tokenRes.expires_in || 86400;
      tokenExpiresAt = new Date(Date.now() + Math.max(0, expiresInSec - 300) * 1000).toISOString();
      clientIdEnc = encrypt(clientId);
      clientSecretEnc = encrypt(clientSecret);
    } catch (e: any) {
      return err(`Could not generate Shopify Access Token: ${e.message}`, 400);
    }
  } else {
    accessToken = String(body.access_token || '').trim();
    if (!accessToken) return err('Access token is required');
  }

  let info;
  try {
    info = await getShopInfo({ shop_domain, access_token: accessToken });
  } catch (e: any) {
    return err(`Could not connect to Shopify: ${e.message}`, 400);
  }

  const clientUserId = user.role === 'admin' && body.client_user_id ? Number(body.client_user_id) : (user.role === 'client' ? user.userId : null);

  const store = (await one<StoreRow>(
    `INSERT INTO stores(
       client_user_id, name, shop_domain, auth_type,
       shopify_client_id_enc, shopify_client_secret_enc, access_token_enc, token_expires_at,
       currency, default_gst_pct, round_to
     )
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      clientUserId,
      body.name?.trim() || info.name,
      info.myshopifyDomain || shop_domain,
      authType,
      clientIdEnc,
      clientSecretEnc,
      encrypt(accessToken),
      tokenExpiresAt,
      info.currencyCode,
      Number(body.default_gst_pct ?? 3),
      Number(body.round_to ?? 1),
    ],
  ))!;

  await seedRates(store.id);
  // Initial sync in background
  syncStore(store.id).catch((e) => console.error('initial sync failed', e));

  return json(publicStore(store), 201);
});
