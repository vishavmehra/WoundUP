import { expect, test, type Page } from '@playwright/test';
import { listParts, openTrunkAndSetBench, seatByHand, type ListedPart } from './support/flow';
import { DEV_URL, frames, GPU_ARGS, Hand, hasComponent, nodePosition, openGame, partPose, press, requireDevRuntime } from './support/xr';

/**
 * The ghost-hand onboarding (PRODUCT_SPEC F15, §15; INTERACTION_SPEC §17) in the emulated Quest 3 (IWER), with the gaze and ray variants (ray mode itself is ray-mode.spec.ts). EMULATOR
 * evidence, never headset evidence. "Real hand" is IWER hand input; "debug helper" is the opt-in ?debug handle (`window.__wu`), which here
 * presses the UI and reads the guide's state. Needs the IWSDK dev runtime on localhost:8081 and the real GPU.
 */
test.use({ launchOptions: { args: GPU_ARGS }, viewport: { width: 960, height: 540 } });
test.setTimeout(240_000);

test.beforeAll(async ({ request }) => {
  await requireDevRuntime(request);
});

/* eslint-disable @typescript-eslint/no-explicit-any -- reaches into the opt-in ?debug handles (__world, __wu) */
interface Cue {
  lesson: string;
  kind: string;
  t: number;
  variant: string;
  hand: boolean;
  pulses: number;
}
type Point = { x: number; y: number; z: number };
const cueOf = (page: Page): Promise<Cue | null> => page.evaluate(() => (window as any).__wu.guide());
const learnedOf = (page: Page): Promise<{ learned: string[]; tracker: string[] }> => page.evaluate(() => (window as any).__wu.lessons());

/** What the scene holds of the guide: the hand (visible, where, how opaque), the pulses, the beam, the ghost of the carried part. */
const ghosts = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__world;
    const find = (pick: (n: any) => boolean): any[] => {
      const out: any[] = [];
      w.scene.traverse((n: any) => pick(n) && out.push(n));
      return out;
    };
    const visibleInTree = (n: any): boolean => {
      for (let p = n; p; p = p.parent) if (p.visible === false) return false;
      return true;
    };
    const at = (n: any): Point => {
      const p = n.getWorldPosition(w.camera.position.clone());
      return { x: p.x, y: p.y, z: p.z };
    };
    const hand = find((n) => n.name === 'GhostHand')[0];
    const skinned = hand ? find((n) => n.isSkinnedMesh && visibleInTree(hand) !== undefined && hand.getObjectById(n.id))[0] : undefined;
    // GhostPreview (the ghost of a carried part) builds meshes of opacity 0.5 at render order 10 outside the hand.
    const partGhosts = find((n) => n.isMesh && n.renderOrder === 10 && n.material?.opacity === 0.5 && visibleInTree(n) && !(hand && hand.getObjectById(n.id)));
    return {
      handVisible: hand ? visibleInTree(hand) : false,
      hand: hand ? at(hand) : null,
      opacity: skinned ? skinned.material.opacity : null,
      pulses: find((n) => n.name === 'GhostPulse' && visibleInTree(n)).map((n) => ({ ...at(n), radius: n.scale.x })),
      beam: find((n) => n.name === 'GhostBeam' && visibleInTree(n)).length,
      partGhosts: partGhosts.length,
    };
  });

/** Waits until a cue is on show and `test` holds for it (polling the page). */
const waitForCue = (page: Page, check: (cue: any) => boolean, timeout = 20_000): Promise<unknown> =>
  page.waitForFunction((src) => { const c = (window as any).__wu.guide(); return c !== null && new Function('c', `return (${src})(c)`)(c); }, check.toString(), { timeout, polling: 50 });

async function toBench(page: Page): Promise<Hand> {
  await openGame(page);
  await Hand.enable(page);
  await openTrunkAndSetBench(page);
  return new Hand(page, 'right');
}

/** Switches a pointer mode on from the pause menu, as a player does (debug-helper presses), and resumes. */
async function chooseMode(page: Page, toggle: 'UI_Toggle_gazeMode' | 'UI_Toggle_rayMode'): Promise<void> {
  expect(await press(page, 'UI_Pause')).toBe(true);
  await frames(page, 4);
  expect(await press(page, toggle)).toBe(true);
  await press(page, 'UI_PanelLeft'); // Resume
  await frames(page, 4);
}

const trayPositions = (page: Page): Promise<Point[]> =>
  page.evaluate(() => {
    const w = (window as any).__world;
    return w
      .getSceneObject('stage')
      .children.filter((c: any) => w.entityManager.getEntityByIndex(c.entityIdx)?.getComponents().some((x: any) => x.id === 'SnapPart'))
      .map((c: any) => {
        const p = c.getWorldPosition(w.camera.position.clone());
        return { x: p.x, y: p.y, z: p.z };
      });
  });
const samePositions = (a: Point[], b: Point[]): boolean => a.length === b.length && a.every((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y, p.z - b[i].z) < 1e-9);

