/**
 * The Music Box journey in steps, shared by the hands, evidence, repeat and motion specs. Each step says in its doc comment
 * whether a hand (IWER pinch, glide and wrist rotation) or the ?debug helper (`window.__wu`) drives it, because the specs
 * report that distinction.
 */
import type { Page } from '@playwright/test';
import {
  frames,
  gameState,
  Hand,
  hasComponent,
  nodePosition,
  partPose,
  press,
  pressWhenReady,
  waitForMode,
  type PartHandle,
  type Vec3,
} from './xr';

/* eslint-disable @typescript-eslint/no-explicit-any -- reaches into the ?debug world handle */

/**
 * The 12 big parts of the Music Box in the order of its stages (INTRICATE_ASSEMBLY_DESIGN §8.1, ADR-050): the empty on the case, and the start of the part id the
 * blueprint intends there. Each stage's tray opens when the stage before it closes, so this is the only order the armed sockets accept.
 */
export const MUSIC_BOX_SOCKETS: ReadonlyArray<readonly [socket: string, part: string]> = [
  ['SOCKET_BracketL', 'bracket_support'],
  ['SOCKET_BracketR', 'bracket_support'],
  ['SOCKET_Arbor', 'shaft_short'],
  ['SOCKET_GearC', 'gear_spur_16_m1'],
  ['SOCKET_Cylinder', 'cylinder_music_box'],
  ['SOCKET_GearB', 'gear_spur_20_m1'],
  ['SOCKET_Comb', 'comb_music_box'],
  ['SOCKET_Governor', 'governor_standard'],
  ['SOCKET_GearD', 'gear_spur_12_m1'],
  ['SOCKET_Spring', 'spring_standard'],
  ['SOCKET_GearA', 'gear_spur_10_m1'],
  ['SOCKET_Key', 'winding_key'],
];

/** The three levels of the first-build card (ADR-050). */
export type Level = 'relaxed' | 'standard' | 'master';

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export interface Beat {
  /** Called at a named moment of a step (for screenshots). */
  (name: string, index?: number): Promise<void> | void;
}
const noBeat: Beat = () => undefined;

// ---- The story steps up to the workbench (UI presses through the debug helper: a hand never presses these in the specs) -------------

/**
 * The first deep build asks for a level before the parcel opens (the card stands over the closed parcel, modal). Presses `level` when the card comes up and
 * does nothing when it does not (a later letter, a build with no stages): the answer is saved, so the card is a once-only step. Debug-helper press.
 */
export async function answerDifficultyCard(page: Page, level: Level = 'relaxed'): Promise<boolean> {
  const shown = await page
    .waitForFunction(
      (name) => (window as any).__wu.ui.pressables().some((p: any) => p.name === name && p.active),
      `UI_Difficulty_${level}`,
      { timeout: 4_000, polling: 100 },
    )
    .then(
      () => true,
      () => false,
    );
  if (shown) await press(page, `UI_Difficulty_${level}`);
  return shown;
}

/** Latch -> lid opens -> town shows -> envelope -> Accept -> level card -> parcel -> housing and the first stage's parts on the bench. Debug-helper presses. */
export async function openTrunkAndSetBench(page: Page, beat: Beat = noBeat, level: Level = 'relaxed'): Promise<void> {
  await beat('frozen-trunk');
  await press(page, 'trunk', 'COL_Latch');
  await page.waitForFunction(() => (window as any).__wu.ui.localFlow.trunk === 'opening', null, { timeout: 15_000, polling: 20 });
  await frames(page, 14); // the lid is part-way open (it takes 1.1 s)
  await beat('trunk-opening');
  await waitForMode(page, 'town');
  await frames(page, 20);
  await beat('town-unfolding');
  await page.waitForFunction(() => (window as any).__wu.ui.localFlow.trunk === 'gone', null, { timeout: 30_000, polling: 100 });
  await frames(page, 30);
  await beat('frozen-town');
  await pressWhenReady(page, 'envelope');
  await page.waitForFunction(() => (window as any).__wu.ui.localFlow.envelope === 'open', null, { timeout: 10_000, polling: 100 });
  await whenActive(page, 'UI_Accept'); // the card has risen to the reading spot and Accept answers
  await frames(page, 10);
  await beat('letter');
  await press(page, 'UI_Accept');
  await answerDifficultyCard(page, level);
  await whenActive(page, 'parcel');
  await frames(page, 30);
  await beat('parcel');
  await press(page, 'parcel');
  await page.waitForFunction(() => (window as any).__wu.state().build?.parts > 0, null, { timeout: 30_000, polling: 100 });
  await waitForPartsPopped(page);
  await beat('bench');
}

