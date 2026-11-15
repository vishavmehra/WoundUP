import { expect, test, type Page } from '@playwright/test';
import { carryGeometry, listParts, openTrunkAndSetBench, seatedCount, type ListedPart } from './support/flow';
import { frames, gameState, GPU_ARGS, Hand, hasComponent, nodePosition, openGame, partPose, press, requireDevRuntime, waitForMode, type Vec3 } from './support/xr';

/**
 * Ray interaction mode (PRODUCT_SPEC F17, §16) played with the emulated hand's own ray (IWER), not with a debug helper: a tray part taken
 * from a distance and seated, a seated part taken out on a held pinch (and kept by a tap), the key wound by taps, the Run plaque pressed
 * and the finished machine carried to its plot. EMULATOR evidence, never headset evidence. The only debug-helper steps are named in the
 * comments (the trunk and letter presses, `seatAll`). Needs the IWSDK dev runtime on localhost:8081 and the real GPU.
 */
test.use({ launchOptions: { args: GPU_ARGS }, viewport: { width: 960, height: 540 } });
test.setTimeout(300_000);

test.beforeAll(async ({ request }) => {
  await requireDevRuntime(request);
});

/* eslint-disable @typescript-eslint/no-explicit-any -- reaches into the opt-in ?debug handles (__world, __wu) */
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};

/** The ray as a hand holds it: where the hand is, the aim it was given (fingers and palm), and how far the ray runs to its target. */
interface Aimed {
  handAt: Vec3;
  aim: { fingers: Vec3; palm: Vec3 };
  reach: number;
}

/**
 * Puts the hand `stand` away from `target`, turned to point at it, then shifts it until the hand's own ray passes through `target`. IWER's
 * target ray does not run along the fingers (a Quest hand ray does not either), so the shift is read from the emulator's ray: nothing here
 * says what a headset's ray does. The hand never gets near the target; the ray covers the distance (`reach`).
 */
async function aimRay(page: Page, hand: Hand, target: Vec3, stand: Vec3 = { x: 0, y: 0.3, z: 0.22 }): Promise<Aimed> {
  const away = add(target, stand);
  const fingers = unit(sub(target, away));
  const palm = unit({ x: 0, y: -0.8, z: -0.6 });
  const aim = { fingers, palm };
  await hand.place(away, 'grip', aim);
  await frames(page, 6);
  const ray = await page.evaluate((t) => {
    const w = (window as any).__world;
    const space = w.player.raySpaces.right;
    const o = space.getWorldPosition(w.camera.position.clone());
    const d = new (o.constructor as any)(0, 0, -1).applyQuaternion(space.getWorldQuaternion(new (w.camera.quaternion.constructor as any)()));
    const along = (t.x - o.x) * d.x + (t.y - o.y) * d.y + (t.z - o.z) * d.z;
    return { shift: { x: t.x - (o.x + d.x * along), y: t.y - (o.y + d.y * along), z: t.z - (o.z + d.z * along) }, reach: along };
  }, target);
  const handAt = add(away, ray.shift);
  await hand.place(handAt, 'grip', aim);
  await frames(page, 6);
  return { handAt, aim, reach: ray.reach };
}

/** Switches ray mode on from the pause menu (debug-helper presses of the toggle, as flow-ui does for a pinch) and resumes. */
async function rayModeOn(page: Page): Promise<void> {
  expect(await press(page, 'UI_Pause')).toBe(true);
  await frames(page, 4);
  expect(await press(page, 'UI_Toggle_rayMode')).toBe(true);
  await press(page, 'UI_PanelLeft'); // Resume
  await frames(page, 4);
  expect(await page.evaluate(() => (window as any).__wu.session.save.settings)).toMatchObject({ rayMode: true, gazeMode: false });
}

const learnedOf = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).__wu.lessons().learned);
const grabbed = (page: Page, part: ListedPart): Promise<boolean> => hasComponent(page, part, 'Grabbed');
const unitsOf = async (page: Page): Promise<number> => (await gameState(page)).windUnits;
const partOf = async (page: Page, prefix: string, seated: boolean): Promise<ListedPart> => {
  const part = (await listParts(page)).find((p) => p.name.startsWith(prefix) && p.snapped === seated);
  if (!part) throw new Error(`no ${seated ? 'seated' : 'loose'} part ${prefix}`);
  return part;
};

