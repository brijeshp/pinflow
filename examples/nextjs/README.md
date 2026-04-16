# Next.js Example

Pinflow in a Next.js App Router project. Because Pinflow needs browser APIs, the wrapper is a client component.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000/?reviewer=YourName`.

## Integration

```tsx
// app/pinflow-provider.tsx
'use client';
import { Annotator } from 'pinflow/react';
export function PinflowProvider() {
  return <Annotator project="my-prototype" />;
}

// app/layout.tsx
import { PinflowProvider } from './pinflow-provider';
export default function RootLayout({ children }) {
  return (
    <html><body>
      <PinflowProvider />
      {children}
    </body></html>
  );
}
```

The `'use client'` directive keeps the SSR boundary clean. Pinflow lazy-imports its core module so the server render is a no-op.