/** Waits until the named UI target answers to pointers (without pressing it). */
export const whenActive = (page: Page, name: string, timeout = 30_000): Promise<unknown> =>
  page.waitForFunction(
    (n) => {
      const all = (window as any).__wu.ui.pressables();
      const alias = ['trunk', 'parcel', 'envelope'].indexOf(n); // the three props keep their GLB root name: they are the first three targets
      return alias >= 0 ? Boolean(all[alias]?.active) : all.some((p: any) => p.name === n && p.active);
    },
    name,
    { timeout, polling: 100 },
  );

/**
 * The tray's parts pop in 0.12 s apart: wait until `count` parts stand in the scene and every one is at full size (a grab collider is sized against the part's scale).
 * The first stage's bag of the deep build is 2 parts; a repair's bench has 12.
 */
export async function waitForPartsPopped(page: Page, count = 2): Promise<void> {
  await page.waitForFunction(
    (n) => {
      const w = (window as any).__world;
      const parts = w.getSceneObject('stage').children.filter((c: any) => w.entityManager.getEntityByIndex(c.entityIdx)?.getComponents().some((x: any) => x.id === 'SnapPart'));
      return parts.length >= n && parts.every((p: any) => p.scale.x > 0.99);
    },
    count,
    { timeout: 30_000, polling: 100 },
  );
  await frames(page, 10);
}

// ---- Parts ---------------------------------------------------------------------------------------------------------------------

export interface ListedPart extends PartHandle {
  snapped: boolean;
}

/** Every part in the scene that carries SnapPart (the tray's and the seated ones), in scene order. */
export const listParts = (page: Page): Promise<ListedPart[]> =>
  page.evaluate(() => {
    const w = (window as any).__world;
    const counts = new Map<string, number>();
    const out: any[] = [];
    for (const c of w.getSceneObject('stage').children) {
      const entity = w.entityManager.getEntityByIndex(c.entityIdx);
      const components = entity?.getComponents() ?? [];
      const index = counts.get(c.name) ?? 0;
      counts.set(c.name, index + 1);
      if (components.some((x: any) => x.id === 'SnapPart')) out.push({ name: c.name, index, snapped: components.some((x: any) => x.id === 'SnappedTo') });
    }
    return out;
  });

export const seatedCount = async (page: Page): Promise<number> => (await gameState(page)).build?.seated ?? 0;

/**
 * The deep build's stages seated by the ?debug helper, as a player who knows the machine would, until every socket is full (mode Wind): each pass seats what the director
 * has armed, then the next stage's bag opens and the game seats Relaxed's hardware a few frames later. DEBUG HELPER (a hand does none of this).
 */
export async function seatAllByHelper(page: Page, passes = 60): Promise<void> {
  for (let pass = 0; pass < passes; pass++) {
    if ((await gameState(page)).mode === 'wind') return;
    await page.evaluate(() => (window as any).__wu.seatAll());
    await frames(page, 25);
  }
  await waitForMode(page, 'wind', 30_000);
}

/** World position of the empty of blueprint socket `id` on the bench machine, or null (a hardware seat exists only while its carrier is seated). DEBUG HELPER. */
export const socketPosition = (page: Page, id: string): Promise<Vec3 | null> => page.evaluate((i) => (window as any).__wu.socketAt(i) as Vec3 | null, id);

/**
 * The caddy piece of `partPrefix` that a hand can take: it has rolled up to its bin's mouth (it carries ReturnsToRest and the grab from then on) and is at full size.
 * A bin makes the next piece 0.25 s after the one before it was seated. Throws after 20 s.
 */
