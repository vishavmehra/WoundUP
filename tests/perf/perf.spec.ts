import { expect, test, type Page } from '@playwright/test';
import { openTrunkAndSetBench, playLetterByHelper, runMachine, windByHelper } from '../e2e/support/flow';
import { frames, Hand, openGame, samplePerf, waitForMode, type PerfSample } from '../e2e/support/xr';

/**
 * Renderer and frame-time numbers along the story, for docs/evidence/PERF_2026-11-15.md. Not part of `npm test` or the e2e suite:
 * run it with `npx playwright test -c playwright.perf.config.ts` against a server you started on port 5190 (see the config).
 *
 *  - "IWER" test: the dev runtime's emulated Quest 3 (two eyes rendered one after the other, no multiview). Draw calls and triangles
 *    are the two-eye totals. Frame time is the desktop GPU's plus the emulator's, so it ranks changes and proves nothing about Quest.
 *  - "Desktop" test: `?debug&demo=<machine>` in a plain browser window (one view), works on a production build.
 * Everything is written to .tmp/perf/<WU_PERF_LABEL>-*.json. `renderMs` is the JavaScript time of one `renderer.render()` call (draw
 * submission, the part the CPU pays per draw call); the GPU's own time is not measured.
 */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const BASE = (env.WU_PERF_URL ?? 'https://localhost:5190/').replace(/\/?$/, '/');
const LABEL = env.WU_PERF_LABEL ?? 'run';

/* eslint-disable @typescript-eslint/no-explicit-any -- reaches into the opt-in ?debug handles (__world, __wu) */

interface Stats {
  n: number;
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

const stats = (values: number[]): Stats => {
  const v = [...values].sort((a, b) => a - b);
  const at = (q: number): number => v[Math.min(v.length - 1, Math.floor(q * v.length))] ?? 0;
  return { n: v.length, mean: +(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)).toFixed(3), p50: +at(0.5).toFixed(3), p95: +at(0.95).toFixed(3), max: +(v[v.length - 1] ?? 0).toFixed(3) };
};

/** Wraps `renderer.render` once to record its JavaScript time. */
const watchRender = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const r = (window as any).__world.renderer;
    if (r.__wuTimed) return;
    const draw = r.render.bind(r);
    const times: number[] = [];
    r.__wuTimed = times;
    r.render = (scene: unknown, camera: unknown) => {
      const t0 = performance.now();
      draw(scene, camera);
      times.push(performance.now() - t0);
    };
  });

/** Frame interval (ms between frames of the XR session, or of the page when `xr` is false) and `renderer.render` time over `count` frames. */
async function frameTimes(page: Page, count: number, xr: boolean): Promise<{ intervalMs: Stats; renderMs: Stats }> {
  await watchRender(page);
  const out = await page.evaluate(
    ([n, xr]) =>
      new Promise<{ intervals: number[]; render: number[] }>((resolve) => {
        const w = (window as any).__world;
        const timed: number[] = w.renderer.__wuTimed;
        timed.length = 0;
        const intervals: number[] = [];
        let last = 0;
        const ask = (cb: (t: number) => void): void => void (xr ? w.session.requestAnimationFrame(cb) : requestAnimationFrame(cb));
        const tick = (now: number): void => {
          if (last) intervals.push(now - last);
          last = now;
          if (intervals.length >= n) resolve({ intervals, render: [...timed] });
          else ask(tick);
        };
        ask(tick);
      }),
    [count, xr] as const,
  );
  return { intervalMs: stats(out.intervals), renderMs: stats(out.render) };
}

const xrState = (page: Page): Promise<Record<string, unknown>> =>
  page.evaluate(() => {
    const w = (window as any).__world;
    const x = w.renderer.xr;
    const s = w.session;
    return {
      isMultiview: x.isMultiview === true,
      foveation: x.getFoveation?.() ?? null,
      frameRate: s?.frameRate ?? null,
      supportedFrameRates: s?.supportedFrameRates ? [...s.supportedFrameRates] : null,
      antialias: w.renderer.getContextAttributes?.()?.antialias ?? null,
      pixelRatio: w.renderer.getPixelRatio(),
    };
  });

