/**
 * Market regime detection
 * - Trend regime (MA-based)
 * - Volatility regime (VIX-like levels)
 * - Correlation regime
 * - Composite regime indicator
 */

export type RegimeState = 'risk_on' | 'neutral' | 'risk_off' | 'crisis';

export interface RegimeSignals {
  trend: 1 | 0 | -1;
  volatility: 1 | 0 | -1;
  correlation: 1 | 0 | -1;
  composite: RegimeState;
  score: number; // -3 to +3
}

/** Trend regime: price relative to 200-day MA */
export function trendSignal(prices: number[], shortWindow: number = 50, longWindow: number = 200): 1 | 0 | -1 {
  if (prices.length < longWindow) return 0;
  const shortMA = sma(prices.slice(-shortWindow));
  const longMA = sma(prices.slice(-longWindow));
  const current = prices[prices.length - 1];

  if (current > longMA && shortMA > longMA) return 1;  // bullish
  if (current < longMA && shortMA < longMA) return -1;  // bearish
  return 0; // mixed
}

/** Volatility regime based on annualized vol levels */
export function volRegimeSignal(annualizedVol: number): 1 | 0 | -1 {
  if (annualizedVol < 15) return 1;   // low vol = risk on
  if (annualizedVol > 30) return -1;  // high vol = risk off
  return 0; // normal
}

/** Correlation regime: average pairwise correlation */
export function correlationSignal(corrMatrix: number[][]): 1 | 0 | -1 {
  const n = corrMatrix.length;
  if (n < 2) return 0;

  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sum += corrMatrix[i][j];
      count++;
    }
  }
  const avgCorr = count > 0 ? sum / count : 0;

  if (avgCorr < 0.3) return 1;  // low correlation = good diversification
  if (avgCorr > 0.6) return -1; // high correlation = risk off
  return 0;
}

/** Composite regime from all signals */
export function compositeRegime(signals: {
  trend: 1 | 0 | -1;
  volatility: 1 | 0 | -1;
  correlation: 1 | 0 | -1;
}): RegimeSignals {
  const score = signals.trend + signals.volatility + signals.correlation;

  let composite: RegimeState;
  if (score >= 2) composite = 'risk_on';
  else if (score >= 0) composite = 'neutral';
  else if (score >= -2) composite = 'risk_off';
  else composite = 'crisis';

  return { ...signals, composite, score };
}

/** Regime-based exposure multiplier */
export function regimeExposure(regime: RegimeState): number {
  switch (regime) {
    case 'risk_on': return 1.0;
    case 'neutral': return 0.85;
    case 'risk_off': return 0.6;
    case 'crisis': return 0.3;
  }
}

function sma(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}
