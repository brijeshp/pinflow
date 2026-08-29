---
name: Pinflow
description: A pin-and-comment annotation layer that behaves like a guest on someone else's page.
colors:
  accent: '#2563eb'
  accent-contrast: '#ffffff'
  surface-light: '#ffffff'
  surface-dark: '#1e222b'
  text-light: '#0f172a'
  text-dark: '#e7eaf1'
  text-muted-light: '#64748b'
  text-muted-dark: '#99a1b3'
  danger: '#dc2626'
  ink: '#0f172a'
  ink-contrast: '#f8fafc'
  orphan: '#a3a3a3'
  scrim: '#0f172a52'
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.45
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'
    fontSize: '13px'
    fontWeight: 600
    lineHeight: 1.45
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.4
  numeral:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'
    fontSize: '11px'
    fontWeight: 600
    lineHeight: 1
  field:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.5
rounded:
  hairline: '4px'
  control: '8px'
  input: '10px'
  panel: '12px'
  pill: '999px'
spacing:
  xs: '4px'
  sm: '6px'
  md: '8px'
  lg: '12px'
  xl: '16px'
components:
  pin:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-contrast}'
    rounded: '{rounded.pill}'
    size: '24px'
    typography: '{typography.numeral}'
  pin-resolved:
    backgroundColor: '{colors.text-muted-light}'
    textColor: '{colors.accent-contrast}'
    rounded: '{rounded.pill}'
    size: '24px'
  chip:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-contrast}'
    rounded: '{rounded.pill}'
    height: '26px'
    padding: '0 8px'
  arm:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.ink-contrast}'
    rounded: '{rounded.pill}'
    size: '26px'
  arm-active:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-contrast}'
  panel:
    backgroundColor: '{colors.surface-light}'
    textColor: '{colors.text-light}'
    rounded: '{rounded.panel}'
    padding: '16px'
    width: '260px'
  input:
    backgroundColor: '{colors.surface-light}'
    textColor: '{colors.text-light}'
    rounded: '{rounded.input}'
    padding: '10px'
    width: '240px'
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-contrast}'
    rounded: '{rounded.control}'
    padding: '6px 16px'
    height: '30px'
  highlight:
    backgroundColor: '#2563eb14'
    rounded: '{rounded.hairline}'
---

# Design System: Pinflow

## 1. Overview

**Creative North Star: "the surveyor's chalk line"**

A surveyor marks a boundary with the thinnest possible line, in the one color
that is not already on the ground, and the mark washes off. It is precise, it is
temporary, and nobody mistakes it for part of the building. Pinflow's entire
visual system is that line: an accent circle, a hairline box, a small surface
that holds text, and nothing else standing when the gesture ends.

The system is deliberately tiny. There are four materials — the **pin** (accent
circle), the **panel/input** (elevated surface holding text), the **highlight**
(non-interactive accent box over host content), and the **dock** (neutral
bottom-left chrome). Everything Pinflow has ever needed has been built from
those four. New visual language is a byte cost and a comprehension cost, so a
new feature earns its place by re-using a material, not by inventing one.

Two constraints shape the whole system in ways they would not shape a normal
product UI. First, **the widget lives inside `all:initial` shadow DOM on an
unknown page** — a marketing site, a dark dashboard, a half-styled prototype —
so every surface carries its own contrast and nothing may inherit. Second, the
CSS ships as a single hand-minified string literal inside the bundle
(`src/core/ui/styles.ts`) and is measured in gzipped bytes by CI. Selector reuse
is a design decision, not just an optimization: `.arm,.chip{…}` sharing a circle
is why both exist.

What this system rejects: DevTools inspector chrome, persistent widget
furniture, design-tool selection handles, and any affordance that promises an
interaction Pinflow does not support.

**Key characteristics:**

- One accent, used only for identity and action, never for decoration.
- Theme-following, not theme-imposing (`light-dark()` on every surface).
- Nine host-overridable `--pf-*` tokens with stock values baked as `var()`
  fallbacks, so an untokened embed renders identically.
- Ephemeral by default: gesture-scoped surfaces are removed, not hidden.
- Reduced-motion is a first-class branch, not an afterthought.

## 2. Colors

Tinted-neutral **Restrained** palette: one blue accent over slate neutrals, with
a single red reserved for destruction.

### Primary

- **Accent Blue** (`#2563eb`, token `--pf-accent`): pins, the count chip, the
  armed dock state, primary buttons, the hover/marquee highlight border and
  wash. This is the color that means "this is Pinflow, and this is the thing."
  It is never used as background decoration.
