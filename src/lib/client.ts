'use client';

export async function api<T = any>(url: string, init?: Omit<RequestInit, 'body'> & { body?: any }): Promise<T> {
  const opts: RequestInit = { ...(init as RequestInit) };
  if (init?.body && !(init.body instanceof FormData) && typeof init.body !== 'string') {
    opts.body = JSON.stringify(init.body);
    opts.headers = { 'Content-Type': 'application/json', ...(init.headers || {}) };
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data?.error === 'Unauthorized') {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

export function money(n: number | null | undefined, currency = 'INR') {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency', currency, maximumFractionDigits: 2,
    }).format(Number(n));
  } catch {
    return `${currency} ${Number(n).toFixed(2)}`;
  }
}

export function timeAgo(d?: string | null) {
  if (!d) return 'never';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(d).toLocaleString();
}

export const productNumericId = (gid: string) => gid.split('/').pop()!;
