import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const dependencies = Object.keys(
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).dependencies,
).filter((name) => name !== '@univer-copilot/shared');

export default defineConfig({
  build: {
    ssr: true,
    target: 'node24',
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      external: (id) =>
        dependencies.some((dependency) => id === dependency || id.startsWith(`${dependency}/`)),
      input: {
        main: resolve(import.meta.dirname, 'src/bootstrap/main.ts'),
        app: resolve(import.meta.dirname, 'src/bootstrap/app.ts'),
        'office-worker': resolve(import.meta.dirname, 'src/office/worker/entry.ts'),
        'attachment-worker': resolve(import.meta.dirname, 'src/modules/attachments/worker.ts'),
      },
      output: { entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' },
    },
  },
  ssr: { noExternal: ['@univer-copilot/shared'], external: dependencies },
});
