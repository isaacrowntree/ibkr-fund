import { describe, it, expect } from 'vitest';
import { sampleCovMatrix, covToCorr, ledoitWolfShrinkage } from './covariance';

describe('sampleCovMatrix', () => {
  it('computes 2x2 covariance matrix', () => {
    const returns = [
      [0.01, -0.01, 0.02, -0.02, 0.01],
      [0.02, -0.02, 0.01, -0.01, 0.02],
    ];
    const cov = sampleCovMatrix(returns);
    expect(cov).toHaveLength(2);
    expect(cov[0]).toHaveLength(2);
    expect(cov[0][0]).toBeGreaterThan(0); // variance > 0
    expect(cov[1][1]).toBeGreaterThan(0);
    expect(cov[0][1]).toBe(cov[1][0]); // symmetric
  });

  it('returns empty for empty input', () => {
    expect(sampleCovMatrix([])).toEqual([]);
  });

  it('diagonal equals variance', () => {
    const returns = [[1, 2, 3, 4, 5]];
    const cov = sampleCovMatrix(returns);
    // Variance of [1,2,3,4,5] with mean 3: (4+1+0+1+4)/4 = 2.5
    expect(cov[0][0]).toBeCloseTo(2.5, 6);
  });
});

describe('covToCorr', () => {
  it('diagonal is 1.0', () => {
    const cov = [[0.04, 0.01], [0.01, 0.09]];
    const corr = covToCorr(cov);
    expect(corr[0][0]).toBeCloseTo(1.0, 6);
    expect(corr[1][1]).toBeCloseTo(1.0, 6);
  });

  it('off-diagonal between -1 and 1', () => {
    const cov = [[0.04, 0.01], [0.01, 0.09]];
    const corr = covToCorr(cov);
    expect(corr[0][1]).toBeGreaterThanOrEqual(-1);
    expect(corr[0][1]).toBeLessThanOrEqual(1);
    // corr = 0.01 / (0.2 * 0.3) = 0.1667
    expect(corr[0][1]).toBeCloseTo(0.1667, 3);
  });
});

describe('ledoitWolfShrinkage', () => {
  it('returns shrinkage intensity between 0 and 1', () => {
    const returns = [
      [0.01, -0.01, 0.02, -0.02, 0.01, 0.03, -0.01, 0.0],
      [0.02, -0.02, 0.01, -0.01, 0.02, -0.01, 0.01, 0.0],
      [-0.01, 0.01, 0.015, -0.015, 0.005, 0.02, -0.005, 0.01],
    ];
    const { shrunk, shrinkageIntensity } = ledoitWolfShrinkage(returns);
    expect(shrinkageIntensity).toBeGreaterThanOrEqual(0);
    expect(shrinkageIntensity).toBeLessThanOrEqual(1);
    expect(shrunk).toHaveLength(3);
    expect(shrunk[0]).toHaveLength(3);
  });

  it('shrunk matrix is symmetric', () => {
    const returns = [
      [0.01, -0.01, 0.02, -0.02],
      [0.02, -0.02, 0.01, -0.01],
    ];
    const { shrunk } = ledoitWolfShrinkage(returns);
    expect(shrunk[0][1]).toBeCloseTo(shrunk[1][0], 10);
  });
});
