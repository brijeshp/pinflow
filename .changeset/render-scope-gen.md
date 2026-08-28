---
'@brijeshp/pinflow': patch
---

The `**Scope:**` line now says which tuning generation captured the record.

Scope is resolved once at pin time and **stored**, never re-derived at export — `export.ts` is DOM-free by contract and cannot reach the engine. So re-exporting comments placed before a retune renders the old boundaries, the old confidence, and the old `Area covers`, with nothing in the file to say so. That is exactly what `SCOPE_GEN` exists to prevent: `rung` and `confidence` are persisted _and shipped to agents_, so the same word means different things across tunings.

It was persisted, and validated at hydration, and then dropped at the one boundary where a reader could act on it. A record captured months ago was indistinguishable from a fresh one.

`(rung: landmark, confidence: medium, gen: 1 — older tuning)` — the marker appears only when the record predates the current generation, so current captures gain three characters and nothing else. All four agent formats explain what it means, held in step by a parity test.

The constant moves from `scope.ts` to `scope-limits.ts`, which already exists for values three modules must agree on and none may import the engine for: capture stamps it, hydration validates it, export renders it. `scope.ts` re-exports it, so nothing that imported it from there changes.
