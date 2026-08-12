// The caps that bound a scope record, in one place because TWO modules must
// agree on them and neither may import the other.
//
// `scope.ts` applies them at CAPTURE. `storage.ts` applies them again at the
// hydration boundary, where the record arrives from a backend, a tampered
// localStorage blob, or an imported JSON export. If the two drifted apart, a
// record this device produced would be silently truncated when it loaded it
// back — and `storage.ts` cannot import `scope.ts`, because `export.ts`
// imports `storage.ts` and is DOM-free by contract.
//
// No imports, no DOM, no `_` prefixes: these values are read back out of
// persisted records.
export const MEMBER_CAP = 24;
export const EXCLUDED_CAP = 12;
export const LABEL_MAX = 80;