export async function waitForLivePiece(page: Page, partPrefix: string, timeout = 20_000): Promise<ListedPart> {
  const until = Date.now() + timeout;
  for (;;) {
    for (const part of await listParts(page)) {
      if (!part.name.startsWith(partPrefix) || part.snapped) continue;
      if ((await hasComponent(page, part, 'ReturnsToRest')) && (await partPose(page, part)).scale > 0.99) {
        await frames(page, 4);
        return part;
      }
    }
    if (Date.now() > until) throw new Error(`no live caddy piece starting with ${partPrefix} after ${timeout} ms`);
    await frames(page, 6);
  }
}

/**
 * The unseated part whose id starts with `partPrefix`, full size and at rest. A stage's tray opens a moment after the stage before it closes (the bag is made, then
 * pops in), so this waits for it. Throws after 20 s.
 */
export async function waitForTrayPart(page: Page, partPrefix: string, timeout = 20_000): Promise<ListedPart> {
  const until = Date.now() + timeout;
  for (;;) {
    const part = (await listParts(page)).find((p) => p.name.startsWith(partPrefix) && !p.snapped);
    if (part && (await partPose(page, part)).scale > 0.99) {
      await frames(page, 4);
      return part;
    }
    if (Date.now() > until) throw new Error(`no unseated part starting with ${partPrefix} in the tray after ${timeout} ms`);
    await frames(page, 6);
  }
}

export interface SeatReport {
  part: PartHandle;
  socket: string;
  /** Distance of the part origin from the socket when the hand let go, metres. */
  releasedAt: number;
  grabbed: boolean;
  snapped: boolean;
  seatedAfter: number;
  /** Where the part lay (tray compartment, bin mouth) before the hand took it. */
  home: Vec3;
}

/**
 * A HAND picks the unseated part whose id starts with `partPrefix` out of the tray (grip on its grab collider, pinch), carries it to
 * `socket`, and lets go. Real emulated hand input: IWER pinch and hand placement; no debug helper.
 */
export async function seatByHand(
  page: Page,
  hand: Hand,
  socket: string,
  partPrefix: string,
  beat: Beat = noBeat,
  /** Where on the part to pinch, relative to its grab collider (metres): away from a bigger collider that overlaps it. */
  bias: Vec3 = { x: 0, y: 0, z: 0 },
  /** The socket's position when it is not a named empty of the case (a hardware seat on a seated part: `socketPosition`), and whether the piece is a caddy piece. */
  target?: { at: Vec3; hardware: boolean },
): Promise<SeatReport> {
  const part = target?.hardware ? await waitForLivePiece(page, partPrefix) : await waitForTrayPart(page, partPrefix);
  const pose = await partPose(page, part);
  const home = pose.origin;
  pose.grab = add(pose.grab, bias);
  const socketAt = target?.at ?? (await nodePosition(page, socket));
  const offset = sub(pose.grab, pose.origin); // the grip rides on the collider; the origin follows with this offset
  const carry = add(socketAt, offset);

  await hand.place(pose.grab);
  await frames(page, 2);
  await hand.pinch(1, 0.12);
  await frames(page, 3);
  const grabbed = await hasComponent(page, part, 'Grabbed');
  await beat('grabbed');

  const lift = { x: (pose.grab.x + carry.x) / 2, y: Math.max(pose.grab.y, carry.y) + 0.05, z: (pose.grab.z + carry.z) / 2 };
  await hand.glide(lift, 0.35);
  await beat('lifted');
  await hand.glide(add(carry, { x: 0, y: 0.02, z: 0 }), 0.3);
  await beat('near-socket');
  await hand.glide(carry, 0.15);
  const releasedAt = dist((await partPose(page, part)).origin, socketAt);
  await hand.pinch(0, 0.1);
  await frames(page, 8);
  const snapped = await hasComponent(page, part, 'SnappedTo');
  await beat('snapped');
  return { part, socket, releasedAt, grabbed, snapped, seatedAfter: await seatedCount(page), home };
}

