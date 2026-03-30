/**
 * Risk Manager
 * VaR/CVaR, drawdown control, volatility targeting, correlation monitoring.
 */
import { connect, disconnect, getAccountSummary, getMarketPrices , requestDelayedData } from '../connection/gateway.js';
import { TARGET_PORTFOLIO } from '../config.js';
import { historicalVaR, conditionalVaR } from '../risk/var.js';
import { assessDrawdown, maxDrawdown } from '../risk/drawdown.js';
import { ewmaVolatility, annualizeVol, volTargetLeverage } from '../risk/volatility.js';
import { loadState, saveState } from '../state/store.js';
import { log, logError } from '../log.js';

const AGENT = 'RiskManager';
const TARGET_VOL = 0.12; // 12% annualized target volatility

async function run(): Promise<void> {
  log('Risk assessment starting', AGENT);
  await connect();
  requestDelayedData();

  try {
    const account = await getAccountSummary();
    const symbols = TARGET_PORTFOLIO.map(t => t.symbol);
    const prices = await getMarketPrices(symbols);

    const state = loadState();
    const navHistory = (state.navHistory || []) as number[];
    navHistory.push(account.netLiquidation);
    if (navHistory.length > 500) navHistory.splice(0, navHistory.length - 500);

    log(`NAV: $${account.netLiquidation.toFixed(2)}`, AGENT);

    // Drawdown
    const peak = Math.max(...navHistory);
    const dd = assessDrawdown(account.netLiquidation, peak);
    log(`Drawdown: ${dd.drawdownPct.toFixed(2)}% (${dd.level}) | Peak: $${dd.peak.toFixed(2)}`, AGENT);

    // Max drawdown
    if (navHistory.length >= 10) {
      const mdd = maxDrawdown(navHistory);
      log(`Max drawdown (history): ${mdd.toFixed(2)}%`, AGENT);
    }

    // VaR from NAV returns
    if (navHistory.length >= 20) {
      const returns = navHistory.slice(1).map((v, i) => (v - navHistory[i]) / navHistory[i]);
      const var95 = historicalVaR(returns, 0.95);
      const cvar95 = conditionalVaR(returns, 0.95);
      log(`VaR(95%): ${(var95 * 100).toFixed(2)}% | CVaR(95%): ${(cvar95 * 100).toFixed(2)}%`, AGENT);

      // Volatility targeting
      const vol = ewmaVolatility(returns.slice(-60));
      const annVol = annualizeVol(vol);
      const leverage = volTargetLeverage(annVol, TARGET_VOL);
      log(`Realized vol: ${(annVol * 100).toFixed(1)}% | Target: ${(TARGET_VOL * 100).toFixed(0)}% | Leverage: ${leverage.toFixed(2)}x`, AGENT);

      state.riskMetrics = {
        drawdown: dd,
        var95: var95 * 100,
        cvar95: cvar95 * 100,
        realizedVol: annVol * 100,
        volTargetLeverage: leverage,
      };
    }

    if (dd.level === 'stopped') {
      log('HARD STOP: Portfolio drawdown exceeds limit — manual review required', AGENT);
    } else if (dd.level === 'derisking') {
      log('DE-RISKING: Reducing exposure to 50%', AGENT);
    } else if (dd.level === 'warning') {
      log('WARNING: Tightening risk limits', AGENT);
    }

    state.navHistory = navHistory;
    state.lastRiskAt = new Date().toISOString();
    saveState(state);

  } finally {
    disconnect();
  }
  log('Risk assessment complete', AGENT);
}

if (process.argv.includes('--once')) {
  run().then(() => process.exit(0)).catch(e => { logError('Fatal', e, AGENT); process.exit(1); });
}
