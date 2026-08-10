import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUIRoot, resolveStyleStrategy } from '../../src/core/ui/dom';
import { STYLES } from '../../src/core/ui/styles';

// P1 (0.4.1): a shadow root has NO CSP context of its own — the document policy
// governs the whole tree, and HTML's "update a style block" algorithm runs the
// inline-style check when a <style> is inserted. Under `style-src 'self'` with
// no 'unsafe-inline' the sheet is dropped. The host's `pointer-events:none` is
// set through CSSOM (which CSP does not restrict) while every
// `pointer-events:auto` lives in that sheet, so the widget degrades to an
// invisible, completely NON-INTERACTIVE overlay — not merely an unstyled one.
//
// The strategy is injectable because the branch taken is environment-dependent:
// these assert WHICH path was chosen, and tests/e2e/csp.spec.ts proves the
// chosen path survives a real `style-src 'self'` policy in real browsers.
describe('stylesheet strategy (CSP survival)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  // Post-merge review F9: both fallback branches were pinned but the positive
  // branch never was — a refactor inverting the probe would send EVERY browser
  // down the <style> path (dropped under `style-src 'self'`, degrading the
  // widget to an invisible non-interactive overlay) with the suite green.
  // happy-dom supports constructable sheets natively, so this pins it.
  it("returns 'adopted' in an engine with working constructable sheets", () => {
    expect(resolveStyleStrategy()).toBe('adopted');
  });

  // The default-argument path is what production init() actually runs:
  // createUIRoot() → probe → channel. Nothing else exercised it end to end.
  it('createUIRoot() with no argument adopts a constructed sheet', () => {
    const ui = createUIRoot();
    expect(ui.shadow.adoptedStyleSheets).toHaveLength(1);
    expect(ui.shadow.querySelector('style')).toBeNull();
    ui.destroy();
  });

  it('falls back to <style> when the CSSStyleSheet constructor throws', () => {
    // Pre-Safari-16.4 throws `TypeError: Illegal constructor`.
    vi.stubGlobal(
      'CSSStyleSheet',
      class {
        constructor() {
          throw new TypeError('Illegal constructor');
        }
      },
    );
    expect(resolveStyleStrategy()).toBe('element');
  });

  it('falls back to <style> when replaceSync is a silent no-op', () => {
    // An engine that accepts replaceSync and drops the rules would otherwise
    // give us an empty sheet and a widget with no styles at all.
    vi.stubGlobal(
      'CSSStyleSheet',
      class {
        cssRules: unknown[] = [];
        replaceSync(): void {
          /* accepts, discards */
        }
      },
    );
    expect(resolveStyleStrategy()).toBe('element');
  });

  it("adopts a constructed sheet and appends no <style> under the 'adopted' strategy", () => {
    const ui = createUIRoot('adopted');
    expect(ui.shadow.querySelector('style')).toBeNull();
    expect(ui.shadow.adoptedStyleSheets).toHaveLength(1);
    ui.destroy();
  });

  it("appends a <style> and adopts nothing under the 'element' strategy", () => {
    const ui = createUIRoot('element');
    expect(ui.shadow.querySelector('style')?.textContent).toBe(STYLES);
    expect(ui.shadow.adoptedStyleSheets ?? []).toHaveLength(0);
    ui.destroy();
  });

  // The regression that matters: the rule that makes the widget clickable must
  // arrive through the channel that was ASKED for. `pointer-events:auto` living
  // only in a dropped <style> is the whole bug, so a version of this that reads
  // "whichever channel delivered it" would pass against the broken code —
  // exactly the way the escaping assertions in export.test.ts used to.
  it.each(['adopted', 'element'] as const)(
    'delivers the interactive rule through the requested %s channel',
    (strategy) => {
      const ui = createUIRoot(strategy);
      const delivered =
        strategy === 'adopted'
          ? Array.from(ui.shadow.adoptedStyleSheets[0]!.cssRules)
              .map((r) => r.cssText)
              .join('')
          : (ui.shadow.querySelector('style')!.textContent ?? '');
      // A bare `pointer-events` search is satisfied by the root's own
      // pointer-events:none — mutating every interactive `auto` to `none`
      // stayed green against it (0.4.1 review). Assert the CONCRETE
      // interactive selector carries auto, tolerating serializer whitespace.
      const armRule = /(^|})[^{}]*\.arm[^{}]*\{[^}]*pointer-events:\s*auto/;
      expect(delivered).toMatch(armRule);
      ui.destroy();
    },
  );
});

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
