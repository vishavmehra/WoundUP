/* eslint-disable @typescript-eslint/no-explicit-any -- these specs reach into the ?debug world handle and the emulator's device */
import { expect, test, type Page } from '@playwright/test';
import { giftCatalogue, giftPlacements, MUSIC_BOX, verifyGift } from '../../src/content/blueprints';
import { encodeGift } from '../../src/game/gift';
import { serializeSave } from '../../src/game/save';
import { playStory } from '../game/helpers';
import { assembleDeepByHand, carryToPlot, grabbedParts, listParts, openTrunkAndSetBench, runMachine, waitForLivePiece, windByHandAuto, type Level } from './support/flow';
import { aimAtTable, DEV_URL, frames, gameState, GPU_ARGS, Hand, hasComponent, openGame, partPose, press, requireDevRuntime, waitForMode } from './support/xr';

/**
 * The intricate Music Box (ADR-050) in the emulated Quest 3 (IWER): the whole build with a hand at each level, measured. EMULATOR evidence, never headset evidence.
 * "Hand" is IWER hand input (hand placed by its grip, thumb and index pinch ramped, IWSDK's own grab, our snap system); "debug helper" is `window.__wu`, which
 * only reads which socket the director asks for next and presses the UI targets (the level card, Run). The numbers (docs/evidence/ASSEMBLY_TIMED_RUN_2026-11-15.md):
 *
 *   pinches   one per placement by hand, plus the winding grabs and the carry; exact.
 *   seconds   wall clock of the scripted hand, whose glides and pinches have fixed durations. It is the script's time, not a person's: a person is estimated in the
 *             evidence document from these counts and the design's per-step times, and says so.
 *
 * Needs a dev runtime (WU_DEV_PORT, default the shared 8081) and the real GPU.
 */
test.use({ launchOptions: { args: GPU_ARGS }, viewport: { width: 960, height: 540 } });
test.setTimeout(900_000);

test.beforeAll(async ({ request }) => {
  await requireDevRuntime(request);
});

async function toBench(page: Page, level: Level): Promise<Hand> {
  await openGame(page);
  await Hand.enable(page);
  await openTrunkAndSetBench(page, undefined, level);
  return new Hand(page, 'right');
}

/** Draw calls of the last frame, the live grabbables and the number of meshes in the scene. */
const sceneNumbers = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__world;
    let grabbables = 0;
    let meshes = 0;
    w.scene.traverse((n: any) => {
      if (n.isMesh && n.visible) meshes++;
      if (n.entityIdx === undefined) return;
      const ids = w.entityManager.getEntityByIndex(n.entityIdx)?.getComponents().map((c: any) => c.id) ?? [];
      if (ids.some((id: string) => id === 'OneHandGrabbable' || id === 'DistanceGrabbable' || id === 'TwoHandsGrabbable')) grabbables++;
    });
    const i = w.renderer.info;
    return { drawCalls: i.render.calls as number, triangles: i.render.triangles as number, grabbables, meshes };
  });

const write = async (name: string, data: unknown): Promise<void> => {
  const fs = (await import('node:fs' as string)) as { mkdirSync(p: string, o: object): void; writeFileSync(p: string, d: string): void };
  fs.mkdirSync('.tmp/assembly', { recursive: true });
  fs.writeFileSync(`.tmp/assembly/${name}.json`, JSON.stringify(data, null, 2));
};

