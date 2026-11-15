import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { assembleByHand, carryToPlot, openTrunkAndSetBench, runMachine, windByHelper } from './support/flow';
import { frames, gameState, GPU_ARGS, Hand, openGame, pressWhenReady, requireDevRuntime, waitForMode } from './support/xr';

/**
 * The Music Box flow three times in a row in ONE browser session, with the two things that go wrong after a first run:
 *   run 1  fresh start, the whole flow, then a PAGE RELOAD (the save must bring the town back: plot awake, machine on its plot);
 *   run 2  Restart from the pause menu (the reset), then the whole flow again, then a page reload;
 *   run 3  Restart again, the whole flow again, then a page reload.
 * Parts and the carry are done by hands (IWER); UI presses, wind and Run go through the debug helper. EMULATOR evidence, never headset evidence.
 * A console error or an uncaught exception anywhere fails the run that saw it. The result of each run is written to
 * .tmp/evidence/repeat.json as well as reported by the runner.
 */
test.use({ launchOptions: { args: GPU_ARGS } });
test.setTimeout(600_000);

test.beforeAll(async ({ request }) => {
  await requireDevRuntime(request);
});

/* eslint-disable @typescript-eslint/no-explicit-any -- reaches into the ?debug handles */

interface RunResult {
  run: number;
  start: string;
  flow: 'pass' | 'FAIL';
  reload: 'pass' | 'FAIL';
  seconds: number;
  notes: string[];
}

const results: RunResult[] = [];

async function world(page: Page) {
  return page.evaluate(() => {
    const wu = (window as any).__wu;
    return {
      mode: wu.state().mode as string,
      placed: wu.state().placed as string[],
      letter: wu.state().letter as string | null,
      awake: wu.town.wake.awakePlots() as string[],
      townVisible: wu.town.town.group.visible as boolean,
      machines: wu.session.save.machines.map((m: any) => [m.blueprintId, m.placed, m.plotId]) as unknown[],
      trunk: wu.ui.localFlow.trunk as string,
    };
  });
}

/** Frozen town -> bench -> 12 parts by hand -> wind (helper) -> Run (helper) -> carried by hand onto the plot. */
async function flowByHand(page: Page, hand: Hand): Promise<string[]> {
  const notes: string[] = [];
  await openTrunkAndSetBench(page);
  const reports = await assembleByHand(page, hand);
  const bad = reports.filter((r, i) => !(r.grabbed && r.snapped && r.releasedAt < 0.04 && r.seatedAfter === i + 1));
  expect(bad, '12 parts pinched, carried and snapped').toEqual([]);
  await waitForMode(page, 'wind');
  await windByHelper(page, 8);
  await runMachine(page);
  const carry = await carryToPlot(page, hand, 'music_box', 'SOCKET_PlotMusicBox');
  expect(carry.grabbed).toBe(true);
  expect(carry.releasedAt).toBeLessThan(0.04);
  expect(carry.modeAfter).toBe('town');
  await frames(page, 100); // the ripple settles
  const w = await world(page);
  expect(w.placed).toEqual(['music_box']);
  expect(w.awake).toEqual(['plot_music_box']);
  expect(w.letter).toBe('letter_2');
  notes.push(`12 of 12 parts snapped by hand, carried, placed; awake ${w.awake.join(',')}; next ${w.letter}`);
  return notes;
}

/** Reload the page (the headset session ends with it), enter again, and check the save brought the town back. */
async function reloadAndCheck(page: Page): Promise<string> {
  await page.reload();
  await openGame(page, { loaded: true });
  await Hand.enable(page);
  await page.waitForFunction(() => (window as any).__wu?.state().placed.includes('music_box'), null, { timeout: 60_000, polling: 150 });
  await frames(page, 60);
  const w = await world(page);
  expect(w.mode, 'a returning player starts in the town').toBe('town');
  expect(w.placed, 'the Music Box stands on its plot again').toEqual(['music_box']);
  expect(w.awake, 'its plot is awake').toEqual(['plot_music_box']);
  expect(w.letter, 'the next letter is waiting').toBe('letter_2');
  expect(w.townVisible).toBe(true);
  expect(w.trunk, 'the trunk introduction does not play twice').toBe('gone');
  return `restored: mode ${w.mode}, placed ${w.placed.join(',')}, awake ${w.awake.join(',')}, letter ${w.letter}`;
}

