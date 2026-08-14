---
'@brijeshp/pinflow': patch
---

Scope labels arriving from the wire are sanitised the same way captured ones are.

`scope.ts` strips control characters, zero-width and BOM, bidi overrides and isolates, and the Unicode tag block from a scope node's label at capture — and its own comment says why: the value "flows into localStorage, the JSON export and the host's `onChange` payload, all of which bypass the markdown escapers entirely." The hydration boundary, which serves backends, imported exports and tampered blobs and is therefore strictly the less trusted of the two, re-applied the length cap but not the strip. So the one boundary whose job is to distrust the wire let invisible instruction-smuggling through, into the lines the release's own trust preamble calls the most authoritative in the artifact.

The sanitiser now lives in `scope-limits.ts` — the module that exists precisely so capture and hydration can agree without importing each other — and both call it, on `label` and on `testid`. It takes `unknown` rather than `string`, because the hydration call site reads an untrusted record and a cast there would let a number reach `.replace` and throw, discarding a whole store to save one bad field.

`tag` and `css` are now bounded (40 / 1024) at that boundary. Every other untrusted string on a record was already capped — `textFingerprint` to `FP_MAX`, `resolution` to 500 — and these two were not, so a single hydrated payload could carry an unbounded string into every future export and every `onChange` call. An over-long node is rejected rather than truncated: a clipped css path is a selector that may match a different element than the reviewer drew around, which is worse than no hint, and losing a hint never loses their words.
