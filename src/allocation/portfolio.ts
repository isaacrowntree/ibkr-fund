import { TARGET_PORTFOLIO, HoldingTarget, config } from '../config.js';
import { AccountSummary, Position } from '../connection/gateway.js';

export interface HoldingStatus {
  symbol: string;
  name: string;
  sleeve: 'growth' | 'defensive';
  targetPct: number;
  currentPct: number;
  driftPct: number;
  targetValue: number;
  currentValue: number;
  deltaValue: number;
  qty: number;
  marketPrice: number;
}

export interface PortfolioSnapshot {
  timestamp: string;
  netLiquidation: number;
  cashValue: number;
  holdings: HoldingStatus[];
  growthPct: number;
  defensivePct: number;
  cashPct: number;
  maxDrift: number;
  needsRebalance: boolean;
}

export interface RebalanceOrder {
  symbol: string;
  action: 'BUY' | 'SELL';
  qty: number;
  estimatedValue: number;
  reason: string;
}

export function analyzePortfolio(
  account: AccountSummary,
  prices: Map<string, number>
): PortfolioSnapshot {
  const nav = account.netLiquidation;
  const holdings: HoldingStatus[] = [];

  for (const target of TARGET_PORTFOLIO) {
    const pos = account.positions.find(p => p.symbol === target.symbol);
    const price = prices.get(target.symbol) || pos?.marketPrice || 0;
    const qty = pos?.qty || 0;
    const currentValue = qty * price;
    const currentPct = nav > 0 ? (currentValue / nav) * 100 : 0;
    const targetValue = (target.pct / 100) * nav;
    const driftPct = currentPct - target.pct;

    holdings.push({
      symbol: target.symbol,
      name: target.name,
      sleeve: target.sleeve,
      targetPct: target.pct,
      currentPct: Math.round(currentPct * 100) / 100,
      driftPct: Math.round(driftPct * 100) / 100,
      targetValue: Math.round(targetValue * 100) / 100,
      currentValue: Math.round(currentValue * 100) / 100,
      deltaValue: Math.round((targetValue - currentValue) * 100) / 100,
      qty,
      marketPrice: price,
    });
  }

  const growthPct = holdings
    .filter(h => h.sleeve === 'growth')
    .reduce((s, h) => s + h.currentPct, 0);
  const defensivePct = holdings
    .filter(h => h.sleeve === 'defensive')
    .reduce((s, h) => s + h.currentPct, 0);
  const allocatedValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const cashPct = nav > 0 ? ((nav - allocatedValue) / nav) * 100 : 100;
  const maxDrift = Math.max(...holdings.map(h => Math.abs(h.driftPct)));

  return {
    timestamp: new Date().toISOString(),
    netLiquidation: nav,
    cashValue: account.totalCashValue,
    holdings,
    growthPct: Math.round(growthPct * 100) / 100,
    defensivePct: Math.round(defensivePct * 100) / 100,
    cashPct: Math.round(cashPct * 100) / 100,
    maxDrift: Math.round(maxDrift * 100) / 100,
    needsRebalance: maxDrift >= config.rebalance.driftThreshold,
  };
}

export function generateRebalanceOrders(snapshot: PortfolioSnapshot): RebalanceOrder[] {
  const orders: RebalanceOrder[] = [];
  const { driftThreshold, minTradeUsd } = config.rebalance;

  // Sort: sells first (to free cash), then buys
  const sorted = [...snapshot.holdings].sort((a, b) => a.deltaValue - b.deltaValue);

  for (const h of sorted) {
    if (Math.abs(h.driftPct) < driftThreshold) continue;
    if (h.marketPrice <= 0) continue;

    const delta = h.deltaValue;
    if (Math.abs(delta) < minTradeUsd) continue;

    const qty = Math.floor(Math.abs(delta) / h.marketPrice);
    if (qty <= 0) continue;

    const action = delta > 0 ? 'BUY' : 'SELL';
    orders.push({
      symbol: h.symbol,
      action,
      qty,
      estimatedValue: Math.round(qty * h.marketPrice * 100) / 100,
      reason: `${h.symbol} drift ${h.driftPct > 0 ? '+' : ''}${h.driftPct.toFixed(1)}% (target ${h.targetPct}%, current ${h.currentPct.toFixed(1)}%)`,
    });
  }

  return orders;
}
