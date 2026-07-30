# React + Vite Example

Pinflow integrated into a standard React + Vite project.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173/?reviewer=YourName`.

## Integration

```tsx
import { Annotator } from '@brijeshp/pinflow/react';

function App() {
  return (
    <>
      <Annotator project="my-prototype" />
      {/* your app */}
    </>
  );
}
```

One component. No config. No wrapper. It renders nothing into the DOM.
