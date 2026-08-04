---
'@brijeshp/pinflow': patch
---

Clicking an existing pin while annotate mode is armed now disarms the mode and closes the menu, matching new-pin placement. Previously the edit popup opened with the crosshair cursor and document capture listener still active — a subsequent outside click could dismiss the popup and place a spurious pin from the same event — and the menu panel stayed open underneath the popup.
