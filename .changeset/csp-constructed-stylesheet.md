---
'@brijeshp/pinflow': patch
---

Pinflow now survives a strict Content Security Policy. Under `style-src 'self'`
with no `'unsafe-inline'`, the shadow-root `<style>` element was silently
dropped — and because the host's `pointer-events: none` is set through CSSOM
(which CSP does not restrict) while every `pointer-events: auto` lived in that
blocked stylesheet, the widget degraded to an invisible, completely
**non-interactive** overlay: pins and buttons present, all dead, no error. A
shadow root has no CSP context of its own, so the document policy governs it.

Styles now load through a constructed `CSSStyleSheet` adopted into the shadow
root. CSP defines no hook for CSSOM, so this survives where a `<style>` element
does not. Engines without constructed stylesheets (Safari below 16.4) keep the
`<style>` path unchanged, chosen by a feature probe that also rejects engines
which accept `replaceSync` and silently discard the rules.

No API change. Hosts serving pinflow under a strict CSP no longer need
`'unsafe-inline'` in `style-src`.
