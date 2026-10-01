'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, money, productNumericId, timeAgo } from '@/lib/client';
import { deriveRates, MetalRate } from '@/lib/pricing';
import { Field, Modal, Spinner, toast } from '@/components/ui';

interface Store {
  id: number; name: string; shop_domain: string; currency: string; round_to: number; default_gst_pct: number;
  auto_push: boolean; metafield_ready: boolean; last_synced_at: string | null; last_pushed_at: string | null;
  products: number; variants: number; configured: number;
}
interface Run { id: string; trigger: string; status: string; total: number; updated: number; failed: number; message: string | null; started_at: string; finished_at: string | null }
interface ProductRow { gid: string; title: string; handle: string; status: string; image_url: string | null; variant_count: number; configured: number; min_price: string | null; max_price: string | null }

export default function StorePage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [store, setStore] = useState<Store | null>(null);
  const [rates, setRates] = useState<MetalRate[]>([]);
  const [savedRates, setSavedRates] = useState<string>('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState<string>('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadStore = useCallback(() => api<Store>(`/api/stores/${storeId}`).then(setStore), [storeId]);
  const loadRates = useCallback(async () => {
    const r = await api<{ rates: MetalRate[] }>(`/api/stores/${storeId}/rates`);
    setRates(r.rates);
    setSavedRates(JSON.stringify(r.rates.map((x) => [x.key, x.rate, x.auto])));
  }, [storeId]);
  const loadRuns = useCallback(() => api<Run[]>(`/api/stores/${storeId}/runs`).then(setRuns), [storeId]);

  useEffect(() => {
    loadStore().catch((e) => toast(e.message, true));
    loadRates().catch((e) => toast(e.message, true));
    loadRuns().catch(() => {});
  }, [loadStore, loadRates, loadRuns]);

  // Poll while a price update is running
  const running = runs.find((r) => r.status === 'running');
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const list = await api<Run[]>(`/api/stores/${storeId}/runs`).catch(() => null);
      if (!list) return;
      setRuns(list);
      const r = list.find((x) => x.id === running.id);
      if (r && r.status !== 'running') {
        toast(r.status === 'done' ? `Shopify updated: ${r.updated} variant prices` : `Price update failed`, r.status !== 'done');
        loadStore();
      }
    }, 2000);
    return () => clearInterval(t);
  }, [running, storeId, loadStore]);

  const derived = useMemo(() => deriveRates(rates), [rates]);
  const dirty = JSON.stringify(derived.map((x) => [x.key, x.rate, x.auto])) !== savedRates;

  const setRate = (key: string, patch: Partial<MetalRate>) =>
    setRates((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const saveRates = async (push: boolean) => {
    setBusy(push ? 'push' : 'save');
    try {
      const res = await api(`/api/stores/${storeId}/rates`, {
        method: 'PUT',
        body: { push, rates: derived.map((r) => ({ key: r.key, rate: Number(r.rate) || 0, auto: r.auto })) },
      });
      setRates(res.rates);
      setSavedRates(JSON.stringify(res.rates.map((x: MetalRate) => [x.key, x.rate, x.auto])));
      toast(push ? 'Rates saved — updating Shopify prices…' : 'Rates saved');
      if (push) loadRuns();
    } catch (e: any) { toast(e.message, true); }
    setBusy('');
  };

  const pushAll = async () => {
    setBusy('push');
    try {
      await api(`/api/stores/${storeId}/push`, { method: 'POST', body: {} });
      toast('Updating Shopify prices…');
      loadRuns();
    } catch (e: any) { toast(e.message, true); }
    setBusy('');
  };

  const sync = async () => {
    setBusy('sync');
    try {
      const r = await api(`/api/stores/${storeId}/sync`, { method: 'POST' });
      toast(`Synced ${r.products} products from Shopify`);
      loadStore();
      setReloadKey((k) => k + 1);
    } catch (e: any) { toast(e.message, true); }
    setBusy('');
  };
  const [reloadKey, setReloadKey] = useState(0);

  if (!store) return <div className="page"><div className="empty">Loading…</div></div>;
  const pct = store.variants ? Math.round((store.configured / store.variants) * 100) : 0;
  const baseKeys = new Set<string>();
  for (const m of new Set(derived.map((r) => r.metal))) {
    const b = derived.filter((r) => r.metal === m && !r.auto).sort((a, c) => c.purity - a.purity)[0];
    if (b) baseKeys.add(b.key);
  }
  const lastRateUpdate = (rates as (MetalRate & { updated_at?: string })[])
    .map((r) => r.updated_at).filter(Boolean).sort().pop() ?? null;

  return (
    <div className="page">
      <div className="page-head">
        <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 12 }}>
          <Link href="/" className="btn-back" title="Back to stores" aria-label="Back to stores">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Back</span>
          </Link>
          <div>
            <div className="crumbs"><Link href="/">Stores</Link> /</div>
            <h1>{store.name}</h1>
            <div className="muted small">{store.shop_domain} · {store.currency}</div>
          </div>
        </div>
        <div className="row">
          <button onClick={sync} disabled={!!busy}>{busy === 'sync' ? <Spinner /> : '⟳'} Sync products</button>
          <button onClick={() => setSettingsOpen(true)}>Settings</button>
          <button className="primary" onClick={pushAll} disabled={!!busy || !!running || !store.configured}>
            Update all prices on Shopify
          </button>
        </div>
      </div>

      {!store.last_synced_at && (
        <div className="banner info"><Spinner /> First product sync is running in the background. Click <b>Sync products</b> in a minute if the list is empty.</div>
      )}
      {!store.metafield_ready && store.last_synced_at && (
        <div className="banner warn">The price-breakup metafield definition could not be created. Check the token has the write_products scope, then Sync again.</div>
      )}

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card stat" style={{ margin: 0 }}><div className="v">{store.products}</div><div className="l">Products synced</div></div>
        <div className="card stat" style={{ margin: 0 }}><div className="v">{store.variants}</div><div className="l">Variants</div></div>
        <div className="card stat" style={{ margin: 0 }}>
          <div className="v">{store.configured} <span className="muted small">({pct}%)</span></div>
          <div className="l">Variants configured</div>
          <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="card stat" style={{ margin: 0 }}><div className="v" suppressHydrationWarning style={{ fontSize: 16, paddingTop: 5 }}>{timeAgo(store.last_pushed_at)}</div><div className="l">Last Shopify price update</div></div>
      </div>

      {/* Metal rates */}
      <div className="card">
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Today's metal rates (per gram, {store.currency})</h2>
            <span className="muted small" suppressHydrationWarning>Last saved {timeAgo(lastRateUpdate)} · Auto-Sync Active</span>
          </div>
          <button
            className="small"
            onClick={async () => {
              setBusy('live_rate');
              try {
                const res = await api<{ ok: boolean; rate24k: number }>(`/api/cron/fetch-live-rates?storeId=${storeId}`);
                if (res.ok) {
                  toast(`Live market rate fetched (24K: ₹${res.rate24k}) — updating Shopify prices…`);
                  loadRates();
                  loadStore();
                  loadRuns();
                } else {
                  toast('Could not fetch live rate', true);
                }
              } catch (e: any) {
                toast(e.message, true);
              }
              setBusy('');
            }}
            disabled={!!busy}
          >
            {busy === 'live_rate' ? <Spinner /> : '⚡'} Fetch Live Market Rate
          </button>
        </div>
        <div className="card-body">
          <div className="grid g3">
            {derived.map((r) => {
              const isBase = baseKeys.has(r.key);
              return (
                <Field
                  key={r.key}
                  label={r.label}
                  required={isBase}
                  suffix={store.currency}
                  hint={
                    r.auto ? (
                      <>Auto · {(r.purity * 100).toFixed(2)}% purity · <button className="link small" onClick={() => setRate(r.key, { auto: false })}>set manually</button></>
                    ) : !isBase ? (
                      <>Manual · <button className="link small" onClick={() => setRate(r.key, { auto: true })}>use auto</button></>
                    ) : 'Base rate — other purities derive from this'
                  }
                >
                  <input
                    type="number" min={0} step="any"
                    value={r.auto ? Number(r.rate).toFixed(2) : (r.rate as any)}
                    readOnly={r.auto}
                    style={r.auto ? { color: 'var(--muted)' } : undefined}
                    onChange={(e) => setRate(r.key, { rate: e.target.value as any })}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  />
                </Field>
              );
            })}
          </div>
        </div>
        <div className="card-foot">
          {dirty && <span className="badge amber">Unsaved changes</span>}
          <span className="spacer" />
          <button className="primary gold" onClick={() => saveRates(true)} disabled={!!busy || (!dirty && !running)}>
            {busy === 'push' || busy === 'save' ? <><Spinner /> Updating Shopify prices…</> : 'Save & Sync All Prices to Shopify'}
          </button>
        </div>
      </div>

      {/* Runs */}
      {runs.length > 0 && <RunsCard runs={runs} currency={store.currency} />}

      <ProductsCard storeId={storeId} reloadKey={reloadKey} currency={store.currency} onImported={() => { loadStore(); setReloadKey((k) => k + 1); }} />

      {settingsOpen && <SettingsModal store={store} onClose={() => setSettingsOpen(false)} onSaved={(s) => { setStore({ ...store, ...s }); setSettingsOpen(false); }} />}
    </div>
  );
}

