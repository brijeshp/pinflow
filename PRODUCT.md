# Product

## Register

product

## Users

Two audiences with opposite fluency, sharing one artifact.

**The reviewer** is the primary user of the interface. A client, a PM, a founder's friend, someone
glancing at a prototype on a phone between other things. They installed nothing, signed into
nothing, and did not choose this tool. They are here once, briefly, to say what looks wrong. They
will not read documentation, will not discover a hidden gesture, and will not come back to fix a
mistake they made in the widget. Assume a thumb, a small screen, and no patience for chrome.

**The builder** is the reviewer's counterpart: a developer working with a coding agent, who pastes
the exported markdown into Claude Code, Cursor, or Codex as the next prompt. They never see most of
the reviewer's interface. They experience Pinflow almost entirely as the quality of the file that
comes out the other end.

The job to be done: turn "the upgrade button looks weak" from a sentence an agent has to guess at
into a file that names the element, its selectors, its context, and what it actually looked like.

## Product Purpose

Pinflow adds a comment layer to any web page via one script tag, then exports what was said as
markdown built for an agent's context window rather than a human's inbox.

It exists because coding agents cannot see the screen. The reviewer clicking the element is
strictly better information than the reviewer describing it.

Success is a reviewer who never thinks about Pinflow, and a builder whose agent gets the change
right on the first attempt because the export left nothing to infer.

Explicit non-goals, held deliberately: it is not a bug tracker (no threads, assignees, priorities,
notifications), it hosts nothing, and it cannot see source, only the rendered DOM.

## Brand Personality

Plain, candid, unhurried.

The product's voice states limits as readily as capabilities. It says "It isn't a bug tracker" and
"It's pre-1.0" in its own README. It does not sell, does not exclaim, and does not congratulate the
user for completing an ordinary action. Where something cannot be verified, it says so rather than
implying success.

In the interface this means: short declarative sentences, no exclamation marks, no cheerleading, no
personality in error copy. The widget is a guest on someone else's page and behaves like one.

## Anti-references

- **Tools that need an extension or a running dev server.** These rule out the exact people whose
  opinion was wanted: the client, the PM, someone on a phone. Anything that reintroduces an install
  step is a regression, not a feature.
- **Signup walls and identity gates.** Naming yourself is optional and asked once, at the only
  moment it matters.
- **SaaS feedback-widget aesthetics.** Gradient bubbles, mascot avatars, "We'd love your feedback!",
  emoji reaction rows, satisfaction faces. Pinflow is a tool, not a survey.
- **Anything that phones home.** No telemetry, ever. This is a hard invariant in AGENTS.md, not a
  current preference.
- **Chrome that competes with the host page.** The widget must never look like it is the product.

## Design Principles

1. **Ask for a decision only where the evidence to make it exists.** A choice presented before its
   outcome is knowable is a guess dressed as consent. This applies hardest to destructive actions:
   never ask someone to authorise discarding data before they can see whether the thing that
   replaces it actually arrived.

2. **Report only what can be verified.** The clipboard write returns a result, so it is asserted.
   The download fires a detached click and returns nothing, so it is never claimed. Where a channel
   cannot be observed, offer a retry rather than a reassurance.

3. **Reviewers install nothing and owe nothing.** Zero setup is the feature that makes the product
   possible. Every decision defends the cost of entry, including the cost of leaving.

4. **Disappear into the host page.** Pinflow renders over someone else's work. One standing
   affordance, in the pins' own visual vocabulary, that exists only when it has something to do.

5. **Every byte is argued for.** Size ceilings are enforced by CI and ratchet down between
   features; a ceiling moves up only as a deliberate, changeset-documented trade that is
   re-ratcheted razor-thin afterwards. A refinement that cannot justify its weight is not a
   refinement.

## Accessibility & Inclusion

Target WCAG 2.1 AA.

- **Touch first.** Pins and dock controls grow to 32px under 640px; panel buttons hold a 36px
  floor with a mouse and a 44px floor on coarse pointers, keyed to the pointer rather than the
  viewport so a landscape phone still qualifies. Text inputs use 16px on coarse pointers, because
  iOS Safari auto-zooms below that and the reviewer's recovery pinch eats the draft.
- **Reduced motion is honoured.** `prefers-reduced-motion: reduce` disables the pin pop, the chip
  pop, the marching-ants area border, and the arm glyph rotation.
- **Both colour schemes.** Surfaces resolve through `light-dark()`, and the nine theme tokens let a
  host retint without patching CSS.
- **Never colour alone.** Comment status is carried by shape and glyph as well as tint: resolved
  pins swap the number for a check, declined pins strike it through.
- **Labelled controls.** The count chip carries `aria-label` and `title`, the arm segment an
  `aria-label`; the optional
  name field is labelled as what it does, not what it is.
- **Bulk-destructive actions are confirmed, never undone.** Deletes go out per-comment on the sync
  wire with no bulk reversal, so friction belongs before the act rather than after it. A
  single-comment delete stays one tap, inside a popup whose scope is already visible.
