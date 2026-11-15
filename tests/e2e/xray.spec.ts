import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { answerDifficultyCard, carryToPlot, openTrunkAndSetBench, runMachine, seatAllByHelper, whenActive, windByHelper } from './support/flow';
import { frames, gameState, GPU_ARGS, Hand, openGame, press, pressWhenReady, requireDevRuntime, waitForMode, type Vec3 } from './support/xr';

/**
 * X-ray in the emulated Quest 3 (IWER; emulator evidence, never headset evidence). The casing of the machine fades to about 15% opacity over
 * 0.3 s and the mechanism stays opaque and glows a gentle warm (it wears its own copy of the material while X-ray shows), for the lens button and for the open palm facing down 5 to 20 cm above the machine, on the
 * bench, in the hand and on the plot. The lens press and Run go through the debug helper (`window.__wu`); the palm, the carry and the drop
 * are IWER hand input.
 *
 * Needs the IWSDK dev runtime (WU_DEV_PORT, default 8081) and the real GPU.
 */
test.use({ launchOptions: { args: GPU_ARGS }, viewport: { width: 960, height: 540 } });
test.setTimeout(300_000);

test.beforeAll(async ({ request }) => {
  await requireDevRuntime(request);
});

/* eslint-disable @typescript-eslint/no-explicit-any -- reaches into the opt-in ?debug handles (__world, __wu) */

interface Look {
  /** Meshes whose name starts with the Music Box case prefix: how many, and the lowest and highest opacity among them. */
  casing: { count: number; min: number; max: number; transparent: number; depthWrite: number };
  /** Every other mesh under the stage that is part of a machine (gears, shafts, key): the lowest opacity, and how many are transparent. */
  mechanism: { count: number; min: number; transparent: number; lit: number; unlit: number };
}

/** The look of the Music Box now: casing meshes by name prefix, the seated gears and shafts by theirs. */
const look = (page: Page): Promise<Look> =>
  page.evaluate(() => {
    const w = (window as any).__world;
    const casing = { count: 0, min: 1, max: 0, transparent: 0, depthWrite: 0 };
    const mechanism = { count: 0, min: 1, transparent: 0, lit: 0, unlit: 0 };
    w.getSceneObject('stage').traverse((n: any) => {
      if (!n.isMesh) return;
      const m = Array.isArray(n.material) ? n.material[0] : n.material;
      if (n.name.startsWith('MusicBoxCase_')) {
        casing.count++;
        casing.min = Math.min(casing.min, m.opacity);
        casing.max = Math.max(casing.max, m.opacity);
        casing.transparent += m.transparent ? 1 : 0;
        casing.depthWrite += m.depthWrite ? 1 : 0;
      } else if (/^(GearSpur|ShaftShort|Cylinder|Governor|Spring|WindingKey|Comb)/i.test(n.name)) {
        mechanism.count++;
        mechanism.min = Math.min(mechanism.min, m.opacity);
        mechanism.transparent += m.transparent ? 1 : 0;
        const glow = m.emissive.r * m.emissiveIntensity; // the warm X-ray glow of a moving part (the comb is the case's, it does not move)
        if (/^Comb/i.test(n.name)) return;
        if (glow > 0.1 && m.emissive.r > m.emissive.b) mechanism.lit++;
        else mechanism.unlit++;
      }
    });
    return { casing, mechanism };
  });

/** The headset moves to a seated eye position 30 cm towards the player and 22 cm above `root` (`rigOf` machine, or the bench housing) and looks at it. */
const aimAt = (page: Page, machine: 'bench' | 'plot'): Promise<void> =>
  page.evaluate(async (which) => {
    const w = (window as any).__world;
    const root = which === 'plot' ? (window as any).__wu.town.rigOf('music_box').root : w.getSceneObject('stage').children.find((c: any) => c.name === 'music_box');
    const t = root.getWorldPosition(w.camera.position.clone());
    const remote = (window as any).IWER_DEVICE.remote;
    await remote.dispatch('set_transform', { device: 'headset', position: { x: t.x, y: t.y + 0.22, z: t.z + 0.3 } });
    await remote.dispatch('look_at', { device: 'headset', target: { x: t.x, y: t.y + 0.04, z: t.z } });
  }, machine);

/** Waits for the fade (0.3 s) to settle and the picture to be drawn. */
const settle = (page: Page): Promise<void> => frames(page, 40);

