import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// Served under a sub-path on purpose: ACCEPTANCE APP-08 (the build must work from any base path, not only the domain root).
const BASE = '/wound-up/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `https://localhost:${PORT}${BASE}`, // vite preview serves HTTPS (self-signed) because the IWSDK plugin enables it
    ignoreHTTPSErrors: true,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort --base ${BASE}`,
    url: `https://localhost:${PORT}${BASE}`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
