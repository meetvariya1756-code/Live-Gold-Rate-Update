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
          <Link href={user?.role === 'admin' ? '/admin' : '/'} className="brand" style={{ color: '#ffffff' }}>
            <span className="brand-dot" /> Gold Rate Pricer
          </Link>
          {user?.role === 'admin' && (
            <nav className="row" style={{ gap: 14, marginLeft: 8 }}>
              <Link
                href="/admin"
                style={{
                  color: path === '/admin' || path === '/' ? '#fff' : '#aaa',
                  fontWeight: path === '/admin' || path === '/' ? 700 : 500,
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
              {user.role === 'admin' && (
                <span
                  style={{
                    background: '#332600',
                    color: '#ffd700',
                    border: '1px solid #7a5a00',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Crown size={12} />
                  <span>Admin</span>
                </span>
              )}
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

