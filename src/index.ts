import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AudioEngine, bindInteractionAudio } from './audio/index.js';
import { getBlueprint, giftCatalogue, INTRICATE_ASSEMBLY, verifyGift } from './content/blueprints/index.js';
import { demoRequest, DEMO_HINT, installDemo } from './debug/demo.js';
import { Gameplay, installGameplay } from './gameplay.js';
import { GameSession } from './game/session.js';
import { hasGiftHash, type Gift } from './game/gift.js';
import { showGiftMachine } from './gift-stage.js';
import { GrabFeedbackSystem } from './grab-feedback.js';
import { GrabModeSystem } from './grab-mode.js';
import { useSelfHostedHands } from './hands.js';
import { installInteraction } from './interaction/index.js';
import { landing, landingOptions } from './landing-host.js';
import type { Landing, LandingOptions } from './landing/landing.js';
import { installToneMapping } from './lighting.js';
import { createMaterialRegistry, type MaterialRegistry } from './materials/index.js';
import { PartLoader } from './parts/index.js';
import { preloadStartup } from './preload.js';
import { installRenderBudget, type RenderBudget } from './render-budget.js';
import { compileBehindLanding, installRenderGate } from './render-gate.js';
import { StageSystem } from './stage.js';
import { machineFrame, stageFrame, type Insets, type StageBox } from './stage-framing.js';
import { addWorkshopLantern, emptyTownSource, installTown, loadModel, prepareTownShading, showGiftPlate } from './town/index.js';
import type { WakeUniforms } from './town/wake-shader.js';
import { precompileNight } from './town/night.js';
import { browserShareEnv, installFlowUi, MASTER_AVAILABLE, mountGiftViewer, type FlowEvent } from './ui/index.js';
import { detectXrSupport, enterXR } from './xr-entry.js';
import { installXrTuning } from './xr-tuning.js';

const sceneContainer = document.getElementById('scene-container') as HTMLDivElement;

let world: World | undefined;
/** What the 2D page shows while no immersive session is running. */
let idleMode: 'landing' | 'preview' = 'landing';
let renderBudget: RenderBudget | undefined;
/** A first-time player: the trunk is closed and the town hidden until it opens, so the town's models load after the page is usable (`installGame`). */
let deferTown = false;
/** Loads the town once the page is usable (set when the game is installed with `deferTown`). */
let loadTown: (() => Promise<void>) | undefined;
/** On a gift page: the machine on show (stage-local box) and the part of the window the gift card leaves free. Both set means "frame the machine". */
let giftMachine: StageBox | null = null;
let giftInsets: Insets | null = null;

// The landing itself is mounted by src/main.ts (it paints before this module is even downloaded); the actions it offers are filled in here.
const actions: Partial<LandingOptions> = {
  // "Play in your browser": offered only where the browser has no WebXR. Loads IWER's emulated Quest 3 on demand (its own chunk).
  onPlayEmulated: async () => {
    if (!world) throw new Error('The workshop is still unpacking. Try again in a moment.');
    await (await import('./emulator/index.js')).startBrowserHeadset();
    if ((await detectXrSupport()) === 'none') throw new Error('The emulated headset did not answer WebXR.');
    world.getSystem(GrabModeSystem)?.useHands(); // the parts were given mouse-ray grabbing when the page had no WebXR (ADR-024)
    landingOptions.previewHint = 'This preview is for looking. Enter mixed reality (emulated) to build the machines with the emulated hands.';
  },
  // Called synchronously from the click handler: WebXR needs the user gesture.
  onEnterXR: (mode) => {
    if (!world) throw new Error('The workshop is still unpacking. Try again in a moment.');
    return enterXR(world, mode);
  },
  onPreview: () => {
    // Without a world the preview would be an empty page with a hint about a trunk that is not there.
    if (!world) throw new Error('The 3D view did not start.');
    idleMode = 'preview';
    renderBudget?.setMode('live');
  },
  onBack: () => {
    idleMode = 'landing';
    renderBudget?.setMode('still');
  },
};
Object.assign(landingOptions, actions);

/** Loading progress shown on the landing's ruler, 0 to 1. Only moves forward: parallel loads report in any order. */
let loadedFraction = 0;
/** User Timing marks (`performance.getEntriesByType('mark')`): where the start-up time goes. They cost nothing and are how docs/evidence/WEBPERF_2026-11-15.md was measured. */
const mark = (name: string): void => void performance.mark(`wu:${name}`);
const progress = (fraction: number): void => {
  loadedFraction = Math.max(loadedFraction, Math.min(1, fraction));
  landing.setLoading(loadedFraction);
};

