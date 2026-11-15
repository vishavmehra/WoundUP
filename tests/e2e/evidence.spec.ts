import { expect, test, type Page } from '@playwright/test';
import {
  assembleByHand,
  carryToPlot,
  dist,
  grabbedParts,
  MUSIC_BOX_SOCKETS,
  openTrunkAndSetBench,
  repairWornSpringByHand,
  runMachine,
  windByHandAuto,
  type SeatReport,
} from './support/flow';
import { checkMusicBox, measureMotion, type MotionReport } from './support/motion';
import { changedPixels, mechanismRegion, mechanismVisibility } from './support/pixels';
import {
  frames,
  gameState,
  GPU_ARGS,
  Hand,
  openGame,
  partPose,
  pressWhenReady,
  requireDevRuntime,
  samplePerf,
  waitForMode,
  type PerfSample,
} from './support/xr';

/**
 * The evidence run: walks the whole Music Box flow in the emulated Quest 3 (IWER) and saves the 19 screenshots of the
 * competition's acceptance list to docs/evidence/screens/NN-name.png, plus the machine-readable record of the run
 * (docs/evidence/screens/run.json: one row per screenshot, the renderer numbers at four points, the motion readings).
 * EMULATOR evidence (IWER in desktop Chromium, real GPU, both eyes rendered), never headset evidence. Screenshot 19 is the desktop gift page.
 *
 * Re-runnable: it starts from a fresh browser context (no save), needs only the IWSDK dev runtime on localhost:8081, and
 * overwrites its own outputs. `driver` in each row says whether a hand or the ?debug helper did the thing in the picture.
 */
test.use({ launchOptions: { args: GPU_ARGS }, viewport: { width: 1120, height: 630 } });
test.setTimeout(600_000);

// The tsconfig carries no Node typings (the project convention, see tests/town/helpers.ts): the little of fs and path used here is typed by hand.
interface NodeFs {
  mkdirSync(path: string, options: { recursive: boolean }): void;
  writeFileSync(path: string, data: string): void;
}
interface NodePath {
  join(...parts: string[]): string;
}
const fs = (await import('node:fs' as string)) as NodeFs;
const path = (await import('node:path' as string)) as NodePath;
const cwd = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();

const OUT = path.join(cwd, 'docs', 'evidence', 'screens');

type Png = Awaited<ReturnType<Page['screenshot']>>;
type Driver = 'hands' | 'debug helper' | 'hands + debug helper';
interface Row {
  id: string;
  name: string;
  file: string;
  scenario: string;
  state: string;
  result: 'pass' | 'FAIL';
  detail: string;
  /** Seconds since the first screenshot of the run, to show how far apart frames were taken. */
  at: number;
  source: 'IWER (emulated Quest 3)' | 'Desktop (Chromium, no WebXR)';
  driver: Driver;
}

test.beforeAll(async ({ request }) => {
  await requireDevRuntime(request);
  fs.mkdirSync(OUT, { recursive: true });
});

/* eslint-disable @typescript-eslint/no-explicit-any -- reaches into the ?debug handles */
type Target = 'stage' | 'bench' | 'sheet' | 'tray' | 'build' | 'plot' | 'carried';

/** The headset moves to a seated eye position `back` metres towards the player and `up` above the target, and looks at it. */
async function aimAt(page: Page, what: Target, back = 0.3, up = 0.22): Promise<void> {
  await page.evaluate(
    async ({ what, back, up }) => {
      const w = (window as any).__world;
      const wu = (window as any).__wu;
      const v = w.camera.position.clone();
      const stage = w.getSceneObject('stage');
      const node =
        what === 'bench' ? wu.ui.bench.root
          : what === 'sheet' ? wu.ui.sheet.root
          : what === 'tray' ? wu.ui.tray.root
          : what === 'build' ? stage.getObjectByName('music_box')
          : what === 'plot' ? wu.town.town.ground.getObjectByName('SOCKET_PlotMusicBox')
          : what === 'carried' ? wu.town.rigOf('music_box').root
          : stage;
      const t = node.getWorldPosition(v.clone());
      const remote = (window as any).IWER_DEVICE.remote;
      await remote.dispatch('set_transform', { device: 'headset', position: { x: t.x, y: t.y + up, z: t.z + back } });
      await remote.dispatch('look_at', { device: 'headset', target: { x: t.x, y: t.y + 0.02, z: t.z } });
    },
    { what, back, up },
  );
  await frames(page, 6);
}

