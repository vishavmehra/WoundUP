/**
 * Shared helpers for the emulator specs (hands, evidence, repeat, motion). They drive the IWSDK dev runtime on localhost:8081,
 * where the dev plugin injects the emulated Quest 3 (IWER) into any browser that loads the page. Everything here is emulator
 * evidence, never headset evidence.
 *
 * The browser is started with the real GPU (ANGLE D3D11) instead of the config's SwiftShader: software rendering runs the
 * emulated headset at about 1 frame per second, the GPU at about 60. Draw calls, triangles, programs and the JS heap do not
 * depend on which rasteriser draws them, so the numbers stay comparable.
 */
import { test, type Page } from '@playwright/test';

export const DEV_URL = 'https://localhost:8081/?debug';

export const GPU_ARGS = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-precise-memory-info'];

export type Vec3 = { x: number; y: number; z: number };
export type Side = 'left' | 'right';

/** Skips the file when the IWSDK dev runtime is not up (CI, production preview). Call it from `test.beforeAll`. */
export async function requireDevRuntime(request: import('@playwright/test').APIRequestContext): Promise<void> {
  const up = await request.get(DEV_URL, { ignoreHTTPSErrors: true, timeout: 3000 }).then(
    (r) => r.ok(),
    () => false,
  );
  test.skip(!up, 'IWSDK dev runtime is not running on https://localhost:8081');
}

/* eslint-disable @typescript-eslint/no-explicit-any -- these reach into the emulator and the opt-in ?debug handles (__world, __wu) */

/** Resolves after `count` frames of the XR session (not of the page: the page's own rAF stops in an immersive session). */
export const frames = (page: Page, count: number): Promise<void> =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const session = (window as any).__world.session;
        let seen = 0;
        const tick = () => (++seen >= n ? resolve() : session.requestAnimationFrame(tick));
        session.requestAnimationFrame(tick);
      }),
    count,
  );

export interface GameState {
  mode: string;
  build: { blueprint: string; parts: number; seated: number; fixed: number } | null;
  windUnits: number;
  carried: boolean;
  placed: string[];
  letter: string | null;
}

export const gameState = (page: Page): Promise<GameState> => page.evaluate(() => (window as any).__wu.state() as GameState);

export interface OpenOptions {
  viewport?: { width: number; height: number };
  /** Navigate to this URL instead of DEV_URL (a reload of the same page keeps its save). */
  url?: string;
  /** Skip the page.goto: the page is already loaded (after a reload). */
  loaded?: boolean;
}

/**
 * Loads the game, enters the emulated immersive-ar session, waits until the table choice is made (the stand, in the emulated
 * room) and hides the emulator's own overlay so screenshots show only what the headset shows.
 */
export async function openGame(page: Page, options: OpenOptions = {}): Promise<void> {
  if (options.viewport) await page.setViewportSize(options.viewport);
  if (!options.loaded) await page.goto(options.url ?? DEV_URL);
  await page.locator('.wu').waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector('.wu')?.getAttribute('data-support') === 'ar', null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Enter mixed reality' }).click();
  await page.waitForFunction(() => document.querySelector('.wu')?.getAttribute('data-mode') === 'xr', null, { timeout: 60_000 });
  await page.waitForFunction(() => (window as any).__world.getSceneObject('stage').visible, null, { timeout: 60_000 });
  await hideEmulatorOverlay(page);
  await frames(page, 10);
}

/** The emulator draws its controller panels, toolbar and "Remote Control Active" badge as shadow-DOM overlays on top of the headset view. */
export const hideEmulatorOverlay = (page: Page): Promise<void> =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll('div')) if (el.shadowRoot) el.style.display = 'none';
  });

/** The headset looks at the stage from a seated eye position, so screenshots show the table the way the player sees it. */
export async function aimAtTable(page: Page, eye: Vec3 = { x: 0, y: 1.44, z: -0.02 }, lift = 0.0): Promise<void> {
  await page.evaluate(
    async ({ eye, lift }) => {
      const w = (window as any).__world;
      const remote = (window as any).IWER_DEVICE.remote;
      const stage = w.getSceneObject('stage').getWorldPosition(w.camera.position.clone());
      await remote.dispatch('set_transform', { device: 'headset', position: eye });
      await remote.dispatch('look_at', { device: 'headset', target: { x: stage.x, y: stage.y + lift, z: stage.z } });
    },
    { eye, lift },
  );
  await frames(page, 6);
}

// ---- Flow steps driven through the ?debug helper (UI presses and the shortcuts a hand cannot reach) --------------------------

