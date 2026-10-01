import { NextRequest } from 'next/server';
import Papa from 'papaparse';
import { q } from '@/lib/db';
import { handler, json, err, Ctx } from '@/lib/api';
import { rowToConfig, sanitizeConfig, saveVariantConfig } from '@/lib/services';
import { emptyConfig } from '@/lib/pricing';
import { CSV_FIELDS } from '@/lib/csv';
import { requireStoreAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST multipart form-data with "file" (CSV exported from /export). Rows with empty metal_weight are skipped.
export const POST = handler(async (req: NextRequest, { params }: Ctx<{ storeId: string }>) => {
  const { storeId } = await params;
  const id = Number(storeId);
  await requireStoreAccess(id, req);
  const form = await req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return err('CSV file required');
  const text = (await file.text()).replace(/^﻿/, '');
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });

  const variants = await q('SELECT gid, sku FROM variants WHERE store_id=$1', [id]);
  const bySku = new Map(variants.filter((v) => v.sku).map((v) => [String(v.sku).trim(), v.gid]));
  const gids = new Set(variants.map((v) => v.gid));
  const existing = new Map((await q('SELECT * FROM variant_configs WHERE store_id=$1', [id])).map((c) => [c.variant_gid, c]));

  let saved = 0, skipped = 0;
  const errors: string[] = [];
  for (const [i, row] of parsed.data.entries()) {
    const gid = gids.has(row.variant_gid) ? row.variant_gid : bySku.get(String(row.sku || '').trim());
    if (!gid) { errors.push(`Row ${i + 2}: variant not found`); continue; }
    if (!row.metal_weight || !row.metal_key) { skipped++; continue; }
    const prev = existing.get(gid);
    const base = prev ? rowToConfig(prev) : emptyConfig();
    const merged: any = { ...base };
    for (const f of CSV_FIELDS) if (row[f] !== undefined && row[f] !== '') merged[f] = row[f];
    try {
      await saveVariantConfig(id, gid, sanitizeConfig(merged));
      saved++;
    } catch (e: any) {
      errors.push(`Row ${i + 2}: ${e.message}`);
    }
  }
  return json({ saved, skipped, errors: errors.slice(0, 50) });
});
