import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireSelectionGuard } from '../../src/core/ui/selection-guard';

// iOS long-press starts text selection + the Copy/Search callout on the HOST
// page — the same gesture pinflow uses to place a pin, so both fired at once
// (0.5.0 mobile report). `selectstart` is ignored by WebKit; CSS is the only
// reliable suppression, applied document-level so it never crosses into
// pinflow's shadow tree (the draft textarea keeps native selection).

function guardText(): string {
  const adopted = document.adoptedStyleSheets
    .map((s) =>
      Array.from(s.cssRules)
        .map((r) => r.cssText)
        .join(''),
    )
    .join('');
  const els = Array.from(document.querySelectorAll('style[data-pinflow-guard]'))
    .map((s) => s.textContent ?? '')
    .join('');
  return adopted + els;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('selection guard (document-level, refcounted)', () => {
  it('acquire suppresses selection and the touch callout; release restores', () => {
    expect(guardText()).toBe('');
    const release = acquireSelectionGuard();
    const text = guardText();
    expect(text).toContain('user-select');
    expect(text).toContain('none');
    expect(text).toContain('-webkit-touch-callout');
    release();
    expect(guardText()).toBe('');
  });

  it('is refcounted: overlapping holders share one suppression', () => {
    const a = acquireSelectionGuard();
    const b = acquireSelectionGuard();
    expect(document.adoptedStyleSheets.length).toBe(1);
    a();
    expect(guardText()).not.toBe('');
    b();
    expect(guardText()).toBe('');
  });

  it('releasing the same token twice cannot strip another holder', () => {
    const a = acquireSelectionGuard();
    const b = acquireSelectionGuard();
    a();
    a(); // double release of one token must not decrement again
    expect(guardText()).not.toBe('');
    b();
    expect(guardText()).toBe('');
  });

  it('falls back to a <style> element when constructed sheets are unavailable', () => {
    vi.stubGlobal(
      'CSSStyleSheet',
      class {
        constructor() {
          throw new TypeError('Illegal constructor');
        }
      },
    );
    const release = acquireSelectionGuard();
    const el = document.querySelector('style[data-pinflow-guard]');
    expect(el?.textContent).toContain('user-select');
    release();
    expect(document.querySelector('style[data-pinflow-guard]')).toBeNull();
  });

  it('leaves foreign adopted sheets untouched on release', () => {
    const foreign = new CSSStyleSheet();
    foreign.replaceSync('.host{color:red}');
    document.adoptedStyleSheets = [foreign];
    const release = acquireSelectionGuard();
    expect(document.adoptedStyleSheets.length).toBe(2);
    release();
    expect(document.adoptedStyleSheets).toEqual([foreign]);
    document.adoptedStyleSheets = [];
  });
});
