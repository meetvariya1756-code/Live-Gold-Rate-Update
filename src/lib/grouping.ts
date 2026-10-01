// Groups variants by every option except the "size" option.
// e.g. options Purity / Color / Size  ->  group "14KT · Rose Gold" containing sizes 5,6,7,8...

export interface OptionDef { name: string; values: string[] }
export interface VariantLike { gid: string; title: string; options: { name: string; value: string }[]; position: number }

const SIZE_RE = /(size|length|chain length|ring|bangle|width)/i;

export function detectSizeOption(options: OptionDef[]): string | null {
  if (!options?.length) return null;
  const named = options.find((o) => SIZE_RE.test(o.name));
  if (named) return named.name;
  if (options.length > 1) return options[options.length - 1].name;
  return null; // single option (e.g. only size or only purity) -> each variant is its own group key
}

export interface VariantGroup<V> {
  key: string;
  label: string;          // "14KT · Rose Gold"
  values: Record<string, string>;
  variants: V[];
}

export function groupVariants<V extends VariantLike>(options: OptionDef[], variants: V[], sizeOption?: string | null): VariantGroup<V>[] {
  const size = sizeOption === undefined ? detectSizeOption(options) : sizeOption;
  const groupOpts = options.map((o) => o.name).filter((n) => n !== size);
  const groups = new Map<string, VariantGroup<V>>();
  for (const v of [...variants].sort((a, b) => a.position - b.position)) {
    const vals: Record<string, string> = {};
    for (const o of v.options) if (groupOpts.includes(o.name)) vals[o.name] = o.value;
    const key = groupOpts.map((n) => vals[n] ?? '').join(' | ') || 'All variants';
    if (!groups.has(key)) {
      const label = groupOpts.map((n) => vals[n]).filter(Boolean).join(' · ') || 'All variants';
      groups.set(key, { key, label, values: vals, variants: [] });
    }
    groups.get(key)!.variants.push(v);
  }
  return [...groups.values()];
}

export function sizeLabel(v: VariantLike, sizeOption: string | null) {
  if (!sizeOption) return v.title;
  return v.options.find((o) => o.name === sizeOption)?.value ?? v.title;
}