/** Builds the whole Music Box with one hand, in blueprint order. Returns one report per part. */
export async function assembleByHand(page: Page, hand: Hand, beat: (name: string, index: number) => Promise<void> | void = noBeat): Promise<SeatReport[]> {
  const reports: SeatReport[] = [];
  for (const [index, [socket, prefix]] of MUSIC_BOX_SOCKETS.entries()) {
    reports.push(await seatByHand(page, hand, socket, prefix, (name) => beat(name, index)));
  }
  return reports;
}

export interface PullReport {
  part: PartHandle;
  seatedBefore: number;
  /** Seated count and the part's SnappedTo while the hand still holds it, 10 cm from its socket. */
  seatedWhileHeld: number;
  snappedWhileHeld: boolean;
  /** Distance from the tray position it started from, after the hand let go and it returned. */
  backInTray: number;
}

/**
 * A HAND pulls the seated part out of its socket: pinch it where it sits, lift it 10 cm (the part leaves its socket past 3 cm),
 * let go in the air. The part returns to where it lay in the tray (ReturnsToRest). Real emulated hand input.
 */
export async function pullByHand(page: Page, hand: Hand, part: PartHandle, trayHome: Vec3): Promise<PullReport> {
  const seatedBefore = await seatedCount(page);
  const pose = await partPose(page, part);
  await hand.place(pose.grab);
  await frames(page, 2);
  await hand.pinch(1, 0.12);
  await frames(page, 3);
  await hand.glide(add(pose.grab, { x: 0, y: 0.1, z: 0.0 }), 0.5);
  await frames(page, 3);
  const seatedWhileHeld = await seatedCount(page);
  const snappedWhileHeld = await hasComponent(page, part, 'SnappedTo');
  await hand.pinch(0, 0.1);
  await page.waitForFunction(
    ([name, index, x, y, z]) => {
      const w = (window as any).__world;
      const node = w.getSceneObject('stage').children.filter((c: any) => c.name === name)[index as number];
      const p = node.getWorldPosition(w.camera.position.clone());
      return Math.hypot(p.x - (x as number), p.y - (y as number), p.z - (z as number)) < 0.005;
    },
    [part.name, part.index, trayHome.x, trayHome.y, trayHome.z] as const,
    { timeout: 15_000, polling: 100 },
  );
  const back = (await partPose(page, part)).origin;
  return { part, seatedBefore, seatedWhileHeld, snappedWhileHeld, backInTray: dist(back, trayHome) };
}

export interface RepairReport {
  /** Seated parts when the repair bench opened (the game seats all 12, the worn spring among them) and after the hand pulled the worn spring. */
  seatedAtStart: number;
  seatedAfterPull: number;
  /** The parts the hand then seated again. */
  reseated: SeatReport[];
}

/**
 * Letter 2, the worn-spring repair. UI presses (envelope, Accept, parcel, Run) go through the debug helper and the wind through
 * `__wu.wind`; a HAND pulls the worn spring out (the pinion and key that stood on it come loose with it) and seats the standard
 * spring, the 10-tooth pinion and the key again. Leaves the session in Wind with 8 units wound, ready for Run.
 */
