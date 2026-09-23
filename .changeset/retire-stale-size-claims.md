---
'@brijeshp/pinflow': patch
---

The package description no longer quotes a bundle size.

It said 17 kB, which was true at 0.6.0 and has been wrong since; npm and GitHub both surface that line. It now says "zero dependencies", which is an invariant rather than a measurement. The README hero carried the same figure and is corrected, and the size badge now tracks the enforced ceiling it links to.
