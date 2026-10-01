'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginForm() {
  const sp = useSearchParams();
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

      const res = await r.json();
      if (r.ok) {
        location.href = sp.get('next') || '/';
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
        <div className="brand" style={{ marginBottom: 20, fontSize: 18 }}>
          <span className="brand-dot" /> Gold Rate Pricer
        </div>

        <div style={{ marginBottom: 16, color: 'var(--muted)', fontSize: 13 }}>
          Sign in to manage your store's live gold rates and variant pricing.
        </div>

        {error && <div className="banner error">{error}</div>}

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Username / Client ID</label>
          <input
            className="plain"
            type="text"
            autoFocus
            value={username}
            placeholder="e.g. admin or client_101"
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Password</label>
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
          style={{ marginTop: 18, width: '100%', justifyContent: 'center' }}
          disabled={busy || !password}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