/** Presses the named UI target (the trunk latch, the envelope, a plaque) as a ray or poke click would. Debug helper, not a hand. */
export const press = (page: Page, name: string, hit?: string): Promise<boolean> =>
  page.evaluate(([n, h]) => (window as any).__wu.press(n, h) as boolean, [name, hit] as const);

/** Presses `name` as soon as it answers to pointers (a prop that is still animating does not yet). */
export async function pressWhenReady(page: Page, name: string, timeout = 30_000): Promise<void> {
  await page.waitForFunction(([n]) => (window as any).__wu.press(n) as boolean, [name] as const, { timeout, polling: 150 });
}

export const waitForMode = (page: Page, mode: string, timeout = 30_000): Promise<unknown> =>
  page.waitForFunction((m) => (window as any).__wu.state().mode === m, mode, { timeout, polling: 100 });

/** Everything a part GLB is called in the scene: the part id, finish included (`gear_spur_20_m1_brass`). */
export interface PartHandle {
  /** Scene name, which is the part id. */
  name: string;
  /** Index among objects with that name (two brackets share one id). */
  index: number;
}

/** Whether the entity that owns the node named `name` (the `index`th of them under the stage) carries the component `id`. */
export const hasComponent = (page: Page, part: PartHandle, id: string): Promise<boolean> =>
  page.evaluate(
    ({ part, id }) => {
      const w = (window as any).__world;
      const node = w.getSceneObject('stage').children.filter((c: any) => c.name === part.name)[part.index];
      const entity = node && w.entityManager.getEntityByIndex(node.entityIdx);
      return Boolean(entity?.getComponents().some((c: any) => c.id === id));
    },
    { part, id },
  );

/** World position of a part's origin, of its grab collider, and the collider's offset from the origin. */
export interface PartPose {
  origin: Vec3;
  grab: Vec3;
  scale: number;
}

export const partPose = (page: Page, part: PartHandle): Promise<PartPose> =>
  page.evaluate((part) => {
    const w = (window as any).__world;
    const node = w.getSceneObject('stage').children.filter((c: any) => c.name === part.name)[part.index];
    if (!node) throw new Error(`no part ${part.name}#${part.index}`);
    const v = w.camera.position.clone();
    const origin = node.getWorldPosition(v.clone());
    let grab = origin;
    node.traverse((n: any) => {
      if (n.name === 'COL_Grab' && grab === origin) grab = n.getWorldPosition(v.clone());
    });
    return { origin: { x: origin.x, y: origin.y, z: origin.z }, grab: { x: grab.x, y: grab.y, z: grab.z }, scale: node.scale.x };
  }, part);

/** World position of a named empty under the stage (a `SOCKET_` of the housing, for example). */
export const nodePosition = (page: Page, name: string): Promise<Vec3> =>
  page.evaluate((name) => {
    const w = (window as any).__world;
    const node = w.getSceneObject('stage').getObjectByName(name);
    if (!node) throw new Error(`no node ${name} under the stage`);
    const p = node.getWorldPosition(w.camera.position.clone());
    return { x: p.x, y: p.y, z: p.z };
  }, name);

// ---- Hands (real emulated hand input: IWER pinch, hand pose and wrist rotation) -------------------------------------------------

/** One emulated hand. Every call goes through IWER's remote control queue and resolves when the motion has finished. */
export class Hand {
  constructor(
    private readonly page: Page,
    readonly side: Side,
  ) {}

  private get device(): string {
    return `hand-${this.side}`;
  }

  private dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    return this.page.evaluate(([m, p]) => (window as any).IWER_DEVICE.remote.dispatch(m, p), [method, { device: this.device, ...params }] as const);
  }

  /** Switches the emulated headset to hand tracking (hands become the primary input). */
  static async enable(page: Page): Promise<void> {
    await page.evaluate(() => (window as any).IWER_DEVICE.remote.dispatch('set_input_mode', { mode: 'hand' }));
    await frames(page, 6);
  }

  /** Puts `anchor` of the hand (the grip, the index fingertip, the wrist) at `position` at once, and holds it there. */
  place(position: Vec3, anchor = 'grip', orientation?: unknown): Promise<unknown> {
    return this.dispatch('set_transform', { position, anchor, ...(orientation ? { orientation } : {}) });
  }

  /** Moves `anchor` to `position` over `seconds`, turning the wrist to `orientation` on the way when it is given. */
  glide(position: Vec3, seconds: number, anchor = 'grip', orientation?: unknown): Promise<unknown> {
    return this.dispatch('animate_to', { position, anchor, duration: seconds, easing: 'minimum-jerk', ...(orientation ? { orientation } : {}) });
  }

  /** Closes the thumb and index to `value` (1 is a full pinch, a select starts at 0.9) over `seconds`. */
  pinch(value: number, seconds = 0.12): Promise<unknown> {
    return this.dispatch('set_select_value', { value, duration: seconds });
  }

  /** Where an anchor of this hand is now, in the XR origin's space (the world, for this app). */
  async anchorAt(anchor: string): Promise<Vec3> {
    const state = (await this.dispatch('get_hand_state', {})) as { anchors: Record<string, Vec3> };
    return state.anchors[anchor];
  }
}