export async function repairWornSpringByHand(page: Page, hand: Hand, beat: Beat = noBeat): Promise<RepairReport> {
  await pressWhenReady(page, 'envelope');
  await whenActive(page, 'UI_Accept');
  await frames(page, 10);
  await press(page, 'UI_Accept');
  await whenActive(page, 'parcel');
  await frames(page, 20);
  await press(page, 'parcel');
  await page.waitForFunction(() => (window as any).__wu.state().build?.seated === 12, null, { timeout: 45_000, polling: 150 });
  await waitForMode(page, 'wind'); // all 12 sockets are full, with the worn spring in one of them
  await frames(page, 40);
  await beat('repair-bench');
  const seatedAtStart = await seatedCount(page);

  const worn = (await listParts(page)).find((p) => p.name.startsWith('spring_worn') && p.snapped);
  if (!worn) throw new Error('the repair bench has no seated worn spring');
  const pose = await partPose(page, worn);
  await hand.place(pose.grab);
  await frames(page, 2);
  await hand.pinch(1, 0.12);
  await frames(page, 3);
  await hand.glide(add(pose.grab, { x: 0, y: 0.1, z: 0 }), 0.5);
  await frames(page, 3);
  const seatedAfterPull = await seatedCount(page);
  await beat('worn-spring-out');
  await hand.pinch(0, 0.1);
  await waitForMode(page, 'build');
  await frames(page, 90); // the spring and whatever stood on it ease back to the tray

  const reseated: SeatReport[] = [];
  // BUG-2 (see the report): the pinion and the key that came loose with the worn spring hang in the air at their old sockets, and the
  // freshly seated spring's bigger collider overlaps the pinion's, so the hand pinches the pinion 2 cm to the side, away from the spring.
  for (const [socket, prefix, bias] of [
    ['SOCKET_Spring', 'spring_standard', undefined],
    ['SOCKET_GearA', 'gear_spur_10_m1', { x: -0.02, y: 0, z: 0 }],
    ['SOCKET_Key', 'winding_key', undefined],
  ] as const) {
    reseated.push(await seatByHand(page, hand, socket, prefix, noBeat, bias));
  }
  await waitForMode(page, 'wind');
  await windByHelper(page, 8);
  await frames(page, 4);
  return { seatedAtStart, seatedAfterPull, reseated };
}

// ---- The deep build (ADR-050) ---------------------------------------------------------------------------------------------------

export interface DeepStep {
  socketId: string;
  partId: string;
  hardware: boolean;
  /** Wall-clock seconds of the scripted hand, from the step being asked for to the piece being counted. */
  seconds: number;
  grabbed: boolean;
  snapped: boolean;
  /** Distance of the piece from its socket when the hand let go, metres. */
  releasedAt: number;
}

export interface DeepBuild {
  level: Level;
  steps: DeepStep[];
  /** One pinch per placement (a pick and a release). */
  pinches: number;
  bigParts: number;
  hardware: number;
  /** Wall-clock seconds from the first step to the machine being complete (mode Wind). Scripted hands move at fixed speeds: this is not a human's time. */
  seconds: number;
  /** Placements by hand that the director refused or that missed (a step run again). */
  retries: number;
}

/**
 * Builds the whole Music Box with a HAND, one step after another as the director asks (`__wu.state().bench.next`): every big part from the tray, and in Standard and
 * Master every pin, washer, bush, screw, collar and clip from the caddy. The hardware of Relaxed is the game's. Returns one entry per placement. Real emulated hand input;
 * the only debug helpers are the reads of which socket is next and where it is.
 */
export async function assembleDeepByHand(
  page: Page,
  hand: Hand,
  level: Level,
  beat: (name: string, index: number) => Promise<void> | void = noBeat,
  /** Called after every placement that counted (a probe of the scene: draw calls, live grabbables). */
  afterStep: (index: number) => Promise<void> | void = () => undefined,
  maxSteps = 60,
): Promise<DeepBuild> {
  const steps: DeepStep[] = [];
  const started = Date.now();
  let retries = 0;
  for (let n = 0; steps.length < maxSteps; ) {
    const st = (await page.evaluate(() => (window as any).__wu.state())) as { mode: string; bench: { next: string | null; nextPart: string | null; complete: boolean } | null };
    if (st.mode === 'wind' || st.bench?.complete) break;
    if (!st.bench?.next || !st.bench.nextPart) {
      await frames(page, 6); // a stage is closing, its bag is arriving
      continue;
    }
    const { next: socketId, nextPart: partId } = st.bench;
    const at = await socketPosition(page, socketId);
    if (!at) {
      await frames(page, 6);
      continue;
    }
    const hardware = isHardwarePart(partId);
    const t0 = Date.now();
    const r = await seatByHand(page, hand, socketId, partId, (name) => beat(name, n), { x: 0, y: 0, z: 0 }, { at, hardware });
    const step: DeepStep = { socketId, partId, hardware, seconds: (Date.now() - t0) / 1000, grabbed: r.grabbed, snapped: r.snapped, releasedAt: r.releasedAt };
    if (!r.snapped) {
      retries++;
      if (retries > 20) throw new Error(`the hand missed ${socketId} ${retries} times`);
      await frames(page, 30);
      continue;
    }
    steps.push(step);
    await afterStep(n);
    n++;
  }
  const hardwareCount = steps.filter((s) => s.hardware).length;
  return { level, steps, pinches: steps.length + retries, bigParts: steps.length - hardwareCount, hardware: hardwareCount, seconds: (Date.now() - started) / 1000, retries };
}

