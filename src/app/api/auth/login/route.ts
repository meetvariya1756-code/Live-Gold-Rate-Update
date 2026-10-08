import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { one } from '@/lib/db';
import { verifyPassword } from '@/lib/crypto';
import { createSessionToken, SESSION_COOKIE } from '@/lib/session';
import { ensureDefaultAdminExists } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  await ensureDefaultAdminExists();

  const body = await req.json().catch(() => ({}));
  const username = String(body.username || body.clientId || '').trim();
  const password = String(body.password || '');

  if (!password) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }

  // 1. Direct Admin Environment Password check (fallback if username is admin or blank)
  const envAdminPassword = process.env.ADMIN_PASSWORD || '';
  const isAdminEnvMatch =
    envAdminPassword &&
    (!username || username.toLowerCase() === 'admin') &&
    password.length === envAdminPassword.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(envAdminPassword));

  if (isAdminEnvMatch) {
    const adminUser = await one<{ id: number; username: string; role: string; name: string }>(
      `SELECT id, username, role, name FROM users WHERE role = 'admin' LIMIT 1`,
    );

    const userPayload = {
      userId: adminUser?.id || 1,
      username: adminUser?.username || 'admin',
      role: 'admin' as const,
      name: adminUser?.name || 'Administrator',
    };

    const res = NextResponse.json({ ok: true, user: userPayload });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(userPayload), {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      path: '/',
      maxAge: 7 * 86400,
    });
    return res;
  }

  // 2. Database User Authentication (Admins and Clients)
  if (!username) {
    return NextResponse.json({ error: 'Username / Client ID is required' }, { status: 400 });
  }

  const user = await one<{
    id: number;
    username: string;
    name: string;
    password_hash: string;
    role: 'admin' | 'client';
    is_active: boolean;
  }>('SELECT id, username, name, password_hash, role, is_active FROM users WHERE lower(username) = lower($1)', [
    username,
  ]);

  if (!user) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  if (!user.is_active) {
    return NextResponse.json({ error: 'This account has been deactivated. Contact your administrator.' }, { status: 403 });
  }

  const isValidPassword = await verifyPassword(password, user.password_hash);
  if (!isValidPassword) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const userPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
  };

  const res = NextResponse.json({ ok: true, user: userPayload });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(userPayload), {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/',
    maxAge: 7 * 86400,
  });
  return res;
}