- **Accent Contrast** (`#ffffff`, `--pf-accent-contrast`): numerals and labels
  sitting on accent.

### Secondary

- **Ink** (`#0f172a` on `#f8fafc`): the dock's arm segment and the builder
  drawer. Deliberately _not_ tokened — it is neutral chrome that must stay
  legible regardless of what a host sets `--pf-accent` to, and it is the visual
  cue for "not armed."

### Tertiary

- **Danger Red** (`#dc2626`, `--pf-danger`): delete affordances and the voice
  recording indicator. Reserved. Uncertainty, warnings, and low confidence must
  never borrow it.

### Neutral

- **Surface** (`light-dark(#fff, #1e222b)`, `--pf-surface`): panels, inputs, and
  the 2 px ring that separates a pin from whatever is behind it.
- **Text** (`light-dark(#0f172a, #e7eaf1)`, `--pf-text`): primary copy on
  surfaces.
- **Text Muted** (`light-dark(#64748b, #99a1b3)`, `--pf-text-muted`): hints,
  action rows, resolution lines, and resolved (done/declined) pins.
- **Orphan Gray** (`#a3a3a3`): a pin whose anchor could not be re-found.
  Deliberately distinct from Text Muted, which means "resolved."
- **Scrim** (`rgba(15,23,42,.32)`): the marquee's page dim, painted as a
  `0 0 0 200vmax` box-shadow spread rather than an overlay element.

### Named Rules

**The One Accent Rule.** `--pf-accent` is the only chromatic color in the
reviewer's interface. If a new state needs to be distinguishable, it earns that
through opacity, stroke pattern, or shape — not a second hue. Hosts brand
Pinflow by setting one variable; a second accent would break that promise.

**The Danger Reservation.** Red means destruction, and only destruction.
Uncertainty is expressed as _less_ signal (thinner, dashed, dimmer), never as
alarm.

**The Theme-Follows-Host Rule.** Every surface color is `light-dark()` or a
`color-mix` off `currentColor`. Nothing is hard-coded to a light background.

## 3. Typography

**Display Font:** none. The system has no display tier.
**Body Font:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
(overridable via `--pf-font-family`, consumed on `.root`, never on `:host` —
Chrome drops a `var()`-dependent longhand that shares a block with
`all:initial`).
**Label/Mono Font:** none.

**Character:** native, invisible, and small. The reviewer should read Pinflow's
copy the way they read their own OS chrome, with no sense of having entered
another product.

### Hierarchy

- **Title** (600, 13px, 1.45): panel and drawer headings. One step of _weight_
  contrast, zero steps of size contrast, against body.
- **Body** (400, 13px, 1.45): panel prose, textarea content on fine pointers.
- **Label** (400, 12px, 1.4): action rows, hints, resolution lines, chip counts.
- **Numeral** (600, 11px → 13px on coarse pointers): pin indices.
- **Field** (400, 16px on coarse pointers): the composer textarea. 16px is not
  an aesthetic choice — below it, iOS Safari auto-zooms on focus and the
  reviewer's recovery pinch eats the draft.

### Named Rules

**The Weight-Not-Size Rule.** The type scale is nearly flat (11/12/13) because
every surface is 240–320 px wide. Hierarchy comes from weight (400 vs 600) and
from muted color, not from scale ratios. A 20px heading in a 260px panel reads
as a different product.

## 4. Elevation

A hybrid: **shadow for anything that floats over the host page, flat for
anything painted onto it.** Panels, inputs, pins, and the dock float and cast.
The scope/hover highlight is painted _onto_ host content and casts nothing — it
is a mark on the page, not an object above it.

### Shadow Vocabulary

- **Surface float** (`box-shadow: 0 16px 48px rgba(15,23,42,.18), 0 2px 6px rgba(15,23,42,.08)`,
  token `--pf-shadow`): panels. A long soft cast plus a tight contact shadow.
- **Compact float** (`0 12px 32px rgba(15,23,42,.18), 0 2px 6px rgba(15,23,42,.08)`):
  the composer input — same recipe, shorter throw.
- **Object lift + separator ring** (`0 4px 10px rgba(0,0,0,.28), 0 0 0 2px var(--pf-surface,…)`):
  pins, chip, arm. The second layer is a hard ring in the surface color; it is
  what keeps a pin legible on a photograph.
- **Page dim** (`0 0 0 200vmax rgba(15,23,42,.32)`): the marquee scrim, borrowed
  as spread rather than a real overlay so there is one element to destroy.

