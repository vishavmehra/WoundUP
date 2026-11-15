import { defineConfig, devices } from '@playwright/test';

/**
 * The production build behind vercel.json's security headers (ADR-025). Run `npm run build` first, then
 * `npx playwright test -c playwright.csp.config.ts`. tools/serve-dist.mjs serves dist/ on port 5194 with the headers of vercel.json,
 * so what this checks is the Content-Security-Policy that will be enforced, not the one `vite preview` does not send. Plain http on
 * 127.0.0.1 is a secure context, which WebXR (and IWER) need. Software rendering, like the other browser specs: slow but portable.
 */
const PORT = 5194;

export default defineConfig({
  testDir: 'tests/csp',
  timeout: 600_000,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${PORT}/`,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `node tools/serve-dist.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false, // the server reads vercel.json once: always start one that matches the file on disk
    timeout: 30_000,
  },
});
