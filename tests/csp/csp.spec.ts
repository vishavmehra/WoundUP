/* eslint-disable @typescript-eslint/no-explicit-any -- these specs reach into the ?debug world handle and the emulator's device */
import { expect, test, type Page } from '@playwright/test';
import { giftCatalogue, giftPlacements, MUSIC_BOX, verifyGift } from '../../src/content/blueprints/index.js';
import { ENGRAVING_IDS } from '../../src/game/content.js';
import { buildGiftUrl, encodeGift } from '../../src/game/gift.js';
import { openTrunkAndSetBench } from '../e2e/support/flow.js';

/**
 * The production build served with the headers of vercel.json (tools/serve-dist.mjs, playwright.csp.config.ts): the Content-Security-Policy
 * that Vercel will enforce must break nothing. Every flow below runs with it enforced and ends on "zero violations" and "no request outside
 * our own origin". Desktop Chromium with software rendering and IWER's emulated Quest 3: EMULATOR evidence. A real Quest Browser session
 * is not covered, and neither is real WebXR plane detection.
 *
 * A violation counts when the page reports it (`securitypolicyviolation` on the document), when Chrome logs it to the console of the page
 * or of a worker it started ("Refused to ..."), or when the page throws.
 */
const PLAY = 'Play in your browser (emulated Quest 3)';

interface Watch {
  /** Everything that went wrong: reported violations, console lines that mention the policy, uncaught errors. */
  problems: string[];
  /** Every http(s) request, to check the origin. */
  urls: string[];
}

async function watch(page: Page): Promise<Watch> {
  const seen: Watch = { problems: [], urls: [] };
  const policyLine = (text: string) => /content security policy|refused to (load|connect|execute|create|apply|frame)/i.test(text);
  page.on('console', (m) => policyLine(m.text()) && seen.problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => seen.problems.push(`pageerror: ${e}`));
  page.on('worker', (w) => w.on('console', (m) => policyLine(m.text()) && seen.problems.push(`worker console: ${m.text()}`)));
  page.on('request', (r) => {
    if (r.url().startsWith('http')) seen.urls.push(r.url());
  });
  await page.addInitScript(() => {
    (window as any).__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as any).__violations.push(`${e.violatedDirective} blocked ${e.blockedURI || '(inline)'} at ${e.sourceFile}:${e.lineNumber}`);
    });
  });
  return seen;
}

/** Reads the violations the page reported so far (the list lives in the page, so read it before navigating away). */
const reported = async (page: Page, seen: Watch): Promise<void> => {
  const list: string[] = await page.evaluate(() => (window as any).__violations ?? []);
  seen.problems.push(...list.map((v) => `securitypolicyviolation: ${v}`));
};

const ownOrigin = (page: Page): string => new URL(page.url()).origin;

test('the response headers are the ones in vercel.json', async ({ request }) => {
  const page = await request.get('./');
  const h = page.headers();
  expect(h['content-security-policy']).toContain("default-src 'self'");
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['content-security-policy']).not.toContain("'unsafe-eval'"); // 'wasm-unsafe-eval' only
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('no-referrer');
  expect(h['permissions-policy']).toContain('xr-spatial-tracking=(self)'); // WebXR needs this origin to keep it
  expect(h['x-frame-options']).toBe('DENY');
  const html = await page.text();
  const script = /src="(\.?\/?assets\/[^"]+\.js)"/.exec(html)?.[1];
  expect(script, 'index.html loads a hashed script').toBeTruthy();
  expect((await request.get(script!)).headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  expect((await request.get('./assets/xr/generic-hand/left.glb')).headers()['content-type']).toBe('model/gltf-binary');
});

