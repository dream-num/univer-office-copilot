import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3100', changeOrigin: false },
      '/universer-api': { target: 'http://127.0.0.1:3100', changeOrigin: false, ws: true },
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, '../dist/web'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
  },
  worker: { format: 'es' },
});
