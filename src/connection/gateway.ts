import { IBApi, EventName, Contract, Order, OrderAction, OrderType, SecType, ErrorCode, TickType, OrderStatus } from '@stoqey/ib';
import { config } from '../config.js';
import { log, logError } from '../log.js';

// Helper to bypass strict overload checking on IBApi.on
const on = (api: IBApi, event: EventName, fn: (...args: any[]) => void) =>
  (api as any).on(event, fn);

// Helper to remove listeners added via the `on` helper
const off = (api: IBApi, event: EventName, fn: (...args: any[]) => void) =>
  (api as any).removeListener(event, fn);

export interface Position {
  symbol: string;
  qty: number;
  avgCost: number;
  marketValue: number;
  marketPrice: number;
}

export interface AccountSummary {
  netLiquidation: number;
  totalCashValue: number;
  positions: Position[];
}

export interface TradeResult {
  orderId: number;
  symbol: string;
  action: 'BUY' | 'SELL';
  qty: number;
  status: string;
}

let ibApi: IBApi | null = null;
let nextOrderId = 0;

/** Monotonic request ID counter to avoid collisions (Fix #9) */
let nextReqId = 10000;
function allocateReqId(): number { return nextReqId++; }

export function getApi(): IBApi {
  if (!ibApi) throw new Error('IB Gateway not connected');
  return ibApi;
}

export function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    ibApi = new IBApi({ host: config.ib.host, port: config.ib.port, clientId: config.ib.clientId });

    const timeout = setTimeout(() => {
      reject(new Error(`Connection to IB Gateway timed out (${config.ib.host}:${config.ib.port})`));
    }, 30_000);

    (ibApi as any).once(EventName.nextValidId, (id: number) => {
      clearTimeout(timeout);
      nextOrderId = id;
      log(`Connected to IB Gateway (nextOrderId=${id})`);
      resolve();
    });

    on(ibApi, EventName.error, (err: Error, code: ErrorCode, reqId: number) => {
      const infoish = [2104, 2106, 2158, 10167].includes(code);
      if (!infoish) {
        logError(`IB error [${code}] reqId=${reqId}`, err);
      }
    });

    ibApi.connect();
  });
}

/** Request delayed market data (free, no subscription needed) */
export function requestDelayedData(): void {
  const api = getApi();
  api.reqMarketDataType(3); // 3 = delayed, 4 = delayed-frozen
  log('Switched to delayed market data');
}

export function disconnect(): void {
  if (ibApi) {
    ibApi.disconnect();
    ibApi = null;
    log('Disconnected from IB Gateway');
  }
}

export function getAccountSummary(): Promise<AccountSummary> {
  const api = getApi();
  return new Promise((resolve, reject) => {
    const reqId = allocateReqId();
    const summary: Partial<AccountSummary> = { positions: [] };
    const positions: Position[] = [];

    const cleanup = () => {
      clearTimeout(timer);
      off(api, EventName.accountSummary, summaryHandler);
      off(api, EventName.accountSummaryEnd, summaryEndHandler);
      off(api, EventName.position, positionHandler);
      off(api, EventName.positionEnd, positionEndHandler);
    };

    const summaryHandler = (_rid: number, _account: string, tag: string, value: string) => {
      if (tag === 'NetLiquidation') summary.netLiquidation = parseFloat(value);
      if (tag === 'TotalCashValue') summary.totalCashValue = parseFloat(value);
    };

    const summaryEndHandler = () => {
      api.cancelAccountSummary(reqId);
      // Now get positions
      api.reqPositions();
    };

    const positionHandler = (_account: string, contract: Contract, pos: number, avgCost: number) => {
      if (pos !== 0 && contract.symbol) {
        positions.push({
          symbol: contract.symbol,
          qty: pos,
          avgCost,
          marketValue: 0, // filled by market data
          marketPrice: 0,
        });
      }
    };

    const positionEndHandler = () => {
      api.cancelPositions();
      summary.positions = positions;
      // Ensure required fields have defaults (Fix #3)
      if (summary.netLiquidation == null) summary.netLiquidation = 0;
      if (summary.totalCashValue == null) summary.totalCashValue = 0;
      cleanup();
      resolve(summary as AccountSummary);
    };

    // Request account summary
    api.reqAccountSummary(reqId, 'All', 'NetLiquidation,TotalCashValue');

    on(api, EventName.accountSummary, summaryHandler);
    on(api, EventName.accountSummaryEnd, summaryEndHandler);
    on(api, EventName.position, positionHandler);
    on(api, EventName.positionEnd, positionEndHandler);

    const timer = setTimeout(() => { cleanup(); reject(new Error('Account summary timed out')); }, 30_000);
  });
}

