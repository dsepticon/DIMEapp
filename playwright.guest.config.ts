import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/guest-browser',
  outputDir: '/tmp/dime-m43-guest/browser-results',
  workers: 1,
  retries: 0,
  use: { headless: true, actionTimeout: 15000, trace: 'retain-on-failure' },
  timeout: 600000,
});
