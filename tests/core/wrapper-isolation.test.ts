import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The react/vue wrappers must never bundle a copy of core — they reference the
// bare `@brijeshp/pinflow` specifier so the consumer's bundler resolves ONE shared core
// module (two copies = two independent `init()` singletons). Assert both
// directions: core internals absent, bare specifier present. Runs only when a
// build is present (same pattern as tests/voice/bundle-isolation.test.ts).
const WRAPPER_BUNDLES = ['dist/react.js', 'dist/react.cjs', 'dist/vue.js', 'dist/vue.cjs'];
// Distinctive core-internal strings that survive minification: the shadow-root
// host attribute (ui/dom.ts) and the storage key prefix (storage.ts).
const CORE_INTERNALS = /data-pinflow-root|pinflow:/;
// esm: `from"@brijeshp/pinflow"` / `import"@brijeshp/pinflow"`; cjs: `require("@brijeshp/pinflow")`.
const BARE_SPECIFIER = /from\s*["']@brijeshp\/pinflow["']|require\(["']@brijeshp\/pinflow["']\)/;

describe('wrapper isolation', () => {
  const built = WRAPPER_BUNDLES.filter((f) => existsSync(f));

  it.runIf(built.length > 0)('keeps core out of the react/vue wrapper bundles', () => {
    for (const file of built) {
      const contents = readFileSync(file, 'utf8');
      expect(contents, `${file} must not inline core internals`).not.toMatch(CORE_INTERNALS);
      expect(contents, `${file} must import core via the bare specifier`).toMatch(BARE_SPECIFIER);
    }
  });
});
