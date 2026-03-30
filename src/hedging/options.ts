/**
 * Options overlay strategies: covered calls, protective puts, collars
 */

export interface OptionLeg {
  symbol: string;
  type: 'call' | 'put';
  action: 'buy' | 'sell';
  strike: number;
  expiry: string;
  qty: number;
  delta: number;
  premium: number;
}

export interface CoveredCallParams {
  symbol: string;
  sharesHeld: number;
  currentPrice: number;
  targetDelta: number;   // e.g. 0.25 (25-delta call)
  minDTE: number;        // e.g. 30
  maxDTE: number;        // e.g. 45
  coveragePct: number;   // e.g. 0.5 = cover 50% of shares
}

export interface ProtectivePutParams {
  symbol: string;
  sharesHeld: number;
  currentPrice: number;
  targetDelta: number;   // e.g. -0.25
  maxCostPct: number;    // max % of portfolio to spend on puts
  minDTE: number;
  maxDTE: number;
}

export interface CollarParams {
  symbol: string;
  sharesHeld: number;
  currentPrice: number;
  putDelta: number;      // e.g. -0.25
  callDelta: number;     // e.g. 0.25
  minDTE: number;
  maxDTE: number;
}

/** Compute number of contracts for covered call (1 contract = 100 shares) */
export function coveredCallContracts(params: CoveredCallParams): number {
  const coveredShares = Math.floor(params.sharesHeld * params.coveragePct);
  return Math.floor(coveredShares / 100);
}

/** Estimate covered call strike from delta target */
export function estimateStrikeFromDelta(
  currentPrice: number,
  targetDelta: number,
  impliedVol: number,
  daysToExpiry: number
): number {
  // Simplified: strike ≈ price × (1 + z × σ × √T)
  // where z corresponds to the delta level
  const t = daysToExpiry / 365;
  const z = targetDelta < 0.5 ? 0.5 + (0.5 - targetDelta) * 2 : 0; // rough approximation
  return currentPrice * (1 + z * impliedVol * Math.sqrt(t));
}

/** Generate covered call order */
export function generateCoveredCall(params: CoveredCallParams, impliedVol: number): OptionLeg | null {
  const contracts = coveredCallContracts(params);
  if (contracts <= 0) return null;

  const dte = Math.round((params.minDTE + params.maxDTE) / 2);
  const strike = estimateStrikeFromDelta(params.currentPrice, params.targetDelta, impliedVol, dte);

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + dte);

  return {
    symbol: params.symbol,
    type: 'call',
    action: 'sell',
    strike: Math.round(strike * 100) / 100,
    expiry: expiry.toISOString().slice(0, 10),
    qty: contracts,
    delta: params.targetDelta,
    premium: 0, // filled at execution
  };
}

/** Generate protective put order */
export function generateProtectivePut(params: ProtectivePutParams, impliedVol: number): OptionLeg | null {
  const contracts = Math.floor(params.sharesHeld / 100);
  if (contracts <= 0) return null;

  const dte = Math.round((params.minDTE + params.maxDTE) / 2);
  const strike = estimateStrikeFromDelta(params.currentPrice, 1 + params.targetDelta, impliedVol, dte);

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + dte);

  return {
    symbol: params.symbol,
    type: 'put',
    action: 'buy',
    strike: Math.round(Math.min(strike, params.currentPrice * 0.97) * 100) / 100,
    expiry: expiry.toISOString().slice(0, 10),
    qty: contracts,
    delta: params.targetDelta,
    premium: 0,
  };
}

/** Generate zero-cost collar (sell call to fund put) */
export function generateCollar(params: CollarParams, impliedVol: number): OptionLeg[] {
  const contracts = Math.floor(params.sharesHeld / 100);
  if (contracts <= 0) return [];

  const dte = Math.round((params.minDTE + params.maxDTE) / 2);
  const callStrike = estimateStrikeFromDelta(params.currentPrice, params.callDelta, impliedVol, dte);
  const putStrike = estimateStrikeFromDelta(params.currentPrice, 1 + params.putDelta, impliedVol, dte);

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + dte);
  const expiryStr = expiry.toISOString().slice(0, 10);

  return [
    {
      symbol: params.symbol, type: 'put', action: 'buy',
      strike: Math.round(Math.min(putStrike, params.currentPrice * 0.95) * 100) / 100,
      expiry: expiryStr, qty: contracts, delta: params.putDelta, premium: 0,
    },
    {
      symbol: params.symbol, type: 'call', action: 'sell',
      strike: Math.round(callStrike * 100) / 100,
      expiry: expiryStr, qty: contracts, delta: params.callDelta, premium: 0,
    },
  ];
}

/** Tail risk hedge: deep OTM puts, budget-constrained */
export function tailRiskPutBudget(
  portfolioValue: number,
  annualBudgetPct: number = 0.01 // 1% of portfolio per year
): number {
  return portfolioValue * annualBudgetPct;
}
