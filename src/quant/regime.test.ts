import { describe, it, expect } from 'vitest';
import { trendSignal, volRegimeSignal, correlationSignal, compositeRegime, regimeExposure } from './regime';

describe('trendSignal', () => {
  it('returns 1 for strong uptrend', () => {
    const prices = Array.from({ length: 250 }, (_, i) => 100 + i);
    expect(trendSignal(prices)).toBe(1);
  });

  it('returns -1 for strong downtrend', () => {
    const prices = Array.from({ length: 250 }, (_, i) => 500 - i);
    expect(trendSignal(prices)).toBe(-1);
  });

  it('returns 0 for insufficient data', () => {
    expect(trendSignal([100, 101])).toBe(0);
  });
});

describe('volRegimeSignal', () => {
  it('returns 1 for low vol', () => {
    expect(volRegimeSignal(10)).toBe(1);
  });

  it('returns 0 for normal vol', () => {
    expect(volRegimeSignal(20)).toBe(0);
  });

  it('returns -1 for high vol', () => {
    expect(volRegimeSignal(35)).toBe(-1);
  });
});

describe('correlationSignal', () => {
  it('returns 1 for low correlation', () => {
    const corr = [[1, 0.1], [0.1, 1]];
    expect(correlationSignal(corr)).toBe(1);
  });

  it('returns -1 for high correlation', () => {
    const corr = [[1, 0.8], [0.8, 1]];
    expect(correlationSignal(corr)).toBe(-1);
  });

  it('returns 0 for moderate correlation', () => {
    const corr = [[1, 0.45], [0.45, 1]];
    expect(correlationSignal(corr)).toBe(0);
  });
});

describe('compositeRegime', () => {
  it('risk_on when all positive', () => {
    const result = compositeRegime({ trend: 1, volatility: 1, correlation: 1 });
    expect(result.composite).toBe('risk_on');
    expect(result.score).toBe(3);
  });

  it('crisis when all negative', () => {
    const result = compositeRegime({ trend: -1, volatility: -1, correlation: -1 });
    expect(result.composite).toBe('crisis');
    expect(result.score).toBe(-3);
  });

  it('neutral for mixed signals', () => {
    const result = compositeRegime({ trend: 1, volatility: 0, correlation: -1 });
    expect(result.composite).toBe('neutral');
  });
});

describe('regimeExposure', () => {
  it('returns correct multipliers', () => {
    expect(regimeExposure('risk_on')).toBe(1.0);
    expect(regimeExposure('neutral')).toBe(0.85);
    expect(regimeExposure('risk_off')).toBe(0.6);
    expect(regimeExposure('crisis')).toBe(0.3);
  });
});
