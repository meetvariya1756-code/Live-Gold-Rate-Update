'use client';
import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Lock, User } from 'lucide-react';

function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const res = await r.json();
      if (r.ok) {
        if (res.user?.role === 'admin') {
          location.href = '/admin';
        } else {
          setError('Access denied: Administrator privileges required.');
          setBusy(false);
        }
      } else {
        setError(res.error || 'Invalid administrator credentials.');
        setBusy(false);
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card" style={{ maxWidth: 400, margin: '10vh auto' }}>
      <div className="card-body">
        <div style={{ marginBottom: 16 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#09090b',
              color: '#ffffff',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <ShieldCheck size={13} style={{ color: '#ffd700' }} /> Master Admin Portal
          </span>
        </div>

        <h2 style={{ fontSize: 20, margin: '0 0 6px', fontWeight: 700 }}>Administrator Sign In</h2>
        <div style={{ marginBottom: 18, color: 'var(--muted)', fontSize: 13 }}>
          Authorized system administrators only.
        </div>

        {error && <div className="banner error">{error}</div>}

        <div className="field" style={{ marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <User size={13} /> Admin Username
          </label>
          <input
            className="plain"
            type="text"
            autoFocus
            value={username}
            placeholder="admin"
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lock size={13} /> Admin Password
          </label>
          <input
            className="plain"
            type="password"
            value={password}
            placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          className="primary"
          style={{
            marginTop: 20,
            width: '100%',
            justifyContent: 'center',
            background: '#09090b',
            color: '#ffffff',
            fontWeight: 700,
          }}
          disabled={busy || !password}
        >
          {busy ? 'Verifying…' : 'Sign In as Administrator'}
        </button>
      </div>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}
