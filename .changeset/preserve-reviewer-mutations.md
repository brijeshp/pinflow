---
'@brijeshp/pinflow': patch
---

Reconcile changes against each tab's saved baseline so stale tabs preserve completed additions, edits, and deletions. Preserve the old reviewer store when remembering a rename fails, and batch selector repairs into one persistence write per render. The localStorage backend remains lockless; truly simultaneous cross-process writes require a host-provided transactional backend.