const sceneStats = (page: Page): Promise<Record<string, number>> =>
  page.evaluate(() => {
    const w = (window as any).__world;
    let meshes = 0;
    let visibleMeshes = 0;
    w.scene.traverse((o: any) => {
      if (!o.isMesh) return;
      meshes++;
      for (let n = o; n; n = n.parent) if (n.visible === false) return;
      visibleMeshes++;
    });
    return { meshes, visibleMeshes, shadowMap: w.renderer.shadowMap.enabled ? 1 : 0 };
  });

type Fs = { mkdirSync(p: string, o: object): void; writeFileSync(p: string, d: string): void };

test.describe.serial('renderer numbers', () => {
  test('IWER: the story from the frozen town to every machine placed, then night', async ({ page }) => {
    const samples: Array<PerfSample & { scene: Record<string, number>; timing: { intervalMs: Stats; renderMs: Stats } }> = [];
    const notes: string[] = [];
    await openGame(page, { url: `${BASE}?debug` });
    await Hand.enable(page);
    const xr = await xrState(page);
    const take = async (label: string): Promise<void> => {
      await frames(page, 30);
      const timing = await frameTimes(page, 90, true);
      const perf = await samplePerf(page, label);
      samples.push({ ...perf, scene: await sceneStats(page), timing });
    };
    try {
      await openTrunkAndSetBench(page, async (beat) => {
        if (beat === 'frozen-town') await take('frozen town');
      });
      await page.evaluate(() => (window as any).__wu.seatAll());
      await waitForMode(page, 'wind');
      await windByHelper(page, 8);
      await runMachine(page);
      await take('Music Box running on the bench');
      await page.evaluate(() => (window as any).__wu.dropOnPlot());
      await waitForMode(page, 'town');
      await take('Music Box placed');
      const built = await playLetterByHelper(page, 'spring_worn_brass');
      notes.push(`letter 2: repaired the ${built}`);
      for (const [fault, label] of [
        [undefined, '+ Carousel placed'],
        [undefined, '+ Windmill placed'],
        ['gear_spur_12_m1_brass', 'Windmill repaired (letter 5)'],
        [undefined, '+ Clock Tower placed'],
      ] as const) {
        const machine = await playLetterByHelper(page, fault);
        notes.push(`${label}: built ${machine}`);
        await frames(page, 150);
        await take(label);
      }
    } catch (error) {
      notes.push(`story stopped: ${String(error).split('\n')[0]}`);
    }
    try {
      await page.evaluate(() => (window as any).__wu.town.setNight(true, true));
      await take('night, everything placed so far');
    } catch (error) {
      notes.push(`night not sampled: ${String(error).split('\n')[0]}`);
    }
    const fs = (await import('node:fs' as string)) as Fs;
    fs.mkdirSync('.tmp/perf', { recursive: true });
    fs.writeFileSync(`.tmp/perf/${LABEL}-iwer.json`, JSON.stringify({ ranAt: new Date().toISOString(), source: 'IWER (emulated Quest 3), desktop GPU', xr, notes, samples }, null, 2));
    expect(samples.length, notes.join('; ')).toBeGreaterThan(0);
  });

  test('Desktop: each finished machine awake on its plot (?debug&demo=), one view', async ({ page }) => {
    const rows: unknown[] = [];
    for (const machine of ['music_box', 'carousel', 'windmill']) {
      await page.goto(`${BASE}?debug&demo=${machine}`);
      await page.waitForFunction(() => Boolean((window as any).__wuDemo), null, { timeout: 120_000 });
      await page.waitForTimeout(3000);
      await watchRender(page);
      await page.mouse.move(600, 300); // the page draws only while something changes: keep it awake
      const timing = await frameTimes(page, 120, false);
      const row = await page.evaluate(() => {
        const w = (window as any).__world;
        const i = w.renderer.info;
        return { drawCalls: i.render.calls, triangles: i.render.triangles, programs: i.programs?.length ?? 0, geometries: i.memory.geometries, textures: i.memory.textures };
      });
      rows.push({ machine, ...row, scene: await sceneStats(page), ...timing });
    }
    const fs = (await import('node:fs' as string)) as Fs;
    fs.mkdirSync('.tmp/perf', { recursive: true });
    fs.writeFileSync(`.tmp/perf/${LABEL}-desktop.json`, JSON.stringify({ ranAt: new Date().toISOString(), source: 'Desktop Chromium, one view', rows }, null, 2));
    expect(rows).toHaveLength(3);
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