/**
 * Loads the library textures, reporting progress as each material's three images arrive (0.15 to 0.5 of the whole). Needs no world, so
 * it runs while the world is created. Never rejects: a material whose textures fail keeps its constants.
 */
function loadLibraryTextures(materials: MaterialRegistry): Promise<void> {
  const names = materials.names();
  let done = 0;
  return Promise.all(names.map((name) => materials.loadTextures([name]).then(() => progress(0.15 + (0.35 * ++done) / names.length))))
    .then(() => undefined)
    .catch((e: unknown) => console.warn('[wound-up] library textures did not load:', e));
}

/**
 * The playable game: session, interaction, audio, flow UI and the loop that joins them (src/gameplay.ts), and the town. The loop is made
 * first and given its parts as they arrive. With `deferTown` (a first-time player: the town is hidden until the trunk opens) the town is
 * NOT loaded here: `loadTown` does it, after the page has become usable, and the loop copes with a town that is not there yet
 * (`Gameplay.townReady`). Without it (a returning player, whose town is on show at once) the town is loaded before this returns.
 * Returns what `?debug` exposes and `loadTown` (the same promise however often it is called).
 */
async function installGame(
  gameWorld: World,
  materials: MaterialRegistry,
  texturesReady: Promise<void>,
  budget: RenderBudget,
  progress: (fraction: number) => void,
  session: GameSession,
  wake: WakeUniforms,
  deferTown: boolean,
): Promise<{ debug: ReturnType<Gameplay['debug']>; loadTown: () => Promise<void> }> {
  // Easy Snap and gaze mode from the save reach the interaction systems before the flow UI reads them (the pause menu changes both later).
  installInteraction(gameWorld, { easySnap: session.save.settings.easySnap, gazeMode: session.save.settings.gazeMode, level: session.save.settings.difficulty ?? 'standard' });
  const audio = new AudioEngine();
  audio.installGestureUnlock();
  bindInteractionAudio(audio, { snaps: false }); // the game loop plays every snap itself, in the voice of the part's material (src/assembly/feedback.ts)
  const play = new Gameplay(gameWorld, { session, materials, audio, texturesReady, keepAwake: () => budget.wake() });
  progress(0.55);
  play.loader = new PartLoader(gameWorld, materials);
  /** The Night setting (PRODUCT_SPEC F16): the town's lamps, windows and the room lights. Kept here for a town that is not in yet. */
  let night = session.save.settings.night;
  play.ui = await installFlowUi(gameWorld, {
    session,
    townScale: () => gameWorld.getSystem(StageSystem)?.townScale ?? 1,
    materials,
    // Difficulty, the Helper and the step list (ADR-050): only a build told in stages (the Music Box's first build) asks for a level. Turn the fallback off in
    // src/content/blueprints/index.ts (INTRICATE_ASSEMBLY) and none of this appears.
    assembly: {
      enabled: INTRICATE_ASSEMBLY,
      deepBuild: (letter) => letter?.objective.type === 'build_and_run' && getBlueprint(letter.objective.blueprintId)?.stages !== undefined,
      masterAvailable: MASTER_AVAILABLE,
    },
    // The Night setting (PRODUCT_SPEC F16) is the town's: its lamps, windows and the room lights; the loop handles every other event.
    onEvent: (event: FlowEvent) => {
      if (event.type === 'town-retry') {
        startTownLoad(); // the slip over the town offered it after a load that failed (the flow UI then shows "Waking Tockton…")
        return;
      }
      if (event.type === 'setting' && event.key === 'night') {
        night = event.value;
        play.town?.setNight(event.value);
      }
      play.onFlow(event);
    },
    gift: {
      // The machine as it stands in the town: what the player built, or the intended build for one restored from a save.
      build: (machineId, engraving) => play.giftOf(machineId, engraving),
      options: { catalogue: giftCatalogue, verify: verifyGift },
      pageUrl: () => location.href,
    },
    share: browserShareEnv(),
  });
  progress(deferTown ? 0.92 : 0.8);
  installGameplay(gameWorld, play);
  play.start();

  let loading: Promise<void> | null = null;
  /** Loads the town's models (4.4 MiB of GLBs), builds it under the stage and hands it to the loop. */
  const loadTown = (): Promise<void> =>
    (loading ??= (async () => {
      play.townLoading();
      try {
        // The town needs the loop's callbacks and the loop needs the town: the loop was made first.
        const town = await installTown(gameWorld, { registry: materials, audio, events: play.townEvents, keepAwake: () => budget.wake(), uniforms: wake });
        town.setNight(night, true); // a saved night: the town loads dark, with no fade
        void addWorkshopLantern(play.ui.benchRoot, loadModel, materials);
        await play.attachTown(town); // also restores a returning player's town
        // The first night would compile a shader program for every lit material (the lamp lights): do it now, behind the page, once the textures are in.
        const lamps = town.town.dressing?.lamps.map((lamp) => lamp.light) ?? [];
        void texturesReady
          .then(() => precompileNight(gameWorld.renderer, gameWorld.scene, gameWorld.camera, lamps))
          .catch((e: unknown) => console.warn('[wound-up] could not prepare the night shaders; the first night may hitch once:', e));
        if (!deferTown) progress(0.92); // a deferred town loads after the landing is usable: progress would lock its buttons again
        budget.wake();
      } catch (error) {
        loading = null; // a retry loads it again: the files that did arrive are cached, the others are fetched afresh
        play.townFailed();
        throw error;
      }
    })());
  if (!deferTown) await loadTown();
  return { debug: play.debug(), loadTown };
}

