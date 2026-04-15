# Pinflow

Figma-style pin-and-comment annotation for any prototype. Zero backend. One line to install. Exports to markdown that drops straight into Claude Code or Cursor.

```html
<script src="https://cdn.jsdelivr.net/npm/pinflow@latest" data-project="my-prototype"></script>
```

Or with npm:

```bash
npm install pinflow
```

```jsx
import { Annotator } from 'pinflow/react';

export default function App() {
  return (
    <>
      <Annotator project="my-prototype" />
      {/* rest of your app */}
    </>
  );
}
```

## What it does

- Click any element on your prototype → drop a pin, type a comment.
- Comments persist in localStorage, per reviewer, per route.
- No login. No server. No account system.
- Export a markdown file, paste it into your AI coding tool, iterate.

## Status

🚧 **Pre-release.** See [`specs/pinflow_v1_spec.md`](./specs/pinflow_v1_spec.md) for the full v1 spec.

## License

MIT
