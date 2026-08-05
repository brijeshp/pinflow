// Hand-minified on purpose: this ships inside the bundle as a string literal,
// so whitespace and comments survive esbuild minification. Readability loss
// is worth ~450B gzipped.
// Theme seam (A1): the nine PinflowTheme tokens surface as var(--pf-*,stock)
// fallbacks; the annotator sets the custom properties on the shadow host, and
// they inherit through the shadow boundary. No theme → identical stock CSS.
// GOTCHA: --pf-font-family is consumed on .root, NOT :host — Chrome drops a
// var()-dependent longhand that shares a block with `all:initial` (found via
// the sensavera browser proof), so the :host rule keeps only the static stack.
export const STYLES =
  ':host{all:initial;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
  '*{box-sizing:border-box}' +
  // The var fallback repeats the static stack (not `inherit`) so .root never
  // depends on :host's font surviving `all:initial` — some Chromium builds
  // drop it (audit 2026-07-23: untokened embeds computed Times).
  '.root{position:fixed;inset:0;pointer-events:none;z-index:2147483646;font-family:var(--pf-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif)}' +
  '.control{position:fixed;pointer-events:auto;background:#0f172a;color:#f8fafc;border-radius:999px;padding:10px 14px;font-size:13px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.18),0 2px 4px rgba(0,0,0,.08);cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:8px;transition:transform .15s ease}' +
  '.control:hover{transform:translateY(-1px)}' +
  '.control[data-active="true"]{background:var(--pf-accent,#2563eb)}' +
  '.panel{position:fixed;pointer-events:auto;min-width:260px;max-width:320px;background:var(--pf-surface,light-dark(#fff,#1e222b));color:var(--pf-text,light-dark(#0f172a,#e7eaf1));border-radius:var(--pf-radius,12px);padding:16px;box-shadow:var(--pf-shadow,0 16px 48px rgba(15,23,42,.18),0 2px 6px rgba(15,23,42,.08));font-size:13px;line-height:1.45}' +
  '.panel h3{margin:0 0 8px;font-size:13px;font-weight:600}' +
  '.panel p{margin:0 0 12px;opacity:.75;color:var(--pf-text-muted,inherit)}' +
  '.panel .row{display:flex;gap:8px}' +
  '.panel button{flex:1;min-height:36px;padding:8px 12px;border-radius:8px;border:1px solid color-mix(in oklab,currentColor 18%,transparent);background:color-mix(in oklab,currentColor 7%,transparent);color:inherit;font:inherit;cursor:pointer}' +
  '.panel button.primary{background:var(--pf-accent,#2563eb);color:var(--pf-accent-contrast,#fff);border-color:transparent}' +
  '.panel button:hover{filter:brightness(.97)}' +
  '.pin{position:fixed;pointer-events:auto;width:24px;height:24px;border:0;padding:0;font-family:inherit;border-radius:999px;background:var(--pf-accent,#2563eb);color:var(--pf-accent-contrast,#fff);display:grid;place-items:center;font-size:11px;font-weight:600;box-shadow:0 4px 10px rgba(0,0,0,.28),0 0 0 2px var(--pf-surface,light-dark(#fff,#1e222b));cursor:pointer;transform:translate(-50%,-50%) scale(0);animation:pop .18s ease forwards;transition:transform .12s ease}' +
  '.pin:hover{transform:translate(-50%,-50%) scale(1.08)}' +
  // Resolution treatment (L2.3), cheapest legible option: dispositioned pins go
  // muted via the theme's textMuted token (distinct from orphan gray #a3a3a3);
  // done additionally swaps the number for a ✓ (set in _renderPins), declined
  // keeps its number struck through. One shared bg rule + one declined rule.
  '.pin[data-status]{background:var(--pf-text-muted,light-dark(#64748b,#99a1b3))}' +
  '.pin[data-status="declined"]{text-decoration:line-through}' +
  '@keyframes pop{to{transform:translate(-50%,-50%) scale(1)}}' +
  // Anytime-export count chip: the pin vocabulary (same accent circle, same
  // pop-in) promoted to a fixed corner summon for the export sheet.
  '.chip{position:fixed;left:16px;bottom:16px;pointer-events:auto;min-width:26px;height:26px;padding:0 8px;border:0;border-radius:999px;background:var(--pf-accent,#2563eb);color:var(--pf-accent-contrast,#fff);font:inherit;font-size:12px;font-weight:600;box-shadow:0 4px 10px rgba(0,0,0,.28),0 0 0 2px var(--pf-surface,light-dark(#fff,#1e222b));cursor:pointer;display:grid;place-items:center;transform:scale(0);animation:chippop .18s ease forwards}' +
  '@keyframes chippop{to{transform:scale(1)}}' +
  '@media (prefers-reduced-motion:reduce){.pin{animation:none;transform:translate(-50%,-50%)}.chip{animation:none;transform:none}}' +
  '@media (max-width:640px){.pin{width:32px;height:32px;font-size:13px}.chip{min-width:32px;height:32px;font-size:13px}}' +
  '.input{position:fixed;pointer-events:auto;min-width:240px;max-width:320px;background:var(--pf-surface,light-dark(#fff,#1e222b));color:var(--pf-text,light-dark(#0f172a,#e7eaf1));border-radius:var(--pf-radius,10px);padding:10px;box-shadow:var(--pf-shadow,0 12px 32px rgba(15,23,42,.18),0 2px 6px rgba(15,23,42,.08))}' +
  '.input textarea{width:100%;min-height:64px;max-height:160px;resize:none;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:13px;line-height:1.5}' +
  // iOS Safari auto-zooms the page when a focused input is under 16px; the
  // reviewer's recovery pinch then eats the draft. 16px on touch kills the
  // zoom trigger at the source.
  '@media (pointer:coarse){.input textarea{font-size:16px}}' +
  '.input .actions{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:var(--pf-text-muted,inherit)}' +
  // Read-only disposition line in a resolved comment's popup ("✓ Done — note").
  '.input .res{margin-top:8px;font-size:12px;color:var(--pf-text-muted,light-dark(#64748b,#99a1b3))}' +
  '.input .delete,.input .exportall{background:transparent;border:0;color:inherit;cursor:pointer;opacity:.55;font:inherit;padding:0}' +
  '.input .delete:hover{opacity:1;color:var(--pf-danger,#dc2626)}' +
  '.input .exportall:hover{opacity:1}' +
  '.input .save{background:var(--pf-accent,#2563eb);color:var(--pf-accent-contrast,#fff);border:0;border-radius:8px;padding:6px 16px;min-height:30px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}' +
  '.input .save:hover{filter:brightness(.95)}' +
  '.drawer{position:fixed;bottom:16px;left:16px;pointer-events:auto;background:#0f172a;color:#f8fafc;border-radius:12px;padding:14px;min-width:240px;max-width:320px;box-shadow:0 16px 48px rgba(0,0,0,.25);font-size:12px}' +
  '.drawer h3{margin:0 0 8px;font-size:13px;font-weight:600}' +
  '.drawer label{display:flex;align-items:center;gap:6px;margin:4px 0}' +
  '.drawer .bar{display:flex;gap:6px;margin-top:10px}' +
  '.drawer button{flex:1;padding:6px 10px;border-radius:6px;border:1px solid color-mix(in oklab,currentColor 18%,transparent);background:color-mix(in oklab,currentColor 8%,transparent);color:inherit;font:inherit;cursor:pointer}' +
  '.drawer button.danger{background:var(--pf-danger,#dc2626);color:var(--pf-accent-contrast,#fff)}' +
  '';
