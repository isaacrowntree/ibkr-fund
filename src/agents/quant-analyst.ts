/**
 * Quant Analyst
 * Generates factor signals, detects market regime, feeds data to the strategist.
 */
import { connect, disconnect, getMarketPrices , requestDelayedData } from '../connection/gateway.js';
import { TARGET_PORTFOLIO } from '../config.js';
import { trendSignal, volRegimeSignal, compositeRegime } from '../quant/regime.js';
import { realizedVolatility, annualizeVol } from '../risk/volatility.js';
import { olsRegression } from '../quant/regression.js';
import { loadState, saveState } from '../state/store.js';
import { log, logError } from '../log.js';

const AGENT = 'QuantAnalyst';

async function run(): Promise<void> {
  log('Quant analysis starting', AGENT);
  await connect();
  requestDelayedData();

  try {
    const symbols = TARGET_PORTFOLIO.map(t => t.symbol);
    const prices = await getMarketPrices(symbols);

    const state = loadState();
    const priceHistory = (state.priceHistory || {}) as Record<string, number[]>;

    // Update price history
    for (const [sym, price] of prices) {
      if (!priceHistory[sym]) priceHistory[sym] = [];
      priceHistory[sym].push(price);
      if (priceHistory[sym].length > 500) priceHistory[sym] = priceHistory[sym].slice(-500);
    }

    // Compute regime signals for first symbol as market proxy
    const proxySymbol = symbols[0];
    const proxyPrices = priceHistory[proxySymbol] || [];

    let regime;
    if (proxyPrices.length >= 200) {
      const trend = trendSignal(proxyPrices);
      const returns = proxyPrices.slice(1).map((p, i) => (p - proxyPrices[i]) / proxyPrices[i]);
      const vol = annualizeVol(realizedVolatility(returns.slice(-60)));
      const volSignal = volRegimeSignal(vol * 100);

      regime = compositeRegime({ trend, volatility: volSignal, correlation: 0 });
      log(`Regime: ${regime.composite} (score: ${regime.score})`, AGENT);
      log(`  Trend: ${trend}, Vol: ${volSignal} (annualized: ${(vol * 100).toFixed(1)}%)`, AGENT);
    } else {
      log(`Insufficient price history (${proxyPrices.length}/200 days) — regime unknown`, AGENT);
    }

    // Factor regression: build returns from price history and run OLS
    const MIN_REGRESSION_OBS = 30;
    const allSymbolReturns: Record<string, number[]> = {};
    for (const sym of symbols) {
      const ph = priceHistory[sym] || [];
      if (ph.length >= MIN_REGRESSION_OBS + 1) {
        allSymbolReturns[sym] = ph.slice(1).map((p, i) => (p - ph[i]) / ph[i]);
      }
    }

    // Use first symbol as dependent (portfolio proxy), rest as factors
    if (symbols.length >= 2 && allSymbolReturns[symbols[0]]) {
      const dependentReturns = allSymbolReturns[symbols[0]];
      const factorSymbols = symbols.slice(1).filter(s => allSymbolReturns[s]);

      if (factorSymbols.length > 0) {
        // Align lengths to shortest series
        const minLen = Math.min(dependentReturns.length, ...factorSymbols.map(s => allSymbolReturns[s].length));

        if (minLen > factorSymbols.length + 1) {
          const y = dependentReturns.slice(-minLen);
          const X = Array.from({ length: minLen }, (_, i) =>
            factorSymbols.map(s => allSymbolReturns[s].slice(-minLen)[i])
          );

          try {
            const reg = olsRegression(y, X, factorSymbols);
            log(`Factor regression (${symbols[0]} ~ ${factorSymbols.join(' + ')}):`, AGENT);
            log(`  Alpha: ${(reg.alpha * 10000).toFixed(2)} bps/day | R²: ${(reg.rSquared * 100).toFixed(1)}%`, AGENT);
            factorSymbols.forEach((s, i) => {
              log(`  Beta(${s}): ${reg.betas[i].toFixed(3)} (t=${reg.tStatistics[i + 1].toFixed(2)})`, AGENT);
            });

            state.factorRegression = {
              dependent: symbols[0],
              factors: factorSymbols,
              alpha: reg.alpha,
              betas: reg.betas,
              rSquared: reg.rSquared,
              adjustedRSquared: reg.adjustedRSquared,
              tStatistics: reg.tStatistics,
            };
          } catch (err) {
            log(`Factor regression skipped: ${err instanceof Error ? err.message : String(err)}`, AGENT);
          }
        }
      }
    }

    state.priceHistory = priceHistory;
    state.regime = regime || null;
    state.lastQuantAt = new Date().toISOString();
    saveState(state);

  } finally {
    disconnect();
  }
  log('Quant analysis complete', AGENT);
}

if (process.argv.includes('--once')) {
  run().then(() => process.exit(0)).catch(e => { logError('Fatal', e, AGENT); process.exit(1); });
}
