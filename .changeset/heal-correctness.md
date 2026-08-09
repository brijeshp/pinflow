---
'@brijeshp/pinflow': patch
---

Comments no longer silently re-anchor to the wrong element. The selector ladder
tried the CSS path before the text fingerprint, so on a virtualised list or an
infinite scroll — where the DOM recycles nodes — a stale `li:nth-of-type(1)`
kept resolving confidently onto whatever content had scrolled into that slot. A
pin on "Order #1042" could reattach to "Order #7781" with no sign anything was
wrong. A positional match that contradicts a strong stored fingerprint is now
demoted: the text pass gets first refusal, and the positional hit is still used
if nothing corroborates, so no comment that resolved before stops resolving.

Two related fixes on the same path. The fingerprint walk started at the document
root, which meant `<head>` was scored — a page titled "Checkout" would heal a
pin on a "Checkout" heading to `<title>`, an exact match found first and never
displaced. The walk now starts at `<body>` and skips tags that can never be a
pin target, and skipped elements no longer consume the walk budget.

The walk is also faster and bounded by time as well as count. Fingerprinting
normalised an element's entire subtree to keep 80 characters, which measured
97 µs on a 33 kB anchor and 640 µs under 6x CPU throttling; it now scans a
bounded prefix and falls back to the full string only when whitespace-heavy
markup makes the prefix insufficient, so fingerprints are unchanged. A 2 ms
budget complements the 2,000-node cap, which alone was device-dependent —
roughly 1.5 ms on a laptop but 9.5 ms on a mid-range phone.
