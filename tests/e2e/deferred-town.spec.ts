/* eslint-disable @typescript-eslint/no-explicit-any -- these specs reach into the ?debug world handle */
import { expect, test, type Page } from '@playwright/test';

/**
 * The town's models (4.4 MiB, 8 GLBs) load AFTER the landing's buttons work for a first-time player, because the town stays hidden until
 * the trunk opens (src/index.ts `deferTown`, src/gameplay.ts `attachTown`). A returning player's town is on show at once, so for them the
 * buttons still wait for it. Runs against `vite preview` (the config builds and serves the production bundle).
 */
const TOWN_GROUND = '**/assets/models/tockton/environment/town_ground.glb';

// Software rendering with several workers at once makes a page load take a minute; the default 60 s is for a quiet machine.
test.setTimeout(180_000);

/** Resolves the page's `townReady` (the debug handle's promise for the town runtime) and reports whether the town group is shown. */
const townShown = (page: Page) =>
  page.evaluate(async () => {
    const wu = (window as any).__wu;
    await wu.townReady;
    return wu.town.town.group.visible as boolean;
  });

test.describe('the town loads after the page is usable (first-time player)', () => {
  test('the buttons work, the preview opens and the trunk opens while the town is still downloading; the town is shown when it arrives', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    // Hold the town's ground GLB: until it is let through the town cannot finish loading, however fast the rest is.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let asked = false;
    await page.route(TOWN_GROUND, async (route) => {
      asked = true;
      await held;
      await route.continue();
    });

    await page.goto('./?debug');
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none', { timeout: 90_000 });
    const preview = page.getByRole('button', { name: 'Preview in this browser' });
    await expect(preview).toBeEnabled({ timeout: 30_000 }); // usable without the town: this is the point
    await expect.poll(() => asked, { message: 'the town starts loading once the page is usable', timeout: 30_000 }).toBe(true);
    expect(await page.evaluate(() => (window as any).__wu.town)).toBeNull();

    await preview.click();
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'preview');
    await page.waitForFunction(() => document.getElementById('scene-container')?.getAnimations().length === 0);

    // The trunk answers although there is no town: the lid opens and the story moves on to Letter 1.
    expect(await page.evaluate(() => (window as any).__wu.press('trunk', 'COL_Latch'))).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).__wu.state().mode), { message: 'the latch press opens the trunk', timeout: 15_000 }).toBe('town');
    expect(await page.evaluate(() => (window as any).__wu.state().letter)).toBe('letter_1');
    expect(await page.evaluate(() => (window as any).__wu.town)).toBeNull(); // still not in

    // The town arrives: it is shown at once, because the trunk has opened.
    release();
    expect(await townShown(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('a town that arrives before the trunk opens stays hidden until it does', async ({ page }) => {
    await page.goto('./?debug');
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none', { timeout: 90_000 });
    expect(await townShown(page)).toBe(false);
    await page.getByRole('button', { name: 'Preview in this browser' }).click();
    await page.waitForFunction(() => document.getElementById('scene-container')?.getAnimations().length === 0);
    expect(await page.evaluate(() => (window as any).__wu.press('trunk', 'COL_Latch'))).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).__wu.town.town.group.visible), { timeout: 15_000 }).toBe(true);
  });
});

test.describe('a town that cannot be loaded', () => {
  test('is reported on the page, which stays usable, and whatever waits for the town hears the failure', async ({ page }) => {
    await page.route(TOWN_GROUND, (route) => route.abort());
    await page.goto('./?debug');
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none', { timeout: 90_000 });
    await expect(page.locator('.wu-slip')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.wu-slip')).toContainText('The town could not be unpacked');
    await expect(page.getByRole('button', { name: 'Preview in this browser' })).toBeEnabled(); // the trunk and the stand still work
    expect(await page.evaluate(() => (window as any).__wu.town)).toBeNull();
    // `townReady` rejects: the bench steps that need the town stop with that error and say so, they do not carry on as if it stood.
    expect(await page.evaluate(() => (window as any).__wu.townReady.then(() => 'in', () => 'failed'))).toBe('failed');
  });
});

test.describe('a returning player waits for the town', () => {
  test('after the trunk has been opened once, the buttons stay locked until the town stands in the scene', async ({ page }) => {
    await page.goto('./?debug');
    await expect(page.getByRole('button', { name: 'Preview in this browser' })).toBeEnabled({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Preview in this browser' }).click();
    await page.waitForFunction(() => document.getElementById('scene-container')?.getAnimations().length === 0);
    expect(await page.evaluate(() => (window as any).__wu.press('trunk', 'COL_Latch'))).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).__wu.state().mode), { timeout: 15_000 }).toBe('town');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Preview in this browser' })).toBeEnabled({ timeout: 90_000 });
    // The moment the button works the town is in, and on show: the save says the trunk was opened.
    const state = await page.evaluate(() => {
      const wu = (window as any).__wu;
      return { town: wu.town !== null, visible: wu.town?.town.group.visible as boolean | undefined, mode: wu.state().mode as string };
    });
    expect(state).toEqual({ town: true, visible: true, mode: 'town' });
  });
});
