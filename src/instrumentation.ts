export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { autoUpdateStoreRates } = await import('@/lib/rateFetcher');

    console.log('[Gold Rate Pricer] Background Auto-Rate Scheduler initialized.');

    // Run periodic rate check every 30 minutes
    const INTERVAL_MS = 30 * 60 * 1000;
    setInterval(async () => {
      try {
        const now = new Date();
        // Log IST time
        const istTime = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
        console.log(`[Gold Rate Pricer - ${istTime}] Checking for live gold rate updates...`);
        const res = await autoUpdateStoreRates();
        if (res.ok) {
          console.log(`[Gold Rate Pricer - ${istTime}] Auto-update completed. 24K Rate: ₹${res.rate24k}`);
        }
      } catch (err) {
        console.warn('[Gold Rate Pricer] Auto-update loop error:', err);
      }
    }, INTERVAL_MS);
  }
}
