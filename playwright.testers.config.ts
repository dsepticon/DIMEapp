import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'webTesters.spec.ts',
  outputDir: '/tmp/dime-m42-testers/tester-browser-results',
  workers: 1,
  retries: 0,
  use: { headless: true },
});
