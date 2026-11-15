import { defineConfig, devices } from '@playwright/test';

/**
 * The emulator specs (tests/e2e: hands, assembly, xray, ...) against a dev runtime you started yourself, with no server of its own:
 *   npx vite --port 5207 --strictPort       (a worktree never touches the shared 8081)
 *   WU_DEV_PORT=5207 npx playwright test --config playwright.emu.config.ts tests/e2e/assembly.spec.ts
 * Unlike playwright.config.ts it neither builds nor serves the production preview, so it cannot meet another checkout's server on port 4173.
 * The browser uses the real GPU (ANGLE D3D11), as the specs' own `GPU_ARGS` ask: software rendering runs the emulated headset at about 1 frame per second.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 300_000,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    ignoreHTTPSErrors: true,
    viewport: { width: 960, height: 540 },
    launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-precise-memory-info'] },
  },
});
