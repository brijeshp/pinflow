// Build-time constant injected by tsup `define` (see tsup.config.ts) with the
// package.json version. Runtimes that skip the define step (vitest) hit the
// `typeof` fallback in src/core/index.ts instead.
declare const __PINFLOW_VERSION__: string;

// Vite/vitest `?raw` imports. Used by the guards that assert a property of the
// SOURCE rather than of its behaviour — the `_`-prefix ban in scope.ts, whose
// violation is silent data corruption no behavioural test can observe.
declare module '*?raw' {
  const content: string;
  export default content;
}
