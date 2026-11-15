// Entry point. Paints the landing page first and loads the rest behind it.
//
// Everything heavy (IWSDK, three.js, the town, the game, the flow UI, the gift viewer, audio, the debug and emulator code) lives in
// src/index.ts, which is imported only after the landing has been shown, so the first thing a visitor sees is HTML and CSS and not a
// blank page waiting for 2.4 MB of JavaScript. The landing shows the real loading progress until the actions are usable.
import { landing } from './landing-host.js';

/**
 * The longest the load waits for the landing to be shown: a hidden tab never draws a frame, and on a slow connection the fonts can take longer than
 * this. By the time the game's script has been downloaded then, the landing is almost always up.
 */
const SHOW_LANDING_MAX_MS = 600;

/**
 * Resolves once the landing has been revealed (it holds itself back until its fonts are in, so its first visible frame is final) and
 * two frames have been drawn: evaluating the game's script blocks the main thread for a second or more, and the page must already be on screen.
 */
function landingShown(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#landing-root .wu');
  const revealed = new Promise<void>((resolve) => {
    if (!root || root.dataset.ready === '1') return resolve();
    const watch = new MutationObserver(() => {
      if (root.dataset.ready !== '1') return;
      watch.disconnect();
      resolve();
    });
    watch.observe(root, { attributes: true, attributeFilter: ['data-ready'] });
  });
  const twoFrames = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return Promise.race([revealed.then(twoFrames), new Promise<void>((resolve) => setTimeout(resolve, SHOW_LANDING_MAX_MS))]);
}

void landingShown().then(() => {
  import('./index.js').catch((error: unknown) => {
    console.error('[wound-up] Could not load the game:', error);
    landing.setSupport('none');
    landing.showError('The game could not be downloaded. Check your connection and reload the page.');
    landing.setLoading(null);
  });
});