test('FIRST BUILD (real hand): the ghost hand shows the pinch to the next socket and pulses it, moves nothing, and the first real seat is saved as learned', async ({ page }) => {
  const hand = await toBench(page);
  await waitForCue(page, (c) => c.lesson === 'grab');
  expect((await cueOf(page)) as Cue).toMatchObject({ lesson: 'grab', kind: 'first', variant: 'hands' });

  const before = await trayPositions(page);
  await page.waitForFunction(() => { const c = (window as any).__wu.guide(); return c === null || c.t > 2.6; }, null, { timeout: 15_000, polling: 40 });
  const mid = await ghosts(page);
  expect(mid.handVisible && (mid.opacity ?? 0) > 0.3, 'a translucent hand is on show during the carry').toBe(true);
  expect(mid.pulses.length, 'the target pulses').toBeGreaterThanOrEqual(1);
  expect(mid.partGhosts, 'a ghost of the part travels with the pinch').toBeGreaterThan(0);
  expect(samePositions(before, await trayPositions(page)), 'the demonstration moved no part of the player').toBe(true);

  // The first showing plays out (5.2 s) and takes everything with it.
  await page.waitForFunction(() => (window as any).__wu.guide() === null, null, { timeout: 15_000, polling: 40 });
  const after = await ghosts(page);
  expect(after.handVisible, 'the hand is gone when the showing ends').toBe(false);
  expect(after.pulses).toEqual([]);
  expect(after.partGhosts).toBe(0);

  expect((await learnedOf(page)).learned).toEqual(['latch', 'letter', 'parcel']); // the flow's debug-helper presses; nothing about a part yet
  const report = await seatByHand(page, hand, 'SOCKET_BracketL', 'bracket_support');
  expect(report.snapped).toBe(true);
  const learned = await learnedOf(page);
  expect(learned.learned, 'a hand seating a part is the lesson done').toEqual(['latch', 'letter', 'parcel', 'grab']);
  expect(learned.tracker).toEqual(['latch', 'letter', 'parcel', 'grab']);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('woundup.save') ?? '{}'));
  expect(stored.learned, 'remembered in the save').toEqual(['latch', 'letter', 'parcel', 'grab']);
});

test('TRUNK (real hand): nothing shows before the stage stands; then the ghost hand pokes the latch with the pulse on it, and opening the trunk is the lesson done', async ({ page }) => {
  // Before the session starts, and while the stage is still hidden (about two seconds into it), no cue may be running.
  await page.goto(DEV_URL);
  await page.locator('.wu').waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector('.wu')?.getAttribute('data-support') === 'ar', null, { timeout: 120_000 });
  expect(await cueOf(page), 'no cue on the landing page').toBeNull();
  await page.evaluate(() => {
    const w = (window as any).__world;
    (window as any).__cueBeforeStage = false;
    const tick = (): void => {
      if (!w.getSceneObject('stage').visible && (window as any).__wu.guide() !== null) (window as any).__cueBeforeStage = true;
      (w.session ?? w.renderer.xr.getSession())?.requestAnimationFrame(tick);
    };
    const start = setInterval(() => {
      if (!w.session) return;
      clearInterval(start);
      w.session.requestAnimationFrame(tick);
    }, 5);
  });
  await openGame(page, { loaded: true });
  await Hand.enable(page);
  await waitForCue(page, (c) => c.lesson === 'latch' && c.t > 2);
  expect(await page.evaluate(() => (window as any).__cueBeforeStage), 'no cue while the stage was hidden').toBe(false);
  const latch = await nodePosition(page, 'COL_Latch');
  const g = await ghosts(page);
  expect(g.handVisible, 'the hand is on show').toBe(true);
  expect(g.pulses.length).toBeGreaterThanOrEqual(1);
  expect(Math.hypot(g.pulses[0].x - latch.x, g.pulses[0].y - latch.y, g.pulses[0].z - latch.z), 'the pulse sits on the latch, in the placed town').toBeLessThan(0.05);
  expect((await learnedOf(page)).learned).toEqual([]);
  expect(await press(page, 'trunk', 'COL_Latch')).toBe(true);
  await page.waitForFunction(() => (window as any).__wu.lessons().learned.includes('latch'), null, { timeout: 15_000, polling: 50 });
  expect(await cueOf(page), 'the cue goes once the trunk is open').toBeNull();
  expect((await learnedOf(page)).learned).toEqual(['latch']);
});

test('SAVE (real hand): a lesson learned is remembered after a reload, and a save from before the ghost hands loads', async ({ page }) => {
  const hand = await toBench(page);
  const seated = await seatByHand(page, hand, 'SOCKET_BracketL', 'bracket_support');
  expect(seated.snapped).toBe(true);
  expect((await learnedOf(page)).learned).toEqual(['latch', 'letter', 'parcel', 'grab']);
  await page.reload();
  await openGame(page, { loaded: true });
  expect((await learnedOf(page)).learned, 'the saved lessons are the new session\'s').toEqual(['latch', 'letter', 'parcel', 'grab']);
  expect((await learnedOf(page)).tracker).toEqual(['latch', 'letter', 'parcel', 'grab']);
  // An older save has no `learned` at all: it loads, and every lesson is new.
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('woundup.save') ?? '{}');
    delete save.learned;
    delete save.settings.rayMode;
    localStorage.setItem('woundup.save', JSON.stringify(save));
  });
  await page.reload();
  await openGame(page, { loaded: true });
  expect((await learnedOf(page)).learned).toEqual([]);
  expect(await page.evaluate(() => (window as any).__wu.session.save.settings)).toMatchObject({ rayMode: false });
});

