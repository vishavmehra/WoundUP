/**
 * Starts the downloads of the GLBs the first screen of the game needs the moment the game module begins to run, BEFORE the world exists:
 * the loaders (IWSDK's asset manager) cannot ask for a file until `World.create` has finished, which is a second or more on a slow
 * laptop, and the network would sit idle for all of it. They are fetched with the loaders' own request shape (same URL, same-origin
 * credentials), so the loaders later find them in the browser's preload cache and nothing is downloaded twice.
 *
 * It is NOT started from the entry (src/main.ts), beside the scripts: the scripts would arrive later on servers that share the connection
 * evenly between requests (measured on `vite preview`: the game script ran 2 s later), and the scripts are what everything waits for.
 * Starting it when the game's script has finished downloading (a PerformanceObserver in main.ts) was tried and measured no better.
 * This file imports nothing heavy. `tests/preload.test.ts` keeps STARTUP_MODELS in step with the loaders that ask for them.
 */

/** GLBs (relative to `assets/models/`) the game page loads before it is usable: the trunk, the town and its dressing, and the workshop (the stand is IWSDK's own critical asset, loaded inside World.create). */
export const STARTUP_MODELS: readonly string[] = [
  'tockton/trunk/trunk_main.glb',
  'tockton/environment/town_ground.glb',
  'tockton/bakery/bakery_building.glb',
  'tockton/theatre/theatre_facade.glb',
  'tockton/characters/figure_otto.glb',
  'tockton/characters/figure_mira.glb',
  'tockton/environment/town_houses.glb',
  'tockton/environment/town_props_set.glb',
  'tockton/environment/lamp_post.glb',
  'tockton/workshop/letter_envelope.glb',
  'tockton/workshop/parcel.glb',
  'tockton/workshop/blueprint_sheet.glb',
  'tockton/workshop/parts_tray.glb',
  'tockton/workshop/workbench.glb',
  'tockton/workshop/lantern_workbench.glb',
];

const absolute = (path: string): string => new URL(`${import.meta.env.BASE_URL}${path}`, document.baseURI).href;

function preload(href: string): void {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'fetch';
  link.crossOrigin = 'anonymous'; // fetch() with same-origin credentials, as the loaders do
  link.href = href;
  document.head.append(link);
}

/** Queues the startup GLBs. Never throws and never blocks; a file that fails to preload is simply fetched when asked for. */
export function preloadStartup(): void {
  try {
    for (const model of STARTUP_MODELS) preload(absolute(`assets/models/${model}`));
  } catch {
    // preloading is an optimisation only
  }
}
