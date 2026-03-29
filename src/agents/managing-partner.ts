/**
 * Managing Partner (CEO agent)
 *
 * Orchestrates the fund. Runs on a schedule (default: every 4h).
 * - Checks portfolio state
 * - Delegates to Risk Monitor and Portfolio Manager
 * - Decides whether to trigger rebalance
 * - Reports fund status
 */
import { connect, disconnect, getAccountSummary, getMarketPrices } from '../connection/gateway.js';
import { analyzePortfolio, generateRebalanceOrders } from '../allocation/portfolio.js';
import { assessRisk, logRiskReport } from '../risk/monitor.js';
import { loadState, saveState } from '../state/store.js';
import { TARGET_PORTFOLIO, validateTargets } from '../config.js';
import { log, logError } from '../log.js';

const AGENT = 'ManagingPartner';

async function run(): Promise<void> {
  log('Fund check starting', AGENT);
  validateTargets();

  await connect();

  try {
    const account = await getAccountSummary();
    log(`NAV: $${account.netLiquidation.toFixed(2)} | Cash: $${account.totalCashValue.toFixed(2)}`, AGENT);

    const symbols = TARGET_PORTFOLIO.map(t => t.symbol);
    const prices = await getMarketPrices(symbols);

    const snapshot = analyzePortfolio(account, prices);

    // Risk assessment
    const risk = assessRisk(snapshot);
    logRiskReport(risk);

    // Portfolio breakdown
    for (const h of snapshot.holdings) {
      log(`  ${h.symbol}: ${h.currentPct.toFixed(1)}% (target ${h.targetPct}%) drift ${h.driftPct > 0 ? '+' : ''}${h.driftPct.toFixed(1)}%`, AGENT);
    }

    // Rebalance decision
    if (snapshot.needsRebalance && risk.status !== 'critical') {
      const orders = generateRebalanceOrders(snapshot);
      if (orders.length > 0) {
        log(`Rebalance needed: ${orders.length} order(s)`, AGENT);
        for (const o of orders) {
          log(`  → ${o.action} ${o.qty} ${o.symbol} (~$${o.estimatedValue}) — ${o.reason}`, AGENT);
        }
        // Save pending orders for Rebalancer agent to execute
        const state = loadState();
        state.pendingOrders = orders;
        state.lastSnapshot = snapshot;
        state.lastRisk = risk;
        saveState(state);
        log('Pending orders saved — Rebalancer agent will execute', AGENT);
      } else {
        log('Drift detected but orders too small to execute', AGENT);
      }
    } else if (risk.status === 'critical') {
      log('CRITICAL risk status — skipping rebalance, manual review required', AGENT);
    } else {
      log(`Portfolio balanced (max drift ${snapshot.maxDrift.toFixed(1)}% < ${5}% threshold)`, AGENT);
    }

    // Save latest state
    const state = loadState();
    state.lastSnapshot = snapshot;
    state.lastRisk = risk;
    state.lastCheckAt = new Date().toISOString();
    saveState(state);

  } finally {
    disconnect();
  }

  log('Fund check complete', AGENT);
}

// Support --once mode for Paperclip process adapter
const isOnce = process.argv.includes('--once');
run()
  .then(() => { if (isOnce) process.exit(0); })
  .catch((err) => { logError('Fatal', err, AGENT); process.exit(1); });
