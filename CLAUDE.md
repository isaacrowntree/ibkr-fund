# IBKR Allocation Fund

Multi-agent portfolio allocation fund for Interactive Brokers, managed by Paperclip.

## Architecture

This project implements a **70/30 growth/defensive ETF portfolio** with automated threshold-based rebalancing via IBKR.

### Agents (Paperclip multi-agent setup)

| Agent | Role | Schedule | Entry Point |
|-------|------|----------|-------------|
| **Managing Partner** | CEO — orchestrates fund, delegates work | Every 4h | `dist/agents/managing-partner.js --once` |
| **Portfolio Manager** | Analyzes holdings, computes drift | Daily | `dist/agents/portfolio-manager.js --once` |
| **Risk Monitor** | Evaluates risk metrics, flags alerts | Every 4h | `dist/agents/risk-monitor.js --once` |
| **Rebalancer** | Executes pending trade orders | On demand | `dist/agents/rebalancer.js --once` |
| **Research Scout** | Monitors ETF prices and market moves | Daily | `dist/agents/research-scout.js --once` |

### Agent Hierarchy (Paperclip reportsTo)

```
Managing Partner (CEO)
├── Portfolio Manager
├── Risk Monitor
├── Rebalancer (Exec Bot)
└── Research Scout
```

### Target Portfolio

| Symbol | Allocation | Sleeve | What |
|--------|-----------|--------|------|
| VTI | 42% | Growth | US Total Stock Market |
| VXUS | 28% | Growth | International Stocks |
| BND | 18% | Defensive | US Total Bond Market |
| BNDX | 12% | Defensive | International Bonds |

### Rebalancing Rules

- Check monthly, act only when any holding drifts >5 percentage points
- Sells execute before buys (to free cash)
- Minimum trade size: $50
- Market orders via IBKR SMART routing

## Project Structure

```
src/
  config.ts          — Portfolio targets, IB connection config
  log.ts             — Logging utilities
  index.ts           — Daemon entry point with status server
  connection/
    gateway.ts       — IB Gateway connection, orders, market data
  allocation/
    portfolio.ts     — Portfolio analysis, drift detection, order generation
  risk/
    monitor.ts       — Risk assessment (drift, concentration, sleeve balance)
  agents/
    managing-partner.ts  — CEO agent
    portfolio-manager.ts — Analysis agent
    risk-monitor.ts      — Risk agent
    rebalancer.ts        — Trade execution agent
    research-scout.ts    — Market monitoring agent
  state/
    store.ts         — JSON state persistence, trade history
  status/
    server.ts        — HTTP status endpoint
```

## Running

```bash
# Install
pnpm install

# Development (single check)
pnpm dev -- --once

# Build
pnpm build

# Run individual agents (Paperclip mode)
node dist/agents/managing-partner.js --once
node dist/agents/risk-monitor.js --once

# Daemon mode (standalone)
node dist/index.js
```

## Environment

See `.env.example` for all configuration options. Key vars:
- `IB_PORT=4002` (paper) or `IB_PORT=4001` (live)
- `TRADING_MODE=paper` or `live`
- `ALLOC_*` — target allocation percentages
- `REBALANCE_DRIFT_THRESHOLD=5` — drift % to trigger rebalance

## Connection

Requires IB Gateway running (TWS API on localhost). For Docker deployment,
the Dockerfile uses `gnzsnz/ib-gateway-docker` as base image which handles
IB Gateway + Xvfb + IBC auto-login.
