/**
 * Portfolio Strategist
 * Runs portfolio construction algorithms (HRP, risk parity) and determines target weights.
 */
import { connect, disconnect, getAccountSummary, getMarketPrices , requestDelayedData } from '../connection/gateway.js';
import { TARGET_PORTFOLIO, validateTargets } from '../config.js';
import { hrpWeights } from '../portfolio/hrp.js';
import { riskParityWeights } from '../portfolio/risk-parity.js';
import { blackLitterman } from '../portfolio/black-litterman.js';
import { allocateCashFlow } from '../portfolio/cashflow-rebalance.js';
import { sampleCovMatrix } from '../portfolio/covariance.js';
import { loadState, saveState } from '../state/store.js';
import { log, logError } from '../log.js';

const AGENT = 'PortfolioStrategist';

async function run(): Promise<void> {
  log('Portfolio strategy analysis starting', AGENT);
  validateTargets();
  await connect();
  requestDelayedData();

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

      // Black-Litterman: use equal market weights as prior, no active views
      const marketWeights = symbols.map(() => 1 / symbols.length);
      const bl = blackLitterman(cov, marketWeights, {
        P: [symbols.map((_, i) => (i === 0 ? 1 : 0))],  // simple view: first asset
        Q: [0.05],  // 5% expected return view
      });
      log('Black-Litterman posterior weights:', AGENT);
      symbols.forEach((s, i) => log(`  ${s}: ${(bl.optimalWeights[i] * 100).toFixed(1)}%`, AGENT));

      state.optimizedWeights = { hrp: hrp.weights, riskParity: rp, blackLitterman: bl.optimalWeights };
    } else {
      log('Insufficient historical data — using static target weights', AGENT);
      log('Target weights:', AGENT);
      for (const t of TARGET_PORTFOLIO) {
        log(`  ${t.symbol}: ${t.pct}% (${t.sleeve})`, AGENT);
      }
    }

    // Cash flow rebalancing: if cash exceeds threshold, allocate to underweight positions
    const CASH_THRESHOLD = 1000;
    if (account.totalCashValue > CASH_THRESHOLD) {
      const holdings = TARGET_PORTFOLIO.map(t => {
        const pos = account.positions.find((p: { symbol: string }) => p.symbol === t.symbol);
        const price = prices.get(t.symbol) || 0;
        return {
          symbol: t.symbol,
          currentValue: pos ? pos.qty * price : 0,
          targetPct: t.pct,
        };
      });

      const cashOrders = allocateCashFlow(holdings, account.totalCashValue - CASH_THRESHOLD, 100, prices);
      if (cashOrders.length > 0) {
        log(`Cash flow rebalance (surplus: $${(account.totalCashValue - CASH_THRESHOLD).toFixed(2)}):`, AGENT);
        for (const o of cashOrders) {
          log(`  BUY ${o.shares} ${o.symbol} ($${o.amountUsd.toFixed(2)})`, AGENT);
        }
        state.cashFlowOrders = cashOrders;
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