test("RAY MODE (real hand ray): the hand's ray takes a tray part from a distance, carries it and seats it", async ({ page }) => {
  await openGame(page);
  await Hand.enable(page);
  await rayModeOn(page);
  await openTrunkAndSetBench(page); // debug-helper presses of the latch, the envelope, Accept and the parcel
  const hand = new Hand(page, 'right');
  const part = await partOf(page, 'bracket_support', false);
  const pose = await partPose(page, part);
  const socket = await nodePosition(page, 'SOCKET_BracketL');
  const stood = await aimRay(page, hand, pose.grab);
  await hand.pinch(1, 0.12);
  await frames(page, 6);
  const took = await grabbed(page, part);
  test.info().annotations.push({ type: 'ray', description: `ray pinch from ${Math.round(stood.reach * 100)} cm took the part: ${took}` });
  expect(stood.reach, 'the ray, not the hand, covers the distance').toBeGreaterThan(0.25);
  expect(took, 'a pinch with the ray on the part grabs it').toBe(true);
  // The part follows the ray: move the hand by the part-to-socket offset.
  const delta = { x: socket.x - pose.origin.x, y: socket.y - pose.origin.y + 0.01, z: socket.z - pose.origin.z };
  await hand.glide(add(stood.handAt, { x: delta.x, y: delta.y + 0.03, z: delta.z }), 0.6, 'grip', stood.aim);
  await hand.glide(add(stood.handAt, delta), 0.3, 'grip', stood.aim);
  await hand.pinch(0, 0.1);
  await frames(page, 10);
  expect(await hasComponent(page, part, 'SnappedTo'), 'released at the socket, it seats').toBe(true);
  expect(await learnedOf(page), 'a ray seating a part is the pinch lesson done, as a hand is').toContain('grab');
});

