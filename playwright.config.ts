import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: [
    'm4Movement.spec.ts',
    'm4Release.spec.ts',
    'm4Vacuum.spec.ts',
    'm4Nodes.spec.ts',
    'm43Visual.spec.ts',
    'm43Travel.spec.ts',
    'm43WorldView.spec.ts',
    'm43Scanner.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true },
  webServer: {
    command: 'VITE_DIME_MODE=local npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
  },
});