// ---- Renderer and memory numbers ------------------------------------------------------------------------------------------------

export interface PerfSample {
  label: string;
  drawCalls: number;
  /** Eyes the emulated view renders (2), and the draw calls per eye. */
  eyes: number;
  drawCallsPerEye: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
  /** Unique decoded texture bytes held by the scene's materials, with mipmaps (w x h x 4 x 4/3), as the budget counts them. */
  textureMiB: number;
  /** The five largest of those textures: where they sit (material name or mesh name) and their size in pixels. */
  topTextures: string[];
  jsHeapMiB: number;
  /** Frame counter of the renderer, to show the sample is of a rendered frame. */
  frame: number;
  /**
   * Where the draws come from: visible mesh primitives (one per material) under the stage, grouped by the first two names below the
   * stage root, largest first, and the count outside the stage (hands, interface, room). Counted before frustum culling, so they sum
   * to a little more than `drawCalls`; read them as shares.
   */
  drawSources: string[];
}

/**
 * Reads `renderer.info` after a rendered frame. IWER renders BOTH eyes (the XR camera is an ArrayCamera of two), so `drawCalls` and
 * `triangles` are the two-eye totals; `drawCallsPerEye` is the same divided by the eyes. Quest Browser may draw one eye pass with
 * multiview (unverified, see ASSET_OPTIMISATION_BUDGET section 4): the two-eye total is the figure without it.
 */
export async function samplePerf(page: Page, label: string): Promise<PerfSample> {
  await frames(page, 3);
  return page.evaluate((label) => {
    const w = (window as any).__world;
    const info = w.renderer.info;
    const seen = new Set<any>();
    const sizes: Array<{ label: string; bytes: number }> = [];
    let bytes = 0;
    w.scene.traverse((node: any) => {
      const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
      for (const m of materials) {
        if (/^controller/i.test(m.name ?? '')) continue; // IWER's two controller models (2 x 21 MiB): emulator, not game
        for (const key of Object.keys(m)) {
          const t = m[key];
          if (t && t.isTexture && !seen.has(t)) {
            seen.add(t);
            const img = t.image;
            const width = img?.width ?? img?.videoWidth ?? 0;
            const height = img?.height ?? img?.videoHeight ?? 0;
            const own = width * height * 4 * (4 / 3);
            bytes += own;
            sizes.push({ label: `${m.name || node.name || '?'}.${key} ${width}x${height}`, bytes: own });
          }
        }
      }
    });
    const stage = w.getSceneObject('stage');
    const groups = new Map<string, number>();
    const rigs: any[] = (window as any).__wu?.town?.rigs ?? [];
    let outside = 0;
    w.scene.traverse((node: any) => {
      if (!node.isMesh) return;
      const chain: any[] = [];
      for (let n = node; n && n !== w.scene; n = n.parent) chain.push(n);
      if (chain.some((n) => n.visible === false)) return;
      const draws = Array.isArray(node.material) ? node.material.length : 1;
      const at = chain.indexOf(stage);
      const rig = rigs.find((r: any) => chain.includes(r.root));
      if (at < 0) outside += draws;
      else {
        const below = chain.slice(0, at).reverse();
        const key = rig ? `machine ${rig.machineId}` : below.slice(0, 2).map((n) => n.name || '?').join('/') || stage.name;
        groups.set(key, (groups.get(key) ?? 0) + draws);
      }
    });
    const drawSources = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}: ${n}`);
    drawSources.push(`outside the stage: ${outside}`);
    const heap = (performance as any).memory?.usedJSHeapSize ?? 0;
    return {
      label,
      drawCalls: info.render.calls,
      eyes: w.renderer.xr.getCamera().cameras?.length ?? 1,
      drawCallsPerEye: info.render.calls / (w.renderer.xr.getCamera().cameras?.length ?? 1),
      triangles: info.render.triangles,
      programs: info.programs?.length ?? 0,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      textureMiB: +(bytes / 1048576).toFixed(2),
      topTextures: sizes.sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((t) => `${t.label} (${(t.bytes / 1048576).toFixed(1)} MiB)`),
      jsHeapMiB: +(heap / 1048576).toFixed(1),
      frame: info.render.frame,
      drawSources,
    };
  }, label);
}

/* eslint-enable @typescript-eslint/no-explicit-any */
