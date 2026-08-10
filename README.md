<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/brijeshp/pinflow/main/.github/assets/hero-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/brijeshp/pinflow/main/.github/assets/hero-light.svg">
  <img alt="A reviewer pins a comment on an Upgrade button; Pinflow exports Markdown carrying the element, its selectors, the surrounding context and a computed-style snapshot." src="https://raw.githubusercontent.com/brijeshp/pinflow/main/.github/assets/hero-light.svg" width="880" height="380">
</picture>

# Pinflow

**Your reviewer clicks the thing that's wrong. Your coding agent gets a selector, the surrounding context, and the comment — as Markdown it can act on.**

[![npm](https://img.shields.io/npm/v/%40brijeshp%2Fpinflow)](https://www.npmjs.com/package/@brijeshp/pinflow)
[![license](https://img.shields.io/npm/l/%40brijeshp%2Fpinflow)](./LICENSE)
[![core size](https://img.shields.io/badge/core-17_kB_gzipped-2563eb)](./package.json)

**[Try it live on pinflow.dev](https://pinflow.dev)** · [Guide](./docs/guide.md) · [API](./docs/wiki/api.md) · [Examples](./examples)

"Make this button clearer" is not enough for an agent that cannot see your screen. Pinflow adds a
[17 kB](./package.json) annotation layer to any page, so the person reviewing it points at the
element instead of describing it — and every comment ships with the evidence an agent needs to find
that element again.

One script tag. No backend, no account, no extension. **Your reviewers install nothing**, and it
works on a phone.

```html
<script src="https://cdn.jsdelivr.net/npm/@brijeshp/pinflow" data-project="my-prototype"></script>
```

That's the whole install. Send someone the URL; they can start pinning.

## What your agent receives

Real export output, not a mockup — leave a note on [pinflow.dev](https://pinflow.dev), hit
**Export**, and diff it against this:

<!-- prettier-ignore -->
```markdown
## Route: /pricing

### Comment 1
**Comment ID:** `cmt_9f2kx1abq`
**Status:** open
**Created:** 2026-08-10T14:24:00Z
**Element:** `<button data-testid="upgrade-cta">` (“Upgrade”)
**Context:** the ‘Upgrade’ button under ‘Choose a plan’
**Computed:** background rgb(37, 99, 235), text rgb(255, 255, 255), font 13px Inter
**Selector candidates:**
- testid: `upgrade-cta`
- css: `main > section.pricing:nth-of-type(2) > button:nth-of-type(1)`
- xpath: `/html/body/main/section[2]/button[1]`
**Position:** 47% from left, 38% from top of element
**Viewport at time of comment:** 390×844 (mobile)

> Upgrade is losing to Start free — make it the primary action.
```

Three ways to locate the element, the human description of where it sits, and what it actually
looked like. That is the difference between an agent finding the button and an agent guessing.

## Install

| You have                                | Add this                                                                           | Notes                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Any web page**                        | `<script src="https://cdn.jsdelivr.net/npm/@brijeshp/pinflow" data-project="app">` | Nothing to build. WordPress, Webflow, a static file — anything you can paste a tag into. |
| **React / Next.js**                     | `npm i @brijeshp/pinflow` → `import { Annotator } from '@brijeshp/pinflow/react'`  | 468 B wrapper. See the [guide](./docs/guide.md#frameworks).                              |
| **Vue / Nuxt**                          | `npm i @brijeshp/pinflow` → `import { Annotator } from '@brijeshp/pinflow/vue'`    | 604 B wrapper.                                                                           |
| **A generated app** (Lovable, v0, Bolt) | The script tag, in the generated `index.html`                                      | Paste the export back into the chat so the next generation gets it right.                |

## How the loop runs

**1 · Anyone pins.** Send a link to a page with the script tag. Reviewers click the element they mean
and type what's wrong. No install, no account, works on a phone. Voice notes are an optional module.

**2 · You export.** One button writes a Markdown file and copies it to your clipboard — every comment
carrying its selectors, context and style snapshot. JSON, email handoff, and your own backend are one
config option away.

**3 · You hand it to your agent.** Paste it in and ask for the changes. The
[`agent/`](./agent/README.md) folder ships the reading protocol as a skill, a slash command, an editor
rule and an `AGENTS.md` snippet, so your agent knows what each field means before it starts editing.

## Why this one

- **Your reviewer installs nothing.** No extension, no localhost, no account. Every tool that
  requires one rules out the people you most need feedback from — clients, PMs, a designer on a
  phone.
- **Pins survive edits.** When an agent rewrites the page, Pinflow re-finds elements through a
  selector ladder with fuzzy text matching, and reports an honest orphan rather than silently
  reattaching a comment to the wrong element.
- **Comments are treated as untrusted input.** Everything in an export is escaped so a reviewer's
  note can't smuggle instructions into your agent's context. It's a [hard
  invariant](./AGENTS.md), enforced in CI.
- **Zero runtime dependencies**, MIT, no telemetry, and a bundle ceiling CI won't let us exceed.

## What this isn't

- **Not a bug tracker.** No threads, assignees, severities or notifications. It produces one
  artifact and gets out of the way.
- **Not hosted.** Comments live in the reviewer's browser until someone exports them. Sharing across
  people or devices means wiring [your own backend](./docs/guide.md#connect-your-own-backend).
- **Not able to see your source.** It captures the rendered DOM, so it reports the element and its
  context; mapping that to a file is your agent's job.
- **Young.** Published, CI-gated and independently reviewed, but the API can still move before 1.0.

## Docs

[Guide](./docs/guide.md) — configuration, sync, voice, builder mode, privacy, troubleshooting ·
[API reference](./docs/wiki/api.md) · [Sync protocol](./PROTOCOL.md) ·
[Architecture](./docs/wiki/README.md) · [Examples](./examples)

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md), and
[AGENTS.md](./AGENTS.md) for the invariants CI enforces: bundle ceilings, test coverage, and the
export escaping. Security reports: [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © Brijesh Patel
