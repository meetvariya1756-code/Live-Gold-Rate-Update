import { NextRequest } from 'next/server';
import { q, one } from '@/lib/db';
import { handler, json, err } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { hashPassword } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

// GET /api/admin/clients - List all clients and their assigned stores
export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);

  const clients = await q<{
    id: number;
    username: string;
    name: string;
    role: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>(`SELECT id, username, name, role, is_active, created_at, updated_at FROM users ORDER BY id ASC`);

  const stores = await q<{
    id: number;
    client_user_id: number | null;
    name: string;
    shop_domain: string;
    currency: string;
  }>(`SELECT id, client_user_id, name, shop_domain, currency FROM stores ORDER BY name ASC`);

  const result = clients.map((client) => ({
    ...client,
    stores: stores.filter((s) => s.client_user_id === client.id),
  }));

  return json({ clients: result });
});

// POST /api/admin/clients - Create a new client account
export const POST = handler(async (req: NextRequest) => {
  await requireAdmin(req);

  const body = await req.json();
  const username = String(body.username || '').trim();
  const name = String(body.name || username).trim();
  const password = String(body.password || '').trim();
  const role = body.role === 'admin' ? 'admin' : 'client';
  const isActive = typeof body.is_active === 'boolean' ? body.is_active : true;
  const storeIds: number[] = Array.isArray(body.store_ids) ? body.store_ids.map(Number) : [];

  if (!username) return err('Username / Client ID is required');
  if (!password || password.length < 4) return err('Password must be at least 4 characters');

  const existing = await one('SELECT id FROM users WHERE lower(username) = lower($1)', [username]);
  if (existing) return err(`User with username '${username}' already exists`);

  const passwordHash = await hashPassword(password);

  const user = (await one<{ id: number; username: string; name: string; role: string; is_active: boolean }>(
    `INSERT INTO users (username, name, password_hash, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     RETURNING id, username, name, role, is_active`,
    [username, name, passwordHash, role, isActive],
  ))!;

  // Assign stores if specified
  if (storeIds.length) {
    await q(`UPDATE stores SET client_user_id = $1 WHERE id = ANY($2::int[])`, [user.id, storeIds]);
  }

  return json({ ok: true, client: user }, 201);
});
