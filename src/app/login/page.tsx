'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Store, Lock, User } from 'lucide-react';

function ClientLoginForm() {
  const sp = useSearchParams();
  const nextParam = sp.get('next');

  const [username, setUsername] = useState('');
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

      let res: any = {};
      try {
        res = await r.json();
      } catch {
        res = { error: 'Server communication error. Please try again.' };
      }

      if (r.ok) {
        if (nextParam && !nextParam.startsWith('/admin')) {
          location.href = nextParam;
        } else if (res.user?.role === 'admin') {
          location.href = '/admin';
        } else {
          location.href = '/';
        }
      } else {
        setError(res.error || 'Login failed. Check your credentials.');
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
        <div className="brand" style={{ marginBottom: 12, fontSize: 19 }}>
          <span className="brand-dot" /> Gold Rate Pricer
        </div>

        <div style={{ marginBottom: 18, color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
          Sign in to manage your store's live gold rates and product variant pricing.
        </div>

        {error && <div className="banner error">{error}</div>}

        <div className="field" style={{ marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <User size={13} /> Username / Store ID
          </label>
          <input
            className="plain"
            type="text"
            autoFocus
            value={username}
            placeholder="e.g. client_101 or store.myshopify.com"
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lock size={13} /> Password
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
            fontWeight: 700,
          }}
          disabled={busy || !password}
        >
          {busy ? 'Signing in…' : 'Sign in to Store'}
        </button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <ClientLoginForm />
    </Suspense>
  );
}
