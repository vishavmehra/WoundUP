/* eslint-disable @typescript-eslint/no-explicit-any -- these specs reach into the ?debug world handle */
import { expect, test, type Page } from '@playwright/test';
import { whenActive } from './support/flow';
import { press, pressWhenReady } from './support/xr';

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

/** What the player is told about the town (the flow UI's view) and whether its slip and retry plaque are really shown in the scene. */
const townCue = (page: Page) =>
  page.evaluate(() => {
    const world = (window as any).__world;
    const shown = (name: string): boolean => {
      const object = world.scene.getObjectByName(name);
      for (let n = object; n; n = n.parent) if (!n.visible) return false;
      return Boolean(object);
    };
    return { cue: (window as any).__wu.ui.currentView.townCue as string, slip: shown('UI_TownWait'), retry: shown('UI_TownRetry') };
  });
const townLoad = (page: Page) => page.evaluate(() => (window as any).__wu.townLoad() as string);

/** Opens the 2D preview and presses the trunk's latch, as the first thing a player does; the story moves on to Letter 1. */
async function openTrunk(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Preview in this browser' }).click();
  await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'preview');
  await page.waitForFunction(() => document.getElementById('scene-container')?.getAnimations().length === 0);
  expect(await press(page, 'trunk', 'COL_Latch')).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__wu.state().mode), { message: 'the latch press opens the trunk', timeout: 15_000 }).toBe('town');
}

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

    // The player is told: "Waking Tockton…" over the town (no retry: nothing has failed), not an empty table.
    await expect.poll(() => townCue(page), { message: 'the wait cue shows once the trunk has opened', timeout: 15_000 }).toEqual({ cue: 'waiting', slip: true, retry: false });
    expect(await townLoad(page)).toBe('loading');

    // The town arrives: it is shown at once, because the trunk has opened, the cue goes, and the town settles to its size instead of popping.
    release();
    expect(await townShown(page)).toBe(true);
    await expect.poll(() => townCue(page), { message: 'the cue goes once the town is in', timeout: 15_000 }).toEqual({ cue: 'none', slip: false, retry: false });
    expect(await townLoad(page)).toBe('ready');
    await expect
      .poll(() => page.evaluate(() => (window as any).__wu.town.town.group.scale.x as number), { message: 'the late town settles to its full size', timeout: 15_000 })
      .toBeCloseTo(1, 3);
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
    // `townReady` does not resolve: the bench steps that need the town wait, they do not carry on as if it stood.
    expect(await townLoad(page)).toBe('failed');
    expect(await page.evaluate(() => Promise.race([(window as any).__wu.townReady.then(() => 'in'), new Promise((resolve) => setTimeout(() => resolve('waiting'), 500))]))).toBe('waiting');
  });

  test('the player in the town is told, the bench waits, and "Try again" brings the town and the workbench', async ({ page }) => {
    let failing = true;
    let asked = 0;
    await page.route(TOWN_GROUND, async (route) => {
      asked++;
      if (failing) await route.abort();
      else await route.continue();
    });
    await page.goto('./?debug');
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none', { timeout: 90_000 });
    await expect.poll(() => townLoad(page), { message: 'the first attempt fails', timeout: 30_000 }).toBe('failed');
    await openTrunk(page);

    // A calm message, not a silent empty table, and the plaque to try again.
    await expect.poll(() => townCue(page), { timeout: 15_000 }).toEqual({ cue: 'failed', slip: true, retry: true });
    expect(await page.evaluate(() => (window as any).__wu.town)).toBeNull();

    // The story goes on: the letter is read and the parcel opened. The workbench cannot be set without the town, and says nothing false.
    await page.waitForFunction(() => (window as any).__wu.ui.localFlow.trunk === 'gone', null, { timeout: 30_000, polling: 100 });
    await pressWhenReady(page, 'envelope');
    await whenActive(page, 'UI_Accept');
    expect(await press(page, 'UI_Accept')).toBe(true);
    await pressWhenReady(page, 'parcel');
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => (window as any).__wu.state().build)).toBeNull();
    expect((await townCue(page)).cue).toBe('failed');

    // The retry loads the town again. The plaque goes at once (a second press would load it twice), "Waking Tockton…" takes its place ...
    const before = asked;
    failing = false;
    expect(await press(page, 'UI_TownRetry')).toBe(true);
    expect((await townCue(page)).retry).toBe(false);
    // ... and then the town is in, shown, the landing's own failure notice is gone, and the bench that was waiting is set.
    await expect.poll(() => townLoad(page), { message: 'the retry brings the town', timeout: 60_000 }).toBe('ready');
    expect(asked).toBeGreaterThan(before); // the files were fetched again, not remembered as failed
    expect(await townCue(page)).toEqual({ cue: 'none', slip: false, retry: false });
    expect(await townShown(page)).toBe(true);
    await expect(page.locator('.wu-slip')).toBeHidden();
    await page.waitForFunction(() => (window as any).__wu.state().build?.parts > 0, null, { timeout: 60_000, polling: 100 });
  });

  test('a retry that fails again leaves the message and the plaque up', async ({ page }) => {
    await page.route(TOWN_GROUND, (route) => route.abort());
    await page.goto('./?debug');
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none', { timeout: 90_000 });
    await expect.poll(() => townLoad(page), { timeout: 30_000 }).toBe('failed');
    await openTrunk(page);
    await expect.poll(() => townCue(page), { timeout: 15_000 }).toEqual({ cue: 'failed', slip: true, retry: true });
    expect(await press(page, 'UI_TownRetry')).toBe(true);
    await expect.poll(() => townCue(page), { message: 'it fails again, and says so again', timeout: 60_000 }).toEqual({ cue: 'failed', slip: true, retry: true });
    expect(await townLoad(page)).toBe('failed');
    expect(await page.evaluate(() => (window as any).__wu.town)).toBeNull();
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
