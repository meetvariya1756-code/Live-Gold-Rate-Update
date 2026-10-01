// Pure pricing engine — used by both the browser (live preview) and the server (push to Shopify).

export type MakingType = 'per_gram' | 'percent' | 'fixed';

export interface Stone {
  type: 'diamond' | 'gemstone' | 'moissanite' | 'other';
  name?: string;
  carat: number;          // total carat for this line
  pricePerCarat: number;
  qty?: number;           // informational
}

export interface VariantConfigInput {
  metal_key: string;
  metal_weight: number;
  making_type: MakingType;
  making_value: number;
  wastage_pct: number;
  diamond_charge: number;
  gemstone_charge: number;
  stones: Stone[];
  labour_charge: number;
  hallmark_charge: number;
  misc_charge: number;
  markup_pct: number;
  gst_pct: number;
  compare_margin_pct: number;
  remarks?: string | null;
}

export interface MetalRate {
  key: string;
  label: string;
  metal: string;
  purity: number;
  rate: number;
  auto: boolean;
  sort: number;
}

export interface BreakupLine {
  code: string;
  label: string;
  amount: number;
  detail?: string;
}

export interface PriceResult {
  metal_label: string;
  rate_per_gram: number;
  weight: number;
  metal_value: number;
  wastage: number;
  making: number;
  diamond: number;
  gemstone: number;
  labour: number;
  other: number;
  markup: number;
  subtotal: number;      // before GST
  gst_pct: number;
  gst: number;
  total: number;         // final rounded price
  compare_at: number | null;
  lines: BreakupLine[];  // customer-facing breakup
}

export const DEFAULT_METALS: Omit<MetalRate, 'rate'>[] = [
  { key: 'gold_24k', label: 'Gold 24K (999)', metal: 'gold', purity: 1, auto: false, sort: 1 },
  { key: 'gold_22k', label: 'Gold 22K (916)', metal: 'gold', purity: 0.9167, auto: true, sort: 2 },
  { key: 'gold_18k', label: 'Gold 18K (750)', metal: 'gold', purity: 0.75, auto: true, sort: 3 },
  { key: 'gold_14k', label: 'Gold 14K (585)', metal: 'gold', purity: 0.5833, auto: true, sort: 4 },
  { key: 'gold_10k', label: 'Gold 10K (417)', metal: 'gold', purity: 0.4167, auto: true, sort: 5 },
  { key: 'gold_9k', label: 'Gold 9K (375)', metal: 'gold', purity: 0.375, auto: true, sort: 6 },
  { key: 'silver_999', label: 'Silver 999', metal: 'silver', purity: 1, auto: false, sort: 10 },
  { key: 'silver_925', label: 'Silver 925 (Sterling)', metal: 'silver', purity: 0.925, auto: true, sort: 11 },
  { key: 'platinum_950', label: 'Platinum 950', metal: 'platinum', purity: 0.95, auto: false, sort: 20 },
];