### Named Rules

**The Painted-On Rule.** Anything that describes host content (highlight, scope
outline) is flat, borderless-in-elevation, and `pointer-events:none`. Anything
that holds Pinflow's own content floats and is interactive. A reviewer must
never have to test whether a thing can be clicked.

## 5. Components

### Buttons

- **Shape:** 8 px radius (`--pf-radius` governs panels/inputs, buttons are fixed
  at 8 px), full-width flex within `.panel .row`.
- **Primary:** accent background, accent-contrast text, transparent border,
  `6px 16px` padding, 30–36 px min-height.
- **Secondary:** `color-mix(in oklab, currentColor 7%, transparent)` fill with an
  18% `currentColor` border. Theme-agnostic by construction.
- **Hover:** `filter: brightness(.95–.97)`. No transform, no shadow change.
- **Ghost:** transparent, `opacity:.55` at rest → `1` on hover. Used for
  destructive and tertiary actions; delete additionally shifts to danger on
  hover.

### Chips

- **Style:** accent pill, 26 px tall (32 px on coarse pointers), `0 8px`
  padding, 12 px/600 numerals, object-lift shadow with surface ring.
- **State:** count chips appear only when there is something to export, entering
  with a 0→1 scale pop over 180 ms.

### Cards / Containers

Pinflow has no cards. Panels and inputs are the only containers, and they never
nest.

- **Corner style:** 12 px panel, 10 px input (`--pf-radius`).
- **Background:** `--pf-surface`, `light-dark(#fff,#1e222b)`.
- **Shadow:** Surface float / Compact float.
- **Border:** none. Elevation does the separating.
- **Internal padding:** 16 px panel, 10 px input.

### Inputs / Fields

- **Style:** borderless, transparent, `resize:none`, inheriting the panel's
  color. The surface _is_ the field; there is no second box inside it.
- **Focus:** `outline:0`. The floating surface is already the focus context.
- **Sizing:** `min-height:64px; max-height:160px`.

### Navigation

One dock, bottom-left, `position:fixed`, `16px` inset, `8px` gap. The dock
itself is inert; only its children take pointer events. The arm segment is
neutral ink at rest, accent when armed. Nothing else is ever standing.

### Signature Component: the highlight (`.hl`)

The one material that touches host content. A `position:fixed`,
`pointer-events:none` box with a 2 px accent border, an 8% accent wash
(`color-mix(in oklab, var(--pf-accent) 8%, transparent)`), and a 4 px radius.
It transitions at 80 ms when tracking hover, and drops the transition entirely
under `[data-marquee]` because a lagging drag box reads as broken. In marquee
mode it additionally carries the page-dim spread. It is created lazily and
destroyed, never hidden-and-reused, so teardown is a single `remove()`.

## 6. Do's and Don'ts

### Do:

- **Do** express new states by re-skinning `.pin`, `.panel`, `.input`, `.hl`, or
  the dock. Four materials is the system.
- **Do** put every new color behind `var(--pf-*, stock)` so an untokened embed
  is byte-identical to today.
- **Do** use `color-mix(in oklab, currentColor N%, transparent)` for anything
  that must survive on an unknown background.
- **Do** give every gesture-scoped element exactly one owner and one idempotent
  teardown that calls `remove()`.
- **Do** carry a second, non-color channel for every semantic distinction
  (stroke pattern, weight, shape, text), so hue is never load-bearing.
- **Do** keep transitions at 80–180 ms and branch them off under
  `prefers-reduced-motion: reduce`.
- **Do** hand-minify additions to `styles.ts` and re-run `pnpm size`.

### Don't:

- **Don't** paint DevTools inspector chrome: no margin/padding bands, no
  gridlines, no dimension tooltips, no measurement rulers.
- **Don't** draw selection handles, resize grips, or corner dots on anything
  that cannot actually be resized.
- **Don't** use `--pf-danger` for uncertainty, warnings, or low confidence.
  Red is destruction only.
- **Don't** add a second accent hue, a gradient, or `background-clip: text`.
- **Don't** use a `border-left`/`border-right` stripe above 1 px as an accent.
- **Don't** leave anything standing after a gesture ends. Persistent overlays
  pollute the screenshots reviewers take constantly.
- **Don't** rely on `:hover` to reveal meaning. The primary reviewer is on a
  phone and has no hover.
- **Don't** animate layout properties, and never bounce or overshoot.
- **Don't** introduce a keyframe when a transition will do; keyframes cost
  bytes twice (rule plus reduced-motion override).
