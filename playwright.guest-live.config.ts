import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/guest-live',
  outputDir: '/tmp/dime-m43-game-publication/browser-results',
  workers: 1,
  retries: 0,
  timeout: 600000,
  use: { headless: true, actionTimeout: 15000 },
});
