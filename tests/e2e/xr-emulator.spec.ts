import { expect, test, type Page } from '@playwright/test';

// Needs the IWSDK dev runtime (`npm run dev` or `npx @iwsdk/cli dev up --headless`): it injects the emulated Quest 3
// (IWER) into any browser that loads the page from localhost. Skipped when the runtime is not up (CI, production preview).
const DEV_URL = 'https://localhost:8081/?debug';

/* eslint-disable @typescript-eslint/no-explicit-any -- these reach into the emulator and the ?debug world handle */
const xrFrames = (page: Page, count: number) =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const session = (window as any).__world.session;
        let seen = 0;
        const tick = () => (++seen >= n ? resolve() : session.requestAnimationFrame(tick));
        session.requestAnimationFrame(tick);
      }),
    count,
  );

// IWER's dev UI overwrites direct writes to the device pose, so the head moves through its remote control API.
const moveHead = (page: Page, position: { x: number; y: number; z: number }) =>
  page.evaluate((p) => (window as any).IWER_DEVICE.remote.dispatch('set_transform', { device: 'headset', position: p }), position);

const setVisibility = (page: Page, state: string) => page.evaluate((s) => (window as any).IWER_DEVICE.updateVisibilityState(s), state);

const standFromEyes = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__world;
    const head = w.player.head.getWorldPosition(w.camera.position.clone());
    const stage = w.getSceneObject('stage').getWorldPosition(w.camera.position.clone());
    const ahead = Math.hypot(stage.x - head.x, stage.z - head.z);
    return {
      eyeHeight: head.y as number,
      below: (head.y - stage.y) as number,
      ahead,
      degreesDown: (Math.atan2(head.y - stage.y, ahead) * 180) / Math.PI,
      stage: [stage.x, stage.y, stage.z] as number[],
    };
  });
/* eslint-enable @typescript-eslint/no-explicit-any */

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.evaluate(() => (window as any).__world.exitXR());
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'landing', { timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('fallback stand: measured from the eyes at about 35° down, kept through the system menu, re-placed on recentre', async ({ page }) => {
    test.setTimeout(180_000); // software rendering runs the emulated Quest at about one frame per second
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(DEV_URL);
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'ar');
    await page.getByRole('button', { name: 'Enter mixed reality' }).click();
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'xr', { timeout: 60_000 });
    await xrFrames(page, 3);

    let view = await standFromEyes(page);
    expect(view.below).toBeCloseTo(0.38, 2);
    expect(view.ahead).toBeCloseTo(0.55, 2);
    expect(view.degreesDown).toBeLessThanOrEqual(35);
    const placedAt = view.stage;

    // Opening the system menu blurs the session. Coming back must not move the stand, even if the head moved meanwhile.
    await setVisibility(page, 'visible-blurred');
    await xrFrames(page, 2);
    await moveHead(page, { x: 0.2, y: 1.3, z: 0.1 });
    await xrFrames(page, 2);
    await setVisibility(page, 'visible');
    await xrFrames(page, 3);
    view = await standFromEyes(page);
    expect(view.stage).toEqual(placedAt);

    // Recentring is how the player corrects the stand after changing posture or seat: same view from the new eye position.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.evaluate(() => (window as any).IWER_DEVICE.recenter());
    await xrFrames(page, 3);
    view = await standFromEyes(page);
    expect(view.eyeHeight).toBeCloseTo(1.3, 2);
    expect(view.below).toBeCloseTo(0.38, 2);
    expect(view.ahead).toBeCloseTo(0.55, 2);
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