export function getMarketPrice(symbol: string): Promise<number> {
  const api = getApi();
  return new Promise((resolve, reject) => {
    const reqId = allocateReqId();
    const contract: Contract = { symbol, secType: SecType.STK, exchange: 'SMART', currency: 'USD' };

    const tickHandler = (tickReqId: number, _tickType: number, price: number) => {
      if (tickReqId === reqId && price > 0) {
        cleanup();
        resolve(price);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      api.cancelMktData(reqId);
      off(api, EventName.tickPrice, tickHandler);
    };

    api.reqMktData(reqId, contract, '', true, false);

    const timer = setTimeout(() => { cleanup(); reject(new Error(`Market data timeout for ${symbol}`)); }, 15_000);

    on(api, EventName.tickPrice, tickHandler);
  });
}

export async function getMarketPrices(symbols: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  for (const sym of symbols) {
    try {
      prices.set(sym, await getMarketPrice(sym));
    } catch (err) {
      logError(`Failed to get price for ${sym}`, err);
    }
  }
  return prices;
}

function allocateOrderId(): number {
  return nextOrderId++;
}

export function placeMarketOrder(symbol: string, action: 'BUY' | 'SELL', qty: number): Promise<TradeResult> {
  const api = getApi();
  return new Promise((resolve, reject) => {
    const orderId = allocateOrderId();
    const contract: Contract = { symbol, secType: SecType.STK, exchange: 'SMART', currency: 'USD' };
    const order: Order = {
      action: action === 'BUY' ? OrderAction.BUY : OrderAction.SELL,
      orderType: OrderType.MKT,
      totalQuantity: qty,
      transmit: true,
    };

    const statusHandler = (oid: number, status: string) => {
      if (oid === orderId && (status === 'Filled' || status === 'Submitted' || status === 'PreSubmitted')) {
        cleanup();
        resolve({ orderId, symbol, action, qty, status });
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      off(api, EventName.orderStatus, statusHandler);
    };

    on(api, EventName.orderStatus, statusHandler);

    api.placeOrder(orderId, contract, order);
    log(`Placed ${action} ${qty} ${symbol} (orderId=${orderId})`);

    const timer = setTimeout(() => { cleanup(); reject(new Error(`Order timeout for ${action} ${qty} ${symbol}`)); }, 60_000);
  });
}

export function placeLimitOrder(symbol: string, action: 'BUY' | 'SELL', qty: number, price: number): Promise<TradeResult> {
  const api = getApi();
  return new Promise((resolve, reject) => {
    const orderId = allocateOrderId();
    const contract: Contract = { symbol, secType: SecType.STK, exchange: 'SMART', currency: 'USD' };
    const order: Order = {
      action: action === 'BUY' ? OrderAction.BUY : OrderAction.SELL,
      orderType: OrderType.LMT,
      totalQuantity: qty,
      lmtPrice: price,
      transmit: true,
    };

    const statusHandler = (oid: number, status: string) => {
      if (oid === orderId && (status === 'Filled' || status === 'Submitted' || status === 'PreSubmitted')) {
        cleanup();
        resolve({ orderId, symbol, action, qty, status });
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      off(api, EventName.orderStatus, statusHandler);
    };

    on(api, EventName.orderStatus, statusHandler);

    api.placeOrder(orderId, contract, order);
    log(`Placed LIMIT ${action} ${qty} ${symbol} @ $${price.toFixed(2)} (orderId=${orderId})`);

    const timer = setTimeout(() => { cleanup(); reject(new Error(`Order timeout for ${action} ${qty} ${symbol}`)); }, 120_000);
  });
}
