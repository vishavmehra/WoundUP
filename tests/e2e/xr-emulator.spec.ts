import { expect, test } from '@playwright/test';

// Needs the IWSDK dev runtime (`npm run dev` or `npx @iwsdk/cli dev up --headless`): it injects the emulated Quest 3
// (IWER) into any browser that loads the page from localhost. Skipped when the runtime is not up (CI, production preview).
const DEV_URL = 'https://localhost:8081/?debug';

test.describe('emulated Quest 3 (emulator evidence, not hardware evidence)', () => {
  test.beforeAll(async ({ request }) => {
    const up = await request.get(DEV_URL, { ignoreHTTPSErrors: true, timeout: 3000 }).then(
      (r) => r.ok(),
      () => false,
    );
    test.skip(!up, 'IWSDK dev runtime is not running on https://localhost:8081');
  });

  test('APP-02/04/06: Enter starts an immersive-ar session with optional hand tracking, exiting restores the landing', async ({ page }) => {
    await page.goto(DEV_URL);
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'ar');
    const enter = page.getByRole('button', { name: 'Enter mixed reality' });
    await expect(enter).toBeVisible();
    await enter.click();

    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'xr', { timeout: 15_000 });
    const session = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__world.session;
      return { features: [...(s.enabledFeatures ?? [])] as string[] };
    });
    expect(session.features).toContain('hand-tracking');
    expect(session.features).not.toContain('plane-detection'); // ADR-019: only documented needs are requested

    // The stand is placed 55 cm ahead and 45 cm below the eyes once the first head pose arrives.
    await page.waitForTimeout(500);
    const placed = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = (window as any).__world;
      const head = w.camera.getWorldPosition(w.camera.position.clone());
      const stage = w.getSceneObject('stage').getWorldPosition(w.camera.position.clone());
      return { dy: head.y - stage.y, dist: Math.hypot(stage.x - head.x, stage.z - head.z) };
    });
    expect(placed.dy).toBeCloseTo(0.45, 1);
    expect(placed.dist).toBeCloseTo(0.55, 1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.evaluate(() => (window as any).__world.exitXR());
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'landing', { timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('ADR-025: hand models are served from our own origin, never the public CDN', async ({ page }) => {
    const handRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('generic-hand')) handRequests.push(r.url());
    });
    await page.goto(DEV_URL);
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'ar');
    await page.getByRole('button', { name: 'Enter mixed reality' }).click();
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'xr', { timeout: 15_000 });

    // IWER_DEVICE is the emulated headset the dev plugin installs; switching it to hands makes IWSDK load the hand visuals.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.evaluate(() => ((window as any).IWER_DEVICE.primaryInputMode = 'hand'));

    await expect.poll(() => handRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(handRequests.filter((url) => !url.startsWith('https://localhost:8081/'))).toEqual([]);
  });
});
