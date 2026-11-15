/* eslint-disable @typescript-eslint/no-explicit-any -- these specs reach into the ?debug world handle and the emulator's device */
import { expect, test, type Page } from '@playwright/test';
import { listParts, openTrunkAndSetBench } from './support/flow';
import { hasComponent } from './support/xr';

/**
 * "Play in your browser": the emulated Quest 3 (IWER) on the PRODUCTION build, for visitors without a headset. Runs against
 * `vite preview` (the config builds and serves it), not the dev runtime: nothing here is injected by the IWSDK dev plugin.
 * EMULATOR evidence, never headset evidence. Software rendering runs the emulated headset at about one frame per second.
 */
test.setTimeout(300_000);

const stageFromEyes = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__world;
    const head = w.player.head.getWorldPosition(w.camera.position.clone());
    const stage = w.getSceneObject('stage').getWorldPosition(w.camera.position.clone());
    return { ahead: Math.hypot(stage.x - head.x, stage.z - head.z) as number, below: (head.y - stage.y) as number, visible: w.getSceneObject('stage').visible as boolean };
  });

/** Every http(s) request the page makes (data: and blob: never leave the machine). */
function watchRequests(page: Page): { origins: Set<string>; urls: string[] } {
  const origins = new Set<string>();
  const urls: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!u.protocol.startsWith('http')) return;
    origins.add(u.origin);
    urls.push(r.url());
  });
  return { origins, urls };
}

const PLAY = 'Play in your browser (emulated Quest 3)';

