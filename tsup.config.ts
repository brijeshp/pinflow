import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/core/index.ts',
      react: 'src/react/index.ts',
      vue: 'src/vue/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    // One file per entry — avoids emitting shared `chunk-*.js` files that
    // would show up alongside the published package on unpkg/jsdelivr.
    splitting: false,
    target: 'es2020',
    outDir: 'dist',
  },
  {
    entry: { pinflow: 'src/core/iife.ts' },
    format: ['iife'],
    globalName: 'Pinflow',
    minify: true,
    sourcemap: true,
    target: 'es2020',
    outDir: 'dist',
    outExtension: () => ({ js: '.iife.js' }),
  },
]);
