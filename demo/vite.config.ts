import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      pinflow: resolve(__dirname, '../dist/index.js'),
    },
  },
  server: { port: 4174 },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
