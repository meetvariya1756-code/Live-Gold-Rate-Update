// Edge-safe session token helpers (Web Crypto).
export const SESSION_COOKIE = 'grp_session';

export interface SessionUser {
  userId: number;
  username: string;
  role: 'admin' | 'client';
  name: string;
}

async function hmac(data: string) {
  const secret = process.env.SESSION_SECRET || 'dev-secret-change-me';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createSessionToken(user: SessionUser, days = 7) {
  const exp = Date.now() + days * 86400_000;
  const raw = JSON.stringify({ ...user, exp });
  // Base64 encode UTF-8 safe
  const b64 = Buffer.from(raw, 'utf8').toString('base64url');
  const sig = await hmac(b64);
  return `${b64}.${sig}`;
}

export async function verifySessionToken(token?: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const expectedSig = await hmac(b64);
  if (sig !== expectedSig) return null;
  try {
    const raw = Buffer.from(b64, 'base64url').toString('utf8');
    const data = JSON.parse(raw);
    if (!data.exp || Number(data.exp) < Date.now()) return null;
    return {
      userId: Number(data.userId),
      username: String(data.username),
      role: data.role === 'admin' ? 'admin' : 'client',
      name: String(data.name || data.username),
    };
  } catch {
    return null;
  }
}
