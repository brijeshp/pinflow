---
'pinflowjs': major
---

Published under its own name: the package is now **`pinflowjs`** (was `@brijeshp/pinflow`) and the repository lives at `github.com/pinflowjs/pinflow`. All module specifiers change accordingly:

- `import { init } from 'pinflowjs'`
- `import { Annotator } from 'pinflowjs/react'` (same for `/vue`)
- `pinflowjs/verification` and `pinflowjs/instrumentation` for the optional sidecars
- CDN: `https://cdn.jsdelivr.net/npm/pinflowjs` serves the IIFE directly

Runtime identity is unchanged: storage keys (`pinflow:c:…`), `window.Pinflow`, `data-pinflow-*` attributes, the worklet processor name and export artifact fields all keep the `pinflow` brand, so existing stored comments survive the upgrade untouched. The old `@brijeshp/pinflow` name is deprecated on npm and points here.
