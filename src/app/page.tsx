'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, timeAgo } from '@/lib/client';
import { Field, Modal, Spinner, toast } from '@/components/ui';

interface StoreItem {
  id: number;
  name: string;
  shop_domain: string;
  currency: string;
  client_name?: string | null;
  client_username?: string | null;
  auth_type?: string;
  has_oauth_keys?: boolean;
  has_token?: boolean;
  token_expires_at?: string | null;
  products: number;
  variants: number;
  configured: number;
  last_synced_at: string | null;
  last_pushed_at: string | null;
}

interface ClientOption {
  id: number;
  name: string;
  username: string;
}

interface UserSession {
  userId: number;
  username: string;
  role: 'admin' | 'client';
  name: string;
}

export default function Home() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [stores, setStores] = useState<StoreItem[] | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [open, setOpen] = useState(false);

  const [authMode, setAuthMode] = useState<'client_credentials' | 'access_token'>('client_credentials');
  const [form, setForm] = useState({
    shop_domain: '',
    client_id: '',
    client_secret: '',
    access_token: '',
    name: '',
    client_user_id: '',
    default_gst_pct: '3',
    round_to: '1',
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [meRes, s] = await Promise.all([
        fetch('/api/auth/me')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        api<StoreItem[]>('/api/stores').catch((e) => {
          throw e;
        }),
      ]);

      if (meRes?.user) {
        const u = meRes.user;
        setUser(u);
        if (u.role === 'admin') {
          api<{ clients: ClientOption[] }>('/api/admin/clients')
            .then((res) => setClients(res.clients))
            .catch(() => {});
        }
      }
      setStores(s);
    } catch (e: any) {
      toast(e.message, true);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const payload: any = {
        shop_domain: form.shop_domain,
        auth_type: authMode,
        name: form.name,
        default_gst_pct: form.default_gst_pct,
        round_to: form.round_to,
        client_user_id: form.client_user_id || undefined,
      };

      if (authMode === 'client_credentials') {
        payload.client_id = form.client_id;
        payload.client_secret = form.client_secret;
      } else {
        payload.access_token = form.access_token;
      }

      const s = await api('/api/stores', { method: 'POST', body: payload });
      toast(`Connected ${s.name} — products are syncing in the background`);
      setOpen(false);
      location.href = `/stores/${s.id}`;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{isAdmin ? 'Shopify Stores' : 'My Store & Products'}</h1>
          <div className="muted small">
            {isAdmin
              ? 'Manage connected client stores, automatic Shopify OAuth token generation, and daily repricing.'
              : 'Manage your live daily gold rates and product variant pricing.'}
          </div>
        </div>
        {isAdmin && (
          <button className="primary" onClick={() => { setOpen(true); setError(''); }}>
            + Connect Store
          </button>
        )}
      </div>

      <div className="card">
        {stores === null ? (
          <div className="empty"><Spinner /> Loading stores…</div>
        ) : !stores.length ? (
          <div className="empty">
            <p>{isAdmin ? 'No stores connected yet.' : 'No store is currently assigned to your account. Contact your administrator.'}</p>
            {isAdmin && (
              <button className="primary" onClick={() => setOpen(true)}>
                Connect your first store
              </button>
            )}
          </div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Store</th>
                {isAdmin && <th>Client / Owner</th>}
                <th>Auth & Token Status</th>
                <th>Currency</th>
                <th className="num">Products</th>
                <th>Variants Configured</th>
                <th>Last Sync</th>
                <th>Last Push</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id} className="click" onClick={() => (location.href = `/stores/${s.id}`)}>
                  <td>
                    <Link href={`/stores/${s.id}`}>
                      <b>{s.name}</b>
                      <div className="muted small">{s.shop_domain}</div>
                    </Link>
                  </td>
                  {isAdmin && (
                    <td>
                      {s.client_name ? (
                        <span className="badge" style={{ background: '#eef2ff', color: '#3730a3' }}>
                          👤 {s.client_name}
                        </span>
                      ) : (
                        <span className="muted small">Unassigned</span>
                      )}
                    </td>
                  )}
                  <td>
                    {s.has_oauth_keys ? (
                      <span className="badge green" title={`Automatic 24h refresh enabled (${s.token_expires_at ? 'Active' : 'Ready'})`}>
                        ⚡ Auto-Renew (OAuth)
                      </span>
                    ) : (
                      <span className="badge" title="Static Admin Access Token">
                        🔑 Access Token
                      </span>
                    )}
                  </td>
                  <td>{s.currency}</td>
                  <td className="num">{s.products}</td>
                  <td>
                    <span
                      className={`badge ${
                        s.variants && s.configured === s.variants
                          ? 'green'
                          : s.configured
                          ? 'amber'
                          : ''
                      }`}
                    >
                      {s.configured} / {s.variants}
                    </span>
                  </td>
                  <td className="muted">{timeAgo(s.last_synced_at)}</td>
                  <td className="muted">{timeAgo(s.last_pushed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <Modal
          title="Connect a Shopify Store"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="primary"
                disabled={
                  busy ||
                  !form.shop_domain ||
                  (authMode === 'client_credentials' ? !form.client_id || !form.client_secret : !form.access_token)
                }
                onClick={connect}
              >
                {busy ? <Spinner /> : null} {busy ? 'Connecting…' : 'Connect & Generate Token'}
              </button>
            </>
          }
        >
          {error && <div className="banner error">{error}</div>}
          <div className="grid">
            <Field label="Store Domain" required hint="e.g. isfhqv-ua.myshopify.com or brand.myshopify.com">
              <input
                className="plain"
                value={form.shop_domain}
                onChange={(e) => setForm({ ...form, shop_domain: e.target.value })}
                placeholder="store-name.myshopify.com"
              />
            </Field>

            <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                Authentication Method
              </label>
              <div className="row" style={{ gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="authMode"
                    checked={authMode === 'client_credentials'}
                    onChange={() => setAuthMode('client_credentials')}
                  />
                  <span><b>Shopify Client ID & Secret</b> (Auto Token Renewal)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="authMode"
                    checked={authMode === 'access_token'}
                    onChange={() => setAuthMode('access_token')}
                  />
                  <span>Manual Access Token</span>
                </label>
              </div>
            </div>

            {authMode === 'client_credentials' ? (
              <>
                <Field
                  label="Shopify Client ID"
                  required
                  hint="Found in Shopify Admin → Settings → Apps and sales channels → Develop apps → App credentials"
                >
                  <input
                    className="plain"
                    value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                    placeholder="e.g. 2bc971f50f6ffac83b3d4b1962742527"
                  />
                </Field>

                <Field
                  label="Shopify Client Secret"
                  required
                  hint="Encrypted with AES-256 on your server and used to automatically generate & renew access tokens every 24 hours."
                >
                  <input
                    className="plain"
                    type="password"
                    value={form.client_secret}
                    onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
                    placeholder="shpss_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                </Field>
              </>
            ) : (
              <Field
                label="Admin API Access Token"
                required
                hint="Static access token (shpat_...)"
              >
                <input
                  className="plain"
                  type="password"
                  value={form.access_token}
                  onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                  placeholder="shpat_xxxxxxxx"
                />
              </Field>
            )}

            {isAdmin && (
              <Field label="Assign to Client" hint="Select the client who owns and manages this store">
                <select
                  className="plain"
                  value={form.client_user_id}
                  onChange={(e) => setForm({ ...form, client_user_id: e.target.value })}
                >
                  <option value="">(Unassigned / Admin only)</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.username})
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Display Name" hint="Optional — defaults to the Shopify store name">
              <input
                className="plain"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <div className="grid g2">
              <Field label="Default GST" suffix="%">
                <input
                  type="number"
                  value={form.default_gst_pct}
                  onChange={(e) => setForm({ ...form, default_gst_pct: e.target.value })}
                />
              </Field>
              <Field label="Round final price to">
                <select
                  className="plain"
                  value={form.round_to}
                  onChange={(e) => setForm({ ...form, round_to: e.target.value })}
                >
                  <option value="0">No rounding (0.01)</option>
                  <option value="1">Nearest 1</option>
                  <option value="10">Nearest 10</option>
                  <option value="100">Nearest 100</option>
                </select>
              </Field>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
