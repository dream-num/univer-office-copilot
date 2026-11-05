import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 30000 },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm start',
        env: { DEMO_EXAMPLES: 'false' },
        url: 'http://127.0.0.1:3100/health',
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    viewport: { width: 1600, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
