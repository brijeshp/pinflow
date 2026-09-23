---
'@brijeshp/pinflow': patch
---

Raise the size ceilings for actionable feedback, as an approved trade. Core rises from 25.04 kB (IIFE) and 24.91 kB (ESM) gzipped to 26.71 kB and 26.57 kB; the React and Vue wrappers rise from 470 B and 610 B to 510 B and 690 B for the new props. The bytes buy structured feedback capture and export, the expected-outcome composer field, the URL query allowlist, per-tab baseline reconciliation and the targeting fixes. Verification and source instrumentation ship as separate entry points and add nothing to core. Ceilings sit about 50 B over the CI measurement (26.66 kB and 26.52 kB) and the README badge reads 27 kB to match.
