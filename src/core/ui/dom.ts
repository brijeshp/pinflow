import { STYLES } from './styles';

export interface UIRoot {
  host: HTMLElement;
  shadow: ShadowRoot;
  root: HTMLDivElement;
  destroy(): void;
}

/**
 * How STYLES reaches the shadow root.
 *
 * A shadow root has no CSP context of its own — the document policy governs the
 * whole tree — and HTML's "update a style block" algorithm runs the inline-style
 * check when a `<style>` is inserted. Under `style-src 'self'` with no
 * `'unsafe-inline'` the sheet is dropped. Because the host's
 * `pointer-events:none` below is set through CSSOM, which CSP does NOT restrict,
 * while every `pointer-events:auto` lives in that sheet, the widget degrades to
 * an invisible, completely non-interactive overlay: pins and buttons present,
 * all dead, no error. CSP defines no hook for CSSOM, so a constructed sheet
 * survives where a `<style>` element does not.
 */
export type StyleStrategy = 'adopted' | 'element';

/**
 * Deliberately uncached — `init()` is a singleton, so this runs once per mount,
 * and a module-level cache would leak across tests for no measurable gain.
 */
export function resolveStyleStrategy(): StyleStrategy {
  try {
    const probe = new CSSStyleSheet(); // pre-Safari-16.4: Illegal constructor
    probe.replaceSync(':host{--pf-probe:1}');
    // A rule count of 0 means the engine accepted replaceSync and discarded the
    // rules — an empty sheet would style nothing while reporting success. No
    // separate `'adoptedStyleSheets' in ShadowRoot.prototype` probe: every
    // engine shipped the constructor and the adoption surface together
    // (Chrome 73, Firefox 101, Safari 16.4), so it only buys bytes.
    return probe.cssRules.length ? 'adopted' : 'element';
  } catch {
    return 'element';
  }
}

export function createUIRoot(strategy: StyleStrategy = resolveStyleStrategy()): UIRoot {
  const host = document.createElement('div');
  host.setAttribute('data-pinflow-root', '');
  host.style.cssText =
    'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483646;color-scheme:inherit';
  const shadow = host.attachShadow({ mode: 'open' });
  if (strategy === 'adopted') {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES);
    // Assignment, not push(): the array was frozen before Chrome 99, and
    // assignment works on every engine that has the property at all.
    shadow.adoptedStyleSheets = [sheet];
  } else {
    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.appendChild(style);
  }
  const root = document.createElement('div');
  root.className = 'root';
  shadow.appendChild(root);
  // An ESM init() may run before <body> exists (module script in <head>).
  // The shadow tree above is built synchronously either way — only the host
  // APPEND waits for DOM ready (mirroring iife.ts), which keeps init()'s
  // synchronous Handle contract intact.
  let destroyed = false;
  if (document.body) {
    document.body.appendChild(host);
  } else {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        if (!destroyed) document.body.appendChild(host);
      },
      { once: true },
    );
  }
  return {
    host,
    shadow,
    root,
    destroy() {
      destroyed = true;
      host.remove();
    },
  };
}

/** Tiny createElement helper — className/text are the two things every site sets. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Apply a px position produced by `flipPosition` (or any {left,top} pair). */
export function place(node: HTMLElement, pos: { left: number; top: number }): void {
  node.style.left = `${pos.left}px`;
  node.style.top = `${pos.top}px`;
}

/**
 * Position AND size an absolutely-positioned box, in px. Three call sites write
 * the same five properties in the same order (hover outline, area footprint,
 * scope outline); five template literals each is the single most duplicated
 * shape in the UI layer.
 *
 * `display` is cleared first because two callers reuse a node they may have
 * hidden earlier. On the freshly-created `el('i')` the scope outline passes it
 * is a no-op, so one order serves all three.
 *
 * UNPREFIXED deliberately: this is a module-level export crossing a boundary,
 * and `tsup` mangles `/^_/`. Callers with a local named `box` must rename it.
 */
export function box(node: HTMLElement, l: number, t: number, w: number, h: number): void {
  const s = node.style;
  s.display = '';
  s.left = `${l}px`;
  s.top = `${t}px`;
  s.width = `${w}px`;
  s.height = `${h}px`;
}

export function flipPosition(
  anchor: { left: number; top: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  offset = 12,
): { left: number; top: number } {
  let left = anchor.left + offset;
  let top = anchor.top + offset;
  if (left + size.width > viewport.width - 8) {
    left = anchor.left - size.width - offset;
  }
  if (top + size.height > viewport.height - 8) {
    top = anchor.top - size.height - offset;
  }
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  return { left, top };
}

// WCAG-ish relative luminance for #rgb/#rrggbb; null for non-hex input.
// Picks white or near-black text for a given accent so hosts can theme with
// a single variable.
export function contrastFor(accent: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(accent.trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.35 ? '#16181d' : '#fff';
}
