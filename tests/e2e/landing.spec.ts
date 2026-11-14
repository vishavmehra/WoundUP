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
    await expect(page.locator('.wu-hint')).toContainText('trunk latch');
    await expect(page.getByRole('button', { name: 'Back to start' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeHidden();

    await page.getByRole('button', { name: 'Back to start' }).click();
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'landing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('reduced motion: keyboard focus follows the preview in and back out', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none');
    const preview = page.getByRole('button', { name: 'Preview in this browser' });
    const back = page.getByRole('button', { name: 'Back to start' });

    await preview.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'preview');
    await expect(back).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'landing');
    await expect(preview).toBeFocused();
  });

  test('INT-11 (preview): the mouse presses the trunk latch and the town unfolds', async ({ page }) => {
    await page.goto('./?debug');
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Preview in this browser' }).click();
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'preview');
    await page.waitForFunction(() => Boolean((window as unknown as { __wu?: unknown }).__wu));
    await page.waitForFunction(() => document.getElementById('scene-container')?.getAnimations().length === 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = () => page.evaluate(() => (window as any).__wu.state() as { mode: string; letter: string | null });
    expect((await state()).mode).toBe('intro');

    // Where is the latch on screen? The trunk is the one prop in view: the town stays hidden until it opens.
    const at = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const world = (window as any).__world;
      const latch = world.getSceneObject('stage').getObjectByName('COL_Latch');
      const ndc = latch.getWorldPosition(world.camera.position.clone()).project(world.camera);
      const rect = world.renderer.domElement.getBoundingClientRect();
      return [rect.left + ((ndc.x + 1) / 2) * rect.width, rect.top + ((1 - ndc.y) / 2) * rect.height];
    });
    await page.mouse.move(at[0], at[1]);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(async () => (await state()).mode, { message: 'the latch press opens the trunk', timeout: 15_000 }).toBe('town');
    expect((await state()).letter).toBe('letter_1');
  });
});
