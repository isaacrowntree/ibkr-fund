import { describe, it, expect } from 'vitest';
import { ewmaVolatility, realizedVolatility, annualizeVol, volTargetLeverage, kellyFraction } from './volatility';

describe('ewmaVolatility', () => {
  it('returns positive value for non-zero returns', () => {
    const returns = [0.01, -0.02, 0.015, -0.005, 0.01, -0.01, 0.02, -0.015];
    const vol = ewmaVolatility(returns);
    expect(vol).toBeGreaterThan(0);
  });

  it('returns 0 for insufficient data', () => {
    expect(ewmaVolatility([0.01])).toBe(0);
    expect(ewmaVolatility([])).toBe(0);
  });

  it('higher lambda gives more weight to older observations', () => {
    const returns = [0.01, 0.01, 0.01, 0.01, 0.05]; // spike at end
    const highLambda = ewmaVolatility(returns, 0.97);
    const lowLambda = ewmaVolatility(returns, 0.80);
    expect(lowLambda).toBeGreaterThan(highLambda); // low lambda reacts faster
  });
});

describe('realizedVolatility', () => {
  it('computes standard deviation of returns', () => {
    const returns = [0.01, -0.01, 0.01, -0.01]; // symmetric, mean=0
    const vol = realizedVolatility(returns);
    expect(vol).toBeCloseTo(0.01155, 3); // sqrt(0.01^2 * 4/3)
  });

  it('returns 0 for constant returns', () => {
    expect(realizedVolatility([0.01, 0.01, 0.01])).toBeCloseTo(0, 10);
  });
});

describe('annualizeVol', () => {
  it('scales daily vol by sqrt(252)', () => {
    const daily = 0.01;
    const annual = annualizeVol(daily);
    expect(annual).toBeCloseTo(0.01 * Math.sqrt(252), 6);
  });
});

describe('volTargetLeverage', () => {
  it('returns 1.0 when vol equals target', () => {
    expect(volTargetLeverage(0.15, 0.15)).toBeCloseTo(1.0, 6);
  });

  it('reduces leverage when vol is high', () => {
    expect(volTargetLeverage(0.30, 0.15)).toBeCloseTo(0.5, 6);
  });

  it('caps leverage at maxLeverage', () => {
    expect(volTargetLeverage(0.05, 0.15, 1.5)).toBe(1.5);
  });

  it('floors leverage at minLeverage', () => {
    expect(volTargetLeverage(100, 0.15, 1.5, 0.1)).toBe(0.1);
  });
});

describe('kellyFraction', () => {
  it('returns positive for winning edge', () => {
    const f = kellyFraction(0.6, 1.5, 1.0, 1.0); // full Kelly
    expect(f).toBeGreaterThan(0);
  });

  it('returns 0 for no edge', () => {
    const f = kellyFraction(0.5, 1.0, 1.0, 1.0);
    expect(f).toBe(0);
  });

  it('quarter Kelly is 1/4 of full Kelly', () => {
    const full = kellyFraction(0.6, 1.5, 1.0, 1.0);
    const quarter = kellyFraction(0.6, 1.5, 1.0, 0.25);
    expect(quarter).toBeCloseTo(full * 0.25, 6);
  });

  it('returns 0 for losing edge', () => {
    const f = kellyFraction(0.3, 1.0, 1.0, 1.0);
    expect(f).toBe(0);
  });
});
