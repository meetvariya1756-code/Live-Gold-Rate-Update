import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { one, q } from '@/lib/db';
import { hashPassword } from '@/lib/crypto';
import { SESSION_COOKIE, SessionUser, verifySessionToken } from '@/lib/session';

export class AuthError extends Error {
  constructor(message: string, public status = 403) {
    super(message);
  }
}

export async function getCurrentUser(req?: NextRequest): Promise<SessionUser | null> {
  let token: string | undefined | null;
  if (req) {
    token = req.cookies.get(SESSION_COOKIE)?.value;
  } else {
    const cookieStore = await cookies();
    token = cookieStore.get(SESSION_COOKIE)?.value;
  }
  return verifySessionToken(token);
}

export async function requireAuth(req?: NextRequest): Promise<SessionUser> {
  const user = await getCurrentUser(req);
  if (!user) throw new AuthError('Unauthorized', 401);
  return user;
}

export async function requireAdmin(req?: NextRequest): Promise<SessionUser> {
  const user = await requireAuth(req);
  if (user.role !== 'admin') throw new AuthError('Admin access required', 403);
  return user;
}

/**
 * Checks that the authenticated user has access to this store.
 * Admins have access to all stores.
 * Clients only have access if store.client_user_id === user.userId.
 */
export async function requireStoreAccess(storeId: number, req?: NextRequest): Promise<SessionUser> {
  const user = await requireAuth(req);
  if (user.role === 'admin') return user;

  const store = await one<{ id: number; client_user_id: number | null }>(
    'SELECT id, client_user_id FROM stores WHERE id = $1',
    [storeId]
  );
  if (!store || store.client_user_id !== user.userId) {
    throw new AuthError('You do not have access to this store.', 403);
  }
  return user;
}

/**
 * Ensures a default admin account exists based on ADMIN_PASSWORD in .env
 */
export async function ensureDefaultAdminExists() {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return;

  const existingAdmin = await one('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
  if (!existingAdmin) {
    const pwdHash = await hashPassword(adminPassword);
    await q(
      `INSERT INTO users (username, name, password_hash, role, is_active)
       VALUES ($1, $2, $3, 'admin', TRUE)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      ['admin', 'System Administrator', pwdHash]
    );
  }
}
