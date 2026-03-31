import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// We need to set STATE_DIR before importing store so it uses our temp dir
const TEST_DIR = resolve(__dirname, '../../.test-state-' + process.pid);

beforeEach(() => {
  process.env.STATE_DIR = TEST_DIR;
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  delete process.env.STATE_DIR;
});

// Dynamic import to pick up the env var change
async function getStore() {
  // Clear module cache to force re-evaluation with new STATE_DIR
  const modulePath = resolve(__dirname, './store');
  // vitest uses ESM-like resolution; we just import fresh
  return await import('./store');
}

describe('saveState / loadState round-trip', () => {
  it('saves and loads state correctly', async () => {
    const { saveState, loadState } = await getStore();
    const state = { netLiquidation: 100000, positions: ['VTI', 'BND'], lastCheckAt: '2025-01-01' };
    saveState(state);
    const loaded = loadState();
    expect(loaded.netLiquidation).toBe(100000);
    expect(loaded.positions).toEqual(['VTI', 'BND']);
    expect(loaded.lastCheckAt).toBe('2025-01-01');
  });

  it('file exists after save (atomic write)', async () => {
    const { saveState } = await getStore();
    saveState({ test: true });
    const stateFile = resolve(TEST_DIR, 'bot-state.json');
    expect(existsSync(stateFile)).toBe(true);
    // Temp file should NOT exist after atomic rename
    expect(existsSync(stateFile + '.tmp')).toBe(false);
  });

  it('returns empty object for missing file', async () => {
    const { loadState } = await getStore();
    const loaded = loadState();
    expect(loaded).toEqual({});
  });

  it('returns empty object for corrupted file', async () => {
    const { loadState } = await getStore();
    const stateFile = resolve(TEST_DIR, 'bot-state.json');
    writeFileSync(stateFile, '{corrupted json!!!!', 'utf8');
    const loaded = loadState();
    expect(loaded).toEqual({});
  });
});
