import { defineConfig } from '@playwright/test';
const production = [
  'm4Movement.spec.ts',
  'm4Release.spec.ts',
  'm4Vacuum.spec.ts',
  'm4Nodes.spec.ts',
  'm43Visual.spec.ts',
  'm43Travel.spec.ts',
  'm43WorldView.spec.ts',
];
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  projects: [
    { name: 'production', testMatch: production, use: { baseURL: 'http://127.0.0.1:4186', headless: true } },
    { name: 'legacy', testIgnore: production, use: { baseURL: 'http://127.0.0.1:5173', headless: true } },
  ],
  webServer: [
    { command: 'VITE_DIME_MODE=local npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
    {
      command: 'npx vite preview --host 127.0.0.1 --port 4186',
      url: 'http://127.0.0.1:4186',
      reuseExistingServer: false,
    },
  ],
});
