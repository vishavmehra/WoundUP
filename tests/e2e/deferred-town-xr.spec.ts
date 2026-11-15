import { expect, test } from '@playwright/test';
import { frames, GPU_ARGS, openGame, press, requireDevRuntime, waitForMode } from './support/xr';

/**
 * A first-time player can enter the headset and open the trunk before the town's models are in (src/index.ts `deferTown`): the page never
 * waits for them, so nothing stops it. EMULATOR evidence (IWER on the IWSDK dev runtime), never headset evidence. The town's ground GLB is
 * held back so the town cannot finish loading however fast the rest is, then let through.
 */
test.use({ launchOptions: { args: GPU_ARGS }, viewport: { width: 1120, height: 630 } });
test.setTimeout(240_000);

test.beforeAll(async ({ request }) => {
  await requireDevRuntime(request);
});

/* eslint-disable @typescript-eslint/no-explicit-any -- reaches into the ?debug handles */

test('headset entered and the trunk opened with no town; the town is shown, in the session, the moment it arrives', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  let asked = false;
  await page.route('**/assets/models/tockton/environment/town_ground.glb', async (route) => {
    asked = true;
    await held;
    await route.continue();
  });

  await openGame(page); // the session is running and the table choice is made, with the town not in
  expect(asked).toBe(true);
  expect(await page.evaluate(() => (window as any).__wu.town)).toBeNull();

  expect(await press(page, 'trunk', 'COL_Latch')).toBe(true);
  await waitForMode(page, 'town');
  await frames(page, 30); // the session keeps drawing, trunk open and no town
  expect(await page.evaluate(() => (window as any).__wu.town)).toBeNull();

  release();
  const shown = await page.evaluate(async () => {
    const wu = (window as any).__wu;
    const town = await wu.townReady;
    return { visible: town.town.group.visible as boolean, scale: town.townScale as number, parented: town.town.group.parent !== null };
  });
  expect(shown.visible).toBe(true); // the trunk had opened: the town is shown at once
  expect(shown.parented).toBe(true);
  expect(shown.scale).toBeGreaterThan(0.5); // the table choice was made while it loaded: it stands at the placement's scale (0.75 to 1)
  await frames(page, 30);
  expect(errors).toEqual([]);
});
