import { afterEach, describe, expect, it, vi } from 'vitest';

// The IIFE entry auto-inits from document.currentScript data attributes.
// Import it fresh per test with a stubbed currentScript.
async function importIife(attrs: Record<string, string>): Promise<void> {
  vi.resetModules();
  const script = document.createElement('script');
  for (const [k, v] of Object.entries(attrs)) script.dataset[k] = v;
  Object.defineProperty(document, 'currentScript', { value: script, configurable: true });
  await import('../../src/core/iife');
}

describe('IIFE auto-init activation parsing (codex 0.3.0 #8)', () => {
  afterEach(async () => {
    const { destroy } = await import('../../src/core/index');
    destroy();
    Object.defineProperty(document, 'currentScript', { value: null, configurable: true });
    vi.restoreAllMocks();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it("data-activation='toggle' is an honored opt-out now that the default is 'both'", async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    localStorage.setItem('pinflow:r:iife-t', 'Tester');
    await importIife({ project: 'iife-t', activation: 'toggle' });
    expect(info).toHaveBeenCalledWith(expect.stringContaining('activation=toggle'));
  });

  it('no data-activation attribute inherits the both default', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    localStorage.setItem('pinflow:r:iife-d', 'Tester');
    await importIife({ project: 'iife-d' });
    expect(info).toHaveBeenCalledWith(expect.stringContaining('activation=both'));
  });
});