/** The base (non-auto) rate for a metal family is the reference for its auto-derived purities. */
export function deriveRates(rates: MetalRate[]): MetalRate[] {
  const base: Record<string, MetalRate | undefined> = {};
  for (const r of rates) {
    if (!r.auto && (!base[r.metal] || r.purity > base[r.metal]!.purity)) base[r.metal] = r;
  }
  return rates.map((r) => {
    const b = base[r.metal];
    if (!r.auto || !b || !b.purity) return r;
    return { ...r, rate: round2((b.rate / b.purity) * r.purity) };
  });
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function roundTo(n: number, step: number) {
  if (!step || step <= 0) return round2(n);
  return Math.round(n / step) * step;
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

export function stonesTotal(stones: Stone[] | undefined, type?: Stone['type']) {
  return round2(
    (stones || [])
      .filter((s) => !type || s.type === type || (type === 'gemstone' && s.type !== 'diamond'))
      .reduce((a, s) => a + num(s.carat) * num(s.pricePerCarat), 0),
  );
}

export function calculatePrice(cfg: VariantConfigInput, rates: MetalRate[], roundStep = 1): PriceResult {
  const rate = rates.find((r) => r.key === cfg.metal_key);
  const ratePerGram = num(rate?.rate);
  const weight = num(cfg.metal_weight);

  const metal_value = round2(weight * ratePerGram);
  const wastage = round2((metal_value * num(cfg.wastage_pct)) / 100);

  let making = 0;
  if (cfg.making_type === 'per_gram') making = weight * num(cfg.making_value);
  else if (cfg.making_type === 'percent') making = (metal_value * num(cfg.making_value)) / 100;
  else making = num(cfg.making_value);
  making = round2(making);

  const diamond = round2(num(cfg.diamond_charge) + stonesTotal(cfg.stones, 'diamond'));
  const gemstone = round2(num(cfg.gemstone_charge) + stonesTotal(cfg.stones, 'gemstone'));
  const labour = round2(num(cfg.labour_charge));
  const other = round2(num(cfg.hallmark_charge) + num(cfg.misc_charge));

  const base = metal_value + wastage + making + diamond + gemstone + labour + other;
  const markup = round2((base * num(cfg.markup_pct)) / 100);
  const subtotal = round2(base + markup);
  const gst_pct = num(cfg.gst_pct);
  const gstRaw = (subtotal * gst_pct) / 100;
  const total = roundTo(subtotal + gstRaw, roundStep);
  const gst = round2(total - subtotal); // absorb rounding into GST line so lines always sum to total
  const cm = num(cfg.compare_margin_pct);
  const compare_at = cm > 0 ? roundTo(total * (1 + cm / 100), roundStep) : null;

  // Customer-facing lines: markup + wastage + labour are folded into "Making charges".
  const lines: BreakupLine[] = [
    {
      code: 'metal',
      label: rate?.label || 'Metal',
      amount: metal_value,
      detail: `${weight} g × ${round2(ratePerGram)}`,
    },
    { code: 'making', label: 'Making charges', amount: round2(making + wastage + labour + markup) },
  ];
  if (diamond) lines.push({ code: 'diamond', label: 'Diamond', amount: diamond });
  if (gemstone) lines.push({ code: 'gemstone', label: 'Gemstone', amount: gemstone });
  if (other) lines.push({ code: 'other', label: 'Other charges', amount: other });
  lines.push({ code: 'gst', label: `GST (${gst_pct}%)`, amount: gst });

  return {
    metal_label: rate?.label || cfg.metal_key,
    rate_per_gram: ratePerGram,
    weight,
    metal_value,
    wastage,
    making,
    diamond,
    gemstone,
    labour,
    other,
    markup,
    subtotal,
    gst_pct,
    gst,
    total,
    compare_at,
    lines,
  };
}

export function emptyConfig(defaultMetal = 'gold_14k', gst = 3): VariantConfigInput {
  return {
    metal_key: defaultMetal,
    metal_weight: 0,
    making_type: 'per_gram',
    making_value: 0,
    wastage_pct: 0,
    diamond_charge: 0,
    gemstone_charge: 0,
    stones: [],
    labour_charge: 0,
    hallmark_charge: 0,
    misc_charge: 0,
    markup_pct: 0,
    gst_pct: gst,
    compare_margin_pct: 0,
    remarks: '',
  };
}

/** Guess the metal key from a variant's option values, e.g. "14KT" / "18K" / "Silver 925". */
export function guessMetalKey(values: string[]): string | null {
  const s = values.join(' ').toLowerCase();
  const k = s.match(/\b(24|22|18|14|10|9)\s*(k|kt|kr|karat|carat)\b/);
  if (k) return `gold_${k[1]}k`;
  if (/925|sterling/.test(s)) return 'silver_925';
  if (/silver/.test(s)) return 'silver_999';
  if (/platinum/.test(s)) return 'platinum_950';
  return null;
}