test.describe('no WebXR: Play in your browser', () => {
  test('enters the emulated Quest 3 on the production build, puts the town on the stand, and asks nothing of any other origin', async ({ page, baseURL }, testInfo) => {
    const seen = watchRequests(page);
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('./?debug');
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none', { timeout: 90_000 });
    const play = page.getByRole('button', { name: PLAY });
    await expect(play).toBeVisible();
    // The old actions are still there, and the emulator is not loaded until it is asked for.
    await expect(page.getByRole('button', { name: 'Preview in this browser' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy link to open on Quest' })).toBeVisible();
    expect(await page.evaluate(() => 'IWER_DEVICE' in window)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('1-landing.png') });

    await play.click();
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'xr', { timeout: 90_000 });
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'emulated');

    // A real immersive-ar session on the emulated device, hands first, with the features the table placement asks for.
    await expect.poll(() => page.evaluate(() => (window as any).__world.session != null), { timeout: 30_000 }).toBe(true);
    const session = await page.evaluate(() => {
      const s = (window as any).__world.session;
      return {
        features: [...(s.enabledFeatures ?? [])] as string[],
        sources: [...s.inputSources].map((i: any) => `${i.hand ? 'hand' : 'controller'}-${i.handedness}`) as string[],
        device: (window as any).IWER_DEVICE.name as string,
        mode: (window as any).IWER_DEVICE.primaryInputMode as string,
      };
    });
    expect(session.device).toMatch(/Quest 3/);
    expect(session.mode).toBe('hand');
    expect(session.features).toEqual(expect.arrayContaining(['hand-tracking', 'plane-detection', 'anchors']));
    expect(session.sources.sort()).toEqual(['hand-left', 'hand-right']);

    // The emulated room has no table, so the town stands on the velvet stand: ~55 cm ahead and ~38 cm below the eyes (PRODUCT_SPEC 3.2).
    await expect.poll(() => stageFromEyes(page).then((s) => s.visible), { timeout: 60_000 }).toBe(true);
    const stage = await stageFromEyes(page);
    expect(stage.ahead).toBeCloseTo(0.55, 1);
    expect(stage.below).toBeCloseTo(0.38, 1);

    // The game's own hand models arrive from this origin, never from a CDN (CLAUDE.md 16).
    await expect.poll(() => seen.urls.filter((u) => u.includes('generic-hand')).length, { timeout: 30_000 }).toBeGreaterThan(0);

    // The help card labels the mode honestly and can be put away and brought back.
    const card = page.getByRole('region', { name: 'Emulated Quest 3' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('not a real one');
    await expect(page.locator('.wu-emu-room')).toBeVisible();
    await page.waitForTimeout(1500); // let a few frames reach the screen
    await page.screenshot({ path: testInfo.outputPath('2-emulated-session.png') });
    await page.getByRole('button', { name: 'Hide the controls card' }).click();
    await expect(card).toBeHidden();
    const tab = page.getByRole('button', { name: 'Emulated Quest 3: controls' });
    await expect(tab).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('3-card-put-away.png') });
    await tab.click();
    await expect(card).toBeVisible();

    // Leaving the session brings the landing back, still labelled as the emulated headset.
    await page.evaluate(() => (window as any).__world.exitXR());
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'landing', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Enter mixed reality (emulated)' })).toBeVisible();
    await expect(page.getByRole('button', { name: /play in your browser/i })).toHaveCount(0);
    await expect(page.locator('.wu-msg > span.on')).toContainText('not a real one');
    await page.screenshot({ path: testInfo.outputPath('4-landing-after.png') });

    expect(errors).toEqual([]);
    // Nothing but the preview server answered: no CDN, no font host, no telemetry (the IWER panel's links only open when clicked).
    expect([...seen.origins]).toEqual([new URL(baseURL ?? page.url()).origin]);
  });

  test('the emulated headset has hands, so parts are grabbed by pinch and not by the mouse ray', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 }); // software rendering: fewer pixels, more frames
    await page.goto('./?debug');
    await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none', { timeout: 90_000 });
    await page.getByRole('button', { name: PLAY }).click();
    await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'xr', { timeout: 90_000 });
    await page.waitForFunction(() => (window as any).__world.getSceneObject('stage').visible, null, { timeout: 60_000 });

    // The parts are made when the parcel opens, long after the page chose its grab component (ADR-024); they must follow the new headset.
    await openTrunkAndSetBench(page); // the trunk, letter and parcel go through the ?debug helper, as in the other specs
    // The intricate build (ADR-050) seats the spring's anchor itself at Relaxed: a piece the game seats is not grabbable (no ReturnsToRest), so it is not one the hand takes.
    const parts: Awaited<ReturnType<typeof listParts>> = [];
    for (const part of await listParts(page)) if (await hasComponent(page, part, 'ReturnsToRest')) parts.push(part);
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(await hasComponent(page, part, 'OneHandGrabbable'), `${part.name} near grab`).toBe(true);
      expect(await hasComponent(page, part, 'DistanceGrabbable'), `${part.name} mouse ray`).toBe(false);
    }
  });
});

test.describe('real WebXR is never emulated over', () => {
  for (const [mode, support, button] of [
    ['immersive-ar', 'ar', 'Enter mixed reality'],
    ['immersive-vr', 'vr', 'Enter in VR (no passthrough)'],
  ] as const) {
    test(`the action is absent when the browser reports ${mode} support`, async ({ page }) => {
      await page.addInitScript((modes: readonly string[]) => {
        const xr = {
          isSessionSupported: (m: string) => Promise.resolve(modes.includes(m)),
          requestSession: () => Promise.reject(new DOMException('fake', 'NotSupportedError')),
          offerSession: () => Promise.reject(new DOMException('fake', 'NotSupportedError')),
          addEventListener: () => {},
          removeEventListener: () => {},
        };
        Object.defineProperty(navigator, 'xr', { value: xr, configurable: true });
      }, [mode]);
      await page.goto('./');
      await expect(page.locator('.wu')).toHaveAttribute('data-support', support, { timeout: 90_000 });
      await expect(page.getByRole('button', { name: button })).toBeVisible();
      await expect(page.getByRole('button', { name: /play in your browser/i })).toHaveCount(0);
      await expect(page.locator('.wu-emu')).toBeHidden();
    });
  }
});