test('landing and the 2D preview', async ({ page }) => {
  const seen = await watch(page);
  await page.goto('./');
  await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none', { timeout: 120_000 });
  await expect(page.locator('#scene-container canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Preview in this browser' }).click();
  await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'preview');
  await page.waitForTimeout(3000); // a few frames of the frozen town
  await page.getByRole('button', { name: 'Back to start' }).click();
  await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'landing');

  await reported(page, seen);
  expect(seen.problems).toEqual([]);
  expect(seen.urls.filter((u) => !u.startsWith(ownOrigin(page)))).toEqual([]);
});

test('Play in your browser: the emulated Quest 3 enters XR, the loop starts, and the controllers draw from our own origin', async ({ page }) => {
  const seen = await watch(page);
  await page.setViewportSize({ width: 640, height: 360 }); // software rendering: fewer pixels, more frames
  await page.goto('./?debug');
  await expect(page.locator('.wu')).toHaveAttribute('data-support', 'none', { timeout: 120_000 });
  await page.getByRole('button', { name: PLAY }).click(); // loads the lazy IWER chunk and its panel
  await expect(page.locator('.wu')).toHaveAttribute('data-mode', 'xr', { timeout: 120_000 });
  await expect(page.locator('.wu')).toHaveAttribute('data-support', 'emulated');
  await page.waitForFunction(() => (window as any).__world.getSceneObject('stage').visible, null, { timeout: 120_000 });

  // The loop's first beats, which start the UI text (MSDF workers, wasm), the audio and the part GLBs.
  await openTrunkAndSetBench(page);

  // Controllers: the profile IWSDK resolves for the Quest 3 is requested from jsDelivr by default.
  await page.evaluate(() => ((window as any).IWER_DEVICE.primaryInputMode = 'controller'));
  await expect
    .poll(() => page.evaluate(() => (window as any).__world.input.xr.visualAdapters.controller.right.visual != null), { timeout: 60_000 })
    .toBe(true);

  await reported(page, seen);
  expect(seen.problems).toEqual([]);
  expect(seen.urls.filter((u) => !u.startsWith(ownOrigin(page)))).toEqual([]);
  expect(seen.urls.some((u) => u.includes('/assets/xr/profiles/meta-quest-touch-plus/'))).toBe(true);
});

test('a gift link', async ({ page, baseURL }) => {
  const gift = {
    blueprintId: MUSIC_BOX.id,
    blueprintVersion: MUSIC_BOX.version,
    placements: giftPlacements(MUSIC_BOX, MUSIC_BOX.intended), // the big parts only: the Music Box's hardware is implied (ADR-050)
    engraving: ENGRAVING_IDS[0],
  };
  const encoded = await encodeGift(gift, { catalogue: giftCatalogue, verify: verifyGift });
  if (!encoded.ok) throw new Error(`could not make the test link: ${encoded.error}`);
  const link = buildGiftUrl(baseURL ?? 'http://127.0.0.1:5194/', encoded.data);

  const seen = await watch(page);
  await page.goto(link);
  await page.locator('.wu-gift[data-state="wrapped"]').waitFor({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Unwrap' }).click();
  await page.locator('.wu-gift[data-state="revealed"]').waitFor({ timeout: 60_000 });
  await expect(page.locator('.wu-gift__card')).toContainText('Music Box');
  await page.waitForTimeout(4000); // the machine builds on the stand and starts to turn

  await reported(page, seen);
  expect(seen.problems).toEqual([]);
  expect(seen.urls.filter((u) => !u.startsWith(ownOrigin(page)))).toEqual([]);
});

test('a hostile gift link ends on the error card, still with nothing blocked', async ({ page, baseURL }) => {
  const seen = await watch(page);
  await page.goto(`${baseURL ?? 'http://127.0.0.1:5194/'}#g=${'A'.repeat(200)}`); // valid alphabet, not a deflate stream
  await expect(page.locator('.wu-gift')).toContainText(/damaged|another version/i, { timeout: 120_000 });
  await reported(page, seen);
  expect(seen.problems).toEqual([]);
  expect(seen.urls.filter((u) => !u.startsWith(ownOrigin(page)))).toEqual([]);
});
/* eslint-enable @typescript-eslint/no-explicit-any */