/** The catalogue ids of the hardware the Music Box uses (family `fastener`), by the asset stem they start with. */
const HARDWARE_STEMS = ['pin_taper_2', 'pin_dowel_3', 'collar_set_8', 'washer_plain_8', 'bush_split_8', 'screw_slot_m3', 'clip_angle_small'];
export const isHardwarePart = (partId: string): boolean => HARDWARE_STEMS.some((stem) => partId.startsWith(stem));

// ---- Wind -----------------------------------------------------------------------------------------------------------------------

/** Wrist roll about the key's axis (the case's +X): the fingers point along -X, the palm direction turns by `theta` radians about X. */
const rollOf = (theta: number) => ({ fingers: { x: -1, y: 0, z: 0 }, palm: { x: 0, y: -Math.cos(theta), z: Math.sin(theta) } });

export interface WindReport {
  grabs: number;
  /** Wind units after each grab. */
  units: number[];
  seatedAfter: number;
  /** Which parts the pinch grabbed at the start of the first twist (names). */
  grabbedAtPinch: string[];
}

/**
 * A HAND winds the key by wrist twist: the index fingertip on the key's origin, pinch, roll the wrist 45 degrees at a time
 * (`halfTurns` x 45 degrees per grab), let go, roll back, again. WindSystem counts one unit per 90 degrees of twist.
 */
export async function windByHand(
  page: Page,
  hand: Hand,
  grabs: number,
  degreesPerGrab: number,
  beat: (name: string, grab: number) => Promise<void> | void = noBeat,
): Promise<WindReport> {
  const key = (await listParts(page)).find((p) => p.name.startsWith('winding_key'));
  if (!key) throw new Error('no winding key');
  const K = (await partPose(page, key)).origin;
  const units: number[] = [];
  let grabbedAtPinch: string[] = [];
  for (let g = 0; g < grabs; g++) {
    // The fingertip comes down onto the key from above. From the right it crosses the Run plaque (which stands 1.7 cm in front of that line once the key has turned) within the 2 cm a poke needs, and presses it.
    await hand.place(add(K, { x: 0, y: 0.05, z: 0 }), 'index-tip', rollOf(0));
    await frames(page, 2);
    await hand.glide(K, 0.4, 'index-tip', rollOf(0));
    await hand.pinch(1, 0.15);
    await frames(page, 3);
    if (g === 0) grabbedAtPinch = await grabbedParts(page);
    const steps = Math.round(degreesPerGrab / 45);
    for (let s = 1; s <= steps; s++) {
      await hand.glide(K, 0.3, 'index-tip', rollOf((s * Math.PI) / 4));
      if (s === 6) await beat('twisting', g); // 270 degrees in
    }
    await frames(page, 4);
    await hand.pinch(0, 0.12);
    await frames(page, 4);
    units.push((await gameState(page)).windUnits);
    await hand.glide(K, 0.2, 'index-tip', rollOf(0));
  }
  return { grabs, units, seatedAfter: await seatedCount(page), grabbedAtPinch };
}

export interface WindOutcome {
  /** `real pinch`: the plain pinch winds the key. (Before BUG-1 was fixed the key's grab handle had to be removed first, a labelled diagnostic.) */
  path: 'real pinch';
  /** Parts the plain pinch on the seated key took (the key itself: it is held in its socket, not moved) and the seated count after the winding. */
  probe: { grabbed: string[]; seatedAfter: number };
  report: WindReport;
}

