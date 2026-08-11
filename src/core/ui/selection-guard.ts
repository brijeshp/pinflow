// iOS long-press starts text selection + the Copy/Search callout on the HOST
// page — the same gesture pinflow uses to place a pin, so both fired at once
// (0.5.0 mobile report: pin placed AND selection handles AND the callout bar).
// WebKit ignores `selectstart`, so CSS is the only reliable suppression. The
// rule is document-level and therefore never crosses into pinflow's shadow
// tree — the draft textarea keeps native selection — and it is MODAL: held
// only while annotate mode is armed or a stealth press owns the finger, then
// removed. `!important` on `*` because user-select is per-element (a host's
// own `user-select: text` would defeat a body-level rule).
const RULE =
  '*{-webkit-user-select:none!important;-webkit-touch-callout:none!important;user-select:none!important}';

let holders = 0;
let sheet: CSSStyleSheet | null = null;
let styleEl: HTMLStyleElement | null = null;

function install(): void {
  // Constructed sheet first: it survives `style-src 'self'` (CSP defines no
  // hook for CSSOM), mirroring the widget's own delivery. The <style>
  // fallback covers pre-Safari-16.4 — where a strict CSP may drop it, and the
  // suppression degrades to absent rather than breaking anything.
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(RULE);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } catch {
    sheet = null;
    styleEl = document.createElement('style');
    styleEl.setAttribute('data-pinflow-guard', '');
    styleEl.textContent = RULE;
    document.head.appendChild(styleEl);
  }
}

function uninstall(): void {
  if (sheet) {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
    sheet = null;
  }
  styleEl?.remove();
  styleEl = null;
}

/**
 * Suppress host text selection and the iOS touch callout until the returned
 * release function is called. Refcounted — overlapping holders (armed mode
 * plus an in-flight press) share one document-level rule — and each token
 * releases at most once, so a double release can never strip another holder.
 */
export function acquireSelectionGuard(): () => void {
  if (++holders === 1) install();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--holders === 0) uninstall();
  };
}
