---
'pinflowjs': patch
---

Stop Chromium on touch devices from flashing its default translucent blue tap-highlight square over pinflow's controls — pins, the dock's arm segment and count chip, and the panel and popup buttons. The widget's `all:initial` host kept a host page's own `-webkit-tap-highlight-color` from reaching them, so the widget now opts out itself.
