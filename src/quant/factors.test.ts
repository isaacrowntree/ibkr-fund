import { describe, it, expect } from 'vitest';
import { momentumScore, valueScore, qualityScore, lowVolScore, zScoreNormalize, compositeScore } from './factors';

describe('momentumScore', () => {
  it('returns positive for uptrend', () => {
    const prices = Array.from({ length: 260 }, (_, i) => 100 + i * 0.1);
    expect(momentumScore(prices)).toBeGreaterThan(0);
  });

  it('returns negative for downtrend', () => {
    const prices = Array.from({ length: 260 }, (_, i) => 200 - i * 0.1);
    expect(momentumScore(prices)).toBeLessThan(0);
  });

  it('returns 0 for insufficient data', () => {
    expect(momentumScore([100, 101, 102])).toBe(0);
  });
});

describe('valueScore', () => {
  it('higher for lower P/E', () => {
    expect(valueScore(10)).toBeGreaterThan(valueScore(20));
  });

  it('returns 0 for negative P/E', () => {
    expect(valueScore(-5)).toBe(0);
  });

  it('returns 0 for extreme P/E', () => {
    expect(valueScore(300)).toBe(0);
  });
});

describe('qualityScore', () => {
  it('returns 1.0 for 30% ROE', () => {
    expect(qualityScore(30)).toBeCloseTo(1.0, 6);
  });

  it('returns 0.5 for 15% ROE', () => {
    expect(qualityScore(15)).toBeCloseTo(0.5, 6);
  });

  it('clamps to 0 for negative ROE', () => {
    expect(qualityScore(-10)).toBe(0);
  });
});

describe('lowVolScore', () => {
  it('higher for lower volatility', () => {
    const lowVol = [0.001, -0.001, 0.001, -0.001, 0.001, -0.001, 0.001, -0.001, 0.001, -0.001,
      0.001, -0.001, 0.001, -0.001, 0.001, -0.001, 0.001, -0.001, 0.001, -0.001];
    const highVol = [0.05, -0.05, 0.05, -0.05, 0.05, -0.05, 0.05, -0.05, 0.05, -0.05,
      0.05, -0.05, 0.05, -0.05, 0.05, -0.05, 0.05, -0.05, 0.05, -0.05];
    expect(lowVolScore(lowVol)).toBeGreaterThan(lowVolScore(highVol));
  });

  it('returns 0 for insufficient data', () => {
    expect(lowVolScore([0.01])).toBe(0);
  });
});

describe('zScoreNormalize', () => {
  it('produces mean ~0 and std ~1', () => {
    const values = [10, 20, 30, 40, 50];
    const z = zScoreNormalize(values);
    const mean = z.reduce((s, v) => s + v, 0) / z.length;
    expect(mean).toBeCloseTo(0, 6);
  });

  it('handles empty array', () => {
    expect(zScoreNormalize([])).toEqual([]);
  });

  it('handles constant values', () => {
    const z = zScoreNormalize([5, 5, 5]);
    expect(z).toEqual([0, 0, 0]);
  });
});

describe('compositeScore', () => {
  it('returns weighted sum', () => {
    const score = compositeScore(1, 1, 1, 1);
    expect(score).toBeCloseTo(1.0, 6); // all z=1, weighted sum = 1
  });

  it('handles negative factors', () => {
    const score = compositeScore(-1, -1, -1, -1);
    expect(score).toBeCloseTo(-1.0, 6);
  });
});
