import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/tests/**/*.test.ts', 'web/tests/**/*.test.ts', 'shared/tests/**/*.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
