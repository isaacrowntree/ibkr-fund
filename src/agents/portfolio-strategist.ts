/**
 * Portfolio Strategist
 * Runs portfolio construction algorithms (HRP, risk parity) and determines target weights.
 */
import { connect, disconnect, getAccountSummary, getMarketPrices } from '../connection/gateway.js';
import { TARGET_PORTFOLIO, validateTargets } from '../config.js';
import { hrpWeights } from '../portfolio/hrp.js';
import { riskParityWeights } from '../portfolio/risk-parity.js';
import { sampleCovMatrix } from '../portfolio/covariance.js';
import { loadState, saveState } from '../state/store.js';
import { log, logError } from '../log.js';

const AGENT = 'PortfolioStrategist';

async function run(): Promise<void> {
  log('Portfolio strategy analysis starting', AGENT);
  validateTargets();
  await connect();

  try {
    const account = await getAccountSummary();
    const symbols = TARGET_PORTFOLIO.map(t => t.symbol);
    const prices = await getMarketPrices(symbols);

    log(`NAV: $${account.netLiquidation.toFixed(2)}`, AGENT);

    // If we have historical returns, compute optimized weights
    const state = loadState();
    const historicalReturns = state.historicalReturns as number[][] | undefined;

    if (historicalReturns && historicalReturns.length >= 2) {
      const cov = sampleCovMatrix(historicalReturns);

      const hrp = hrpWeights(cov);
      log('HRP weights:', AGENT);
      symbols.forEach((s, i) => log(`  ${s}: ${(hrp.weights[i] * 100).toFixed(1)}%`, AGENT));

      const rp = riskParityWeights(cov);
      log('Risk Parity weights:', AGENT);
      symbols.forEach((s, i) => log(`  ${s}: ${(rp[i] * 100).toFixed(1)}%`, AGENT));

      state.optimizedWeights = { hrp: hrp.weights, riskParity: rp };
    } else {
      log('Insufficient historical data — using static target weights', AGENT);
      log('Target weights:', AGENT);
      for (const t of TARGET_PORTFOLIO) {
        log(`  ${t.symbol}: ${t.pct}% (${t.sleeve})`, AGENT);
      }
    }

    state.lastStrategyAt = new Date().toISOString();
    saveState(state);
  } finally {
    disconnect();
  }
  log('Portfolio strategy analysis complete', AGENT);
}

if (process.argv.includes('--once')) {
  run().then(() => process.exit(0)).catch(e => { logError('Fatal', e, AGENT); process.exit(1); });
}