/** Pause -> Restart chapter -> Restart (the second, deliberate press), then the frozen intro again. */
async function restartFromPause(page: Page): Promise<string> {
  await pressWhenReady(page, 'UI_Pause');
  await waitForMode(page, 'pause');
  await frames(page, 15);
  await pressWhenReady(page, 'UI_PanelRight'); // Restart chapter: asks first
  await page.waitForFunction(() => (window as any).__wu.ui.currentView?.panel === 'restart', null, { timeout: 10_000, polling: 100 });
  expect((await gameState(page)).mode, 'one press is only the question').toBe('pause');
  await frames(page, 10);
  await pressWhenReady(page, 'UI_PanelRight'); // Restart: confirmed
  await waitForMode(page, 'intro');
  await frames(page, 60);
  const w = await world(page);
  expect(w.mode).toBe('intro');
  expect(w.placed, 'no machine stands in the town').toEqual([]);
  expect(w.awake, 'no plot is awake').toEqual([]);
  expect(w.machines.filter((m) => (m as unknown[])[1] === true), 'the save holds no placed machine').toEqual([]);
  expect(w.townVisible, 'the town is hidden again until the trunk opens').toBe(false);
  expect(w.trunk, 'the trunk is back, closed').toBe('closed');
  return `reset: mode ${w.mode}, placed ${w.placed.length}, awake ${w.awake.length}, trunk ${w.trunk}`;
}

test.describe.serial('the Music Box flow three times in a row (Restart from the pause menu, reload for the save)', () => {
  let context: BrowserContext;
  let page: Page;
  let hand: Hand;
  const problems: string[] = [];

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 960, height: 540 } });
    page = await context.newPage();
    page.on('pageerror', (e) => problems.push(`uncaught: ${String(e).slice(0, 200)}`));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console.error: ${m.text().slice(0, 200)}`);
    });
    await openGame(page);
    await Hand.enable(page);
    hand = new Hand(page, 'right');
  });

  test.afterAll(async () => {
    const fs = (await import('node:fs' as string)) as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string): void };
    const cwd = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    fs.mkdirSync(`${cwd}/.tmp/evidence`, { recursive: true });
    fs.writeFileSync(`${cwd}/.tmp/evidence/repeat.json`, JSON.stringify({ ranAt: new Date().toISOString(), results, consoleProblems: problems }, null, 2));
    await context.close();
  });

  for (const run of [1, 2, 3]) {
    test(`run ${run}: ${run === 1 ? 'fresh start' : 'after Restart from the pause menu'}, full flow by hand, then a page reload`, async () => {
      const t0 = Date.now();
      const result: RunResult = { run, start: run === 1 ? 'fresh browser context' : 'Restart from the pause menu', flow: 'FAIL', reload: 'FAIL', seconds: 0, notes: [] };
      results.push(result);
      problems.length = 0;
      expect((await world(page)).mode, 'the run starts at the introduction').toBe('intro');
      result.notes.push(...(await flowByHand(page, hand)));
      result.flow = 'pass';
      result.notes.push(await reloadAndCheck(page));
      result.reload = 'pass';
      hand = new Hand(page, 'right');
      if (run < 3) result.notes.push(await restartFromPause(page));
      result.seconds = Math.round((Date.now() - t0) / 1000);
      result.notes.push(`console errors and uncaught exceptions during the run: ${problems.length}`);
      expect(problems, 'no console error and no uncaught exception').toEqual([]);
    });
  }
});

/* eslint-enable @typescript-eslint/no-explicit-any */