async function expectSeeThrough(page: Page, why: string): Promise<void> {
  const l = await look(page);
  expect(l.casing.count, `${why}: casing meshes`).toBeGreaterThan(0);
  expect(l.casing.max, `${why}: the casing is about 15% opaque`).toBeLessThan(0.2);
  expect(l.casing.min, `${why}: ... and not gone`).toBeGreaterThan(0.1);
  expect(l.casing.transparent, `${why}: every casing material is transparent`).toBe(l.casing.count);
  expect(l.casing.depthWrite, `${why}: and writes no depth`).toBe(0);
  expect(l.mechanism.min, `${why}: the mechanism stays opaque`).toBe(1);
  expect(l.mechanism.transparent, `${why}: and is not transparent`).toBe(0);
  expect(l.mechanism.lit, `${why}: the moving parts glow warm`).toBeGreaterThan(0);
  expect(l.mechanism.unlit, `${why}: every one of them`).toBe(0);
}

async function expectSolid(page: Page, why: string): Promise<void> {
  const l = await look(page);
  expect(l.casing.count, `${why}: casing meshes`).toBeGreaterThan(0);
  expect(l.casing.min, `${why}: the casing is as built`).toBe(1);
  expect(l.casing.transparent, `${why}: not transparent`).toBe(0);
  expect(l.mechanism.lit, `${why}: nothing glows`).toBe(0);
}

/** Open palm facing down, `above` metres over `at` (the machine's origin), fingers pointing away from the player. IWER: palm is the direction the palm faces. */
const palmOver = (hand: Hand, at: Vec3, above: number) =>
  hand.place({ x: at.x, y: at.y + above, z: at.z + 0.07 }, 'wrist', { fingers: { x: 0, y: 0, z: -1 }, palm: { x: 0, y: -1, z: 0 } });

