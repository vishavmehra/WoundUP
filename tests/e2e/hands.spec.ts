import { expect, test } from '@playwright/test';
import {
  assembleByHand,
  carryToPlot,
  grabbedParts,
  listParts,
  MUSIC_BOX_SOCKETS,
  openTrunkAndSetBench,
  pullByHand,
  removeKeyGrabHandle,
  runMachine,
  seatByHand,
  windByHand,
  windByHelper,
} from './support/flow';
import { frames, gameState, GPU_ARGS, Hand, openGame, partPose, press, requireDevRuntime, waitForMode, type Vec3 } from './support/xr';

/**
 * Hand-driven end-to-end tests in the emulated Quest 3 (IWER). EMULATOR evidence, never headset evidence.
 *
 * "Real hand" below means IWER hand input: the headset is switched to hand tracking, a hand is placed by its grip, the
 * thumb and index pinch is ramped (a select starts at 0.9), and IWSDK's own grab system, our snap system and our wind system
 * react to it exactly as they would to Quest hand tracking. "Debug helper" means `window.__wu` (the opt-in ?debug handle): it
 * presses UI targets and shortcuts steps a hand cannot do yet. Every test name says which steps are which.
 *
 * Needs the IWSDK dev runtime on localhost:8081 and the real GPU (the config's SwiftShader runs the emulator at 1 frame per second).
 */
test.use({ launchOptions: { args: GPU_ARGS }, viewport: { width: 960, height: 540 } });
test.setTimeout(300_000);

test.beforeAll(async ({ request }) => {
  await requireDevRuntime(request);
});

/** Frozen town -> bench with the 12 parts in the tray, hands switched on. UI presses go through the debug helper. */
async function toBench(page: import('@playwright/test').Page): Promise<Hand> {
  await openGame(page);
  await Hand.enable(page);
  await openTrunkAndSetBench(page);
  return new Hand(page, 'right');
}

