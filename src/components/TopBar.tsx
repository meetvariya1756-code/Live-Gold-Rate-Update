'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface SessionUser {
  userId: number;
  username: string;
  role: 'admin' | 'client';
  name: string;
}

export function TopBar() {
  const path = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (path === '/login') return;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, [path]);

  if (path === '/login') return null;

  return (
    <div className="topbar">
      <div className="row" style={{ gap: 18 }}>
        <Link href="/" className="brand">
          <span className="brand-dot" /> Gold Rate Pricer
        </Link>
        {user?.role === 'admin' && (
          <nav className="row" style={{ gap: 12, marginLeft: 8 }}>
            <Link
              href="/"
              style={{
                color: path === '/' || path.startsWith('/stores') ? '#fff' : '#aaa',
                fontWeight: path === '/' || path.startsWith('/stores') ? 700 : 500,
                fontSize: 13,
              }}
            >
              Stores
            </Link>
            <Link
              href="/admin/clients"
              style={{
                color: path.startsWith('/admin/clients') ? '#fff' : '#aaa',
                fontWeight: path.startsWith('/admin/clients') ? 700 : 500,
                fontSize: 13,
              }}
            >
              Clients & Access
            </Link>
          </nav>
        )}
      </div>

      <div className="row" style={{ gap: 12 }}>
        {user && (
          <div className="row" style={{ gap: 6, fontSize: 12, color: '#ccc' }}>
            <span
              style={{
                background: user.role === 'admin' ? '#332600' : '#1e3322',
                color: user.role === 'admin' ? '#ffd700' : '#88e09f',
                border: `1px solid ${user.role === 'admin' ? '#7a5a00' : '#2d6339'}`,
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {user.role === 'admin' ? '👑 Admin' : '👤 Client'}
            </span>
            <span style={{ fontWeight: 600, color: '#fff' }}>{user.name}</span>
          </div>
        )}
        <button
          className="sm"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            location.href = '/login';
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
