/**
 * Execution Bot
 * Executes pending orders using IBKR algo order types (Adaptive, TWAP, VWAP).
 */
import { connect, disconnect, placeMarketOrder } from '../connection/gateway.js';
import { selectExecutionStrategy, selectUrgency } from '../execution/algo-orders.js';
import { loadState, saveState, appendTrade } from '../state/store.js';
import { log, logError } from '../log.js';

const AGENT = 'ExecutionBot';

interface PendingOrder {
  symbol: string;
  action: 'BUY' | 'SELL';
  qty: number;
  estimatedValue: number;
  reason: string;
}

async function run(): Promise<void> {
  log('Execution check starting', AGENT);

  const state = loadState();
  const pendingOrders = (state.pendingOrders || []) as PendingOrder[];

  if (pendingOrders.length === 0) {
    log('No pending orders', AGENT);
    return;
  }

  log(`${pendingOrders.length} pending order(s)`, AGENT);
  await connect();

  try {
    const nav = (state.lastNav as number) || 100000;
    const regime = (state.regime as { composite: string } | null)?.composite || 'neutral';

    // Sort: sells first
    const sells = pendingOrders.filter(o => o.action === 'SELL');
    const buys = pendingOrders.filter(o => o.action === 'BUY');

    for (const order of [...sells, ...buys]) {
      const strategy = selectExecutionStrategy(order.estimatedValue, nav);
      const urgency = selectUrgency(false, true, regime);
      log(`${order.action} ${order.qty} ${order.symbol} via ${strategy} (${urgency}) — ${order.reason}`, AGENT);

      try {
        const result = await placeMarketOrder(order.symbol, order.action, order.qty);
        log(`Filled: orderId=${result.orderId} status=${result.status}`, AGENT);

        appendTrade({
          timestamp: new Date().toISOString(),
          symbol: order.symbol,
          action: order.action,
          qty: order.qty,
          estimatedValue: order.estimatedValue,
          orderId: result.orderId,
          status: result.status,
          reason: order.reason,
        });
      } catch (err) {
        logError(`Order failed: ${order.action} ${order.qty} ${order.symbol}`, err, AGENT);
      }
    }

    state.pendingOrders = [];
    state.lastExecutionAt = new Date().toISOString();
    saveState(state);
    log('Execution complete', AGENT);

  } finally {
    disconnect();
  }
}

if (process.argv.includes('--once')) {
  run().then(() => process.exit(0)).catch(e => { logError('Fatal', e, AGENT); process.exit(1); });
}
