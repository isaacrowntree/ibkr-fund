import { describe, it, expect } from 'vitest';
import { correlationDistance, hrpWeights } from './hrp';

describe('correlationDistance', () => {
  it('returns 0 distance for perfect correlation', () => {
    const corr = [[1, 1], [1, 1]];
    const dist = correlationDistance(corr);
    expect(dist[0][1]).toBeCloseTo(0, 6);
  });

  it('returns max distance for perfect negative correlation', () => {
    const corr = [[1, -1], [-1, 1]];
    const dist = correlationDistance(corr);
    expect(dist[0][1]).toBeCloseTo(1, 6);
  });

  it('returns ~0.707 for zero correlation', () => {
    const corr = [[1, 0], [0, 1]];
    const dist = correlationDistance(corr);
    expect(dist[0][1]).toBeCloseTo(Math.sqrt(0.5), 3);
  });
});

describe('hrpWeights', () => {
  it('produces weights that sum to 1', () => {
    const cov = [
      [0.04, 0.01, 0.005],
      [0.01, 0.09, 0.02],
      [0.005, 0.02, 0.16],
    ];
    const { weights } = hrpWeights(cov);
    expect(weights).toHaveLength(3);
    const sum = weights.reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('all weights are positive', () => {
    const cov = [
      [0.04, 0.01, 0.005],
      [0.01, 0.09, 0.02],
      [0.005, 0.02, 0.16],
    ];
    const { weights } = hrpWeights(cov);
    for (const w of weights) {
      expect(w).toBeGreaterThan(0);
    }
  });

  it('lower variance asset gets higher weight', () => {
    const cov = [
      [0.01, 0],  // low vol
      [0, 0.25],  // high vol
    ];
    const { weights } = hrpWeights(cov);
    expect(weights[0]).toBeGreaterThan(weights[1]);
  });

  it('handles single asset', () => {
    const { weights } = hrpWeights([[0.04]]);
    expect(weights).toEqual([1]);
  });
});
