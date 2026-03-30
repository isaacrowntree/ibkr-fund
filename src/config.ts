import 'dotenv/config';

export interface HoldingTarget {
  symbol: string;
  name: string;
  pct: number;
  sleeve: 'growth' | 'defensive';
}

export const config = {
  ib: {
    host: process.env.IB_HOST || '127.0.0.1',
    port: parseInt(process.env.IB_PORT || '4002', 10),
    clientId: parseInt(process.env.IB_CLIENT_ID || String(Math.floor(Math.random() * 900) + 100), 10),
  },
  tradingMode: (process.env.TRADING_MODE || 'paper') as 'paper' | 'live',
  rebalance: {
    driftThreshold: parseFloat(process.env.REBALANCE_DRIFT_THRESHOLD || '5'),
    minTradeUsd: parseFloat(process.env.REBALANCE_MIN_TRADE_USD || '50'),
  },
  port: parseInt(process.env.PORT || '3001', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
};

export const TARGET_PORTFOLIO: HoldingTarget[] = [
  { symbol: 'VTI',  name: 'Vanguard Total US Stock',     pct: parseFloat(process.env.ALLOC_VTI  || '42'), sleeve: 'growth' },
  { symbol: 'VXUS', name: 'Vanguard Total Intl Stock',    pct: parseFloat(process.env.ALLOC_VXUS || '28'), sleeve: 'growth' },
  { symbol: 'BND',  name: 'Vanguard Total US Bond',       pct: parseFloat(process.env.ALLOC_BND  || '18'), sleeve: 'defensive' },
  { symbol: 'BNDX', name: 'Vanguard Total Intl Bond',     pct: parseFloat(process.env.ALLOC_BNDX || '12'), sleeve: 'defensive' },
];

export function validateTargets(): void {
  const sum = TARGET_PORTFOLIO.reduce((s, t) => s + t.pct, 0);
  if (Math.abs(sum - 100) > 0.01) {
    throw new Error(`Target allocations sum to ${sum}%, expected 100%`);
  }
}
