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

/** Music Box sockets in blueprint (dependency) order: the empty on the case, and the start of the part id that the blueprint intends there. */
export const MUSIC_BOX_SOCKETS: ReadonlyArray<readonly [socket: string, part: string]> = [
  ['SOCKET_BracketL', 'bracket_support'],
  ['SOCKET_BracketR', 'bracket_support'],
  ['SOCKET_Arbor', 'shaft_short'],
  ['SOCKET_Cylinder', 'cylinder_music_box'],
  ['SOCKET_Comb', 'comb_music_box'],
  ['SOCKET_GearB', 'gear_spur_20_m1'],
  ['SOCKET_GearC', 'gear_spur_16_m1'],
  ['SOCKET_Spring', 'spring_standard'],
  ['SOCKET_GearA', 'gear_spur_10_m1'],
  ['SOCKET_Governor', 'governor_standard'],
  ['SOCKET_GearD', 'gear_spur_12_m1'],
  ['SOCKET_Key', 'winding_key'],
];

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

/** Latch -> lid opens -> town shows -> envelope -> Accept -> parcel -> housing and 12 parts on the bench. Debug-helper presses. */
export async function openTrunkAndSetBench(page: Page, beat: Beat = noBeat): Promise<void> {
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

/** The tray's parts pop in 0.12 s apart: wait until every part is at full size (a grab collider is sized against the part's scale). */
export async function waitForPartsPopped(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = (window as any).__world;
      const parts = w.getSceneObject('stage').children.filter((c: any) => w.entityManager.getEntityByIndex(c.entityIdx)?.getComponents().some((x: any) => x.id === 'SnapPart'));
      return parts.length >= 12 && parts.every((p: any) => p.scale.x > 0.99);
    },
    null,
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

export interface SeatReport {
  part: PartHandle;
  socket: string;
  /** Distance of the part origin from the socket when the hand let go, metres. */
  releasedAt: number;
  grabbed: boolean;
  snapped: boolean;
  seatedAfter: number;
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
): Promise<SeatReport> {
  const parts = await listParts(page);
  const part = parts.find((p) => p.name.startsWith(partPrefix) && !p.snapped);
  if (!part) throw new Error(`no unseated part starting with ${partPrefix} in the tray`);
  const pose = await partPose(page, part);
  pose.grab = add(pose.grab, bias);
  const socketAt = await nodePosition(page, socket);
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
  return { part, socket, releasedAt, grabbed, snapped, seatedAfter: await seatedCount(page) };
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
    await hand.place(add(K, { x: 0.08, y: 0, z: 0 }), 'index-tip', rollOf(0));
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
  /** `real pinch`: the plain pinch winds the key (BUG-1 fixed). `diagnostic`: a pinch grabs the key, so the key's grab handle was removed first. */
  path: 'real pinch' | 'diagnostic: key grab handle removed (BUG-1)';
  /** Parts a plain pinch on the seated key grabbed (BUG-1 shows here), and the seated count after the probe let go. */
  probe: { grabbed: string[]; seatedAfter: number };
  report: WindReport;
}

/**
 * Winds with a HAND whichever way works today. A probe pinches the seated key without moving: if the pinch grabs the key (BUG-1), the
 * key's grab handle is removed (diagnostic) so the same wrist twist can still be shown; once BUG-1 is fixed the probe grabs nothing
 * and the twist runs on the untouched game. The outcome says which path ran.
 */
export async function windByHandAuto(
  page: Page,
  hand: Hand,
  grabs: number,
  degreesPerGrab: number,
  beat: (name: string, grab: number, path: WindOutcome['path']) => Promise<void> | void = noBeat,
): Promise<WindOutcome> {
  const key = (await listParts(page)).find((p) => p.name.startsWith('winding_key'));
  if (!key) throw new Error('no winding key');
  const K = (await partPose(page, key)).origin;
  await hand.place(add(K, { x: 0.08, y: 0, z: 0 }), 'index-tip');
  await frames(page, 2);
  await hand.glide(K, 0.4, 'index-tip');
  await hand.pinch(1, 0.15);
  await frames(page, 3);
  const grabbed = await grabbedParts(page);
  await hand.pinch(0, 0.12);
  await frames(page, 10);
  let seatedAfter = await seatedCount(page);
  if (seatedAfter < 12) {
    // The probe drew the key out of its socket and let go: it comes home to the tray, and a hand seats it again.
    await waitForMode(page, 'build', 10_000);
    await frames(page, 90);
    await seatByHand(page, hand, 'SOCKET_Key', 'winding_key');
    await waitForMode(page, 'wind');
    seatedAfter = await seatedCount(page);
  }
  const diagnostic = grabbed.some((n) => n.startsWith('winding_key'));
  if (diagnostic) await removeKeyGrabHandle(page);
  const path: WindOutcome['path'] = diagnostic ? 'diagnostic: key grab handle removed (BUG-1)' : 'real pinch';
  const report = await windByHand(page, hand, grabs, degreesPerGrab, (name, grab) => beat(name, grab, path));
  return { path, probe: { grabbed, seatedAfter }, report };
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
