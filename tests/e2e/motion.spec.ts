import { expect, test } from '@playwright/test';
import { openTrunkAndSetBench, playLetterByHelper, runMachine, windByHelper } from './support/flow';
import {
  checkCarousel,
  checkMusicBox,
  checkWindmill,
  measureMotion,
  type MotionReport,
} from './support/motion';
import { changedPixels, mechanismRegion, mechanismVisibility } from './support/pixels';
import { frames, GPU_ARGS, Hand, gameState, openGame, requireDevRuntime, samplePerf, waitForMode, type PerfSample } from './support/xr';

/**
 * Motion and renderer numbers for the machines that are reachable without a hand (the ?debug helper plays the letters).
 * EMULATOR evidence (IWER, desktop Chromium on the GPU, mono view), never headset evidence.
 *
 *  - every turning part of the Carousel and the Windmill turns in the live scene graph at the solver's speed (within 10 %);
 *    Carousel horses rise and fall once per platform turn;
 *  - renderer.info and the JS heap with the Carousel and the Windmill placed (scene draw calls: target 150, ceiling 200);
 *  - BUG-3: from the default seated eye position the running Music Box shows no motion, because the case wall hides it.
 */
test.use({ launchOptions: { args: GPU_ARGS }, viewport: { width: 1120, height: 630 } });
test.setTimeout(600_000);

test.beforeAll(async ({ request }) => {
  await requireDevRuntime(request);
});

/* eslint-disable @typescript-eslint/no-explicit-any -- reaches into the ?debug handles */