test.describe('X-ray (IWER)', () => {
  test('the lens and the palm fade the Music Box casing on the bench, in the hand and on its plot; the mechanism stays opaque', async ({ page }) => {
    await openGame(page);
    await Hand.enable(page);
    await openTrunkAndSetBench(page);
    const hand = new Hand(page, 'right');
    await seatAllByHelper(page); // DEBUG HELPER: seat the stages quickly
    await waitForMode(page, 'wind');
    await settle(page);

    await test.step('bench, lens (DEBUG HELPER press): casing fades, mechanism stays; the lens again: as built', async () => {
      await expectSolid(page, 'before');
      await aimAt(page, 'bench');
      await settle(page);
      await page.screenshot({ path: test.info().outputPath('xray-bench-solid.png') });
      expect(await press(page, 'UI_Lens')).toBe(true);
      await settle(page);
      await expectSeeThrough(page, 'lens on');
      await page.screenshot({ path: test.info().outputPath('xray-bench-lens.png') });
      expect(await press(page, 'UI_Lens')).toBe(true);
      await settle(page);
      await expectSolid(page, 'lens off');
    });

    await test.step('bench, REAL HAND: an open palm facing down 10 cm over the case, held, fades the casing; lifting the hand brings it back', async () => {
      const origin = await page.evaluate(() => {
        const w = (window as any).__world;
        const root = w.getSceneObject('stage').children.find((c: any) => c.name === 'music_box');
        const p = root.getWorldPosition(w.camera.position.clone());
        return { x: p.x, y: p.y, z: p.z };
      });
      await palmOver(hand, origin, 0.1 + 0.1); // the zone's top is 10 cm: the palm is 10 cm above it
      await frames(page, 6);
      await settle(page);
      await expectSeeThrough(page, 'palm over the bench machine');
      await hand.place({ x: origin.x + 0.4, y: origin.y + 0.3, z: origin.z + 0.3 });
      await settle(page);
      await expectSolid(page, 'palm away');
    });

    await test.step('in the hand, lens: the finished machine being carried fades (DEBUG HELPER: wind and Run)', async () => {
      await windByHelper(page, 8);
      await runMachine(page);
      await settle(page);
      await expectSolid(page, 'carried');
      expect(await press(page, 'UI_Lens')).toBe(true);
      await settle(page);
      await expectSeeThrough(page, 'carried, lens on');
      expect(await press(page, 'UI_Lens')).toBe(true);
      await settle(page);
      await expectSolid(page, 'carried, lens off');
    });

    await test.step('on its plot: the lens is not for a standing machine, the palm over it is', async () => {
      const carry = await carryToPlot(page, hand, 'music_box', 'SOCKET_PlotMusicBox');
      expect(carry.modeAfter).toBe('town');
      await settle(page);
      await expectSolid(page, 'on the plot');
      const where = await page.evaluate(() => {
        const w = (window as any).__world;
        const rig = (window as any).__wu.town.rigOf('music_box');
        const p = rig.root.getWorldPosition(w.camera.position.clone());
        const e = w.entityManager.getEntityByIndex(rig.root.entityIdx);
        const zone = e.getValue(e.getComponents().find((c: any) => c.id === 'XRayTarget'), 'top') as number;
        return { x: p.x, y: p.y, z: p.z, top: zone * rig.root.scale.x };
      });
      await palmOver(hand, where, where.top + 0.1);
      await frames(page, 6);
      await settle(page);
      await expectSeeThrough(page, 'palm over the machine on its plot');
      await aimAt(page, 'plot');
      await settle(page);
      await page.screenshot({ path: test.info().outputPath('xray-plot-palm.png') });
      await hand.place({ x: where.x + 0.4, y: where.y + 0.3, z: where.z + 0.3 });
      await settle(page);
      await expectSolid(page, 'palm away from the plot');
    });
  });

  // The other three machines: the story is played with the debug helper (it needs no hand to show what X-ray does to a machine), the lens
  // is pressed with the helper on the bench and in the hand, and the palm is IWER hand input over the machine standing on its plot.
  test('the Carousel, the Windmill and the Clock Tower fade their casing on the bench, in the hand and on the plot; everything else is as solid as it was', async ({ page }) => {
    test.setTimeout(900_000);
    await openGame(page);
    await Hand.enable(page);
    await openTrunkAndSetBench(page);
    const hand = new Hand(page, 'right');
    await seatAllByHelper(page); // DEBUG HELPER: seat the stages quickly
    await waitForMode(page, 'wind');
    await windByHelper(page, 8);
    await runMachine(page);
    await frames(page, 10);
    await page.evaluate(() => (window as any).__wu.dropOnPlot());
    await waitForMode(page, 'town');
    await frames(page, 30);
    await playStory(page, 'spring_worn_brass'); // letter 2, the Music Box repair

    const machines: Array<[id: string, prefixes: readonly string[]]> = [
      ['carousel', ['CarouselBase_', 'CarouselCanopy_']],
      ['windmill', ['WindmillBase_', 'WindmillTower_']],
      ['clock_tower', ['ClockTowerBase_', 'ClockTowerBaseWalls_', 'ClockTowerShell_', 'ClockTower_']],
    ];
    for (const [id, prefixes] of machines) {
      if (id === 'clock_tower') await playStory(page, 'gear_spur_12_m1_brass'); // letter 5, the Windmill's wrong gear, comes first
      await playStory(page, undefined, {
        bench: async () => {
          const before = await snapshot(page, id, 'bench', prefixes);
          expect(before.casing, `${id}: the housing has casing meshes`).toBeGreaterThan(0);
          await press(page, 'UI_Lens');
          await settle(page);
          await expectFaded(page, id, 'bench', prefixes, before, `${id} on the bench, lens on`);
          await press(page, 'UI_Lens');
          await settle(page);
          await expectSame(page, id, 'bench', before, `${id} on the bench, lens off`);
        },
        carried: async () => {
          const before = await snapshot(page, id, 'rig', prefixes);
          expect(before.casing, `${id}: the finished machine has casing meshes`).toBeGreaterThan(0);
          expect(before.others, `${id}: and a mechanism that is not casing`).toBeGreaterThan(0);
          await press(page, 'UI_Lens');
          await settle(page);
          await expectFaded(page, id, 'rig', prefixes, before, `${id} in the hand, lens on`);
          await press(page, 'UI_Lens');
          await settle(page);
          await expectSame(page, id, 'rig', before, `${id} in the hand, lens off`);
        },
        placed: async () => {
          const before = await snapshot(page, id, 'rig', prefixes);
          await expectSame(page, id, 'rig', before, `${id} on its plot, no palm`);
          const where = await page.evaluate((machine) => {
            const w = (window as any).__world;
            const rig = (window as any).__wu.town.rigOf(machine);
            const p = rig.root.getWorldPosition(w.camera.position.clone());
            const e = w.entityManager.getEntityByIndex(rig.root.entityIdx);
            const top = e.getValue(e.getComponents().find((c: any) => c.id === 'XRayTarget'), 'top') as number;
            return { x: p.x, y: p.y, z: p.z, top: top * rig.root.scale.x };
          }, id);
          await palmOver(hand, where, where.top + 0.1);
          await frames(page, 6);
          await settle(page);
          await expectFaded(page, id, 'rig', prefixes, before, `${id} on its plot, palm over it`);
          await hand.place({ x: where.x + 0.4, y: where.y + 0.4, z: where.z + 0.3 });
          await settle(page);
          await expectSame(page, id, 'rig', before, `${id} on its plot, palm away`);
        },
      });
    }
  });
});

interface Snap {
  casing: number;
  others: number;
  meshes: Array<{ name: string; material: string; opacity: number; transparent: boolean; casing: boolean }>;
}

