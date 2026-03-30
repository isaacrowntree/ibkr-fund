import { describe, it, expect } from 'vitest';
import { selectExecutionStrategy, selectUrgency, adaptiveOrder, bracketOrder } from './algo-orders';

describe('selectExecutionStrategy', () => {
  it('uses market for small orders', () => {
    expect(selectExecutionStrategy(1000, 100000)).toBe('market');
  });

  it('uses adaptive for medium orders', () => {
    expect(selectExecutionStrategy(5000, 100000)).toBe('adaptive');
  });

  it('uses twap for large orders', () => {
    expect(selectExecutionStrategy(15000, 100000)).toBe('twap');
  });

  it('uses adaptive for hedges regardless of size', () => {
    expect(selectExecutionStrategy(500, 100000, true)).toBe('adaptive');
  });
});

describe('selectUrgency', () => {
  it('returns Urgent for hedges', () => {
    expect(selectUrgency(true, false, 'neutral')).toBe('Urgent');
  });

  it('returns Urgent in crisis', () => {
    expect(selectUrgency(false, false, 'crisis')).toBe('Urgent');
  });

  it('returns Patient for rebalances', () => {
    expect(selectUrgency(false, true, 'neutral')).toBe('Patient');
  });

  it('returns Normal otherwise', () => {
    expect(selectUrgency(false, false, 'neutral')).toBe('Normal');
  });
});

describe('adaptiveOrder', () => {
  it('builds correct order structure', () => {
    const { contract, order } = adaptiveOrder('VTI', 'BUY', 100, 'Patient');
    expect(contract.symbol).toBe('VTI');
    expect(order.algoStrategy).toBe('Adaptive');
    expect(order.totalQuantity).toBe(100);
    expect(order.transmit).toBe(true);
  });
});

describe('bracketOrder', () => {
  it('creates 3 linked orders', () => {
    const { contract, orders } = bracketOrder('VTI', 'BUY', 100, 250, 275, 240, 1);
    expect(contract.symbol).toBe('VTI');
    expect(orders).toHaveLength(3);
    // Parent
    expect(orders[0].orderId).toBe(1);
    expect(orders[0].transmit).toBe(false);
    // Take profit
    expect(orders[1].parentId).toBe(1);
    expect(orders[1].lmtPrice).toBe(275);
    // Stop loss
    expect(orders[2].parentId).toBe(1);
    expect(orders[2].auxPrice).toBe(240);
    expect(orders[2].transmit).toBe(true); // last one transmits all
  });
});
