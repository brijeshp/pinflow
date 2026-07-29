---
'pinflow': patch
---

Fix exported xpath selectors: the ancestor walk included `<body>` while the
builder also prepended `/html/body/`, so every artifact's xpath candidate read
`/html/body/body[1]/…` and resolved to nothing (re-anchoring silently fell back
to css/fingerprint). Caught by a reviewer artifact from the first live
anytime-export session.
