/**
 * Managing Partner (CEO)
 * Orchestrates the fund: checks portfolio, delegates to risk/strategy/execution.
 */
import { connect, disconnect, getAccountSummary, getMarketPrices, requestDelayedData } from '../connection/gateway.js';
import { TARGET_PORTFOLIO, validateTargets } from '../config.js';
import { loadState, saveState } from '../state/store.js';
import { log, logError } from '../log.js';

const AGENT = 'ManagingPartner';

async function run(): Promise<void> {
  log('Fund oversight cycle starting', AGENT);
  validateTargets();
  await connect();
  requestDelayedData();

  try {
    const account = await getAccountSummary();
    log(`NAV: $${account.netLiquidation.toFixed(2)} | Cash: $${account.totalCashValue.toFixed(2)}`, AGENT);
    log(`Positions: ${account.positions.length}`, AGENT);

    const symbols = TARGET_PORTFOLIO.map(t => t.symbol);
    const prices = await getMarketPrices(symbols);

    for (const [sym, price] of prices) {
      log(`  ${sym}: $${price.toFixed(2)}`, AGENT);
    }

    const state = loadState();
    state.lastCheckAt = new Date().toISOString();
    state.lastNav = account.netLiquidation;
    state.lastCash = account.totalCashValue;
    saveState(state);

    log('Delegating to Portfolio Strategist, Risk Manager, and Research Scout', AGENT);
  } finally {
    disconnect();
  }
  log('Fund oversight cycle complete', AGENT);
}

if (process.argv.includes('--once')) {
  run().then(() => process.exit(0)).catch(e => { logError('Fatal', e, AGENT); process.exit(1); });
}