test.describe('Music Box by hand (IWER hands; UI presses and Run through the debug helper)', () => {
  test('REAL HANDS pinch-grab and seat all 12 parts, pull one out and seat it again, carry the finished machine onto its plot; WIND and RUN by debug helper', async ({ page }) => {
    const hand = await toBench(page);
    const state0 = await gameState(page);
    expect(state0.mode).toBe('build');
    expect(state0.build).toMatchObject({ blueprint: 'music_box', parts: 12, seated: 0, fixed: 0 });

    // Where every part lies in the tray, to check a pulled part comes home.
    const tray = new Map<string, Vec3>();
    for (const p of await listParts(page)) tray.set(`${p.name}#${p.index}`, (await partPose(page, p)).origin);
    expect(tray.size).toBe(12);

    await test.step('REAL HAND: pinch-grab each of the 12 parts from the tray, carry it to its socket, release; each one snaps', async () => {
      const reports = await assembleByHand(page, hand);
      expect(reports).toHaveLength(MUSIC_BOX_SOCKETS.length);
      reports.forEach((r, i) => {
        expect(r.grabbed, `${r.part.name}: the pinch took the part (Grabbed)`).toBe(true);
        expect(r.releasedAt, `${r.part.name}: released within the 4 cm snap radius of ${r.socket}`).toBeLessThan(0.04);
        expect(r.snapped, `${r.part.name}: SnappedTo after release`).toBe(true);
        expect(r.seatedAfter, `${r.part.name}: the game counts it`).toBe(i + 1);
      });
      await waitForMode(page, 'wind');
      const s = await gameState(page);
      expect(s.build?.seated).toBe(12);
      expect(s.mode).toBe('wind');
    });

    await test.step('REAL HAND: pull the 20-tooth wheel out of its socket; it leaves, the build reopens, the part goes back to the tray', async () => {
      const wheel = (await listParts(page)).find((p) => p.name.startsWith('gear_spur_20_m1'));
      if (!wheel) throw new Error('no 20-tooth wheel');
      const home = tray.get(`${wheel.name}#${wheel.index}`) as Vec3;
      const pull = await pullByHand(page, hand, wheel, home);
      expect(pull.seatedBefore).toBe(12);
      expect(pull.snappedWhileHeld, 'SnappedTo is gone while the hand holds it 10 cm out').toBe(false);
      expect(pull.seatedWhileHeld, 'the game counts 11').toBe(11);
      expect(pull.backInTray, 'let go in the air, it returns to its tray slot (metres)').toBeLessThan(0.01);
      expect((await gameState(page)).mode, 'a missing part sends Wind back to Build').toBe('build');
      expect((await gameState(page)).build?.seated).toBe(11);
    });

    await test.step('REAL HAND: seat the wheel again; the build completes and Wind opens', async () => {
      const r = await seatByHand(page, hand, 'SOCKET_GearB', 'gear_spur_20_m1');
      expect(r.snapped).toBe(true);
      await waitForMode(page, 'wind');
      expect((await gameState(page)).build?.seated).toBe(12);
    });

    await test.step('DEBUG HELPER: wind the key to 8 units (real-hand wind is BUG-1, see the next tests); press Run (debug helper)', async () => {
      await windByHelper(page, 8);
      await frames(page, 4);
      expect((await gameState(page)).windUnits).toBe(8);
      await runMachine(page);
      const s = await gameState(page);
      expect(s.mode).toBe('place');
      expect(s.carried).toBe(true);
    });

    await test.step('REAL HAND: carry the finished machine by its base handle and drop it on its plot; it seats, the town wakes, the next letter comes', async () => {
      const carry = await carryToPlot(page, hand, 'music_box', 'SOCKET_PlotMusicBox');
      expect(carry.grabbed, 'the pinch on the base handle picked the machine up').toBe(true);
      expect(carry.releasedAt, 'released within the 4 cm snap radius of its plot (metres)').toBeLessThan(0.04);
      expect(carry.modeAfter).toBe('town');
      expect(carry.placedAfter).toContain('music_box');
      const saved = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wu = (window as any).__wu;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const machine = wu.session.save.machines.find((m: any) => m.blueprintId === 'music_box');
        return { placed: machine?.placed, plot: machine?.plotId, letter: wu.session.letter?.id };
      });
      expect(saved).toEqual({ placed: true, plot: 'plot_music_box', letter: 'letter_2' });
    });
  });

  // BUG-1. A pinch on the seated key near-grabs it as well (IWSDK's grab sphere is 7 cm around the palm, the key's collider is
  // inside it), WindSystem.tryStart then sees a held part on that hand and refuses to start, and the twist drags the key out of its
  // socket. `test.fail` keeps the suite green while the bug stands and turns red ("expected to fail but passed") when it is fixed.
  test.fail('BUG-1 REAL HAND: a pinch on the seated key and a 360 degree wrist twist wind it (expected to FAIL today: the same pinch grabs the key, WindSystem refuses, the key leaves its socket)', async ({ page }) => {
    const hand = await toBench(page);
    await page.evaluate(() => (window as unknown as { __wu: { seatAll(): number } }).__wu.seatAll()); // DEBUG HELPER: seat the other 11 parts quickly
    await waitForMode(page, 'wind');
    await frames(page, 10);
    const report = await windByHand(page, hand, 1, 360);
    test.info().annotations.push({ type: 'bug-1', description: `grabbed at pinch: ${report.grabbedAtPinch.join(', ') || 'nothing'}; units after the twist: ${report.units.join(',')}; seated after: ${report.seatedAfter} of 12` });
    expect(report.grabbedAtPinch, 'the pinch must not grab the key it winds').not.toContain('winding_key_polished_brass');
    expect(report.units[0], 'one full wrist turn is at least 3 wind units').toBeGreaterThanOrEqual(3);
    expect(report.seatedAfter, 'winding leaves all 12 parts seated').toBe(12);
  });

  test('DIAGNOSTIC REAL HAND: with the key out of the grab system the same wrist twist winds it (isolates BUG-1 to the near-grab): 2 x 360 degrees reach 8 units, then Run works', async ({ page }) => {
    const hand = await toBench(page);
    await page.evaluate(() => (window as unknown as { __wu: { seatAll(): number } }).__wu.seatAll()); // DEBUG HELPER: seat the other 11 parts quickly
    await waitForMode(page, 'wind');
    await frames(page, 10);
    await removeKeyGrabHandle(page); // DIAGNOSTIC: the pinch cannot capture the key now
    const report = await windByHand(page, hand, 2, 360);
    test.info().annotations.push({ type: 'wind', description: `units after each 360 degree twist: ${report.units.join(', ')}` });
    expect(await grabbedParts(page), 'nothing is held after the let-go').toEqual([]);
    expect(report.grabbedAtPinch, 'the pinch grabbed nothing').toEqual([]);
    expect(report.units[0], 'first full turn: at least 3 units').toBeGreaterThanOrEqual(3);
    expect(report.units[0]).toBeLessThanOrEqual(4);
    expect(report.units[1], 'second full turn tops it up').toBeGreaterThanOrEqual(7);
    expect(report.units[1]).toBeLessThanOrEqual(8);
    expect(report.seatedAfter).toBe(12);
    expect((await gameState(page)).windUnits).toBe(report.units[1]);
    await press(page, 'UI_Run'); // DEBUG HELPER
    await waitForMode(page, 'place');
  });
});
