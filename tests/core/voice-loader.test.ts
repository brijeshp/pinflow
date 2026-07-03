import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

// P4.6: the dynamic-import interop must tolerate default-wrapped and
// CJS-shaped namespaces, and reject cleanly (into the existing degrade path)
// when the module doesn't carry the contract.
describe('loadVoice interop hardening', () => {
  afterEach(() => {
    vi.doUnmock('pinflow/voice');
    vi.resetModules();
  });

  async function load(): Promise<unknown> {
    const { loadVoice } = await import('../../src/core/voice-loader');
    return loadVoice();
  }

  it('unwraps an ESM default export', async () => {
    const mod = { start: () => Promise.resolve({ stop: () => Promise.resolve(), dispose() {} }) };
    vi.doMock('pinflow/voice', () => ({ default: mod }));
    await expect(load()).resolves.toBe(mod);
  });

  it('falls back to a CJS-shaped namespace carrying start()', async () => {
    // `default: undefined` keeps vitest's missing-export trap quiet while
    // still exercising the ?? fallback branch.
    vi.doMock('pinflow/voice', () => ({
      default: undefined,
      start: () => Promise.resolve({ stop: () => Promise.resolve(), dispose() {} }),
    }));
    const resolved = (await load()) as { start: unknown };
    expect(typeof resolved.start).toBe('function');
  });

  it('rejects a module without a start function instead of exploding later', async () => {
    vi.doMock('pinflow/voice', () => ({ default: {} }));
    await expect(load()).rejects.toThrow('invalid module');
  });
});
