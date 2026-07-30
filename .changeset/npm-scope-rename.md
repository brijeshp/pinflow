---
'@brijeshp/pinflow': minor
---

Published to npm as **`@brijeshp/pinflow`** (the unscoped `pinflow` name is
taken by an unrelated package). All module specifiers change accordingly:

- `import { init } from '@brijeshp/pinflow'`
- `import { Annotator } from '@brijeshp/pinflow/react'` (same for `/vue`)
- voice stays a lazy internal seam at `@brijeshp/pinflow/voice` — still zero
  bytes for text users
- CDN: `https://cdn.jsdelivr.net/npm/@brijeshp/pinflow` now serves the IIFE
  directly (new `jsdelivr`/`unpkg` fields)

Runtime identity is unchanged: storage keys (`pinflow:c:…`), `window.Pinflow`,
the worklet processor name, export artifact fields, and DOM/css hooks all keep
the `pinflow` brand — existing stored comments survive the upgrade untouched.

Vue wrapper budget notched 0.6 → 0.61 KB gz: the scoped import specifier is
longer; measured cost 4 B.
