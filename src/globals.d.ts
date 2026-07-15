// Build-time constant injected by tsup `define` (see tsup.config.ts) with the
// package.json version. Runtimes that skip the define step (vitest) hit the
// `typeof` fallback in src/core/index.ts instead.
declare const __PINFLOW_VERSION__: string;
