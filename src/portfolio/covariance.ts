/**
 * Covariance matrix estimation with Ledoit-Wolf shrinkage
 */

/** Sample covariance matrix from return series (each row = asset, each col = time) */
export function sampleCovMatrix(returns: number[][]): number[][] {
  const n = returns.length; // number of assets
  const t = returns[0]?.length || 0;
  if (n === 0 || t < 2) return [];

  const means = returns.map(r => r.reduce((s, v) => s + v, 0) / t);
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < t; k++) {
        sum += (returns[i][k] - means[i]) * (returns[j][k] - means[j]);
      }
      cov[i][j] = sum / (t - 1);
      cov[j][i] = cov[i][j];
    }
  }
  return cov;
}

/** Correlation matrix from covariance matrix */
export function covToCorr(cov: number[][]): number[][] {
  const n = cov.length;
  const corr: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const stds = cov.map((_, i) => Math.sqrt(cov[i][i]));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      corr[i][j] = stds[i] > 0 && stds[j] > 0
        ? cov[i][j] / (stds[i] * stds[j])
        : i === j ? 1 : 0;
    }
  }
  return corr;
}

/**
 * Ledoit-Wolf shrinkage estimator
 * Shrinks sample covariance toward scaled identity matrix
 * Returns { shrunk, shrinkageIntensity }
 */
export function ledoitWolfShrinkage(returns: number[][]): {
  shrunk: number[][];
  shrinkageIntensity: number;
} {
  const n = returns.length;
  const t = returns[0]?.length || 0;
  if (n === 0 || t < 2) return { shrunk: [], shrinkageIntensity: 0 };

  const sample = sampleCovMatrix(returns);
  const mu = trace(sample) / n; // average variance
  const target = identityScaled(n, mu);

  // Compute optimal shrinkage intensity (simplified Ledoit-Wolf)
  const means = returns.map(r => r.reduce((s, v) => s + v, 0) / t);
  let piSum = 0;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let pij = 0;
      for (let k = 0; k < t; k++) {
        const xi = (returns[i][k] - means[i]) * (returns[j][k] - means[j]) - sample[i][j];
        pij += xi * xi;
      }
      piSum += pij / t;
    }
  }
  const pi = piSum;

  let gammaSum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      gammaSum += (target[i][j] - sample[i][j]) ** 2;
    }
  }

  const delta = Math.max(0, Math.min(1, (pi / t) / gammaSum));
  const shrunk = matAdd(matScale(target, delta), matScale(sample, 1 - delta));

  return { shrunk, shrinkageIntensity: delta };
}

// Matrix utilities
export function trace(m: number[][]): number {
  return m.reduce((s, row, i) => s + row[i], 0);
}

export function identityScaled(n: number, scale: number): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => i === j ? scale : 0)
  );
}

export function matScale(m: number[][], s: number): number[][] {
  return m.map(row => row.map(v => v * s));
}

export function matAdd(a: number[][], b: number[][]): number[][] {
  return a.map((row, i) => row.map((v, j) => v + b[i][j]));
}
