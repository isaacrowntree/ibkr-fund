/**
 * IBKR Allocation Fund — Main entry point
 *
 * Starts the status server and runs the Managing Partner cycle.
 * Use --once for single-shot execution (Paperclip process adapter).
 * Without --once, runs as a daemon with periodic checks.
 */
import { startStatusServer } from './status/server.js';
import { log } from './log.js';

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

async function runManagingPartner(): Promise<void> {
  // Dynamic import to avoid circular deps
  const mod = await import('./agents/managing-partner.js');
  // The managing-partner module self-executes, so we just import it
}

async function main(): Promise<void> {
  const isOnce = process.argv.includes('--once');

  log('IBKR Allocation Fund starting');
  log(`Mode: ${isOnce ? 'single check' : 'daemon'}`);

  if (!isOnce) {
    startStatusServer();
    // Run immediately, then on interval
    await runManagingPartner();
    setInterval(() => runManagingPartner().catch(console.error), CHECK_INTERVAL_MS);
  }
  // In --once mode, the individual agent scripts handle their own execution
}

if (!process.argv.includes('--once')) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
