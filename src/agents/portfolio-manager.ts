/**
 * Portfolio Manager agent
 *
 * Analyzes current holdings, computes allocation drift, and reports status.
 * Does NOT execute trades — that's the Rebalancer's job.
 * Runs on demand or scheduled (default: daily).
 */
import { connect, disconnect, getAccountSummary, getMarketPrices } from '../connection/gateway.js';
import { analyzePortfolio } from '../allocation/portfolio.js';
import { loadState, saveState } from '../state/store.js';
import { TARGET_PORTFOLIO, validateTargets } from '../config.js';
import { log, logError } from '../log.js';

const AGENT = 'PortfolioManager';

async function run(): Promise<void> {
  log('Portfolio analysis starting', AGENT);
  validateTargets();
  await connect();

  try {
    const account = await getAccountSummary();
    const symbols = TARGET_PORTFOLIO.map(t => t.symbol);
    const prices = await getMarketPrices(symbols);
    const snapshot = analyzePortfolio(account, prices);

    log(`NAV: $${snapshot.netLiquidation.toFixed(2)}`, AGENT);
    log(`Growth: ${snapshot.growthPct.toFixed(1)}% | Defensive: ${snapshot.defensivePct.toFixed(1)}% | Cash: ${snapshot.cashPct.toFixed(1)}%`, AGENT);
    log('', AGENT);

    for (const h of snapshot.holdings) {
      const bar = h.currentPct > 0 ? '█'.repeat(Math.round(h.currentPct / 2)) : '';
      const drift = h.driftPct > 0 ? `+${h.driftPct.toFixed(1)}` : h.driftPct.toFixed(1);
      log(`  ${h.symbol.padEnd(5)} ${bar} ${h.currentPct.toFixed(1)}% (target ${h.targetPct}%) [${drift}%] $${h.currentValue.toFixed(0)}`, AGENT);
    }

    if (snapshot.needsRebalance) {
      log(`\nRebalance recommended — max drift ${snapshot.maxDrift.toFixed(1)}%`, AGENT);
    } else {
      log(`\nPortfolio in balance — max drift ${snapshot.maxDrift.toFixed(1)}%`, AGENT);
    }

    const state = loadState();
    state.lastSnapshot = snapshot;
    saveState(state);

  } finally {
    disconnect();
  }
}

const isOnce = process.argv.includes('--once');
run()
  .then(() => { if (isOnce) process.exit(0); })
  .catch((err) => { logError('Fatal', err, AGENT); process.exit(1); });
