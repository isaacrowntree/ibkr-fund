import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const STATE_FILE = resolve(process.env.STATE_DIR || '.', 'bot-state.json');
const TRADE_HISTORY_FILE = resolve(process.env.STATE_DIR || '.', 'trade-history.json');

export interface FundState {
  lastSnapshot?: unknown;
  lastRisk?: unknown;
  lastPrices?: unknown;
  pendingOrders?: unknown[];
  lastCheckAt?: string;
  lastRebalanceAt?: string;
  lastResearchAt?: string;
  [key: string]: unknown;
}

export interface TradeRecord {
  timestamp: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  qty: number;
  estimatedValue: number;
  orderId: number;
  status: string;
  reason: string;
}

export function loadState(): FundState {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function saveState(state: FundState): void {
  const dir = dirname(STATE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  writeFileSync(STATE_FILE, readFileSync(tmp, 'utf8'), 'utf8');
  try { require('fs').unlinkSync(tmp); } catch {}
}

export function appendTrade(trade: TradeRecord): void {
  const dir = dirname(TRADE_HISTORY_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let history: TradeRecord[] = [];
  if (existsSync(TRADE_HISTORY_FILE)) {
    try { history = JSON.parse(readFileSync(TRADE_HISTORY_FILE, 'utf8')); } catch {}
  }
  history.push(trade);
  writeFileSync(TRADE_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

export function loadTradeHistory(): TradeRecord[] {
  if (!existsSync(TRADE_HISTORY_FILE)) return [];
  try {
    return JSON.parse(readFileSync(TRADE_HISTORY_FILE, 'utf8'));
  } catch {
    return [];
  }
}
