import type { World } from '@iwsdk/core';

/** The 2D page never draws faster than this, whatever the display's refresh rate. XR frames are never limited. */
const MAX_2D_FPS = 60;
/** Drawing continues this long after the last sign of change, so a released part can finish settling. */
const WAKE_MS = 1500;
const WAKE_UPDATES = 30;
/** Resolution scale limits for the 2D view. Blur and small movement hide a soft picture; a stutter cannot be hidden. */
const MIN_SCALE = 0.5;
const SCALE_STEP = 0.85;
/** A draw slower than this misses the 60 fps floor. */
const SLOW_DRAW_MS = 20;
const SAMPLE_DRAWS = 30;
/** Slow draws allowed per sample before the resolution drops, and how long it must stay clean before trying higher again. */
const MAX_SLOW_PER_SAMPLE = 3;
const RAISE_AFTER_MS = 8000;

export interface RenderBudget {
  /** 'still': hold the last frame until something asks for a new one (the blurred world behind the landing). 'live': draw while there is activity. */
  setMode(mode: 'still' | 'live'): void;
  /** Something visible may have changed: draw for a short while. */
  wake(): void;
}

/** Keeps the page at a steady 60 fps on modest GPUs by only drawing what can have changed, and by lowering the 2D resolution under load. */
export function installRenderBudget(world: World): RenderBudget {
  const renderer = world.renderer;
  const draw = renderer.render.bind(renderer);
  const update = world.update.bind(world);
  const minInterval = 1000 / MAX_2D_FPS;
  const maxScale = Math.min(window.devicePixelRatio, 1.5);

  let mode: 'still' | 'live' = 'still';
  let awakeUntil = performance.now() + WAKE_MS;
  let wokeAt = performance.now();
  let lastDraw = 0;
  let scale = maxScale;
  let slow = 0;
  let sampled = 0;
  let cleanSince = performance.now();

  renderer.setPixelRatio(scale);

  // A held pointer keeps everything running (a part may be in the hand), and every wake also lasts a minimum number of
  // updates, so a slow machine still finishes a settle that the time window alone would cut short.
  let pointersDown = 0;
  let updatesLeft = WAKE_UPDATES;
  const idle = (now: number): boolean =>
    !renderer.xr.isPresenting && pointersDown === 0 && updatesLeft <= 0 && now > awakeUntil;

  // Holding still also stops the ECS tick; nothing moves in 2D without a wake, and XR always runs.
  world.update = (delta: number, time: number): void => {
    if (idle(performance.now())) return;
    updatesLeft -= 1;
    update(delta, time);
  };

  renderer.render = (scene, camera): void => {
    if (renderer.xr.isPresenting) {
      draw(scene, camera);
      return;
    }
    const now = performance.now();
    if (idle(now)) return;
    const since = now - lastDraw;
    if (since < minInterval - 1) return;

    // A gap much longer than a frame means the page was idle, not that the GPU struggled, and the first second after
    // waking shares the GPU with the landing's own transition.
    if (since < 250 && now - wokeAt > 1000) adapt(since, now);
    lastDraw = now;
    draw(scene, camera);
  };

  function adapt(since: number, now: number): void {
    if (since > SLOW_DRAW_MS) slow += 1;
    sampled += 1;
    if (sampled < SAMPLE_DRAWS) return;
    if (slow > MAX_SLOW_PER_SAMPLE) {
      scale = Math.max(MIN_SCALE, scale * SCALE_STEP);
      renderer.setPixelRatio(scale);
      cleanSince = now;
    } else if (slow === 0 && scale < maxScale && now - cleanSince > RAISE_AFTER_MS) {
      scale = Math.min(maxScale, scale / SCALE_STEP);
      renderer.setPixelRatio(scale);
      cleanSince = now;
    }
    slow = 0;
    sampled = 0;
  }

  const wake = (): void => {
    const now = performance.now();
    if (now > awakeUntil) wokeAt = now;
    awakeUntil = Math.max(awakeUntil, now + WAKE_MS);
    updatesLeft = WAKE_UPDATES;
  };

  // Keeps drawing while the pointer works in the preview. A resize clears the canvas, and a returning tab may have lost its frame.
  const onActivity = (): void => {
    if (mode === 'live') wake();
  };
  // Capture phase, so a handler on the canvas that stops propagation cannot hide input from the budget.
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'wheel', 'keydown']) {
    window.addEventListener(type, onActivity, { passive: true, capture: true });
  }
  window.addEventListener('pointerdown', () => (pointersDown += 1), { capture: true });
  const release = (): void => {
    pointersDown = Math.max(0, pointersDown - 1);
  };
  window.addEventListener('pointerup', release, { capture: true });
  window.addEventListener('pointercancel', release, { capture: true });
  window.addEventListener('blur', () => (pointersDown = 0));
  // Chrome also sends pointermove while page content animates under a resting mouse; only a real move counts.
  let lastX = NaN;
  let lastY = NaN;
  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.clientX === lastX && event.clientY === lastY) return;
      lastX = event.clientX;
      lastY = event.clientY;
      onActivity();
    },
    { passive: true, capture: true },
  );
  window.addEventListener('resize', wake);
  document.addEventListener('visibilitychange', wake);

  return {
    setMode(next) {
      mode = next;
      // Switching mode changes only the CSS over the canvas, so the frame on screen stays right and nothing is redrawn
      // while the landing's blur transition runs. The preview starts sharp: a resolution change clears the canvas, so
      // that one case draws again.
      if (next === 'live' && scale !== maxScale) {
        scale = maxScale;
        renderer.setPixelRatio(scale);
        cleanSince = performance.now();
        wake();
      }
    },
    wake,
  };
}
