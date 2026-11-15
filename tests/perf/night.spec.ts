import { expect, test } from '@playwright/test';

/**
 * Does the first night hitch? (docs/evidence/PERF_2026-11-15.md section 6.) A desktop page with `?debug`: the stage is shown, the shader programs
 * are counted, the night is switched on at once (`town.setNight(true, true)`, as a saved night does) and the JavaScript time of every
 * `renderer.render` after it is recorded. `precompileNight` compiles the night's programs behind the landing, so no new program may appear at
 * the switch and no frame may take anywhere near a second. Not part of `npm test`: start `npx vite --port 5190 --strictPort` and run
 * `npx playwright test -c playwright.perf.config.ts night` (WU_PERF_URL points it at another server). Desktop evidence only: a headset session
 * that uses multiview asks three for other program variants.
 */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const BASE = (env.WU_PERF_URL ?? 'https://localhost:5190/').replace(/\/?$/, '/');

/* eslint-disable @typescript-eslint/no-explicit-any -- reaches into the opt-in ?debug handles (__world, __wu) */

test('the night switch compiles no new shader program and draws no long frame', async ({ page }) => {
  await page.goto(`${BASE}?debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__world && (window as any).__wu, null, { timeout: 120_000 });
  await page.waitForTimeout(12_000); // the game, the library textures and the pre-warm are in
  await page.mouse.move(40, 300);
  await page.mouse.down(); // a held pointer keeps the 2D page drawing every frame
  await page.evaluate(() => {
    const w = (window as any).__world;
    w.getSceneObject('stage').visible = true; // the landing hides the stage; its materials are what the night recompiles
    (window as any).__wu.town.town.group.visible = true;
  });
  await page.waitForTimeout(3000);
  const programs = (): Promise<string[]> => page.evaluate(() => (window as any).__world.renderer.info.programs.map((p: any) => p.cacheKey as string));
  const day = await programs();
  await page.evaluate(() => {
    const r = (window as any).__world.renderer;
    const draw = r.render.bind(r);
    const times: number[] = [];
    (window as any).__renderMs = times;
    r.render = (scene: unknown, camera: unknown) => {
      const t0 = performance.now();
      draw(scene, camera);
      times.push(performance.now() - t0);
    };
  });
  await page.evaluate(() => (window as any).__wu.town.setNight(true, true));
  await page.waitForTimeout(3000);
  const night = await programs();
  const times = await page.evaluate(() => ((window as any).__renderMs as number[]).filter((t) => t > 0));
  const worst = Math.max(...times);
  const known = new Set(day);
  const added = night.filter((key) => !known.has(key)).length;
  console.log(JSON.stringify({ programsDay: day.length, programsAfterNight: night.length, newAtNight: added, frames: times.length, worstFrameMs: +worst.toFixed(1) }));
  expect(times.length, 'frames were drawn after the switch').toBeGreaterThan(20);
  expect(added, 'programs first compiled at the switch').toBe(0);
  expect(worst, 'the worst frame after the switch (ms)').toBeLessThan(250);
});