test.describe.serial('machines in the town (letters played by the debug helper)', () => {
  test('Carousel and Windmill: every turning part turns at the solver speed; renderer numbers with both placed', async ({ page }) => {
    const perf: PerfSample[] = [];
    const reports: Record<string, MotionReport & { failures: string[] }> = {};
    await openGame(page);
    await openTrunkAndSetBench(page);
    await page.evaluate(() => (window as any).__wu.seatAll());
    await waitForMode(page, 'wind');
    await windByHelper(page, 8);
    await runMachine(page);
    await frames(page, 10);
    await page.evaluate(() => (window as any).__wu.dropOnPlot());
    await waitForMode(page, 'town');
    await frames(page, 90);
    perf.push(await samplePerf(page, 'Music Box placed (letter 1)'));

    expect(await playLetterByHelper(page, 'spring_worn_brass'), 'letter 2 is the Music Box repair').toBe('music_box');
    expect((await gameState(page)).letter).toBe('letter_3');

    expect(await playLetterByHelper(page), 'letter 3 builds the Carousel').toBe('carousel');
    await frames(page, 150); // the wake ripple and the spin-up
    perf.push(await samplePerf(page, 'Carousel placed (Music Box and Carousel in the town)'));
    const carousel = await measureMotion(page, 'carousel', 8, 0.97);
    reports.carousel = { ...carousel, failures: checkCarousel(carousel) };

    expect(await playLetterByHelper(page), 'letter 4 builds the Windmill').toBe('windmill');
    await frames(page, 150);
    perf.push(await samplePerf(page, 'Windmill placed (Music Box, Carousel and Windmill in the town)'));
    const windmill = await measureMotion(page, 'windmill', 4, 0.97);
    reports.windmill = { ...windmill, failures: checkWindmill(windmill) };
    // The Music Box and the Carousel play for one wind (15.7 s) after they are placed and then stand still; only the Windmill turns for good.
    const idle = await page.evaluate(() => (window as any).__wu.town.rigs.map((r: any) => [r.machineId, r.running]));
    test.info().annotations.push({ type: 'running after the Windmill is placed', description: JSON.stringify(idle) });

    test.info().annotations.push({ type: 'perf', description: JSON.stringify(perf) });
    test.info().annotations.push({ type: 'motion', description: JSON.stringify(Object.fromEntries(Object.entries(reports).map(([k, r]) => [k, { rotors: r.rotors.map((x) => [x.socket, +x.measured.toFixed(3), +x.expected.toFixed(3)]), bobbers: r.bobbers.map((b) => [+(b.amplitude * 1000).toFixed(2), +b.rSquared.toFixed(3)]) }]))) });
    await test.info().attach('motion-and-perf.json', { body: JSON.stringify({ perf, reports }, null, 2), contentType: 'application/json' });
    // Written next to the other evidence so the lead can read the numbers after a re-run.
    const fs = (await import('node:fs' as string)) as { writeFileSync(path: string, data: string): void };
    const cwd = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    fs.writeFileSync(`${cwd}/docs/evidence/screens/motion-run.json`, JSON.stringify({ ranAt: new Date().toISOString(), perf, reports }, null, 2));

    for (const [name, r] of Object.entries(reports)) expect(r.failures, `motion of ${name}`).toEqual([]);
  });

  // BUDGET-1. docs/ASSET_OPTIMISATION_BUDGET.md: scene draw calls 150 target, 200 ceiling (renderer.info, mono emulated view; a headset
  // draws both eyes). Reads the numbers the previous test wrote. `test.fail` keeps the suite green while the town is over budget and
  // turns red ("expected to fail but passed") when it comes under.
  test.fail('BUDGET-1: draw calls with the Music Box, the Carousel and the Windmill placed stay under the 200 ceiling (expected to FAIL today: 222 and 292)', async () => {
    const fs = (await import('node:fs' as string)) as { readFileSync(path: string, encoding: string): string };
    const cwd = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const { perf } = JSON.parse(fs.readFileSync(`${cwd}/docs/evidence/screens/motion-run.json`, 'utf8')) as { perf: PerfSample[] };
    for (const sample of perf) expect(sample.drawCalls, `draw calls at "${sample.label}"`).toBeLessThanOrEqual(200);
  });

  test('Music Box running on the bench, helper-built: every turning part turns at the solver speed (control for the hand flow)', async ({ page }) => {
    await openGame(page);
    await openTrunkAndSetBench(page);
    await page.evaluate(() => (window as any).__wu.seatAll());
    await waitForMode(page, 'wind');
    await windByHelper(page, 8);
    await runMachine(page);
    const report = await measureMotion(page, 'music_box', 2.5);
    expect(checkMusicBox(report)).toEqual([]);
  });

  // BUG-3. The motion is real (the tests above and in evidence.spec.ts measure it), but the player cannot see it: from the stand's
  // seated eye position the case's front wall stands between the eye and the gears, and the picture of the mechanism does not change
  // from one second to the next. From above (65 degrees and steeper) the same machine shows the cylinder and gears turning. `test.fail`
  // keeps the suite green while this stands and turns red when the mechanism becomes visible from the seat.
  test.fail('BUG-3: from the default seated eye position the running Music Box visibly moves (expected to FAIL today: the case wall hides the mechanism)', async ({ page }) => {
    await openGame(page);
    await Hand.enable(page);
    await openTrunkAndSetBench(page);
    await page.evaluate(() => (window as any).__wu.seatAll());
    await waitForMode(page, 'wind');
    await windByHelper(page, 8);
    await runMachine(page);
    await page.waitForFunction(() => (window as any).__wu.town.rigOf('music_box').speed > 0.97, null, { timeout: 15_000, polling: 100 });
    // The stand puts the town 0.55 m ahead of and 0.38 m below the eyes; the emulated head starts at (0, 1.6, 0).
    await page.evaluate(async () => {
      const w = (window as any).__world;
      const t = (window as any).__wu.town.rigOf('music_box').root.getWorldPosition(w.camera.position.clone());
      const remote = (window as any).IWER_DEVICE.remote;
      await remote.dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.6, z: 0 } });
      await remote.dispatch('look_at', { device: 'headset', target: { x: t.x, y: t.y + 0.03, z: t.z } });
    });
    await frames(page, 8);
    const seen = await mechanismVisibility(page, 'music_box');
    const region = await mechanismRegion(page, 'music_box');
    const a = await page.screenshot();
    await page.waitForTimeout(700);
    const b = await page.screenshot();
    const seated = await changedPixels(page, a, b, region);
    test.info().annotations.push({
      type: 'bug-3',
      description: `seated eye ${seen.eye.map((v) => v.toFixed(2)).join(', ')}: ${seen.hidden} of ${seen.points} points on the turning parts are hidden behind the case (${(seen.hiddenFraction * 100).toFixed(0)} %); ${(seated.fraction * 100).toFixed(2)} % of the mechanism's region changed in 0.7 s`,
    });
    expect(seen.hiddenFraction, 'share of the turning parts hidden behind the case wall, seen from the seated eye position').toBeLessThan(0.5);
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