const wake = (page: Page) => page.evaluate(() => ({ active: (window as any).__wu.town.wake.active as boolean, awake: (window as any).__wu.town.wake.awakePlots() as string[] }));

let t0: number | undefined;
let lastShotStart = 0;
/** Waits until `ms` have passed since the last screenshot was started. */
const sinceLastShot = (page: Page, ms: number): Promise<void> => page.waitForTimeout(Math.max(0, ms - (Date.now() - lastShotStart)));
const rows: Row[] = [];
const perf: PerfSample[] = [];
const motion: Record<string, MotionReport & { failures: string[] }> = {};
const failures: string[] = [];
const hands: Record<string, unknown> = {};
const strayPauses: number[] = [];

// Written whatever happened, so a failed run still leaves its record (and the screenshots it got to).
test.afterEach(() => {
  rows.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  fs.writeFileSync(
    path.join(OUT, 'run.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), runtime: 'IWSDK dev runtime, IWER emulated Quest 3, desktop Chromium (ANGLE D3D11), both eyes rendered (renderer.info counts both)', rows, perf, motion, hands, failures }, null, 2),
  );
});

test('EVIDENCE: the Music Box flow, 19 screenshots, renderer numbers and motion (IWER; parts and carry by hand, UI presses by debug helper)', async ({ page, browser }) => {
  t0 = undefined;
  for (const list of [rows, perf, failures]) list.length = 0;
  for (const record of [motion, hands]) for (const key of Object.keys(record)) delete record[key];
  strayPauses.length = 0;

  /** Takes the screenshot after the check; a failing check is recorded in the row and fails the test at the end, the run goes on. */
  async function shot(
    id: string,
    name: string,
    scenario: string,
    driver: Driver,
    check: () => Promise<string | void>,
    options: { page?: Page; source?: Row['source'] } = {},
  ): Promise<Png> {
    const target = options.page ?? page;
    let result: Row['result'] = 'pass';
    let detail: string;
    try {
      detail = (await check()) ?? '';
    } catch (e) {
      result = 'FAIL';
      detail = String((e as Error).message ?? e).split('\n')[0];
      failures.push(`${id}-${name}: ${detail}`);
    }
    const file = `${id}-${name}.png`;
    const state = options.page ? 'gift page (no game session)' : JSON.stringify(await gameState(target)); // read just before the picture, not after
    lastShotStart = Date.now();
    const png = await target.screenshot({ path: path.join(OUT, file) });
    const at = +((Date.now() - (t0 ?? (t0 = Date.now()))) / 1000).toFixed(2);
    rows.push({ id, name, file, scenario, state, result, detail, at, source: options.source ?? 'IWER (emulated Quest 3)', driver });
    return png;
  }

  const record = async (label: string): Promise<void> => void perf.push(await samplePerf(page, label));

  await openGame(page);
  await Hand.enable(page);
  const hand = new Hand(page, 'right');
  await aimAt(page, 'stage', 0.4, 0.3);

  // ---- 1 to 5: the trunk, the town, the letter, the parcel ----------------------------------------------------------------------
  await openTrunkAndSetBench(page, async (beat) => {
    if (beat === 'trunk-opening') {
      await shot('02', 'trunk-opening', 'The trunk latch is pressed (debug helper) and the lid swings open, part-way.', 'debug helper', async () => {
        const flow = await page.evaluate(() => (window as any).__wu.ui.localFlow.trunk as string);
        expect(['opening', 'withdrawing']).toContain(flow);
        return `trunk flow: ${flow}`;
      });
    } else if (beat === 'town-unfolding') {
      await shot('03', 'town-unfolding', 'The lid is open and the frozen town has appeared (the game is in its town mode).', 'debug helper', async () => {
        const s = await gameState(page);
        const town = await page.evaluate(() => (window as any).__wu.town.town.group.visible as boolean);
        expect(s.mode).toBe('town');
        expect(town).toBe(true);
        return 'mode town, town group visible';
      });
    } else if (beat === 'frozen-town') {
      await record('frozen town');
      await shot('01', 'frozen-tockton', 'Tockton frozen on the stand: desaturated, still, the sealed letter waiting (taken after the trunk has sunk away: the town stays hidden until the trunk opens, so 01 follows 02 and 03 in time).', 'debug helper', async () => {
        const s = await gameState(page);
        const w = await wake(page);
        expect(s.mode).toBe('town');
        expect(s.placed).toEqual([]);
        expect(w.awake).toEqual([]);
        return 'no plot awake, no machine placed';
      });
    } else if (beat === 'letter') {
      await aimAt(page, 'stage', 0.55, 0.45); // far enough back to see the whole card and the Accept plaque below it
      await shot('04', 'letter', 'Mira\'s letter open at the reading spot, Accept plaque below it.', 'debug helper', async () => {
        const s = await gameState(page);
        const open = await page.evaluate(() => (window as any).__wu.ui.localFlow.envelope as string);
        expect(s.letter).toBe('letter_1');
        expect(open).toBe('open');
        return 'letter_1 open';
      });
    } else if (beat === 'parcel') {
      await aimAt(page, 'bench', 0.3, 0.22);
      await shot('05', 'parcel', 'Letter accepted: the workbench slid in with the closed parcel on it.', 'debug helper', async () => {
        const s = await gameState(page);
        const parcel = await page.evaluate(() => (window as any).__wu.ui.localFlow.parcel as string);
        expect(s.mode).toBe('build');
        expect(parcel).toBe('closed');
        return 'mode build, parcel closed';
      });
    }
  });

  // ---- 6 and 7: the blueprint sheet and the tray --------------------------------------------------------------------------------
  await aimAt(page, 'sheet', 0.2, 0.2);
  await shot('06', 'music-box-blueprint', 'Parcel open: the blueprint sheet for the Music Box with its 12 numbered slots.', 'debug helper', async () => {
    const s = await gameState(page);
    const view = await page.evaluate(() => Boolean((window as any).__wu.ui.currentView?.blueprint));
    expect(s.build).toMatchObject({ blueprint: 'music_box' }); // the intricate build (ADR-050): the first stage's parts are out, the game seats the spring's anchor
    expect(s.build?.parts).toBeGreaterThanOrEqual(2);
    expect(view).toBe(true);
    return 'blueprint visible, 12 slots, the first stage open';
  });
  await aimAt(page, 'tray', 0.2, 0.22);
  await shot('07', 'parts-tray', "The first stage's parts of the Music Box lying in the tray (the later stages' parts arrive as each stage closes, ADR-050).", 'debug helper', async () => {
    const parts = await page.evaluate(() => {
      const w = (window as any).__world;
      return w.getSceneObject('stage').children.filter((c: any) => w.entityManager.getEntityByIndex(c.entityIdx)?.getComponents().some((x: any) => x.id === 'SnapPart')).length as number;
    });
    expect(parts).toBeGreaterThanOrEqual(2);
    return `${parts} parts in the scene`;
  });

  // ---- 8 to 10: grab, snap, completed assembly (a hand does all of it) ------------------------------------------------------------
  await aimAt(page, 'build', 0.2, 0.17);
  const seatReports: SeatReport[] = await assembleByHand(page, hand, async (beat, index) => {
    if (beat === 'snapped' && (await gameState(page)).mode === 'pause') {
      // BUG-4: the pinch that took this part pressed the Pause medallion. Recorded, then resumed by the debug helper so the later pictures are clean.
      strayPauses.push(index);
      await pressWhenReady(page, 'UI_PanelLeft'); // Resume
      await waitForMode(page, 'build');
    }
    if (index !== 5) return; // the 20-tooth wheel: big enough to see, and its socket is in plain view
    if (beat === 'lifted') {
      await shot('08', 'component-grabbing', 'A hand holds the 20-tooth wheel up out of the tray (pinch).', 'hands', async () => {
        const held = await grabbedParts(page);
        expect(held).toContain('gear_spur_20_m1_brass');
        expect((await gameState(page)).mode, 'no stray pause panel in the picture (BUG-4)').toBe('build');
        return `held: ${held.join(', ')}`;
      });
    } else if (beat === 'near-socket') {
      await shot('09', 'component-snapping', 'The held wheel 2 cm above its socket: the ghost preview shows where it will seat; one more move and the pinch is released.', 'hands', async () => {
        const origin = (await partPose(page, { name: 'gear_spur_20_m1_brass', index: 0 })).origin;
        const socket = await page.evaluate(() => {
          const w = (window as any).__world;
          const p = w.getSceneObject('stage').getObjectByName('SOCKET_GearB').getWorldPosition(w.camera.position.clone());
          return { x: p.x, y: p.y, z: p.z };
        });
        const d = dist(origin, socket);
        expect(d).toBeLessThan(0.04); // inside the snap radius: the preview is live
        expect((await gameState(page)).mode, 'no stray pause panel in the picture (BUG-4)').toBe('build');
        return `part ${(d * 100).toFixed(1)} cm from SOCKET_GearB`;
      });
    } else if (beat === 'snapped') {
      await shot('09b', 'component-snapped', 'Extra: the same wheel a moment after the release, seated.', 'hands', async () => {
        const seated = (await gameState(page)).build?.seated ?? 0;
        expect(seated).toBe(index + 1);
        return `${seated} seated`;
      });
    }
  });
  hands.strayPausesWhileBuildingByHand = { atPartIndex: [...strayPauses], note: 'BUG-4: a pinch in the tray opened the Pause panel; each was resumed by the debug helper' };
  hands.seat = seatReports.map((r) => ({ part: r.part.name, socket: r.socket, releasedAtCm: +(r.releasedAt * 100).toFixed(2), grabbed: r.grabbed, snapped: r.snapped, seatedAfter: r.seatedAfter }));
  seatReports.forEach((r, i) => {
    if (!(r.grabbed && r.snapped && r.releasedAt < 0.04 && r.seatedAfter === i + 1)) failures.push(`seat ${i} ${r.part.name}: ${JSON.stringify(r)}`);
  });
  await waitForMode(page, 'wind');
  await frames(page, 20);
  await record('Music Box assembly (12 parts seated, before wind)');
  await aimAt(page, 'build', 0.28, 0.2);
  await shot('10', 'completed-assembly', 'All 12 parts seated by hand: the Music Box is complete and the run sign shows the wind counter.', 'hands', async () => {
    const s = await gameState(page);
    expect(s.mode).toBe('wind');
    expect(s.build?.seated).toBe(MUSIC_BOX_SOCKETS.length);
    return '12 of 12 seated, mode wind';
  });

  // ---- 12: winding. A real wrist twist (IWER rolls the pinching hand about the key's axis) ------------------------------------------
  // A plain pinch on the seated key grabs the key itself (BUG-1) and winding never starts, so while BUG-1 stands the key's grab handle
  // is removed first (a labelled diagnostic); once it is fixed the probe grabs nothing and the same twist runs on the untouched game.
  await aimAt(page, 'build', 0.2, 0.14);
  let windShot = false;
  const wind = await windByHandAuto(page, hand, 2, 360, async (beat, g, path) => {
    if (beat === 'twisting' && g === 0 && !windShot) {
      windShot = true;
      await shot('12', 'winding', 'A hand turns the key by wrist twist (270 degrees so far); the counter on the run sign counts the wind units.', 'hands', async () => {
        const s = await gameState(page);
        expect(s.windUnits).toBeGreaterThanOrEqual(2);
        return `wind units ${s.windUnits} of 8 mid-twist; path: ${path}`;
      });
    }
  });
  hands.wind = wind;
  if (!(wind.report.units[1] >= 7)) failures.push(`wind: units after two turns ${wind.report.units.join(',')}`);

  // ---- 11 and 13: run, the solver's verdict, the machine running -----------------------------------------------------------------
  await runMachine(page);
  await aimAt(page, 'carried', 0.3, 0.22);
  await frames(page, 12);
  await shot('11', 'solver-result', 'Run pressed: the solver\'s verdict on the run sign ("It works!"), the finished machine already turning on the bench.', 'hands + debug helper', async () => {
    const r = await page.evaluate(() => {
      const rig = (window as any).__wu.town.rigOf('music_box');
      return { status: rig.result?.status as string, cylinder: rig.result?.angularVelocity?.cylinder as number, runSeconds: rig.result?.runSeconds as number, mode: (window as any).__wu.state().mode as string };
    });
    expect(r.status).toBe('runs');
    expect(r.mode).toBe('place');
    hands.solver = r;
    return `solver: ${r.status}, cylinder ${r.cylinder} rad/s, ${r.runSeconds.toFixed(1)} s of music`;
  });
  await page.waitForFunction(() => (window as any).__wu.town.rigOf('music_box').speed > 0.97, null, { timeout: 15_000, polling: 100 });
  await record('Music Box running');
  const running = async (): Promise<string> => {
    const r = await page.evaluate(() => {
      const rig = (window as any).__wu.town.rigOf('music_box');
      return { running: rig.running as boolean, speed: rig.speed as number, theta: rig.rotors.find((x: any) => x.socketId === 'cylinder').theta as number };
    });
    expect(r.running).toBe(true);
    expect(r.speed).toBeGreaterThan(0.9);
    return `running, run factor ${r.speed.toFixed(2)}, cylinder angle ${r.theta.toFixed(2)} rad`;
  };
  // The player's own seated eye position first (head 0.38 m above the stand and 0.55 m behind it, the stand's design): is the mechanism visible?
  await page.evaluate(async () => {
    const w = (window as any).__world;
    const t = (window as any).__wu.town.rigOf('music_box').root.getWorldPosition(w.camera.position.clone());
    const remote = (window as any).IWER_DEVICE.remote;
    await remote.dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 } });
    await remote.dispatch('look_at', { device: 'headset', target: { x: t.x, y: t.y + 0.03, z: t.z } });
  });
  await frames(page, 8);
  const seatedRegion = await mechanismRegion(page, 'music_box');
  hands.visibilitySeated = await mechanismVisibility(page, 'music_box');
  const sa = await shot('13s-a', 'running-seated-view', 'Extra: the running Music Box from the default seated eye position (35 degrees down): the cylinder and gears are in view through the open lid, but small.', 'hands + debug helper', running);
  await sinceLastShot(page, 1000);
  const sb = await shot('13s-b', 'running-seated-view', 'Extra: the same view about a second later.', 'hands + debug helper', running);
  hands.visibleMotionSeated = { region: seatedRegion, ...(await changedPixels(page, sa, sb, seatedRegion, 40)) };

  // Then close and from above (about 55 degrees down), where the lid is open and the cylinder and gears can be seen. 13a to 13c are
  // one second apart; the lid is open and still while the machine runs (it swings shut only when the music ends).
  await aimAt(page, 'carried', 0.1, 0.16);
  const topRegion = await mechanismRegion(page, 'music_box');
  hands.visibilityTop = await mechanismVisibility(page, 'music_box');
  const ta = await shot('13a', 'music-box-running', 'The running Music Box seen close and from above (about 55 degrees down), t = 0 s: lid open, cylinder and gears turning.', 'hands + debug helper', running);
  await sinceLastShot(page, 1000);
  const tb = await shot('13b', 'music-box-running', 'Same machine one second after the first.', 'hands + debug helper', running);
  await sinceLastShot(page, 1000);
  const tc = await shot('13c', 'music-box-running', 'Same machine two seconds after the first.', 'hands + debug helper', running);
  const topMotion = { region: topRegion, ab: await changedPixels(page, ta, tb, topRegion, 40), bc: await changedPixels(page, tb, tc, topRegion, 40), ac: await changedPixels(page, ta, tc, topRegion, 40) };
  hands.visibleMotionTop = topMotion;
  for (const [pair, m] of [['13a/13b', topMotion.ab], ['13b/13c', topMotion.bc]] as const) {
    if (!(m.fraction > 0.02)) failures.push(`${pair}: from above only ${(m.fraction * 100).toFixed(1)} % of the mechanism's pixels changed in a second`);
  }
  const topSeen = hands.visibilityTop as { hiddenFraction: number };
  if (!(topSeen.hiddenFraction < 0.35)) failures.push(`13a: from above ${(topSeen.hiddenFraction * 100).toFixed(0)} % of the turning parts are hidden`);
  const benchMotion = await measureMotion(page, 'music_box', 2.5);
  motion['music box on the bench'] = { ...benchMotion, failures: checkMusicBox(benchMotion) };
  failures.push(...motion['music box on the bench'].failures.map((f) => `motion (bench): ${f}`));

  // ---- 14 to 16: place it (a hand carries it), the town wakes ----------------------------------------------------------------------
  await aimAt(page, 'plot', 0.34, 0.26);
  const carry = await carryToPlot(page, hand, 'music_box', 'SOCKET_PlotMusicBox', async (beat) => {
    if (beat === 'carrying') {
      await shot('14', 'machine-placement', 'A hand carries the finished Music Box towards its glowing plot.', 'hands', async () => {
        const s = await gameState(page);
        const held = await page.evaluate(() => {
          const w = (window as any).__world;
          const rig = (window as any).__wu.town.rigOf('music_box');
          return Boolean(w.entityManager.getEntityByIndex(rig.root.entityIdx)?.getComponents().some((c: any) => c.id === 'Grabbed'));
        });
        expect(s.carried).toBe(true);
        expect(held).toBe(true);
        return 'machine in the hand, mode place';
      });
    }
  });
  hands.carry = carry;
  expect(carry.modeAfter).toBe('town');
  await frames(page, 25);
  await shot('15', 'awakening-ripple', 'The Music Box is on its plot: the colour ripple spreads out from it across the town (about 0.5 s into the 1.5 s wake).', 'hands', async () => {
    const w = await wake(page);
    const s = await gameState(page);
    expect(w.active).toBe(true);
    expect(s.placed).toContain('music_box');
    return `ripple active, placed: ${s.placed.join(', ')}`;
  });
  await page.waitForFunction(() => !(window as any).__wu.town.wake.active, null, { timeout: 15_000, polling: 100 });
  await aimAt(page, 'stage', 0.4, 0.3);
  await frames(page, 30);
  await record('awake town after the Music Box');
  await shot('16', 'awakened-tockton', 'The ripple has finished: the Music Box plot is in full colour and the machine plays.', 'hands', async () => {
    const w = await wake(page);
    expect(w.active).toBe(false);
    expect(w.awake).toEqual(['plot_music_box']);
    const s = await gameState(page);
    expect(s.letter).toBe('letter_2');
    return `awake plots: ${w.awake.join(', ')}; next letter ${s.letter}`;
  });
  const townMotion = await measureMotion(page, 'music_box', 2.5, 0.9);
  motion['music box placed in the town'] = { ...townMotion, failures: checkMusicBox(townMotion) };
  failures.push(...motion['music box placed in the town'].failures.map((f) => `motion (town): ${f}`));

  // ---- 17: pause ---------------------------------------------------------------------------------------------------------------------
  await aimAt(page, 'stage', 0.4, 0.3);
  await pressWhenReady(page, 'UI_Pause');
  await frames(page, 20);
  await shot('17', 'pause-menu', 'The pause panel: Resume, Restart chapter and the three accessibility settings.', 'debug helper', async () => {
    const s = await gameState(page);
    expect(s.mode).toBe('pause');
    return 'mode pause';
  });
  await pressWhenReady(page, 'UI_PanelLeft'); // Resume
  await waitForMode(page, 'town');

  // ---- Letter 2, the worn-spring repair (the gift opens once it is done) ------------------------------------------------------------------
  await aimAt(page, 'bench', 0.3, 0.22);
  const repair = await repairWornSpringByHand(page, hand);
  hands.repair = { seatedAtStart: repair.seatedAtStart, seatedAfterPull: repair.seatedAfterPull, reseated: repair.reseated.map((r) => ({ part: r.part.name, socket: r.socket, releasedAtCm: +(r.releasedAt * 100).toFixed(2), grabbed: r.grabbed, snapped: r.snapped, seatedAfter: r.seatedAfter })) };
  if (repair.seatedAtStart !== 12) failures.push(`repair: ${repair.seatedAtStart} seated at the start, expected 12`);
  if (repair.seatedAfterPull > 10) failures.push(`repair: pulling the worn spring left ${repair.seatedAfterPull} seated (the pinion and key stand on it, so at most 9 remain)`);
  if (!repair.reseated.every((r) => r.grabbed && r.snapped)) failures.push(`repair: reseat ${JSON.stringify(repair.reseated.map((r) => [r.part.name, r.grabbed, r.snapped]))}`);
  await runMachine(page);
  await aimAt(page, 'plot', 0.34, 0.26);
  const carry2 = await carryToPlot(page, hand, 'music_box', 'SOCKET_PlotMusicBox');
  hands.carry2 = carry2;
  if (!(carry2.grabbed && carry2.releasedAt < 0.04 && carry2.modeAfter === 'town')) failures.push(`repair carry: ${JSON.stringify(carry2)}`);
  await aimAt(page, 'stage', 0.4, 0.3);
  await frames(page, 30);

  // ---- 18: the gift panel and the link --------------------------------------------------------------------------------------------------
  await pressWhenReady(page, 'UI_Gift');
  await waitForMode(page, 'gift');
  await frames(page, 15);
  await pressWhenReady(page, 'UI_PanelLeft'); // Make link
  await page.locator('[aria-label="Gift link"] textarea').waitFor({ timeout: 20_000 });
  await frames(page, 15);
  const giftUrl = await page.locator('[aria-label="Gift link"] textarea').inputValue();
  await shot('18', 'gift-screen', 'The gift panel after "Make link": the clipboard is blocked in the browser, so the link waits in a box on the page. The link is a real one, made from the built machine.', 'debug helper', async () => {
    const s = await gameState(page);
    expect(s.mode).toBe('gift');
    expect(giftUrl).toContain('#g=');
    return `mode gift, link of ${giftUrl.length} characters`;
  });
  await pressWhenReady(page, 'UI_PanelRight'); // Close
  await waitForMode(page, 'town');
  await record('awake town after the gift panel closed');
  hands.giftLinkLength = giftUrl.length;

  // ---- 19: the gift viewer, as the recipient sees it (a desktop page with no session) ----------------------------------------------------
  const viewerContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1120, height: 630 } });
  const viewer = await viewerContext.newPage();
  const viewerErrors: string[] = [];
  viewer.on('pageerror', (e) => viewerErrors.push(String(e)));
  await viewer.goto(giftUrl);
  await viewer.locator('.wu-gift[data-state="wrapped"]').waitFor({ timeout: 90_000 });
  await viewer.getByRole('button', { name: 'Unwrap' }).click();
  await viewer.locator('.wu-gift[data-state="revealed"]').waitFor({ timeout: 30_000 });
  await viewer.waitForTimeout(4000); // the machine builds on the stand and starts to turn
  await shot(
    '19',
    'gift-viewer',
    'The link opened by someone else on a desktop page: "Music Box", the engraving, the part count and the machine on its stand behind the card, seen from the front (the mechanism inside is out of sight from this angle; motion is not asserted here).',
    'debug helper',
    async () => {
      const text = await viewer.locator('.wu-gift__card').innerText();
      expect(text).toContain('Music Box');
      expect(text).toContain('12 parts');
      expect(viewerErrors).toEqual([]);
      return `card: ${text.replace(/\s+/g, ' ').slice(0, 90)}`;
    },
    { page: viewer, source: 'Desktop (Chromium, no WebXR)' },
  );
  await viewerContext.close();

  expect(failures).toEqual([]);
  const ids = new Set(rows.map((r) => r.id));
  for (let n = 1; n <= 19; n++) {
    const id = String(n).padStart(2, '0');
    expect(n === 13 ? ['13a', '13b', '13c'].every((x) => ids.has(x)) : ids.has(id), `screenshot ${id} was taken`).toBe(true);
  }
});
/* eslint-enable @typescript-eslint/no-explicit-any */
