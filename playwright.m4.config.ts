import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: [
    'm4Movement.spec.ts',
    'm4Release.spec.ts',
    'm4Vacuum.spec.ts',
    'm4Nodes.spec.ts',
    'm43Visual.spec.ts',
    'm43Travel.spec.ts',
    'm43WorldView.spec.ts',
  ],
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4186', headless: true },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4186',
    url: 'http://127.0.0.1:4186',
    reuseExistingServer: false,
  },
});
