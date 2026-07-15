import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The core bundles must never contain voice code — the lazy `import('pinflow/voice')`
// stays an external runtime reference. A size budget alone can hide a small leak,
// so assert the symbols are absent. Runs only when a build is present.
const CORE_BUNDLES = ['dist/index.js', 'dist/index.cjs', 'dist/pinflow.iife.js'];
const VOICE_SYMBOLS = /getUserMedia|AudioContext|AudioWorklet|registerProcessor|api\.deepgram\.com/;

describe('bundle isolation', () => {
  const built = CORE_BUNDLES.filter((f) => existsSync(f));

  it.runIf(built.length > 0)('keeps voice code out of the core bundles', () => {
    for (const file of built) {
      const contents = readFileSync(file, 'utf8');
      expect(contents, `${file} must not contain voice symbols`).not.toMatch(VOICE_SYMBOLS);
      expect(contents, `${file} should keep the external voice import`).toContain('pinflow/voice');
    }
  });
});
