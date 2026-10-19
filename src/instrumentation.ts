export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { autoUpdateStoreRates } = await import('@/lib/rateFetcher');

    console.log('[LiveGold Feed] Background Auto-Rate Scheduler initialized.');

    // Run periodic rate check every 30 minutes
    const INTERVAL_MS = 30 * 60 * 1000;

    const runSync = async (isStartup = false) => {
      try {
        const now = new Date();
        const istTime = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
        console.log(`[LiveGold Feed - ${istTime}] ${isStartup ? 'Initial startup' : 'Scheduled'} live gold rate check...`);
        const res = await autoUpdateStoreRates();
        if (res.ok) {
          console.log(`[LiveGold Feed - ${istTime}] Auto-update completed. 24K Rate: ₹${res.rate24k}`);
        }
      } catch (err) {
        console.warn('[LiveGold Feed] Auto-update loop error:', err);
      }
    };

    // 1. Initial sync safely after server boot and warmup (45 seconds)
    setTimeout(() => runSync(true), 45000);

    // 2. Continuous recurring sync every 30 minutes
    setInterval(() => runSync(false), INTERVAL_MS);
  }
}
