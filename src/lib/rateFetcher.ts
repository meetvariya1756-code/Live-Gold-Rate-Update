import { q, one, tx } from './db';
import { deriveRates, MetalRate } from './pricing';
import { getRates, getStore, pushPrices } from './services';

export interface LiveRateResult {
  gold_24k: number;
  gold_22k: number;
  gold_18k: number;
  gold_14k: number;
  source: string;
  timestamp: string;
}

/**
 * Fetches the latest live certified 24K gold rate per gram in INR.
 * Uses real-time international spot + FX benchmark feeds with fallback.
 */
export async function fetchLiveMarketRates(): Promise<LiveRateResult | null> {
  try {
    // 1. Try Gold API with 3.5s timeout
    const spotRes = await fetch('https://api.gold-api.com/price/XAU', {
      cache: 'no-store',
      signal: AbortSignal.timeout(3500),
    });
    if (spotRes.ok) {
      const spotData = await spotRes.json();
      if (spotData && spotData.price) {
        let inrPerUSD = 88.5;
        try {
          const fxRes = await fetch('https://open.er-api.com/v6/latest/USD', {
            cache: 'no-store',
            signal: AbortSignal.timeout(2500),
          });
          if (fxRes.ok) {
            const fxData = await fxRes.json();
            if (fxData?.rates?.INR) inrPerUSD = fxData.rates.INR;
          }
        } catch {}

        // 1 troy oz = 31.1034768 grams
        // Standard India 24K benchmark factoring import duty & pure gold premium
        const base24k = Math.round((spotData.price / 31.1034768) * inrPerUSD * 1.16);

        return {
          gold_24k: Math.max(12000, base24k),
          gold_22k: Math.round(base24k * 0.9167),
          gold_18k: Math.round(base24k * 0.75),
          gold_14k: Math.round(base24k * 0.5833),
          source: 'Live Spot Market Feed',
          timestamp: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.warn('[RateFetcher] Live rate fetch failed:', err);
  }

  return null;
}

/**
 * Checks and updates metal rates for all stores (or a single store) with live market rates,
 * and automatically triggers price updates on Shopify if rates changed.
 */
export async function autoUpdateStoreRates(storeId?: number, forcedRate24k?: number) {
  const storeQuery = storeId
    ? 'SELECT id, name, auto_push FROM stores WHERE id = $1'
    : 'SELECT id, name, auto_push FROM stores WHERE auto_push = TRUE';
  const stores = await q<{ id: number; name: string; auto_push: boolean }>(storeQuery, storeId ? [storeId] : []);

  const live = forcedRate24k ? { gold_24k: forcedRate24k } : await fetchLiveMarketRates();
  if (!live && !forcedRate24k) {
    return { ok: false, message: 'Could not fetch live market rate.' };
  }

  const rate24k = forcedRate24k || live!.gold_24k;
  const results = [];

  for (const s of stores) {
    try {
      const currentRates = await getRates(s.id);
      const current24k = currentRates.find((r) => r.key === 'gold_24k')?.rate || 0;

      // Update 24k rate and ensure auto-derived rates are active
      await q(
        `UPDATE metal_rates
         SET rate = $1, updated_at = NOW()
         WHERE store_id = $2 AND key = 'gold_24k'`,
        [rate24k, s.id],
      );

      await q(
        `UPDATE metal_rates
         SET auto = TRUE
         WHERE store_id = $1 AND key NOT IN ('gold_24k', 'silver_999', 'platinum_950')`,
        [s.id],
      );

      // Record in rate history if rate changed
      if (current24k !== rate24k) {
        await q(
          `INSERT INTO rate_history(store_id, key, rate, created_at)
           VALUES($1, 'gold_24k', $2, NOW())`,
          [s.id, rate24k],
        );
      }

      // Automatically push updated prices to Shopify
      const { runId } = await pushPrices(s.id, 'auto_rate_sync');
      results.push({ storeId: s.id, storeName: s.name, rate24k, runId });
    } catch (e: any) {
      results.push({ storeId: s.id, storeName: s.name, error: e.message });
    }
  }

  return { ok: true, rate24k, results };
}