/**
 * Winds with a HAND on the untouched game: pinch the seated key, roll the wrist (BUG-1 fixed: the pinch holds the key in its socket and
 * the wrist winds it). The outcome keeps the shape the evidence and repeat specs report.
 */
export async function windByHandAuto(
  page: Page,
  hand: Hand,
  grabs: number,
  degreesPerGrab: number,
  beat: (name: string, grab: number, path: WindOutcome['path']) => Promise<void> | void = noBeat,
): Promise<WindOutcome> {
  const report = await windByHand(page, hand, grabs, degreesPerGrab, (name, grab) => beat(name, grab, 'real pinch'));
  return { path: 'real pinch', probe: { grabbed: report.grabbedAtPinch, seatedAfter: report.seatedAfter }, report };
}

/** Names of the scene objects whose entity holds the Grabbed tag right now. */
export const grabbedParts = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const w = (window as any).__world;
    return w
      .getSceneObject('stage')
      .children.filter((c: any) => w.entityManager.getEntityByIndex(c.entityIdx)?.getComponents().some((x: any) => x.id === 'Grabbed'))
      .map((c: any) => c.name as string);
  });

/**
 * DIAGNOSTIC, not gameplay: removes the key's IWSDK grab handle so a pinch cannot capture it, and so isolates the wrist-twist path
 * of WindSystem from the near-grab that claims the key first. Changes runtime state in the page; no source is touched.
 */
export async function removeKeyGrabHandle(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = (window as any).__world;
    const key = w.getSceneObject('stage').children.find((c: any) => c.name.startsWith('winding_key'));
    const entity = w.entityManager.getEntityByIndex(key.entityIdx);
    entity.removeComponent(entity.getComponents().find((c: any) => c.id === 'Handle'));
  });
}

// ---- Run and place --------------------------------------------------------------------------------------------------------------

/** The key is wound to eight units, as if by hand. DEBUG HELPER (a real hand cannot wind: see the BUG-1 test in hands.spec.ts). */
export const windByHelper = (page: Page, units = 8): Promise<void> => page.evaluate((u) => (window as any).__wu.wind(u), units);

/** Presses the Run plaque (debug helper), waits for the machine to run correctly (the session moves to Place and the machine is in the hand's reach). */
export async function runMachine(page: Page, beat: Beat = noBeat): Promise<void> {
  await pressWhenReady(page, 'UI_Run');
  await beat('run-pressed');
  await waitForMode(page, 'place');
  await page.waitForFunction(() => (window as any).__wu.state().carried === true, null, { timeout: 15_000, polling: 100 });
}

export interface CarryReport {
  handle: Vec3;
  grabbed: boolean;
  /** Distance of the machine's origin from its plot socket when the hand let go, metres. */
  releasedAt: number;
  modeAfter: string;
  placedAfter: string[];
}

/** Where the carried machine's base handle is, where its origin is, and where its plot socket is. */
export const carryGeometry = (page: Page, machine: string, plotSocket: string): Promise<{ handle: Vec3; origin: Vec3; plot: Vec3 }> =>
  page.evaluate(
    ([machine, plotSocket]) => {
      const w = (window as any).__world;
      const town = (window as any).__wu.town;
      const rig = town.rigOf(machine);
      const v = w.camera.position.clone();
      const origin = rig.root.getWorldPosition(v.clone());
      const handleSocket = rig.root.getObjectByName('SOCKET_BaseHandle').getWorldPosition(v.clone());
      let handle: any = null;
      let best = Infinity;
      rig.root.traverse((n: any) => {
        if (n.name !== 'COL_Grab') return;
        const p = n.getWorldPosition(v.clone());
        const d = p.distanceTo(handleSocket);
        if (d < best) {
          best = d;
          handle = p;
        }
      });
      const plot = town.town.ground.getObjectByName(plotSocket).getWorldPosition(v.clone());
      return { handle: { x: handle.x, y: handle.y, z: handle.z }, origin: { x: origin.x, y: origin.y, z: origin.z }, plot: { x: plot.x, y: plot.y, z: plot.z } };
    },
    [machine, plotSocket] as const,
  );

