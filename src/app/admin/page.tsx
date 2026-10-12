'use client';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { api, timeAgo } from '@/lib/client';
import { Field, Modal, Spinner, toast } from '@/components/ui';
import {
  ShieldCheck,
  Store as StoreIcon,
  Users,
  Headphones,
  RefreshCw,
  ExternalLink,
  Plus,
  Search,
  CheckCircle2,
  Key,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';

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

export default function AdminDashboardPage() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [stores, setStores] = useState<StoreItem[] | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [syncingId, setSyncingId] = useState<number | null>(null);
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
      const [meRes, sRes] = await Promise.all([
        fetch('/api/auth/me')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        api<StoreItem[]>('/api/stores').catch((e) => {
          throw e;
        }),
      ]);

      if (meRes?.user) {
        setUser(meRes.user);
        if (meRes.user.role === 'admin') {
          api<{ clients: ClientOption[] }>('/api/admin/clients')
            .then((res) => setClients(res.clients))
            .catch(() => {});
        }
      }
      setStores(sRes);
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
      loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const syncStoreNow = async (id: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncingId(id);
    try {
      const r = await api(`/api/stores/${id}/sync`, { method: 'POST' });
      toast(`Synced ${r.products} products for ${name}`);
      await loadData();
    } catch (err: any) {
      toast(err.message, true);
    } finally {
      setSyncingId(null);
    }
  };

  const filteredStores = useMemo(() => {
    if (!stores) return [];
    if (!searchTerm.trim()) return stores;
    const term = searchTerm.toLowerCase();
    return stores.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        s.shop_domain.toLowerCase().includes(term) ||
        (s.client_name && s.client_name.toLowerCase().includes(term)),
    );
  }, [stores, searchTerm]);

  // Aggregate stats
  const stats = useMemo(() => {
    if (!stores) return { totalStores: 0, totalProducts: 0, totalVariants: 0, totalConfigured: 0 };
    return {
      totalStores: stores.length,
      totalProducts: stores.reduce((acc, s) => acc + (s.products || 0), 0),
      totalVariants: stores.reduce((acc, s) => acc + (s.variants || 0), 0),
      totalConfigured: stores.reduce((acc, s) => acc + (s.configured || 0), 0),
    };
  }, [stores]);

  return (
    <div className="page">
      {/* Admin Navigation Header */}
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#09090b',
                color: '#ffffff',
                border: '1px solid #27272a',
                padding: '4px 12px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
              }}
            >
              <ShieldCheck size={13} style={{ color: '#ffd700' }} /> Super-Admin Portal
            </span>
          </div>
          <h1 style={{ fontSize: 26, margin: '4px 0', fontWeight: 700, color: 'var(--text, #0f172a)' }}>
            Master Administration
          </h1>
          <div className="muted small" style={{ fontSize: 13 }}>
            Dedicated administrative URL: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, color: '#09090b', fontWeight: 600 }}>/admin</code> · Multi-store management, OAuth tokens, and system health.
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button onClick={loadData} title="Refresh stores list" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            className="primary"
            onClick={() => { setOpen(true); setError(''); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#09090b', color: '#ffffff', fontWeight: 600 }}
          >
            <Plus size={15} style={{ color: '#ffd700' }} /> Connect Store
          </button>
        </div>
      </div>

      {/* Admin Subnav */}
      <div
        className="card"
        style={{
          padding: '10px 16px',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div className="row" style={{ gap: 8 }}>
          <Link
            href="/admin"
            className="btn"
            style={{
              background: '#09090b',
              color: '#ffffff',
              border: '1px solid #09090b',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 6,
              padding: '6px 14px',
            }}
          >
            <StoreIcon size={14} style={{ color: '#ffd700' }} /> Stores ({stats.totalStores})
          </Link>
          <Link
            href="/admin/clients"
            className="btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 6,
              padding: '6px 14px',
            }}
          >
            <Users size={14} /> Clients & Access
          </Link>
          <Link
            href="/admin/support"
            className="btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 6,
              padding: '6px 14px',
            }}
          >
            <Headphones size={14} /> Support & Live Chat
          </Link>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}
            />
            <input
              className="plain"
              style={{ paddingLeft: 30, maxWidth: 240, height: 34, fontSize: 13 }}
              placeholder="Search stores or clients…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Overview KPI Cards */}
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="card stat" style={{ margin: 0 }}>
          <div className="v">{stats.totalStores}</div>
          <div className="l">Connected Stores</div>
        </div>
        <div className="card stat" style={{ margin: 0 }}>
          <div className="v">{stats.totalProducts}</div>
          <div className="l">Synced Products</div>
        </div>
        <div className="card stat" style={{ margin: 0 }}>
          <div className="v">{stats.totalVariants}</div>
          <div className="l">Total Variants</div>
        </div>
        <div className="card stat" style={{ margin: 0 }}>
          <div className="v">
            {stats.totalConfigured}{' '}
            <span className="muted small">
              ({stats.totalVariants ? Math.round((stats.totalConfigured / stats.totalVariants) * 100) : 0}%)
            </span>
          </div>
          <div className="l">Configured Variants</div>
        </div>
      </div>

      {/* Stores List Table */}
      <div className="card">
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>All Client Stores</h2>
          <span className="muted small">Click any store row to open its live pricing dashboard</span>
        </div>

        {stores === null ? (
          <div className="empty">
            <Spinner /> Loading stores…
          </div>
        ) : !filteredStores.length ? (
          <div className="empty">
            <p>{searchTerm ? 'No stores match your search query.' : 'No stores connected yet.'}</p>
            {!searchTerm && (
              <button className="primary" onClick={() => setOpen(true)}>
                Connect your first store
              </button>
            )}
          </div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Store Details</th>
                <th>Client / Owner</th>
                <th>Token Status</th>
                <th>Currency</th>
                <th className="num">Products</th>
                <th>Pricing Configured</th>
                <th>Last Synced</th>
                <th>Last Push</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStores.map((s) => {
                const pct = s.variants ? Math.round((s.configured / s.variants) * 100) : 0;
                return (
                  <tr
                    key={s.id}
                    className="click"
                    onClick={() => (location.href = `/stores/${s.id}`)}
                    style={{ transition: 'background 0.15s ease' }}
                  >
                    <td>
                      <div>
                        <b style={{ fontSize: 14, color: 'var(--text, #0f172a)' }}>{s.name}</b>
                        <div className="muted small" style={{ fontFamily: 'monospace', color: '#64748b' }}>
                          {s.shop_domain}
                        </div>
                      </div>
                    </td>
                    <td>
                      {s.client_name ? (
                        <span
                          className="badge"
                          style={{
                            background: '#f8fafc',
                            color: '#0f172a',
                            border: '1px solid #cbd5e1',
                            fontWeight: 600,
                            padding: '4px 10px',
                            borderRadius: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                          }}
                        >
                          <span style={{ fontSize: 12 }}>👤</span> {s.client_name}
                        </span>
                      ) : (
                        <span className="muted small" style={{ color: '#94a3b8' }}>Unassigned (Admin)</span>
                      )}
                    </td>
                    <td>
                      {s.has_token || s.has_oauth_keys ? (
                        <span
                          className="badge green"
                          title="Active token stored securely"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <CheckCircle2 size={12} /> Connected
                        </span>
                      ) : (
                        <span
                          className="badge amber"
                          title="No access token stored"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Key size={12} /> Needs Token
                        </span>
                      )}
                    </td>
                    <td>
                      <b style={{ color: 'var(--text, #0f172a)' }}>{s.currency}</b>
                    </td>
                    <td className="num">
                      <b style={{ color: 'var(--text, #0f172a)' }}>{s.products}</b>
                    </td>
                    <td>
                      <div style={{ minWidth: 120 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 11,
                            marginBottom: 3,
                          }}
                        >
                          <span className={pct === 100 ? 'badge green' : pct > 0 ? 'badge amber' : 'badge'}>
                            {s.configured} / {s.variants}
                          </span>
                          <span className="muted">{pct}%</span>
                        </div>
                        <div className="progress" style={{ height: 4 }}>
                          <div style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="muted small" suppressHydrationWarning>
                      {timeAgo(s.last_synced_at)}
                    </td>
                    <td className="muted small" suppressHydrationWarning>
                      {timeAgo(s.last_pushed_at)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="sm"
                          disabled={syncingId === s.id}
                          onClick={(e) => syncStoreNow(s.id, s.name, e)}
                          title="Sync products from Shopify"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '5px 10px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {syncingId === s.id ? <Spinner /> : <RefreshCw size={12} />}
                          <span>Sync</span>
                        </button>
                        <Link
                          href={`/stores/${s.id}`}
                          className="btn sm"
                          style={{
                            background: '#09090b',
                            color: '#ffffff',
                            border: '1px solid #09090b',
                            padding: '5px 12px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <span>Open</span> <ExternalLink size={11} style={{ color: '#ffd700' }} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Connect Store Modal */}
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
                {busy ? <Spinner /> : null} {busy ? 'Connecting…' : 'Connect Store'}
              </button>
            </>
          }
        >
          {error && <div className="banner error">{error}</div>}
          <div className="grid">
            <Field label="Store Domain" required hint="e.g. quickstart-8848c07c.myshopify.com or brand.myshopify.com">
              <input
                className="plain"
                value={form.shop_domain}
                onChange={(e) => setForm({ ...form, shop_domain: e.target.value })}
                placeholder="store-name.myshopify.com"
              />
            </Field>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
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
                  <span>Direct Access Token</span>
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
                hint="Permanent offline access token (shpat_...)"
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

            <Field label="Assign to Client Account" hint="Select the client who owns and manages this store">
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
