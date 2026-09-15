import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'm4Movement.spec.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4186', headless: true },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4186',
    url: 'http://127.0.0.1:4186',
    reuseExistingServer: false,
  },
});
