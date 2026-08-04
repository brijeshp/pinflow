---
'@brijeshp/pinflow': patch
---

Clicking an existing pin while annotate mode is armed now disarms the mode. Previously the edit popup opened with the crosshair cursor and document capture listener still active, so a subsequent outside click could dismiss the popup and place a spurious pin from the same event.
