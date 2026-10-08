'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminNotificationListener } from '@/components/AdminNotificationListener';
import { SupportWidget } from '@/components/SupportWidget';
import { StoreAccessConsentModal } from '@/components/StoreAccessConsentModal';
import { Crown, User, Sparkles } from 'lucide-react';

interface SessionUser {
  userId: number;
  username: string;
  role: 'admin' | 'client';
  name: string;
}

export function TopBar() {
  const path = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [pendingSupportCount, setPendingSupportCount] = useState<number>(0);

  useEffect(() => {
    if (path === '/login') return;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, [path]);

  // Support notification polling for badge
  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    const fetchStats = () => {
      fetch('/api/support/notifications')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setPendingSupportCount(d.unreadCount || d.pendingCount || 0);
        })
        .catch(() => {});
    };
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [user]);

  if (path === '/login') return null;

  return (
    <>
      <AdminNotificationListener isAdmin={user?.role === 'admin'} />
      <SupportWidget user={user} />
      <StoreAccessConsentModal />

      <div className="topbar">
        <div className="row" style={{ gap: 18 }}>
          <Link href="/" className="brand">
            <span className="brand-dot" /> Gold Rate Pricer
          </Link>
          {user?.role === 'admin' && (
            <nav className="row" style={{ gap: 14, marginLeft: 8 }}>
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
              <Link
                href="/admin/support"
                style={{
                  color: path.startsWith('/admin/support') ? '#fff' : '#aaa',
                  fontWeight: path.startsWith('/admin/support') ? 700 : 500,
                  fontSize: 13,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>Support & Calls</span>
                {pendingSupportCount > 0 && (
                  <span
                    style={{
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: 10,
                      animation: 'pulse 1.5s infinite',
                    }}
                  >
                    {pendingSupportCount}
                  </span>
                )}
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
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {user.role === 'admin' ? <Crown size={12} /> : <User size={12} />}
                <span>{user.role === 'admin' ? 'Admin' : 'Client'}</span>
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
    </>
  );
}