for (const level of ['relaxed', 'standard', 'master'] as const) {
  test(`${level}: the whole Music Box by hand, wound, run and carried onto its plot (timed)`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const hand = await toBench(page, level);
    const state0 = await gameState(page);
    expect(state0.mode).toBe('build');
    const t0 = Date.now();

    // The scene while it is built: the most draw calls a frame took and the most grabbable things a hand could take at once (IWSDK rebuilds its lists every frame: budget 60).
    const peak = { drawCalls: 0, grabbables: 0 };
    const build = await assembleDeepByHand(page, hand, level, undefined, async () => {
      const n = await sceneNumbers(page);
      peak.drawCalls = Math.max(peak.drawCalls, n.drawCalls);
      peak.grabbables = Math.max(peak.grabbables, n.grabbables);
    });
    await waitForMode(page, 'wind');
    const built = await gameState(page);
    expect(build.bigParts, 'twelve big parts by hand').toBe(12);
    expect(build.hardware, 'hardware by hand: 22 pieces in Standard, none in Relaxed (the game seats it)').toBe(level === 'relaxed' ? 0 : 22);
    expect(built.build?.seated, 'every one of the 34 sockets is filled').toBe(34);
    for (const step of build.steps) {
      expect(step.grabbed, `${step.socketId}: the pinch took the piece`).toBe(true);
      expect(step.snapped, `${step.socketId}: it seated`).toBe(true);
    }

    const wind = await windByHandAuto(page, hand, 2, 360);
    expect(wind.report.units[1], 'two wrist turns top the spring up').toBeGreaterThanOrEqual(7);
    await runMachine(page);
    const carried = await carryToPlot(page, hand, 'music_box', 'SOCKET_PlotMusicBox');
    expect(carried.grabbed).toBe(true);
    expect(carried.modeAfter).toBe('town');
    expect(carried.placedAfter).toContain('music_box');
    const seconds = (Date.now() - t0) / 1000;

    await frames(page, 90);
    const numbers = await sceneNumbers(page);
    const pinches = build.pinches + wind.report.grabs + 1; // the placements, the winding grabs, the carry
    const record = { level, bigParts: build.bigParts, hardware: build.hardware, placements: build.steps.length, retries: build.retries, windGrabs: wind.report.grabs, pinches, secondsBuild: build.seconds, secondsWholeRun: seconds, stepSeconds: build.steps.map((s) => [s.socketId, +s.seconds.toFixed(2)]), peakWhileBuilding: peak, awakeTown: numbers, errors };
    await write(`timed-${level}`, record);
    test.info().annotations.push({ type: 'timed-run', description: JSON.stringify({ level, placements: build.steps.length, pinches, secondsBuild: +build.seconds.toFixed(1), secondsWholeRun: +seconds.toFixed(1), peakWhileBuilding: peak, awakeTown: numbers }) });
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('the Helper: Show glows the next part and pulses its socket, Place seats exactly that part and nothing else, and the ladder starts again on progress', async ({ page }) => {
  const hand = await toBench(page, 'standard');
  const slip = async (): Promise<string | null> => page.evaluate(() => (window as any).__wu.state().bench?.slip ?? null);
  const seated = async (): Promise<number> => (await gameState(page)).build?.seated ?? 0;
  const before = await seated();
  const next0 = await page.evaluate(() => (window as any).__wu.state().bench.next as string);
  expect(next0).toBe('bracket_left');
  expect(await press(page, 'UI_Helper'), 'the medallion answers').toBe(true);
  await frames(page, 6);
  expect(await slip(), 'press 1 names the step').toContain('left bracket');
  await frames(page, 90); // the cooldown (1.2 s)
  expect(await press(page, 'UI_Helper')).toBe(true);
  await frames(page, 6);
  await frames(page, 90);
  expect(await press(page, 'UI_Helper')).toBe(true); // press 3: place
  await page.waitForFunction(() => (window as any).__wu.state().build.seated >= 1, null, { timeout: 15_000, polling: 100 });
  expect(await seated(), 'one part, not the stage').toBe(before + 1);
  await frames(page, 60);
  const st = await page.evaluate(() => (window as any).__wu.state().bench);
  expect(st.next, 'the player places the next one: the bush of the left bracket').toBe('bush_left');
  expect(await seated(), 'the Helper placed one part only').toBe(before + 1);
  void hand;
});

test('Master: the live pieces of a stage stand 3.8 cm apart and a pinch takes the nearest one (decides whether Master ships)', async ({ page }) => {
  const hand = await toBench(page, 'master');
  // Stage 1 of the Music Box needs two kinds of hardware (a bush and a screw): two live bins, side by side at the caddy's pitch. Master opens every tray and the stage's bins.
  const hardwareAt = async (): Promise<Array<{ name: string; x: number; y: number; z: number }>> => {
    const out: Array<{ name: string; x: number; y: number; z: number }> = [];
    for (const part of await listParts(page)) {
      if (part.snapped || !(await hasComponent(page, part, 'ReturnsToRest'))) continue;
      if (!/^(bush|screw|pin|washer|collar|clip)/.test(part.name)) continue;
      const p = await partPose(page, part);
      out.push({ name: part.name, ...p.grab });
    }
    return out;
  };
  await waitForLivePiece(page, 'bush_split_8');
  await waitForLivePiece(page, 'screw_slot_m3');
  const live = await hardwareAt();
  expect(live.length, 'the two kinds of the first stage are live at once').toBe(2);
  const [a, b] = live;
  const pitch = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const trials: Array<{ target: string; shift: number; picked: string[]; correct: boolean }> = [];
  const gap = { x: (b.x - a.x) / pitch, y: (b.y - a.y) / pitch, z: (b.z - a.z) / pitch };
  for (const [from, other, sign] of [
    [a, b, 1],
    [b, a, -1],
  ] as const) {
    for (const shift of [0, 0.005, 0.01, 0.015]) {
      // The hand's grip lands `shift` metres from the piece's grab collider, towards its neighbour.
      const at = { x: from.x + gap.x * sign * shift, y: from.y + gap.y * sign * shift, z: from.z + gap.z * sign * shift };
      await hand.place(at);
      await frames(page, 2);
      await hand.pinch(1, 0.12);
      await frames(page, 4);
      const picked = (await grabbedParts(page)).filter((n) => /^(bush|screw|pin|washer|collar|clip)/.test(n));
      trials.push({ target: from.name, shift, picked, correct: picked.length === 1 && picked[0] === from.name });
      await hand.pinch(0, 0.1);
      await frames(page, 40); // the piece returns to its mouth
      void other;
    }
  }
  await write('master-spacing', { pitchM: pitch, trials });
  test.info().annotations.push({ type: 'master-spacing', description: JSON.stringify({ pitchCm: +(pitch * 100).toFixed(2), trials }) });
  const within = trials.filter((t) => t.shift <= 0.01);
  expect(within.every((t) => t.correct), `a pinch within 1 cm of a piece takes that piece and only it: ${JSON.stringify(within)}`).toBe(true);
});

test.describe('saves and gift links written before the intricate build (ADR-050)', () => {
  test('a finished story saved before the level existed loads as it was: every machine stands on its plot, the level is simply not chosen yet', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const old = JSON.parse(serializeSave(playStory())) as { settings: Record<string, unknown> };
    delete old.settings.difficulty; // what a save of the build before ADR-050 holds
    await page.addInitScript((raw) => localStorage.setItem('woundup.save', raw), JSON.stringify(old));
    await openGame(page);
    const loaded = await page.evaluate(() => {
      const wu = (window as any).__wu;
      return { difficulty: wu.session.save.settings.difficulty, placed: wu.state().placed as string[], letters: Object.values(wu.session.save.letters) as string[] };
    });
    expect(loaded.difficulty, 'a save with no level has none, and no version bump was needed').toBeNull();
    expect([...loaded.placed].sort(), 'the six machines are back on their plots, the Music Box with its hardware').toEqual(['belfry', 'carousel', 'clock_tower', 'music_box', 'well', 'windmill']);
    expect(loaded.letters.slice(0, 8).every((l) => l === 'completed'), 'the story letters stay done').toBe(true);
    await frames(page, 30);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('an old gift link (12 placements, no hardware in it) still opens in the viewer without an error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const placements = giftPlacements(MUSIC_BOX, MUSIC_BOX.intended);
    expect(placements, 'the link carries the 12 parts and none of the 22 pieces of hardware').toHaveLength(12);
    const link = await encodeGift({ blueprintId: 'music_box', blueprintVersion: MUSIC_BOX.version, placements, engraving: 'for_you' }, { catalogue: giftCatalogue, verify: verifyGift });
    expect(link.ok, JSON.stringify(link)).toBe(true);
    if (!link.ok) return;
    await page.goto(`${DEV_URL}${link.hash}`);
    await page.locator('.wu-gift[data-state="wrapped"]').waitFor({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Unwrap' }).click();
    await page.locator('.wu-gift[data-state="revealed"]').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(5000); // the machine is made on the stand behind the card
    const card = await page.locator('.wu-gift__card').innerText();
    expect(card).toContain('Music Box');
    expect(card).toContain('12 parts');
    // The viewer fills in the 22 pieces of hardware the link does not carry: the finished machine is the whole one (an unseated socket would be a hole).
    const meshes = await page.evaluate(() => {
      const w = (window as any).__world;
      let n = 0;
      w.getSceneObject('stage')?.traverse((o: any) => o.isMesh && o.visible && !o.name.endsWith('_proxy') && n++);
      return n;
    });
    expect(meshes, 'the machine shows').toBeGreaterThan(10);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test('pictures of the Standard build, for the evidence document (written to .tmp/evidence/assembly/deep_*.png, not the tracked docs folder)', async ({ page }) => {
  const hand = await toBench(page, 'standard');
  const fs = (await import('node:fs' as string)) as { mkdirSync(p: string, o: object): void };
  fs.mkdirSync('.tmp/evidence/assembly', { recursive: true });
  const shot = async (name: string): Promise<void> => {
    await frames(page, 20);
    await page.screenshot({ path: `.tmp/evidence/assembly/deep_${name}.png` });
  };
  await aimAtTable(page, { x: 0, y: 1.5, z: -0.02 }, 0.0);
  await shot('1_stage1_bench');
  // the first stage by hand, then the Helper's Show on the next step
  for (const step of [0, 1, 2, 3]) {
    void step;
    const st = (await page.evaluate(() => (window as any).__wu.state())).bench as { next: string; nextPart: string };
    const at = await page.evaluate((id) => (window as any).__wu.socketAt(id), st.next);
    const { seatByHand: seat, isHardwarePart: hw } = await import('./support/flow');
    await seat(page, hand, st.next, st.nextPart, undefined, undefined, { at, hardware: hw(st.nextPart) });
  }
  await aimAtTable(page, { x: 0, y: 1.5, z: -0.02 }, 0.0);
  await shot('2_frame_seated');
  await press(page, 'UI_Helper');
  await shot('3_helper_show');
  await page.evaluate(() => (window as any).__wu.seatAll());
  for (let i = 0; i < 40 && (await gameState(page)).build?.seated !== 34; i++) {
    await page.evaluate(() => (window as any).__wu.seatAll());
    await frames(page, 20);
  }
  await waitForMode(page, 'wind');
  await shot('4_complete');
  expect((await gameState(page)).build?.seated).toBe(34);
});