function RunsCard({ runs }: { runs: Run[]; currency: string }) {
  const [all, setAll] = useState(false);
  const list = all ? runs : runs.slice(0, 1);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Price updates</h2>
        {runs.length > 1 && <button className="link" onClick={() => setAll(!all)}>{all ? 'Show latest' : 'Show history'}</button>}
      </div>
      <div className="card-body" style={{ paddingTop: 8 }}>
        {list.map((r) => {
          const pct = r.total ? Math.round(((r.updated + r.failed) / r.total) * 100) : r.status === 'running' ? 0 : 100;
          return (
            <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="row">
                <span className={`badge ${r.status === 'done' ? (r.failed ? 'amber' : 'green') : r.status === 'failed' ? 'red' : 'gold'}`}>
                  {r.status === 'running' ? <><Spinner /> running</> : r.status}
                </span>
                <span>{r.updated} updated{r.failed ? `, ${r.failed} failed/skipped` : ''} of {r.total}</span>
                <span className="muted small">· {r.trigger.replace('_', ' ')} · {timeAgo(r.started_at)}</span>
              </div>
              {r.status === 'running' && <div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${pct}%` }} /></div>}
              {r.message && <pre className="small muted" style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{r.message}</pre>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProductsCard({ storeId, reloadKey, currency, onImported }: { storeId: string; reloadKey: number; currency: string; onImported: () => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ products: ProductRow[]; total: number; pageSize: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api(`/api/stores/${storeId}/products?search=${encodeURIComponent(search)}&filter=${filter}&page=${page}`)
        .then(setData).catch((e) => toast(e.message, true));
    }, 250);
    return () => clearTimeout(t);
  }, [storeId, search, filter, page, reloadKey]);

  const importCsv = async (f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    try {
      const r = await api(`/api/stores/${storeId}/import`, { method: 'POST', body: fd });
      toast(`Imported ${r.saved} variant configs${r.errors.length ? `, ${r.errors.length} errors` : ''}`, r.errors.length > 0);
      if (r.errors.length) console.warn(r.errors);
      onImported();
    } catch (e: any) { toast(e.message, true); }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="card">
      <div className="card-head">
        <h2>Products</h2>
        <div className="row">
          <a className="btn" href={`/api/stores/${storeId}/export`}>Export CSV</a>
          <button onClick={() => fileRef.current?.click()}>Import CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ''; }} />
        </div>
      </div>
      <div className="card-body" style={{ paddingBottom: 8 }}>
        <div className="row">
          <input className="plain" style={{ maxWidth: 340 }} placeholder="Search title, handle or SKU…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <div className="tabs">
            {[['all', 'All'], ['pending', 'Not set'], ['partial', 'Partial'], ['done', 'Done']].map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => { setFilter(k); setPage(1); }}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      {!data ? <div className="empty">Loading…</div> : !data.products.length ? <div className="empty">No products found.</div> : (
        <table className="list">
          <thead><tr><th>Product</th><th>Status</th><th>Pricing setup</th><th className="num">Price range</th></tr></thead>
          <tbody>
            {data.products.map((p) => {
              const done = p.variant_count > 0 && p.configured === p.variant_count;
              return (
                <tr key={p.gid} className="click" onClick={() => (location.href = `/stores/${storeId}/products/${productNumericId(p.gid)}`)}>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      {p.image_url ? <img className="thumb" src={`${p.image_url}${p.image_url.includes('?') ? '&' : '?'}width=80`} alt="" /> : <div className="thumb" />}
                      <div><b>{p.title}</b><div className="muted small">{p.handle}</div></div>
                    </div>
                  </td>
                  <td><span className="badge">{p.status?.toLowerCase()}</span></td>
                  <td>
                    <span className={`badge ${done ? 'green' : p.configured ? 'amber' : ''}`}>
                      {done ? '✓ Done' : `${p.configured} / ${p.variant_count} variants`}
                    </span>
                  </td>
                  <td className="num">
                    {p.min_price == null ? '—' : p.min_price === p.max_price ? money(Number(p.min_price), currency) : `${money(Number(p.min_price), currency)} – ${money(Number(p.max_price), currency)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {data && data.total > data.pageSize && (
        <div className="pager">
          <span className="muted small">{data.total} products</span>
          <div className="row">
            <button className="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Prev</button>
            <span className="small">Page {page} / {pages}</span>
            <button className="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next ›</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsModal({ store, onClose, onSaved }: { store: Store; onClose: () => void; onSaved: (s: Partial<Store>) => void }) {
  const [f, setF] = useState({
    name: store.name,
    default_gst_pct: String(store.default_gst_pct),
    round_to: String(store.round_to),
    auto_push: store.auto_push,
    client_id: '',
    client_secret: '',
    access_token: '',
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const s = await api(`/api/stores/${store.id}`, {
        method: 'PATCH',
        body: {
          name: f.name,
          default_gst_pct: Number(f.default_gst_pct),
          round_to: Number(f.round_to),
          auto_push: f.auto_push,
          client_id: f.client_id || undefined,
          client_secret: f.client_secret || undefined,
          access_token: f.access_token || undefined,
        },
      });
      toast('Settings saved successfully');
      onSaved(s);
    } catch (e: any) {
      toast(e.message, true);
    }
    setBusy(false);
  };

  const disconnect = async () => {
    if (!confirm(`Disconnect ${store.name}? All rates and variant pricing setup for this store will be deleted. Shopify products are not touched.`)) return;
    await api(`/api/stores/${store.id}`, { method: 'DELETE' });
    location.href = '/';
  };

  return (
    <Modal
      title="Store settings"
      onClose={onClose}
      footer={
        <>
          <button className="danger" onClick={disconnect}>Disconnect store</button>
          <span className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="grid">
        <Field label="Display name">
          <input className="plain" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <div className="grid g2">
          <Field label="Default GST for new variants" suffix="%">
            <input type="number" value={f.default_gst_pct} onChange={(e) => setF({ ...f, default_gst_pct: e.target.value })} />
          </Field>
          <Field label="Round final price to">
            <select className="plain" value={f.round_to} onChange={(e) => setF({ ...f, round_to: e.target.value })}>
              <option value="0">No rounding (0.01)</option>
              <option value="1">Nearest 1</option>
              <option value="10">Nearest 10</option>
              <option value="100">Nearest 100</option>
            </select>
          </Field>
        </div>
        <label className="row">
          <input type="checkbox" checked={f.auto_push} onChange={(e) => setF({ ...f, auto_push: e.target.checked })} />
          <span>Include this store in the scheduled price update (cron)</span>
        </label>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Update Shopify API Credentials</div>
          <div className="grid">
            <Field label="Shopify Client ID" hint="Leave empty to keep existing Client ID">
              <input className="plain" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} placeholder="Enter new Client ID" />
            </Field>
            <Field label="Shopify Client Secret" hint="Leave empty to keep existing Secret">
              <input className="plain" type="password" value={f.client_secret} onChange={(e) => setF({ ...f, client_secret: e.target.value })} placeholder="Enter new Client Secret" />
            </Field>
            <Field label="Or Static Access Token" hint="Only if using manual access token">
              <input className="plain" type="password" value={f.access_token} onChange={(e) => setF({ ...f, access_token: e.target.value })} placeholder="shpat_…" />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}
