import { NextRequest } from 'next/server';
import { q } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { handler, json, err, Ctx } from '@/lib/api';
import { getStore, publicStore } from '@/lib/services';
import { getShopInfo, fetchAccessTokenWithClientCredentials } from '@/lib/shopify';
import { requireStoreAccess, getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
type P = { storeId: string };

export const GET = handler(async (req: NextRequest, { params }: Ctx<P>) => {
  const { storeId } = await params;
  const id = Number(storeId);
  await requireStoreAccess(id, req);

  const s = await getStore(id);
  if (!s) return err('Store not found', 404);

  const [stats] = await q(
    `SELECT (SELECT COUNT(*) FROM products WHERE store_id=$1)::int AS products,
            (SELECT COUNT(*) FROM variants WHERE store_id=$1)::int AS variants,
            (SELECT COUNT(*) FROM variant_configs c JOIN variants v ON v.store_id=c.store_id AND v.gid=c.variant_gid WHERE c.store_id=$1)::int AS configured`,
    [s.id],
  );
  return json({ ...publicStore(s), ...stats });
});

// Update settings: { name?, default_gst_pct?, round_to?, auto_push?, client_id?, client_secret?, access_token?, client_user_id? }
export const PATCH = handler(async (req: NextRequest, { params }: Ctx<P>) => {
  const { storeId } = await params;
  const id = Number(storeId);
  const user = await requireStoreAccess(id, req);

  const s = await getStore(id);
  if (!s) return err('Store not found', 404);

  const b = await req.json();

  // If Client ID & Secret are updated
  if (b.client_id && b.client_secret) {
    const clientId = String(b.client_id).trim();
    const clientSecret = String(b.client_secret).trim();
    try {
      const tokenRes = await fetchAccessTokenWithClientCredentials(s.shop_domain, clientId, clientSecret);
      const expiresInSec = tokenRes.expires_in || 86400;
      const tokenExpiresAt = new Date(Date.now() + Math.max(0, expiresInSec - 300) * 1000).toISOString();

      await q(
        `UPDATE stores
         SET shopify_client_id_enc = $2, shopify_client_secret_enc = $3,
             access_token_enc = $4, token_expires_at = $5, auth_type = 'client_credentials'
         WHERE id = $1`,
        [s.id, encrypt(clientId), encrypt(clientSecret), encrypt(tokenRes.access_token), tokenExpiresAt],
      );
    } catch (e: any) {
      return err(`Failed to connect with new Client ID / Secret: ${e.message}`, 400);
    }
  } else if (b.access_token) {
    const accessToken = String(b.access_token).trim();
    await getShopInfo({ shop_domain: s.shop_domain, access_token: accessToken });
    await q(`UPDATE stores SET access_token_enc=$2, auth_type='access_token' WHERE id=$1`, [s.id, encrypt(accessToken)]);
  }

  // Update client assignment (Admin only)
  if (user.role === 'admin' && b.client_user_id !== undefined) {
    const clientUserId = b.client_user_id ? Number(b.client_user_id) : null;
    await q('UPDATE stores SET client_user_id=$2 WHERE id=$1', [s.id, clientUserId]);
  }

  await q(
    `UPDATE stores SET name=COALESCE($2,name), default_gst_pct=COALESCE($3,default_gst_pct),
       round_to=COALESCE($4,round_to), auto_push=COALESCE($5,auto_push) WHERE id=$1`,
    [s.id, b.name ?? null, b.default_gst_pct ?? null, b.round_to ?? null, typeof b.auto_push === 'boolean' ? b.auto_push : null],
  );

  return json(publicStore((await getStore(s.id))!));
});

export const DELETE = handler(async (req: NextRequest, { params }: Ctx<P>) => {
  const { storeId } = await params;
  const id = Number(storeId);
  const user = await requireStoreAccess(id, req);

  if (user.role !== 'admin') {
    return err('Only administrators can delete stores', 403);
  }

  await q('DELETE FROM stores WHERE id=$1', [id]);
  return json({ ok: true });
});
