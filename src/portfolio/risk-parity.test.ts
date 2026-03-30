import { describe, it, expect } from 'vitest';
import { riskContributions, riskParityWeights, minVarianceWeights } from './risk-parity';

describe('riskContributions', () => {
  it('sums to portfolio std dev', () => {
    const cov = [[0.04, 0.01], [0.01, 0.09]];
    const weights = [0.6, 0.4];
    const rc = riskContributions(weights, cov);
    const totalRC = rc.reduce((s, v) => s + v, 0);
    // Should sum to portfolio std dev
    const portVar = 0.6*0.6*0.04 + 2*0.6*0.4*0.01 + 0.4*0.4*0.09;
    expect(totalRC).toBeCloseTo(Math.sqrt(portVar), 4);
  });
});

describe('riskParityWeights', () => {
  it('produces weights that sum to 1', () => {
    const cov = [[0.04, 0.01], [0.01, 0.09]];
    const weights = riskParityWeights(cov);
    expect(weights).toHaveLength(2);
    const sum = weights.reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1, 4);
  });

  it('all weights positive', () => {
    const cov = [[0.04, 0.005], [0.005, 0.09]];
    const weights = riskParityWeights(cov);
    for (const w of weights) {
      expect(w).toBeGreaterThan(0);
    }
  });

  it('lower vol asset gets higher weight', () => {
    const cov = [[0.01, 0], [0, 0.25]];
    const weights = riskParityWeights(cov);
    expect(weights[0]).toBeGreaterThan(weights[1]);
  });

  it('equal vol assets get equal weights', () => {
    const cov = [[0.04, 0], [0, 0.04]];
    const weights = riskParityWeights(cov);
    expect(weights[0]).toBeCloseTo(weights[1], 2);
  });
});

describe('minVarianceWeights', () => {
  it('produces weights that sum to 1', () => {
    const cov = [[0.04, 0.01], [0.01, 0.09]];
    const weights = minVarianceWeights(cov);
    const sum = weights.reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('overweights low-variance asset', () => {
    const cov = [[0.01, 0], [0, 0.25]];
    const weights = minVarianceWeights(cov);
    expect(weights[0]).toBeGreaterThan(weights[1]);
  });
});
