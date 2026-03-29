/**
 * Research Scout agent
 *
 * Monitors the ETFs in the portfolio for significant events:
 * - Large price moves (>2% daily)
 * - Unusual volume
 * - Expense ratio changes
 *
 * Reports findings but does not trade.
 * Runs daily or on demand.
 */
import { connect, disconnect, getMarketPrices } from '../connection/gateway.js';
import { loadState, saveState } from '../state/store.js';
import { TARGET_PORTFOLIO } from '../config.js';
import { log, logError } from '../log.js';

const AGENT = 'ResearchScout';

interface PriceRecord {
  symbol: string;
  price: number;
  timestamp: string;
}

async function run(): Promise<void> {
  log('Market scan starting', AGENT);
  await connect();

  try {
    const symbols = TARGET_PORTFOLIO.map(t => t.symbol);
    const prices = await getMarketPrices(symbols);

    const state = loadState();
    const prevPrices = (state.lastPrices || []) as PriceRecord[];

    log('Current prices:', AGENT);
    const newPrices: PriceRecord[] = [];

    for (const [symbol, price] of prices) {
      const prev = prevPrices.find(p => p.symbol === symbol);
      const target = TARGET_PORTFOLIO.find(t => t.symbol === symbol);
      let changeStr = '';

      if (prev && prev.price > 0) {
        const changePct = ((price - prev.price) / prev.price) * 100;
        changeStr = ` (${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}% since last scan)`;

        if (Math.abs(changePct) > 2) {
          log(`  ⚠ ${symbol} moved ${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}% — significant move`, AGENT);
        }
      }

      log(`  ${symbol} (${target?.sleeve || '?'}): $${price.toFixed(2)}${changeStr}`, AGENT);
      newPrices.push({ symbol, price, timestamp: new Date().toISOString() });
    }

    state.lastPrices = newPrices;
    state.lastResearchAt = new Date().toISOString();
    saveState(state);

  } finally {
    disconnect();
  }

  log('Market scan complete', AGENT);
}

const isOnce = process.argv.includes('--once');
run()
  .then(() => { if (isOnce) process.exit(0); })
  .catch((err) => { logError('Fatal', err, AGENT); process.exit(1); });