test('RAY MODE (real hand ray): a held pinch takes a seated part out and a tap does not; taps wind the key; the ray presses Run and carries the machine to its plot', async ({ page }) => {
  await openGame(page);
  await Hand.enable(page);
  await rayModeOn(page);
  await openTrunkAndSetBench(page);
  const hand = new Hand(page, 'right');
  // DEBUG HELPER: seatAll puts the twelve parts in (the ray carrying a part to its socket is the test above). From here a ray does everything.
  await page.evaluate(() => (window as any).__wu.seatAll());
  await waitForMode(page, 'wind', 60_000);
  await frames(page, 20);
  const seated = await seatedCount(page);
  expect(seated).toBeGreaterThanOrEqual(11);

  // A seated part: a tap with the ray leaves it; a pinch held half a second and pulled takes it out; carried back and let go, it seats again.
  const gear = await partOf(page, 'gear_spur_12_m1', true);
  const gearAt = await partPose(page, gear);
  const socket = await nodePosition(page, 'SOCKET_GearD');
  let stood = await aimRay(page, hand, gearAt.grab);
  await hand.pinch(1, 0.1);
  await frames(page, 4);
  await hand.pinch(0, 0.1);
  await frames(page, 8);
  expect(await hasComponent(page, gear, 'SnappedTo'), 'a tap never removes a seated part').toBe(true);
  expect(await seatedCount(page)).toBe(seated);

  await hand.pinch(1, 0.1);
  await page.waitForTimeout(700); // held past the half second
  await hand.glide(add(stood.handAt, { x: 0, y: 0.1, z: 0 }), 0.5, 'grip', stood.aim);
  await frames(page, 4);
  expect(await hasComponent(page, gear, 'SnappedTo'), 'a held pinch pulled away takes the part out').toBe(false);
  expect(await grabbed(page, gear)).toBe(true);
  expect((await gameState(page)).mode, 'a part out of its socket puts the build back to Build').toBe('build');
  await hand.glide(stood.handAt, 0.5, 'grip', stood.aim);
  await hand.pinch(0, 0.1);
  await frames(page, 10);
  expect(dist3(await partPose(page, gear).then((p) => p.origin), socket), 'let go over its socket').toBeLessThan(0.04);
  expect(await hasComponent(page, gear, 'SnappedTo'), 'and it seats again').toBe(true);
  await waitForMode(page, 'wind', 30_000);

  // The key: no wrist twist, a tap with the ray winds one unit.
  const key = await partOf(page, 'winding_key', true);
  const keyAt = (await partPose(page, key)).grab;
  expect(await unitsOf(page)).toBe(0);
  await aimRay(page, hand, keyAt, { x: -0.3, y: 0.25, z: 0.1 }); // from the left: once one unit is wound the Run plaque stands in front of the key as seen from the right
  for (let tap = 1; tap <= 8; tap++) {
    await hand.pinch(1, 0.08); // a tap: down and up well inside half a second (nothing may run in the page while the pinch is held)
    await frames(page, 4);
    await hand.pinch(0, 0.08);
    await frames(page, 8);
    expect(await unitsOf(page), `tap ${tap} winds one unit`).toBe(tap);
  }
  expect(await hasComponent(page, key, 'SnappedTo'), 'the key stays in its socket').toBe(true);

  // Run: the plaque is a ray target.
  const run = await page.evaluate(() => {
    const plaque = (window as any).__wu.ui.pressables().find((p: any) => p.name === 'UI_Run' && p.active);
    if (!plaque) return null;
    const w = (window as any).__world;
    const at = plaque.object.getWorldPosition(w.camera.position.clone());
    return { x: at.x, y: at.y, z: at.z };
  });
  expect(run, 'the Run plaque answers').not.toBeNull();
  await aimRay(page, hand, run as Vec3, { x: 0, y: 0.25, z: 0.45 }); // the fingertip stays further than 20 cm off: nearer, IWSDK's poke pointer wins over the ray
  const hit = await page.evaluate(() => {
    const pointer = (window as any).__world.input.xr.multiPointers.right;
    return [pointer.activeKind, pointer.ray?.pointer?.getIntersection?.()?.object?.name ?? null];
  });
  expect(hit, "the far ray, not the poke, is on the plaque").toEqual(["ray", "UI_Run"]);
  await hand.pinch(1, 0.08);
  await frames(page, 4);
  await hand.pinch(0, 0.08);
  await frames(page, 10);
  await waitForMode(page, 'place', 60_000);
  await page.waitForFunction(() => (window as any).__wu.state().carried === true, null, { timeout: 15_000, polling: 100 });

  // Place: the ray takes the machine by its base handle and carries it to the plot.
  const g = await carryGeometry(page, 'music_box', 'SOCKET_PlotMusicBox');
  const offset = sub(g.handle, g.origin);
  const carry = add(g.plot, offset);
  stood = await aimRay(page, hand, g.handle, { x: 0, y: 0.3, z: 0.25 });
  await hand.pinch(1, 0.12);
  await frames(page, 4);
  const took = await page.evaluate(() => {
    const w = (window as any).__world;
    const rig = (window as any).__wu.town.rigOf('music_box');
    return Boolean(w.entityManager.getEntityByIndex(rig.root.entityIdx)?.getComponents().some((c: any) => c.id === 'Grabbed'));
  });
  expect(took, 'the ray takes the machine by its base handle').toBe(true);
  const shift = sub(carry, g.handle);
  await hand.glide(add(stood.handAt, { x: shift.x / 2, y: shift.y / 2 + 0.06, z: shift.z / 2 }), 0.6, 'grip', stood.aim);
  await hand.glide(add(stood.handAt, { x: shift.x, y: shift.y + 0.02, z: shift.z }), 0.5, 'grip', stood.aim);
  await hand.glide(add(stood.handAt, shift), 0.2, 'grip', stood.aim);
  await hand.pinch(0, 0.1);
  await waitForMode(page, 'town', 20_000);
  await frames(page, 6);
  expect((await gameState(page)).placed, 'the machine stands on its plot').toContain('music_box');
  expect(await learnedOf(page), 'winding, Run and placing are the lessons done').toEqual(expect.arrayContaining(['wind', 'run', 'place']));
});

const dist3 = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