/**
 * A HAND picks the finished machine up by its base handle, carries it over its plot, and lets go. The plot's socket seats it
 * (SocketSnapSystem), the town wakes the plot, the session moves on. Real emulated hand input.
 */
export async function carryToPlot(page: Page, hand: Hand, machine: string, plotSocket: string, beat: Beat = noBeat): Promise<CarryReport> {
  const g = await carryGeometry(page, machine, plotSocket);
  const offset = sub(g.handle, g.origin);
  const carry = add(g.plot, offset);
  await hand.place(g.handle);
  await frames(page, 2);
  await hand.pinch(1, 0.12);
  await frames(page, 3);
  const grabbed = await page.evaluate((machine) => {
    const w = (window as any).__world;
    const rig = (window as any).__wu.town.rigOf(machine);
    return Boolean(w.entityManager.getEntityByIndex(rig.root.entityIdx)?.getComponents().some((c: any) => c.id === 'Grabbed'));
  }, machine);
  await beat('carry-start');
  const up = { x: 0, y: 0.06, z: 0 };
  await hand.glide(add(mix(g.handle, carry, 0.5), up), 0.6);
  await beat('carrying');
  await hand.glide(add(carry, { x: 0, y: 0.02, z: 0 }), 0.5);
  await hand.glide(carry, 0.2);
  const now = await carryGeometry(page, machine, plotSocket);
  const releasedAt = dist(now.origin, now.plot);
  await hand.pinch(0, 0.1);
  await waitForMode(page, 'town', 15_000);
  await frames(page, 6);
  const state = await gameState(page);
  return { handle: g.handle, grabbed, releasedAt, modeAfter: state.mode, placedAfter: state.placed };
}

// ---- The whole story without hands (DEBUG HELPER): used where a test needs a later machine, not the hand flow ------------------------

/**
 * Plays the current letter to the end through the ?debug helper only: envelope, Accept, parcel, seat what is in the tray, wind,
 * Run, drop on the plot. `fault` is the part id to pull out first (a repair letter starts with the faulty part seated).
 * Returns the blueprint id that was built.
 */
export async function playLetterByHelper(page: Page, fault?: string): Promise<string> {
  await pressWhenReady(page, 'envelope');
  await whenActive(page, 'UI_Accept');
  await frames(page, 10);
  await press(page, 'UI_Accept');
  await answerDifficultyCard(page, 'relaxed'); // the first deep build (Letter 1) asks; every other letter does not
  await whenActive(page, 'parcel');
  await frames(page, 20);
  await press(page, 'parcel');
  // The Carousel and the Windmill have little or nothing to place by hand (`build.parts` stays 0), so wait for the build itself.
  await page.waitForFunction(() => (window as any).__wu.state().build !== null, null, { timeout: 60_000, polling: 150 });
  const blueprint = (await gameState(page)).build?.blueprint ?? '';
  if (fault) {
    await waitForMode(page, 'wind', 60_000); // the repair bench opens complete, with the faulty part in
    await page.evaluate((id) => (window as any).__wu.pull(id), fault);
    await waitForMode(page, 'build');
  }
  // Seat until the build is complete: parts spawn a moment after the build opens, and a pulled part's dependents come loose.
  for (let pass = 0; pass < 40; pass++) {
    if ((await gameState(page)).mode === 'wind') break;
    await page.evaluate(() => (window as any).__wu.seatAll());
    await frames(page, 45);
  }
  await waitForMode(page, 'wind', 60_000);
  await frames(page, 10);
  await page.evaluate(() => (window as any).__wu.wind(8));
  await frames(page, 4);
  await pressWhenReady(page, 'UI_Run');
  await waitForMode(page, 'place', 60_000);
  await page.waitForFunction(() => (window as any).__wu.state().carried === true, null, { timeout: 15_000, polling: 100 });
  await frames(page, 10);
  await page.evaluate(() => (window as any).__wu.dropOnPlot());
  await waitForMode(page, 'town', 30_000);
  await frames(page, 20);
  return blueprint;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
