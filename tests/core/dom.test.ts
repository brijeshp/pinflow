import { afterEach, describe, expect, it } from 'vitest';
import { createUIRoot } from '../../src/core/ui/dom';

// P4.6: an ESM init() may run before <body> exists (module script in <head>).
// createUIRoot must not crash; the host append waits for DOMContentLoaded.
describe('createUIRoot without a body', () => {
  afterEach(() => {
    if (!document.body) {
      document.documentElement.appendChild(document.createElement('body'));
    }
    document.body.innerHTML = '';
  });

  function removeBody(): void {
    document.body?.remove();
  }

  it('mounts immediately when body exists', () => {
    const ui = createUIRoot();
    expect(document.querySelector('[data-pinflow-root]')).toBe(ui.host);
    ui.destroy();
  });

  it('builds the shadow tree synchronously and appends the host on DOMContentLoaded', () => {
    removeBody();
    const ui = createUIRoot();
    // Handle contract intact: the shadow tree exists even before mount.
    expect(ui.root).toBeInstanceOf(HTMLDivElement);
    expect(document.querySelector('[data-pinflow-root]')).toBeNull();

    document.documentElement.appendChild(document.createElement('body'));
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(document.querySelector('[data-pinflow-root]')).toBe(ui.host);
    ui.destroy();
  });

  it('never appends after destroy(), even when DOM ready fires later', () => {
    removeBody();
    const ui = createUIRoot();
    ui.destroy();

    document.documentElement.appendChild(document.createElement('body'));
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(document.querySelector('[data-pinflow-root]')).toBeNull();
  });
});
