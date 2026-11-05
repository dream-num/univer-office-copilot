import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/office/render-page'),
  build: {
    target: 'esnext',
    outDir: resolve(import.meta.dirname, 'dist/render-page'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
  },
  worker: { format: 'es' },
});
