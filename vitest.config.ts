import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The lazy `import('pinflow/voice')` self-reference can't resolve in the
      // test runtime (no built dist) — point it at the source so import-analysis
      // is satisfied. The import stays lazy; only voice-activation tests run it.
      'pinflow/voice': fileURLToPath(new URL('./src/voice/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/core/**/*.ts'],
      exclude: [
        'src/core/iife.ts',
        'src/core/ui/**',
        'src/core/types.ts',
        'src/core/voice-contract.ts',
        'src/core/voice-loader.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
