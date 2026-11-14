import { defineConfig, devices } from '@playwright/test';

/**
 * Renderer measurements (docs/evidence/PERF_2026-11-15.md). Unlike playwright.config.ts it starts no server: start `npx vite --port 5190
 * --strictPort` (dev runtime, IWER emulated Quest) or `npx vite preview --port 5190 --strictPort` (production build) first, and point
 * WU_PERF_URL at it (default https://localhost:5190/). The browser uses the real GPU (ANGLE D3D11) as the emulator specs do.
 */
export default defineConfig({
  testDir: 'tests/perf',
  timeout: 900_000,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    ignoreHTTPSErrors: true,
    viewport: { width: 1120, height: 630 },
    launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-precise-memory-info'] },
  },
});