/** Every mesh of the machine (the bench housing, or the finished rig) with its material's uuid and opacity, and whether it is casing: its name starts with a prefix, or it carries the flag the static batching gives a merged casing mesh (`userData.xrayShell`). */
const snapshot = (page: Page, id: string, where: 'bench' | 'rig', prefixes: readonly string[]): Promise<Snap> =>
  page.evaluate(
    ([id, where, prefixes]) => {
      const w = (window as any).__world;
      const root = where === 'rig' ? (window as any).__wu.town.rigOf(id).root : w.getSceneObject('stage').children.find((c: any) => c.name === id);
      const meshes: any[] = [];
      root.traverse((n: any) => {
        if (!n.isMesh) return;
        const m = Array.isArray(n.material) ? n.material[0] : n.material;
        meshes.push({ name: n.name, material: m.uuid, opacity: m.opacity, transparent: m.transparent, casing: n.userData.xrayShell === true || (prefixes as string[]).some((p) => n.name.startsWith(p)) });
      });
      return { casing: meshes.filter((m) => m.casing).length, others: meshes.filter((m) => !m.casing).length, meshes };
    },
    [id, where, prefixes] as const,
  );

async function expectFaded(page: Page, id: string, where: 'bench' | 'rig', prefixes: readonly string[], before: Snap, why: string): Promise<void> {
  const now = await snapshot(page, id, where, prefixes);
  expect(now.meshes.length, `${why}: the same meshes`).toBe(before.meshes.length);
  now.meshes.forEach((m, i) => {
    const was = before.meshes[i];
    if (m.casing) {
      expect(m.opacity, `${why}: ${m.name} is about 15% opaque`).toBeLessThan(0.2);
      expect(m.opacity, `${why}: ${m.name} is not gone`).toBeGreaterThan(0.1);
      expect(m.transparent, `${why}: ${m.name} is transparent`).toBe(true);
    } else {
      // The moving parts wear a glowing copy of their material while X-ray shows (the rest keep theirs): either way they stay as solid as they were.
      expect(m.opacity, `${why}: ${m.name} keeps its opacity`).toBe(was.opacity);
      expect(m.transparent, `${why}: ${m.name} keeps its solidity`).toBe(was.transparent);
    }
  });
}

async function expectSame(page: Page, id: string, where: 'bench' | 'rig', before: Snap, why: string): Promise<void> {
  const now = await snapshot(page, id, where, []);
  now.meshes.forEach((m, i) => {
    expect(m.material, `${why}: ${m.name} has the material it was built with`).toBe(before.meshes[i].material);
    expect(m.opacity, `${why}: ${m.name}`).toBe(before.meshes[i].opacity);
  });
}

/**
 * Plays the current letter through the debug helper like `playLetterByHelper` (support/flow.ts), calling `hooks` at the three moments X-ray is
 * looked at: the machine on the bench, finished in the hand, and standing on its plot.
 */
async function playStory(page: Page, fault?: string, hooks: { bench?: () => Promise<void>; carried?: () => Promise<void>; placed?: () => Promise<void> } = {}): Promise<void> {
  await pressWhenReady(page, 'envelope');
  await whenActive(page, 'UI_Accept');
  await frames(page, 10);
  await press(page, 'UI_Accept');
  await answerDifficultyCard(page, 'relaxed'); // the first deep build asks for a level
  await whenActive(page, 'parcel');
  await frames(page, 20);
  await press(page, 'parcel');
  await page.waitForFunction(() => (window as any).__wu.state().build !== null, null, { timeout: 60_000, polling: 150 });
  if (fault) {
    await waitForMode(page, 'wind', 60_000);
    await page.evaluate((id) => (window as any).__wu.pull(id), fault);
    await waitForMode(page, 'build');
  }
  for (let pass = 0; pass < 40; pass++) {
    if ((await gameState(page)).mode === 'wind') break;
    await seatAllByHelper(page); // DEBUG HELPER: seat the stages quickly
    await frames(page, 45);
  }
  await waitForMode(page, 'wind', 60_000);
  await frames(page, 30);
  await hooks.bench?.();
  await page.evaluate(() => (window as any).__wu.wind(8));
  await frames(page, 4);
  await pressWhenReady(page, 'UI_Run');
  await waitForMode(page, 'place', 60_000);
  await page.waitForFunction(() => (window as any).__wu.state().carried === true, null, { timeout: 15_000, polling: 100 });
  await frames(page, 10);
  await hooks.carried?.();
  await page.evaluate(() => (window as any).__wu.dropOnPlot());
  await waitForMode(page, 'town', 30_000);
  await frames(page, 30);
  await hooks.placed?.();
}
