import { expect, test, type Page } from '@playwright/test';

/** Collects console errors, uncaught exceptions and any request that leaves localhost (CLAUDE.md §16: no third-party requests). */
function watch(page: Page) {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') external.push(r.url());
  });
  return { errors, external };
}

test.describe('desktop browser without WebXR', () => {
  test('APP-01/03: loads clean, tells the truth about support and offers the preview', async ({ page }) => {
    const seen = watch(page);
    await page.goto('./');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Wound Up');
    await expect(page.getByText('Build the machines.')).toBeVisible();
    await expect(page.getByText('Wake the town.')).toBeVisible();
    await expect(page.getByText('Raise the curtain.')).toBeVisible();

    // Chromium without a headset answers isSessionSupported() with false: the page must say so and never fake an XR button.
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none');
    await expect(page.getByRole('button', { name: 'Preview in this browser' })).toBeVisible();
    await expect(page.getByRole('button', { name: /enter mixed reality/i })).toHaveCount(0);
    await expect(page.locator('.wu-slip')).toBeHidden(); // a failed WebGL start would show its error here
    await expect(page.locator('#scene-container canvas')).toHaveCount(1);

    expect(seen.errors).toEqual([]);
    expect(seen.external).toEqual([]);
  });

  test('preview: card gives way to the scene, hint and a way back', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none'); // buttons stay disabled until the world is ready
    await page.getByRole('button', { name: 'Preview in this browser' }).click();

    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'preview');
    await expect(page.locator('.wu-hint')).toContainText('brass gear');
    await expect(page.getByRole('button', { name: 'Back to start' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeHidden();

    await page.getByRole('button', { name: 'Back to start' }).click();
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'landing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('INT-11 (preview): the mouse picks the gear up and it settles back on release', async ({ page }) => {
    await page.goto('./?debug');
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none');
    await page.getByRole('button', { name: 'Preview in this browser' }).click();
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'preview');
    await page.waitForFunction(() => Boolean((window as unknown as { __world?: unknown }).__world));

    // Where is the gear on screen, and where does it rest?
    const probe = () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const world = (window as unknown as { __world: any }).__world;
        const gear = world.getSceneObject('gear-16');
        const p = gear.position;
        const grip = gear.getWorldPosition(gear.position.clone());
        grip.x += 0.018; // a point on the rim: the centre of the gear is its bore, a hole the mouse ray would pass through
        const ndc = grip.project(world.camera);
        const rect = world.renderer.domElement.getBoundingClientRect();
        return {
          local: [p.x, p.y, p.z],
          screen: [rect.left + ((ndc.x + 1) / 2) * rect.width, rect.top + ((1 - ndc.y) / 2) * rect.height],
        };
      });

    const rest = await probe();
    const [x, y] = rest.screen;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y - 40, { steps: 12 });
    await page.waitForTimeout(150);
    const held = await probe();
    const moved = Math.hypot(...held.local.map((v, i) => v - rest.local[i]));
    expect(moved, 'gear should follow the dragged mouse').toBeGreaterThan(0.01);

    await page.mouse.up();
    await page.waitForTimeout(900); // 0.35 s settle + margin
    const back = await probe();
    const drift = Math.hypot(...back.local.map((v, i) => v - rest.local[i]));
    expect(drift, 'gear should settle back to its rest pose').toBeLessThan(0.002);
  });
});
