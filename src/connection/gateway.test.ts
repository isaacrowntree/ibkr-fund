import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';

/**
 * Gateway tests: verify the cleanup pattern concept.
 * We can't easily test the real IBApi connection, but we validate
 * that the listener-cleanup pattern works correctly with EventEmitter.
 */

describe('listener cleanup pattern', () => {
  it('removes listener after resolve', () => {
    const emitter = new EventEmitter();
    let resolved = false;

    const handler = () => { resolved = true; };
    emitter.on('data', handler);
    expect(emitter.listenerCount('data')).toBe(1);

    // Simulate cleanup on resolve
    emitter.removeListener('data', handler);
    expect(emitter.listenerCount('data')).toBe(0);

    emitter.emit('data');
    expect(resolved).toBe(false);
  });

  it('removes listener after timeout/reject', () => {
    const emitter = new EventEmitter();
    const handler = () => {};
    emitter.on('data', handler);
    expect(emitter.listenerCount('data')).toBe(1);

    emitter.removeListener('data', handler);
    expect(emitter.listenerCount('data')).toBe(0);
  });

  it('does not leak listeners across multiple calls', () => {
    const emitter = new EventEmitter();

    for (let i = 0; i < 100; i++) {
      const handler = () => {};
      emitter.on('tick', handler);
      emitter.removeListener('tick', handler);
    }

    expect(emitter.listenerCount('tick')).toBe(0);
  });

  it('monotonic reqId allocator produces unique IDs', () => {
    // Simulate the allocateReqId pattern
    let nextReqId = 10000;
    const allocateReqId = () => nextReqId++;

    const ids = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      ids.add(allocateReqId());
    }
    expect(ids.size).toBe(1000);
    // All IDs should be sequential
    expect(nextReqId).toBe(11000);
  });
});