/** A gift link: no game, only the stand, the town system that steps a machine (the town itself stays hidden) and the machine the link describes. */
async function installGiftPage(
  giftWorld: World,
  materials: MaterialRegistry,
  texturesReady: Promise<void>,
  page: Landing,
  budget: RenderBudget,
): Promise<void> {
  const audio = new AudioEngine();
  audio.installGestureUnlock();
  // The town stays hidden on this page: empty stand-ins for its models, so none of them is downloaded (src/town/stand-in.ts).
  const town = await installTown(giftWorld, { registry: materials, audio, keepAwake: () => budget.wake(), dressing: false, source: emptyTownSource });
  town.town.group.visible = false;
  const reveal = async (gift: Gift): Promise<void> => {
    await texturesReady;
    giftMachine = await showGiftMachine(giftWorld, town, materials, gift);
    await showGiftPlate(giftWorld, loadModel, materials, gift);
    fitStand();
    landingOptions.previewHint = 'Your gift is turning on the stand. Enter mixed reality to see it on your own table.';
    idleMode = 'preview';
    page.setMode('preview');
    budget.setMode('live');
    budget.wake();
  };
  await mountGiftViewer(document.body, location.hash, {
    catalogue: giftCatalogue,
    verify: verifyGift,
    makeYourOwnHref: location.pathname,
    onLayout: (insets) => {
      giftInsets = insets;
      fitStand();
    },
    onReveal: (gift) => void reveal(gift).catch((e: unknown) => console.error('[wound-up] could not show the gift:', e)),
  });
}

/**
 * Frames the 2D page: the whole stage in the preview, the gift's machine beside or above the gift card. Immersive sessions
 * replace the projection every frame, so this only matters for the page; it runs again when a session ends.
 */
function fitStand(): void {
  if (!world) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const frame = giftMachine && giftInsets ? machineFrame(w, h, giftMachine, giftInsets) : stageFrame(w, h);
  world.camera.zoom = frame.zoom;
  world.camera.setViewOffset(w, h, frame.offsetX, frame.offsetY, w, h);
  world.camera.updateProjectionMatrix();
}

