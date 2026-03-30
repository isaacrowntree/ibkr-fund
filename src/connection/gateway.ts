import { IBApi, EventName, Contract, Order, OrderAction, OrderType, SecType, ErrorCode, TickType, OrderStatus } from '@stoqey/ib';
import { config } from '../config.js';
import { log, logError } from '../log.js';

// Helper to bypass strict overload checking on IBApi.on
const on = (api: IBApi, event: EventName, fn: (...args: any[]) => void) =>
  (api as any).on(event, fn);

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
    const reqId = 9001;
    const summary: Partial<AccountSummary> = { positions: [] };
    const positions: Position[] = [];

    // Request account summary
    api.reqAccountSummary(reqId, 'All', 'NetLiquidation,TotalCashValue');

    on(api, EventName.accountSummary, (_rid: number, _account: string, tag: string, value: string) => {
      if (tag === 'NetLiquidation') summary.netLiquidation = parseFloat(value);
      if (tag === 'TotalCashValue') summary.totalCashValue = parseFloat(value);
    });

    on(api, EventName.accountSummaryEnd, () => {
      api.cancelAccountSummary(reqId);
      // Now get positions
      api.reqPositions();
    });

    on(api, EventName.position, (_account: string, contract: Contract, pos: number, avgCost: number) => {
      if (pos !== 0 && contract.symbol) {
        positions.push({
          symbol: contract.symbol,
          qty: pos,
          avgCost,
          marketValue: 0, // filled by market data
          marketPrice: 0,
        });
      }
    });

    on(api, EventName.positionEnd, () => {
      api.cancelPositions();
      summary.positions = positions;
      resolve(summary as AccountSummary);
    });

    setTimeout(() => reject(new Error('Account summary timed out')), 30_000);
  });
}

export function getMarketPrice(symbol: string): Promise<number> {
  const api = getApi();
  return new Promise((resolve, reject) => {
    const reqId = 10_000 + Math.floor(Math.random() * 10_000);
    const contract: Contract = { symbol, secType: SecType.STK, exchange: 'SMART', currency: 'USD' };

    api.reqMktData(reqId, contract, '', true, false);

    const timeout = setTimeout(() => {
      api.cancelMktData(reqId);
      reject(new Error(`Market data timeout for ${symbol}`));
    }, 15_000);

    on(api, EventName.tickPrice, (tickReqId: number, _tickType: number, price: number) => {
      if (tickReqId === reqId && price > 0) {
        clearTimeout(timeout);
        api.cancelMktData(reqId);
        resolve(price);
      }
    });
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

    on(api, EventName.orderStatus, (oid: number, status: string) => {
      if (oid === orderId && (status === 'Filled' || status === 'Submitted' || status === 'PreSubmitted')) {
        resolve({ orderId, symbol, action, qty, status });
      }
    });

    api.placeOrder(orderId, contract, order);
    log(`Placed ${action} ${qty} ${symbol} (orderId=${orderId})`);

    setTimeout(() => reject(new Error(`Order timeout for ${action} ${qty} ${symbol}`)), 60_000);
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

    on(api, EventName.orderStatus, (oid: number, status: string) => {
      if (oid === orderId && (status === 'Filled' || status === 'Submitted' || status === 'PreSubmitted')) {
        resolve({ orderId, symbol, action, qty, status });
      }
    });

    api.placeOrder(orderId, contract, order);
    log(`Placed LIMIT ${action} ${qty} ${symbol} @ $${price.toFixed(2)} (orderId=${orderId})`);

    setTimeout(() => reject(new Error(`Order timeout for ${action} ${qty} ${symbol}`)), 120_000);
  });
}
