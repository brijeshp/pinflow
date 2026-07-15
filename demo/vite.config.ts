import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      // Order matters: the subpath must be aliased before the bare name, or
      // core's lazy `import('pinflow/voice')` resolves to dist/index.js/voice.
      'pinflow/voice': resolve(__dirname, '../dist/voice.js'),
      pinflow: resolve(__dirname, '../dist/index.js'),
    },
  },
  server: { port: 4174 },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
