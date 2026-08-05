---
'@brijeshp/pinflow': minor
---

Adaptive theming — the widget now matches its host page by default, and
branding it takes one variable:

- **Follows the page's scheme, not the OS**: surfaces use `light-dark()`
  defaults and the shadow host carries inline `color-scheme: inherit`, so a
  light-only site gets a light widget even on dark-OS machines (previously an
  OS media query forced dark panels onto light pages), and a page declaring
  `color-scheme: dark` gets a dark widget.
- **Dark-surface bug fixed**: panel and drawer secondary buttons had
  hardcoded light chrome (`#f8fafc` backgrounds) that turned unreadable on
  dark surfaces — "Export & clear" was invisible on dark-themed hosts. All
  button chrome now derives from `currentColor`; pin/chip rings ride the
  surface token instead of hardcoded white.
- **One-variable theming**: setting `theme.accent` alone now derives a
  readable `accentContrast` from the accent's luminance (hex accents;
  explicit values always win). And because CSS custom properties inherit
  through shadow DOM, plain page CSS works with no JS config at all:
  `:root { --pf-accent: #your-brand }`.

Core ceilings notched 14.55/14.2 KB gz (light-dark()/color-mix strings +
the luminance derivation; measured ~200 B).