test('FIRST BUILD (real hand): a hand that takes a part while the demonstration plays takes the demonstration away at once', async ({ page }) => {
  const hand = await toBench(page);
  await waitForCue(page, (c) => c.lesson === 'grab' && c.t > 0.5);
  const parts = await listParts(page);
  const part = parts.find((p) => p.name.startsWith('bracket_support') && !p.snapped) as ListedPart;
  const pose = await partPose(page, part);
  await hand.place(pose.grab);
  await frames(page, 2);
  await hand.pinch(1, 0.12);
  await frames(page, 4);
  expect(await hasComponent(page, part, 'Grabbed')).toBe(true);
  expect(await cueOf(page), 'no cue while a hand holds a part').toBeNull();
  const g = await ghosts(page);
  expect(g.handVisible).toBe(false);
  expect(g.pulses).toEqual([]);
  await hand.pinch(0, 0.1);
});

test('IDLE (real hand): twenty seconds without progress show the demonstration again and the socket pulse then stays until a hand acts', async ({ page }) => {
  const hand = await toBench(page);
  await waitForCue(page, (c) => c.lesson === 'grab' && c.kind === 'first');
  const seated = await seatByHand(page, hand, 'SOCKET_BracketL', 'bracket_support');
  expect(seated.snapped).toBe(true);
  expect(await cueOf(page)).toBeNull();
  const t0 = Date.now();
  await waitForCue(page, (c) => c.lesson === 'grab' && c.kind === 'idle', 40_000);
  const waited = (Date.now() - t0) / 1000;
  expect(waited, 'not before about 20 s of nothing').toBeGreaterThan(18);
  expect(waited).toBeLessThan(32);
  // The hand plays out, then only the socket pulse stands.
  await page.waitForFunction(() => { const c = (window as any).__wu.guide(); return c !== null && c.t > 5.6; }, null, { timeout: 15_000, polling: 100 });
  const standing = await ghosts(page);
  expect(standing.handVisible).toBe(false);
  expect(standing.pulses.length).toBe(1);
  // A hand acting takes it away.
  const next = await seatByHand(page, hand, 'SOCKET_BracketR', 'bracket_support');
  expect(next.snapped).toBe(true);
  expect(await cueOf(page)).toBeNull();
  expect((await ghosts(page)).pulses).toEqual([]);
});

for (const mode of ['gaze', 'ray'] as const) {
  test(`${mode.toUpperCase()} MODE: the first demonstration keeps the hand in the air and pinches${mode === 'ray' ? ', with a ray to the target' : ', the target lit'}`, async ({ page }) => {
    await openGame(page);
    await Hand.enable(page);
    await chooseMode(page, mode === 'gaze' ? 'UI_Toggle_gazeMode' : 'UI_Toggle_rayMode');
    const saved = await page.evaluate(() => (window as any).__wu.session.save.settings);
    expect(saved).toMatchObject({ gazeMode: mode === 'gaze', rayMode: mode === 'ray' });
    await openTrunkAndSetBench(page);
    await waitForCue(page, (c) => c.lesson === 'grab');
    expect((await cueOf(page)) as Cue).toMatchObject({ lesson: 'grab', kind: 'first', variant: mode });
    await page.waitForFunction(() => { const c = (window as any).__wu.guide(); return c !== null && c.t > 1.9; }, null, { timeout: 10_000, polling: 40 });
    const g = await ghosts(page);
    expect(g.handVisible).toBe(true);
    expect(g.beam, mode === 'ray' ? 'a ray runs to the target' : 'no ray in gaze mode').toBe(mode === 'ray' ? 1 : 0);
    expect(g.pulses.length).toBeGreaterThanOrEqual(1);
    // The hand stays where it is (by the lap) and only pinches: it does not travel to the part, the ghost of the part does.
    const before = g.hand as Point;
    await page.waitForFunction(() => { const c = (window as any).__wu.guide(); return c !== null && c.t > 3.1; }, null, { timeout: 10_000, polling: 40 });
    const later = await ghosts(page);
    expect(later.handVisible).toBe(true);
    const moved = Math.hypot((later.hand as Point).x - before.x, (later.hand as Point).y - before.y, (later.hand as Point).z - before.z);
    expect(moved, 'the hand did not move while the part travelled').toBeLessThan(0.03);
    expect(later.partGhosts, 'a ghost of the part travels on its own').toBeGreaterThan(0);
  });
}
