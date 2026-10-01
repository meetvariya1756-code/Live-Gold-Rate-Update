'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, money, timeAgo } from '@/lib/client';
import { calculatePrice, emptyConfig, guessMetalKey, MetalRate, Stone, VariantConfigInput } from '@/lib/pricing';
import { detectSizeOption, groupVariants, sizeLabel, OptionDef } from '@/lib/grouping';
import { Field, Spinner, toast } from '@/components/ui';

interface Variant {
  gid: string; title: string; sku: string | null; position: number;
  options: { name: string; value: string }[];
  price: number | null; compare_at_price: number | null;
  config: VariantConfigInput | null; last_pushed_price: number | null; last_pushed_at: string | null;
}
interface Data {
  store: { id: number; name: string; shop_domain: string; currency: string; round_to: number; default_gst_pct: number };
  product: { gid: string; title: string; handle: string; status: string; image_url: string | null; options: OptionDef[] };
  rates: MetalRate[];
  variants: Variant[];
}
type Form = VariantConfigInput;

const COPY_EXCLUDE: (keyof Form)[] = ['metal_weight', 'remarks'];

export default function ProductPage() {
  const { storeId, productId } = useParams<{ storeId: string; productId: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openVariant, setOpenVariant] = useState<string | null>(null);
  const [sizeOpt, setSizeOpt] = useState<string | null | undefined>(undefined);
  const [autoPush, setAutoPush] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    const d = await api<Data>(`/api/stores/${storeId}/products/${productId}${refresh ? '?refresh=1' : ''}`);
    setData(d);
    const f: Record<string, Form> = {};
    const s: Record<string, string> = {};
    for (const v of d.variants) {
      if (v.config) { f[v.gid] = v.config; s[v.gid] = JSON.stringify(v.config); }
    }
    setForms((prev) => ({ ...prev, ...f }));
    setSaved(s);
    return d;
  }, [storeId, productId]);

  useEffect(() => {
    load(true).catch((e) => { setError(e.message); load(false).catch(() => {}); });
  }, [load]);

  const sizeOption = sizeOpt === undefined ? detectSizeOption(data?.product.options || []) : sizeOpt;
  const groups = useMemo(() => (data ? groupVariants(data.product.options, data.variants, sizeOption) : []), [data, sizeOption]);

  // Open the first unfinished group automatically
  useEffect(() => {
    if (!groups.length || openGroup !== null) return;
    const g = groups.find((g) => g.variants.some((v) => !saved[v.gid])) || groups[0];
    setOpenGroup(g.key);
  }, [groups, saved, openGroup]);

  if (!data) return <div className="page">{error ? <div className="banner error">{error}</div> : <div className="empty">Loading product from Shopify…</div>}</div>;

  const { store, product, rates } = data;
  const cur = store.currency;
  const isSaved = (gid: string) => !!saved[gid] && forms[gid] && JSON.stringify(forms[gid]) === saved[gid];
  const isDirty = (gid: string) => !!forms[gid] && JSON.stringify(forms[gid]) !== saved[gid];

  const formFor = (v: Variant, groupVariants: Variant[]): Form => {
    if (forms[v.gid]) return forms[v.gid];
    // Prefill from a saved sibling in the same group (all charges except weight), else defaults
    const sib = groupVariants.find((x) => x.gid !== v.gid && saved[x.gid]);
    const guess = guessMetalKey(v.options.map((o) => o.value));
    const base = emptyConfig(guess && rates.some((r) => r.key === guess) ? guess : rates.find((r) => r.metal === 'gold' && r.key !== 'gold_24k')?.key || rates[0]?.key, store.default_gst_pct);
    if (sib) {
      const s = JSON.parse(saved[sib.gid]) as Form;
      return { ...s, metal_weight: 0, remarks: '', ...(guess ? { metal_key: guess } : {}) };
    }
    return base;
  };

  const updateForm = (gid: string, current: Form, patch: Partial<Form>) =>
    setForms((f) => ({ ...f, [gid]: { ...current, ...patch } }));

  const pushProduct = async () => {
    const r = await api(`/api/stores/${storeId}/push`, { method: 'POST', body: { product_gids: [product.gid] } });
    const runs = await api<any[]>(`/api/stores/${storeId}/runs`);
    const run = runs.find((x) => String(x.id) === String(r.runId));
    if (run?.status === 'done' && !run.failed) toast(`Shopify updated (${run.updated} variants)`);
    else toast(run?.message || 'Some variants failed to update', true);
    await load(false);
  };

  const saveVariants = async (items: { gid: string; form: Form }[], label: string) => {
    const bad = items.find((i) => !(Number(i.form.metal_weight) > 0));
    if (bad) { toast(`Enter metal weight for ${bad.gid === items[0].gid && items.length === 1 ? 'this variant' : 'every variant'}`, true); return false; }
    setBusy(label);
    try {
      await api(`/api/stores/${storeId}/variants/config`, {
        method: 'PUT',
        body: { items: items.map((i) => ({ variant_gid: i.gid, config: i.form })) },
      });
      setSaved((s) => ({ ...s, ...Object.fromEntries(items.map((i) => [i.gid, JSON.stringify(i.form)])) }));
      setForms((f) => ({ ...f, ...Object.fromEntries(items.map((i) => [i.gid, i.form])) }));
      if (autoPush) await pushProduct();
      else toast(`Saved ${items.length} variant${items.length > 1 ? 's' : ''}`);
      return true;
    } catch (e: any) {
      toast(e.message, true);
      return false;
    } finally { setBusy(''); }
  };

  const totalVariants = data.variants.length;
  const doneCount = data.variants.filter((v) => saved[v.gid]).length;
  const numericId = product.gid.split('/').pop();

  return (
    <div className="page">
      <div className="page-head">
        <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 12 }}>
          <Link href={`/stores/${storeId}`} className="btn-back" title="Back to store" aria-label="Back to store">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Back</span>
          </Link>
          {product.image_url && <img className="thumb" style={{ width: 56, height: 56 }} src={`${product.image_url}${product.image_url.includes('?') ? '&' : '?'}width=120`} alt="" />}
          <div>
            <div className="crumbs"><Link href="/">Stores</Link> / <Link href={`/stores/${storeId}`}>{store.name}</Link> /</div>
            <h1>{product.title}</h1>
            <div className="row small muted" style={{ marginTop: 2 }}>
              <span className={`badge ${doneCount === totalVariants ? 'green' : doneCount ? 'amber' : ''}`}>{doneCount} / {totalVariants} variants configured</span>
              <a href={`https://${store.shop_domain}/admin/products/${numericId}`} target="_blank" rel="noreferrer" style={{ color: '#005bd3' }}>Open in Shopify ↗</a>
            </div>
          </div>
        </div>
        <div className="row">
          <button onClick={() => load(true).then(() => toast('Reloaded from Shopify')).catch((e) => toast(e.message, true))}>⟳ Refresh</button>
          <button className="primary" disabled={!!busy || !doneCount} onClick={async () => { setBusy('push'); try { await pushProduct(); } catch (e: any) { toast(e.message, true); } setBusy(''); }}>
            {busy === 'push' ? <Spinner /> : null} Update prices on Shopify
          </button>
        </div>
      </div>

      {error && <div className="banner warn">Could not refresh from Shopify: {error}. Showing last synced data.</div>}

      <div className="card">
        <div className="card-body row" style={{ gap: 16 }}>
          <div className="row small">
            <span className="muted">Group variants by all options except</span>
            <select className="plain" style={{ width: 'auto' }} value={sizeOption ?? ''} onChange={(e) => { setSizeOpt(e.target.value || null); setOpenGroup(null); }}>
              <option value="">(none — every variant separately)</option>
              {product.options.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
            </select>
          </div>
          <label className="row small"><input type="checkbox" checked={autoPush} onChange={(e) => setAutoPush(e.target.checked)} /> Push to Shopify on save</label>
          <span className="spacer" />
          <div className="row small muted">
            {rates.filter((r) => r.rate > 0).slice(0, 4).map((r) => <span key={r.key} className="badge gold">{r.label.split(' (')[0]}: {money(r.rate, cur)}/g</span>)}
          </div>
        </div>
      </div>

      {rates.every((r) => !r.rate) && (
        <div className="banner warn">Metal rates are not set yet. Set today's rates on the <Link href={`/stores/${storeId}`} style={{ textDecoration: 'underline' }}>store page</Link> — prices will calculate as 0 until then.</div>
      )}

      {groups.map((g) => {
        const gDone = g.variants.every((v) => saved[v.gid]);
        const gCount = g.variants.filter((v) => saved[v.gid]).length;
        const prices = g.variants.filter((v) => forms[v.gid]).map((v) => calculatePrice(forms[v.gid], rates, store.round_to).total);
        const open = openGroup === g.key;
        return (
          <div key={g.key} className={`group ${open ? 'open' : ''} ${gDone ? 'done' : ''}`}>
            <div className="group-head" onClick={() => setOpenGroup(open ? null : g.key)}>
              <span className="chev">▶</span>
              <div style={{ flex: 1 }}>
                <b>{g.label}</b>
                <div className="muted small">
                  {g.variants.length} {sizeOption ? `${sizeOption.toLowerCase()}${g.variants.length > 1 ? 's' : ''}` : 'variant(s)'}
                  {sizeOption && `: ${g.variants.map((v) => sizeLabel(v, sizeOption)).join(', ')}`}
                </div>
              </div>
              {prices.length > 0 && <span className="small muted">{money(Math.min(...prices), cur)}{prices.length > 1 && Math.max(...prices) !== Math.min(...prices) ? ` – ${money(Math.max(...prices), cur)}` : ''}</span>}
              <span className={`badge ${gDone ? 'green' : gCount ? 'amber' : ''}`}>{gDone ? '✓ Done' : `${gCount}/${g.variants.length}`}</span>
            </div>
            {open && (
              <div className="group-body">
                <GroupToolbar
                  count={g.variants.length}
                  savedSources={g.variants.filter((v) => saved[v.gid])}
                  sizeOption={sizeOption}
                  busy={busy === `group:${g.key}`}
                  onCopy={(srcGid, withWeight) => {
                    const src = forms[srcGid];
                    setForms((f) => {
                      const n = { ...f };
                      for (const v of g.variants) {
                        if (v.gid === srcGid) continue;
                        const existing = formFor(v, g.variants);
                        const copy: Form = { ...existing };
                        for (const k of Object.keys(src) as (keyof Form)[]) {
                          if (!withWeight && COPY_EXCLUDE.includes(k)) continue;
                          (copy as any)[k] = src[k];
                        }
                        n[v.gid] = copy;
                      }
                      return n;
                    });
                    toast('Copied — enter each size weight, then "Save all in group"');
                  }}
                  onSaveAll={() => saveVariants(g.variants.map((v) => ({ gid: v.gid, form: formFor(v, g.variants) })), `group:${g.key}`)}
                />
                {g.variants.map((v, idx) => {
                  const form = formFor(v, g.variants);
                  const price = calculatePrice(form, rates, store.round_to);
                  const vOpen = openVariant === v.gid;
                  const st = isDirty(v.gid) ? 'dirty' : isSaved(v.gid) ? 'saved' : '';
                  return (
                    <div key={v.gid} className={`vcard ${st}`}>
                      <div className="vcard-head" onClick={() => setOpenVariant(vOpen ? null : v.gid)}>
                        <span className="size-pill">{sizeLabel(v, sizeOption)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="small"><b>{v.title}</b></div>
                          <div className="muted small">{v.sku ? `SKU ${v.sku} · ` : ''}Shopify: {money(v.price, cur)}{v.last_pushed_at ? ` · pushed ${timeAgo(v.last_pushed_at)}` : ''}</div>
                        </div>
                        {form.metal_weight > 0 && <div className="num"><b>{money(price.total, cur)}</b>{price.compare_at && <div className="small muted"><s>{money(price.compare_at, cur)}</s></div>}</div>}
                        <span className={`badge ${st === 'saved' ? 'green' : st === 'dirty' ? 'amber' : ''}`}>{st === 'saved' ? '✓ Saved' : st === 'dirty' ? 'Unsaved' : 'Not set'}</span>
                      </div>
                      {vOpen && (
                        <div className="vcard-body">
                          <VariantForm
                            form={form}
                            rates={rates}
                            currency={cur}
                            roundTo={store.round_to}
                            onChange={(patch) => updateForm(v.gid, form, patch)}
                          />
                          <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                            {saved[v.gid] && isDirty(v.gid) && (
                              <button onClick={() => setForms((f) => ({ ...f, [v.gid]: JSON.parse(saved[v.gid]) }))}>Discard changes</button>
                            )}
                            <button
                              className="primary"
                              disabled={!!busy}
                              onClick={async () => {
                                const ok = await saveVariants([{ gid: v.gid, form }], `v:${v.gid}`);
                                if (!ok) return;
                                const next = g.variants.slice(idx + 1).find((x) => !saved[x.gid]) || g.variants.find((x) => !saved[x.gid] && x.gid !== v.gid);
                                setOpenVariant(next ? next.gid : null);
                              }}
                            >
                              {busy === `v:${v.gid}` ? <Spinner /> : null} Save variant{autoPush ? ' & update Shopify' : ''}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GroupToolbar({
  count, savedSources, sizeOption, busy, onCopy, onSaveAll,
}: {
  count: number; savedSources: Variant[]; sizeOption: string | null; busy: boolean;
  onCopy: (srcGid: string, withWeight: boolean) => void; onSaveAll: () => void;
}) {
  const [src, setSrc] = useState('');
  const [withWeight, setWithWeight] = useState(false);
  const source = src || savedSources[0]?.gid || '';
  if (count < 2) return null;
  return (
    <div className="row small" style={{ marginBottom: 10, gap: 10 }}>
      {savedSources.length > 0 && (
        <>
          <span className="muted">Copy charges from</span>
          <select className="plain" style={{ width: 'auto' }} value={source} onChange={(e) => setSrc(e.target.value)}>
            {savedSources.map((v) => <option key={v.gid} value={v.gid}>{sizeLabel(v, sizeOption)}</option>)}
          </select>
          <label className="row"><input type="checkbox" checked={withWeight} onChange={(e) => setWithWeight(e.target.checked)} /> incl. weight</label>
          <button className="sm" onClick={() => onCopy(source, withWeight)}>Copy to all {sizeOption ? `${sizeOption.toLowerCase()}s` : 'variants'}</button>
        </>
      )}
      <span className="spacer" />
      <button className="sm primary" disabled={busy} onClick={onSaveAll}>{busy ? <Spinner /> : null} Save all in group</button>
    </div>
  );
}

function VariantForm({
  form, rates, currency, roundTo, onChange,
}: { form: Form; rates: MetalRate[]; currency: string; roundTo: number; onChange: (p: Partial<Form>) => void }) {
  const price = calculatePrice(form, rates, roundTo);
  const n = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [k]: e.target.value as any });
  const numProps = (k: keyof Form) => ({
    type: 'number', min: 0, step: 'any', value: (form[k] as any) === 0 ? '' : (form[k] as any), placeholder: '0',
    onChange: n(k), onWheel: (e: React.WheelEvent<HTMLInputElement>) => (e.target as HTMLInputElement).blur(),
  });
  const setStone = (i: number, p: Partial<Stone>) => onChange({ stones: form.stones.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const rate = rates.find((r) => r.key === form.metal_key);

  return (
    <div className="form-split">
      <div>
        <div className="section-title">Metal</div>
        <div className="grid g3">
          <Field label="Metal & purity" required>
            <select className="plain" value={form.metal_key} onChange={(e) => onChange({ metal_key: e.target.value })}>
              {rates.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Metal weight" required suffix="grams"><input {...numProps('metal_weight')} autoFocus /></Field>
          <Field label="Rate today" suffix={`${currency}/g`}>
            <input readOnly value={rate ? Number(rate.rate).toFixed(2) : ''} style={{ color: 'var(--muted)' }} />
          </Field>
        </div>

        <div className="section-title">Making & labour</div>
        <div className="grid g3">
          <Field label="Making charge type">
            <select className="plain" value={form.making_type} onChange={(e) => onChange({ making_type: e.target.value as any })}>
              <option value="per_gram">Per gram</option>
              <option value="percent">% of metal value</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </Field>
          <Field label="Making charge (majuri)" suffix={form.making_type === 'per_gram' ? `${currency}/g` : form.making_type === 'percent' ? '%' : currency}>
            <input {...numProps('making_value')} />
          </Field>
          <Field label="Wastage" suffix="%"><input {...numProps('wastage_pct')} /></Field>
          <Field label="Labour cost" suffix={currency}><input {...numProps('labour_charge')} /></Field>
          <Field label="Hallmark / certification" suffix={currency}><input {...numProps('hallmark_charge')} /></Field>
          <Field label="Extra / misc. charges" suffix={currency}><input {...numProps('misc_charge')} /></Field>
        </div>

        <div className="section-title">Diamonds & stones</div>
        <div className="grid g2">
          <Field label="Diamond charge" suffix={currency} hint={price.diamond !== Number(form.diamond_charge || 0) ? `+ stones below = ${money(price.diamond, currency)}` : undefined}>
            <input {...numProps('diamond_charge')} />
          </Field>
          <Field label="Gemstone charge" suffix={currency} hint={price.gemstone !== Number(form.gemstone_charge || 0) ? `+ stones below = ${money(price.gemstone, currency)}` : undefined}>
            <input {...numProps('gemstone_charge')} />
          </Field>
        </div>
        {form.stones.length > 0 && (
          <table className="list" style={{ marginTop: 10, background: '#fff', border: '1px solid var(--border)', borderRadius: 8 }}>
            <thead><tr><th>Type</th><th>Name / quality</th><th>Carat</th><th>Price / ct</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>
              {form.stones.map((s, i) => (
                <tr key={i}>
                  <td>
                    <select className="plain" value={s.type} onChange={(e) => setStone(i, { type: e.target.value as any })}>
                      <option value="diamond">Diamond</option><option value="gemstone">Gemstone</option><option value="moissanite">Moissanite</option><option value="other">Other</option>
                    </select>
                  </td>
                  <td><input className="plain" value={s.name || ''} placeholder="VVS-EF round" onChange={(e) => setStone(i, { name: e.target.value })} /></td>
                  <td><input className="plain" type="number" step="any" min={0} value={s.carat || ''} onChange={(e) => setStone(i, { carat: e.target.value as any })} /></td>
                  <td><input className="plain" type="number" step="any" min={0} value={s.pricePerCarat || ''} onChange={(e) => setStone(i, { pricePerCarat: e.target.value as any })} /></td>
                  <td className="num">{money((Number(s.carat) || 0) * (Number(s.pricePerCarat) || 0), currency)}</td>
                  <td><button className="sm danger" onClick={() => onChange({ stones: form.stones.filter((_, j) => j !== i) })}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button className="link small" style={{ marginTop: 6 }} onClick={() => onChange({ stones: [...form.stones, { type: 'diamond', name: '', carat: 0, pricePerCarat: 0, qty: 0 }] })}>
          + Add stone (carat × price per carat)
        </button>

        <div className="section-title">Tax & margin</div>
        <div className="grid g3">
          <Field label="Markup" suffix="%" hint="Hidden margin, shown inside making charges"><input {...numProps('markup_pct')} /></Field>
          <Field label="GST" suffix="%"><input {...numProps('gst_pct')} /></Field>
          <Field label="Compare-at price margin" suffix="%" hint="0 = no strike-through price"><input {...numProps('compare_margin_pct')} /></Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Remarks"><input className="plain" value={form.remarks || ''} onChange={(e) => onChange({ remarks: e.target.value })} /></Field>
        </div>
      </div>

      <div>
        <div className="section-title">Live price breakup</div>
        <div className="breakup">
          {price.lines.map((l) => (
            <div key={l.code} className="l"><span>{l.label}{l.detail && <span className="d">{l.detail}</span>}</span><span>{money(l.amount, currency)}</span></div>
          ))}
          <div className="l total"><span>Total</span><span>{money(price.total, currency)}</span></div>
          {price.compare_at && <div className="l small muted"><span>Compare-at</span><s>{money(price.compare_at, currency)}</s></div>}
        </div>
        {price.total > 0 && <div className="section-title">Internal detail</div>}
        {price.total > 0 && <div className="breakup small">
          {[
            ['Metal value', price.metal_value], ['Wastage', price.wastage], ['Making', price.making], ['Labour', price.labour],
            ['Diamond', price.diamond], ['Gemstone', price.gemstone], ['Other', price.other], ['Markup', price.markup],
            ['Subtotal (pre-GST)', price.subtotal], ['GST', price.gst],
          ].filter(([, v]) => Number(v) !== 0).map(([k, v]) => (
            <div key={k as string} className="l"><span className="muted">{k}</span><span>{money(v as number, currency)}</span></div>
          ))}
        </div>}
      </div>
    </div>
  );
}
