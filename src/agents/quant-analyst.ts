/**
 * Quant Analyst
 * Generates factor signals, detects market regime, feeds data to the strategist.
 */
import { connect, disconnect, getMarketPrices } from '../connection/gateway.js';
import { TARGET_PORTFOLIO } from '../config.js';
import { trendSignal, volRegimeSignal, compositeRegime } from '../quant/regime.js';
import { realizedVolatility, annualizeVol } from '../risk/volatility.js';
import { loadState, saveState } from '../state/store.js';
import { log, logError } from '../log.js';

const AGENT = 'QuantAnalyst';

async function run(): Promise<void> {
  log('Quant analysis starting', AGENT);
  await connect();

  try {
    const symbols = TARGET_PORTFOLIO.map(t => t.symbol);
    const prices = await getMarketPrices(symbols);

    const state = loadState();
    const priceHistory = (state.priceHistory || {}) as Record<string, number[]>;

    // Update price history
    for (const [sym, price] of prices) {
      if (!priceHistory[sym]) priceHistory[sym] = [];
      priceHistory[sym].push(price);
      if (priceHistory[sym].length > 500) priceHistory[sym] = priceHistory[sym].slice(-500);
    }

    // Compute regime signals for first symbol as market proxy
    const proxySymbol = symbols[0];
    const proxyPrices = priceHistory[proxySymbol] || [];

    let regime;
    if (proxyPrices.length >= 200) {
      const trend = trendSignal(proxyPrices);
      const returns = proxyPrices.slice(1).map((p, i) => (p - proxyPrices[i]) / proxyPrices[i]);
      const vol = annualizeVol(realizedVolatility(returns.slice(-60)));
      const volSignal = volRegimeSignal(vol * 100);

      regime = compositeRegime({ trend, volatility: volSignal, correlation: 0 });
      log(`Regime: ${regime.composite} (score: ${regime.score})`, AGENT);
      log(`  Trend: ${trend}, Vol: ${volSignal} (annualized: ${(vol * 100).toFixed(1)}%)`, AGENT);
    } else {
      log(`Insufficient price history (${proxyPrices.length}/200 days) — regime unknown`, AGENT);
    }

    state.priceHistory = priceHistory;
    state.regime = regime || null;
    state.lastQuantAt = new Date().toISOString();
    saveState(state);

  } finally {
    disconnect();
  }
  log('Quant analysis complete', AGENT);
}

if (process.argv.includes('--once')) {
  run().then(() => process.exit(0)).catch(e => { logError('Fatal', e, AGENT); process.exit(1); });
}