try {
  mark('boot');
  const gamePage = !hasGiftHash(location.hash) && !demoRequest(location.search);
  // The save decides what the first screen shows. A player who has opened the trunk (or turned the night on) sees the town at once, so it loads
  // before the page is usable, as it always did; a first-time player sees the closed trunk, and the town waits until the buttons work.
  const session = gamePage ? new GameSession() : null;
  deferTown = session !== null && session.mode === 'intro' && !session.save.settings.night;
  // The plain game page loads the trunk and the workshop (and, for a returning player, the town) before it is usable: ask for those files now, not after the world exists.
  if (gamePage) preloadStartup(!deferTown);
  // The library (a 3 KB file) and its textures need no world: they download and decode while IWSDK builds one.
  const materialsReady = createMaterialRegistry();
  const libraryTextures = materialsReady.then(loadLibraryTextures, () => undefined); // a library that fails to load is reported by the Promise.all below
  const [created, support, materials] = await Promise.all([World.create(sceneContainer, projectOptions), detectXrSupport(), materialsReady]);
  world = created;
  installToneMapping(world.renderer); // AgX instead of the scene file's ACES (src/lighting.ts)
  mark('world');
  progress(0.15);
  installXrTuning(world, location.search); // multiview off-switch, foveation, framebuffer scale and the 72 Hz request (src/xr-tuning.ts)
  // No 2D draw until the finished scene's shader programs are built (below): a draw that compiles blocks the page for seconds.
  const gate = installRenderGate(world);
  // Landing actions stay disabled until setSupport below, so the preview cannot have started yet.
  const budget = (renderBudget = installRenderBudget(world));
  // The shared library materials (ADR-032) go on every GLB built with the library profile. Their textures load in the
  // background: the town and the props show the constants until they arrive, and a machine waits for them (gameplay.ts).
  const texturesReady = libraryTextures;
  useSelfHostedHands(world);
  world
    .registerSystem(StageSystem)
    .registerSystem(GrabModeSystem, { configData: { hands: support !== 'none' } })
    .registerSystem(GrabFeedbackSystem);
  // The game goes in after the stand and the grab systems (the interaction systems must follow GrabFeedbackSystem). If it
  // cannot start, the page still works as a stand to look at, and says so.
  let debugHandle: ReturnType<Gameplay['debug']> | undefined;
  try {
    const demo = demoRequest(location.search); // ?debug&demo=<machine>: a finished machine running, no flow, no save (src/debug/demo.ts)
    if (hasGiftHash(location.hash)) await installGiftPage(world, materials, texturesReady, landing, budget);
    else if (demo) {
      await installDemo(world, materials, texturesReady, budget, demo);
      landingOptions.previewHint = DEMO_HINT;
      idleMode = 'preview';
      landing.setMode('preview');
      budget.setMode('live');
    } else if (session) {
      // The shared materials get the wake shading before anything is compiled, town or no town (src/town/index.ts `prepareTownShading`).
      const game = await installGame(world, materials, texturesReady, budget, progress, session, prepareTownShading(materials), deferTown);
      debugHandle = game.debug;
      loadTown = game.loadTown;
    }
  } catch (error) {
    console.error('[wound-up] Could not start the game:', error);
    landing.showError('The town could not be unpacked. Reload the page to try again.');
  }
  // Opt-in QA hook (?debug): browser tests read scene state and drive the loop through it. Nothing is exposed otherwise.
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __world: world, __wu: debugHandle });
  mark('installed');
  await texturesReady;
  mark('textures');
  // The shaders of what the first picture shows (the textures are in), built on the GPU's own threads; then the first picture.
  await compileBehindLanding(world.renderer, world.scene, world.camera, { visibleOnly: true });
  mark('compiled');
  progress(0.98);
  gate.open();
  budget.wake();
  // The rest (the town, hidden until the trunk opens) is built behind the page, long before anyone can open it. A gift page never shows it,
  // and a town that has not loaded yet is compiled once it has (below).
  if (!hasGiftHash(location.hash) && !deferTown) void compileBehindLanding(world.renderer, world.scene, world.camera);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) sceneContainer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-out' });
  fitStand();
  window.addEventListener('resize', fitStand);
  world.visibilityState.subscribe((state) => {
    if (state === VisibilityState.NonImmersive) fitStand(); // the session's projection is gone: put the page's framing back
    landing.setMode(state === VisibilityState.NonImmersive ? idleMode : 'xr');
    budget.wake(); // the scene moved while the session ran, so redraw what the landing shows
  });
  // With WebXR available parts answer to hands, not the mouse (ADR-024), so the default "drag it" hint would be untrue.
  if (support !== 'none' && landingOptions.previewHint !== DEMO_HINT) {
    const enter = support === 'vr' ? 'Enter VR' : 'Enter mixed reality';
    landingOptions.previewHint = `This preview is for looking. ${enter} to build the machines with your hands.`;
  }
  landing.setSupport(support);
} catch (error) {
  console.error('[wound-up] Could not start the 3D view:', error);
  landing.setSupport('none');
  landing.showError('This browser could not start the 3D view. Try a recent Chrome, Edge or Meta Quest Browser.');
} finally {
  landing.setLoading(null);
}

/**
 * Loads a deferred town and builds its shaders the moment it is in. If it cannot be loaded the landing page says so, and so does the slip over
 * the town (src/ui/flow-ui.ts `townCue`), whose "Try again" calls this again (`installGame`'s `town-retry`).
 */
function startTownLoad(): void {
  if (!loadTown || !world) return;
  const loaded = world;
  void loadTown()
    .then(() => {
      mark('town');
      landing.clearError(); // a failure reported on the landing page is out of date now
      return compileBehindLanding(loaded.renderer, loaded.scene, loaded.camera);
    })
    .catch((error: unknown) => {
      console.error('[wound-up] The town could not be loaded:', error);
      landing.showError('The town could not be unpacked. Reload the page to try again.');
    });
}

// The page is usable. A first-time player's town loads now, behind it: nothing they can do before the trunk opens needs it, and the trunk's
// opening shows it as soon as it is in (src/gameplay.ts `attachTown`). Its shaders are built the moment it is.
if (deferTown) startTownLoad();
