import { NextRequest, NextResponse } from 'next/server';
import { q, one } from '@/lib/db';
import { normalizeDomain, getAppBaseUrl } from '@/lib/shopify';
import { createSessionToken, SESSION_COOKIE } from '@/lib/session';
import { syncStore } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawShop = searchParams.get('shop');
  const host = searchParams.get('host') || '';
  const embedded = searchParams.get('embedded') || '1';
  const appBase = getAppBaseUrl(req);

  if (!rawShop) {
    return NextResponse.redirect(new URL('/login', appBase));
  }

  const domain = normalizeDomain(rawShop);

  // 1. Check if store already exists and has an active token
  const store = await one<{
    id: number;
    client_user_id: number | null;
    name: string;
    shop_domain: string;
    access_token_enc: string | null;
    last_synced_at: string | null;
  }>(
    `SELECT id, client_user_id, name, shop_domain, access_token_enc, last_synced_at
     FROM stores
     WHERE lower(shop_domain) = lower($1)`,
    [domain],
  );

  // 2. If store doesn't exist OR has no access token, route straight to Shopify OAuth installation!
  if (!store || !store.access_token_enc) {
    const installUrl = new URL('/api/auth/shopify', appBase);
    installUrl.searchParams.set('shop', domain);
    if (host) installUrl.searchParams.set('host', host);
    if (embedded) installUrl.searchParams.set('embedded', embedded);
    return NextResponse.redirect(installUrl);
  }

  // 3. Store exists and has token! Look up or assign client user
  let clientUserId = store.client_user_id;
  let clientUser = clientUserId
    ? await one<{ id: number; username: string; name: string; role: 'admin' | 'client' }>(
        'SELECT id, username, name, role FROM users WHERE id = $1',
        [clientUserId],
      )
    : null;

  if (!clientUser) {
    clientUser = await one<{ id: number; username: string; name: string; role: 'admin' | 'client' }>(
      'SELECT id, username, name, role FROM users WHERE lower(username) = lower($1)',
      [domain],
    );
    if (clientUser) {
      await q('UPDATE stores SET client_user_id = $1 WHERE id = $2', [clientUser.id, store.id]);
    }
  }

  // 4. Auto product sync trigger if store hasn't been synced yet
  if (!store.last_synced_at) {
    syncStore(store.id).catch((e) => console.warn('[shopify-direct] Auto background sync failed:', e));
  }

  // 5. Generate authenticated session
  const sessionPayload = {
    userId: clientUser?.id || clientUserId || 1,
    username: clientUser?.username || domain,
    role: (clientUser?.role as 'admin' | 'client') || 'client',
    name: clientUser?.name || store.name || domain,
  };

  const sessionToken = await createSessionToken(sessionPayload);

  // 6. Redirect directly to the store dashboard
  const targetUrl = new URL(`/stores/${store.id}`, appBase);
  if (host) targetUrl.searchParams.set('host', host);
  if (embedded) targetUrl.searchParams.set('embedded', embedded);
  targetUrl.searchParams.set('shop', domain);
  targetUrl.searchParams.set('authed', '1');

  const res = NextResponse.redirect(targetUrl);
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/',
    maxAge: 30 * 86400, // 30 days
  });

  return res;
}
