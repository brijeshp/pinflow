# Demo site (pinflow.dev)

Self-contained marketing + live demo. The whole page has Pinflow loaded — visitors try it by clicking the floating control bottom-right.

## Run

```bash
# From repo root first:
pnpm build

# Then in this directory:
pnpm install
pnpm dev   # http://localhost:4174
```

## Deploy

Static output in `dist/`. Any static host works:

```bash
pnpm build
# Deploy dist/ to Vercel, Netlify, Cloudflare Pages, GitHub Pages...
```

Point `pinflow.dev` at the host of your choice.

## Structure

- `index.html` — hero, install tabs, embedded "Acme SaaS" prototype to annotate, export sample, features grid
- `style.css` — light/dark theme via `prefers-color-scheme`
- `main.ts` — `init()` + tab switcher

The demo imports `pinflow` directly from the built `dist/` via a Vite alias.
