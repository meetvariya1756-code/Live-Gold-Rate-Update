import { NextRequest } from 'next/server';
import { q, one } from '@/lib/db';
import { handler, json, err, Ctx } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { hashPassword } from '@/lib/crypto';

export const dynamic = 'force-dynamic';
type P = { id: string };

// GET /api/admin/clients/[id]
export const GET = handler(async (req: NextRequest, { params }: Ctx<P>) => {
  await requireAdmin(req);
  const { id } = await params;
  const clientId = Number(id);

  const client = await one<{
    id: number;
    username: string;
    name: string;
    role: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>(`SELECT id, username, name, role, is_active, created_at, updated_at FROM users WHERE id = $1`, [clientId]);

  if (!client) return err('Client not found', 404);

  const stores = await q<{ id: number; name: string; shop_domain: string }>(
    `SELECT id, name, shop_domain FROM stores WHERE client_user_id = $1`,
    [clientId],
  );

  return json({ client: { ...client, stores } });
});

// PUT /api/admin/clients/[id] - Update client profile, password, or assigned stores
export const PUT = handler(async (req: NextRequest, { params }: Ctx<P>) => {
  await requireAdmin(req);
  const { id } = await params;
  const clientId = Number(id);

  const client = await one('SELECT id FROM users WHERE id = $1', [clientId]);
  if (!client) return err('Client not found', 404);

  const body = await req.json();
  const name = body.name ? String(body.name).trim() : undefined;
  const username = body.username ? String(body.username).trim() : undefined;
  const password = body.password ? String(body.password).trim() : undefined;
  const isActive = typeof body.is_active === 'boolean' ? body.is_active : undefined;
  const storeIds: number[] | undefined = Array.isArray(body.store_ids) ? body.store_ids.map(Number) : undefined;

  if (username) {
    const conflict = await one('SELECT id FROM users WHERE lower(username) = lower($1) AND id != $2', [username, clientId]);
    if (conflict) return err(`Username '${username}' is already in use by another user.`);
  }

  // Update user fields
  const updates: string[] = ['updated_at = NOW()'];
  const values: any[] = [clientId];

  if (name !== undefined) {
    values.push(name);
    updates.push(`name = $${values.length}`);
  }
  if (username !== undefined) {
    values.push(username);
    updates.push(`username = $${values.length}`);
  }
  if (isActive !== undefined) {
    values.push(isActive);
    updates.push(`is_active = $${values.length}`);
  }
  if (password) {
    if (password.length < 4) return err('Password must be at least 4 characters');
    const hash = await hashPassword(password);
    values.push(hash);
    updates.push(`password_hash = $${values.length}`);
  }

  await q(`UPDATE users SET ${updates.join(', ')} WHERE id = $1`, values);

  // Update assigned stores if specified
  if (storeIds !== undefined) {
    // 1. Unassign all stores previously assigned to this client that are not in storeIds
    await q(`UPDATE stores SET client_user_id = NULL WHERE client_user_id = $1`, [clientId]);
    // 2. Assign the new list of stores to this client
    if (storeIds.length) {
      await q(`UPDATE stores SET client_user_id = $1 WHERE id = ANY($2::int[])`, [clientId, storeIds]);
    }
  }

  const updatedClient = await one(
    `SELECT id, username, name, role, is_active, updated_at FROM users WHERE id = $1`,
    [clientId],
  );

  return json({ ok: true, client: updatedClient });
});

// DELETE /api/admin/clients/[id]
export const DELETE = handler(async (req: NextRequest, { params }: Ctx<P>) => {
  await requireAdmin(req);
  const { id } = await params;
  const clientId = Number(id);

  // Unlink stores
  await q('UPDATE stores SET client_user_id = NULL WHERE client_user_id = $1', [clientId]);
  await q('DELETE FROM users WHERE id = $1', [clientId]);

  return json({ ok: true, message: 'Client deleted' });
});
