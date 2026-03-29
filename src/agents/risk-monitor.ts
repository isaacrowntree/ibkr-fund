/**
 * Risk Monitor agent
 *
 * Evaluates portfolio risk metrics: drift, concentration, sleeve balance, cash drag.
 * Runs on schedule (default: every 4h) or on demand.
 * Flags warnings/critical alerts to the Managing Partner.
 */
import { connect, disconnect, getAccountSummary, getMarketPrices } from '../connection/gateway.js';
import { analyzePortfolio } from '../allocation/portfolio.js';
import { assessRisk, logRiskReport } from '../risk/monitor.js';
import { loadState, saveState } from '../state/store.js';
import { TARGET_PORTFOLIO, validateTargets } from '../config.js';
import { log, logError } from '../log.js';

const AGENT = 'RiskMonitor';

async function run(): Promise<void> {
  log('Risk assessment starting', AGENT);
  validateTargets();
  await connect();

  try {
    const account = await getAccountSummary();
    const symbols = TARGET_PORTFOLIO.map(t => t.symbol);
    const prices = await getMarketPrices(symbols);
    const snapshot = analyzePortfolio(account, prices);
    const risk = assessRisk(snapshot);

    logRiskReport(risk);

    const state = loadState();
    state.lastRisk = risk;
    state.lastSnapshot = snapshot;
    saveState(state);

    if (risk.status === 'critical') {
      log('CRITICAL: Manual intervention may be required', AGENT);
      // In Paperclip, this would trigger a wakeup to the Managing Partner
    }

  } finally {
    disconnect();
  }
}

const isOnce = process.argv.includes('--once');
run()
  .then(() => { if (isOnce) process.exit(0); })
  .catch((err) => { logError('Fatal', err, AGENT); process.exit(1); });
