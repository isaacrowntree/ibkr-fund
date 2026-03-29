import { PortfolioSnapshot } from '../allocation/portfolio.js';
import { config } from '../config.js';
import { log } from '../log.js';

export interface RiskReport {
  timestamp: string;
  status: 'healthy' | 'warning' | 'critical';
  alerts: RiskAlert[];
  metrics: RiskMetrics;
}

export interface RiskAlert {
  level: 'info' | 'warning' | 'critical';
  message: string;
}

export interface RiskMetrics {
  maxDrift: number;
  growthDefensiveRatio: string;
  cashPct: number;
  concentrationRisk: number; // highest single holding %
  sleeveBalance: number; // how close to 70/30 target
}

export function assessRisk(snapshot: PortfolioSnapshot): RiskReport {
  const alerts: RiskAlert[] = [];

  // Check drift
  if (snapshot.maxDrift >= config.rebalance.driftThreshold * 2) {
    alerts.push({ level: 'critical', message: `Max drift ${snapshot.maxDrift.toFixed(1)}% exceeds 2x threshold` });
  } else if (snapshot.needsRebalance) {
    alerts.push({ level: 'warning', message: `Max drift ${snapshot.maxDrift.toFixed(1)}% exceeds threshold` });
  }

  // Check cash drag
  if (snapshot.cashPct > 10) {
    alerts.push({ level: 'warning', message: `${snapshot.cashPct.toFixed(1)}% cash uninvested — deploy via rebalance` });
  }

  // Check sleeve balance (70/30 target)
  const totalAllocated = snapshot.growthPct + snapshot.defensivePct;
  const growthRatio = totalAllocated > 0 ? snapshot.growthPct / totalAllocated : 0;
  const targetGrowthRatio = 0.7;
  const sleeveBalance = Math.abs(growthRatio - targetGrowthRatio) * 100;

  if (sleeveBalance > 10) {
    alerts.push({ level: 'warning', message: `Growth/defensive ratio off target: ${(growthRatio * 100).toFixed(0)}/${((1 - growthRatio) * 100).toFixed(0)} vs 70/30` });
  }

  // Concentration risk
  const maxHolding = Math.max(...snapshot.holdings.map(h => h.currentPct));
  if (maxHolding > 55) {
    alerts.push({ level: 'warning', message: `Concentration risk: single holding at ${maxHolding.toFixed(1)}%` });
  }

  // Empty portfolio
  if (snapshot.netLiquidation <= 0) {
    alerts.push({ level: 'critical', message: 'No account value detected — check IB Gateway connection' });
  }

  const status = alerts.some(a => a.level === 'critical') ? 'critical'
    : alerts.some(a => a.level === 'warning') ? 'warning'
    : 'healthy';

  return {
    timestamp: new Date().toISOString(),
    status,
    alerts,
    metrics: {
      maxDrift: snapshot.maxDrift,
      growthDefensiveRatio: `${snapshot.growthPct.toFixed(0)}/${snapshot.defensivePct.toFixed(0)}`,
      cashPct: snapshot.cashPct,
      concentrationRisk: maxHolding,
      sleeveBalance: Math.round(sleeveBalance * 100) / 100,
    },
  };
}

export function logRiskReport(report: RiskReport): void {
  const agent = 'Risk';
  log(`Risk status: ${report.status.toUpperCase()}`, agent);
  log(`Growth/Defensive: ${report.metrics.growthDefensiveRatio} | Cash: ${report.metrics.cashPct.toFixed(1)}% | Max drift: ${report.metrics.maxDrift.toFixed(1)}%`, agent);
  for (const alert of report.alerts) {
    log(`[${alert.level.toUpperCase()}] ${alert.message}`, agent);
  }
}
