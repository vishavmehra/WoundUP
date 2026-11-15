import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AudioEngine, bindInteractionAudio } from './audio/index.js';
import { giftCatalogue, verifyGift } from './content/blueprints/index.js';
import { demoRequest, DEMO_HINT, installDemo } from './debug/demo.js';
import { Gameplay, installGameplay } from './gameplay.js';
import { GameSession } from './game/session.js';
import { hasGiftHash, type Gift } from './game/gift.js';
import { showGiftMachine } from './gift-stage.js';
import { GrabFeedbackSystem } from './grab-feedback.js';
import { GrabModeSystem } from './grab-mode.js';
import { useSelfHostedHands } from './hands.js';
import { installInteraction } from './interaction/index.js';
import { mountLanding, type Landing, type LandingOptions } from './landing/landing.js';
import { installToneMapping } from './lighting.js';
import { createMaterialRegistry, type MaterialRegistry } from './materials/index.js';
import { PartLoader } from './parts/index.js';
import { installRenderBudget, type RenderBudget } from './render-budget.js';
import { StageSystem } from './stage.js';
import { machineFrame, stageFrame, type Insets, type StageBox } from './stage-framing.js';
import { addWorkshopLantern, installTown, loadModel, showGiftPlate } from './town/index.js';
import { browserShareEnv, installFlowUi, mountGiftViewer, type FlowEvent } from './ui/index.js';
import { detectXrSupport, enterXR } from './xr-entry.js';
import { installXrTuning } from './xr-tuning.js';

const sceneContainer = document.getElementById('scene-container') as HTMLDivElement;
const landingRoot = document.getElementById('landing-root') as HTMLElement;

let world: World | undefined;
/** What the 2D page shows while no immersive session is running. */
let idleMode: 'landing' | 'preview' = 'landing';
let renderBudget: RenderBudget | undefined;
/** On a gift page: the machine on show (stage-local box) and the part of the window the gift card leaves free. Both set means "frame the machine". */
let giftMachine: StageBox | null = null;
let giftInsets: Insets | null = null;

const landingOptions: LandingOptions = {
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
const landing = mountLanding(landingRoot, landingOptions);

landing.setSupport('checking');
landing.setLoading(0);

/**
 * The playable game: session, interaction, audio, town, flow UI and the loop that joins them (src/gameplay.ts). The town needs
 * the loop's callbacks and the loop needs the town, so the loop is made first and given its parts as they arrive.
 * Returns what `?debug` exposes.
 */
async function installGame(
  gameWorld: World,
  materials: MaterialRegistry,
  texturesReady: Promise<void>,
  budget: RenderBudget,
  progress: (fraction: number) => void,
): Promise<ReturnType<Gameplay['debug']>> {
  const session = new GameSession();
  // Easy Snap and gaze mode from the save reach the interaction systems before the flow UI reads them (the pause menu changes both later).
  installInteraction(gameWorld, { easySnap: session.save.settings.easySnap, gazeMode: session.save.settings.gazeMode });
  const audio = new AudioEngine();
  audio.installGestureUnlock();
  bindInteractionAudio(audio);
  const play = new Gameplay(gameWorld, { session, materials, audio, texturesReady, keepAwake: () => budget.wake() });
  progress(0.3);
  play.town = await installTown(gameWorld, { registry: materials, audio, events: play.townEvents, keepAwake: () => budget.wake() });
  play.loader = new PartLoader(gameWorld, materials);
  progress(0.7);
  play.ui = await installFlowUi(gameWorld, {
    session,
    townScale: () => gameWorld.getSystem(StageSystem)?.townScale ?? 1,
    materials,
    // The Night setting (PRODUCT_SPEC F16) is the town's: its lamps, windows and the room lights; the loop handles every other event.
    onEvent: (event: FlowEvent) => {
      if (event.type === 'setting' && event.key === 'night') play.town.setNight(event.value);
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
  progress(0.95);
  play.town.setNight(session.save.settings.night, true); // a saved night: the town loads dark, with no fade
  void addWorkshopLantern(play.ui.benchRoot, loadModel, materials);
  installGameplay(gameWorld, play);
  await play.start();
  return play.debug();
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
  const town = await installTown(giftWorld, { registry: materials, audio, keepAwake: () => budget.wake(), dressing: false });
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
  const [created, support] = await Promise.all([
    World.create(sceneContainer, projectOptions),
    detectXrSupport(),
  ]);
  world = created;
  installToneMapping(world.renderer); // AgX instead of the scene file's ACES (src/lighting.ts)
  installXrTuning(world, location.search); // multiview off-switch, foveation, framebuffer scale and the 72 Hz request (src/xr-tuning.ts)
  // Landing actions stay disabled until setSupport below, so the preview cannot have started yet.
  const budget = (renderBudget = installRenderBudget(world));
  // The shared library materials (ADR-032) go on every GLB built with the library profile. Their textures load in the
  // background: the town and the props show the constants until they arrive, and a machine waits for them (gameplay.ts).
  const materials = await createMaterialRegistry();
  const texturesReady = materials.loadTextures().catch((e: unknown) => console.warn('[wound-up] library textures did not load:', e));
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
    } else debugHandle = await installGame(world, materials, texturesReady, budget, (fraction) => landing.setLoading(fraction));
  } catch (error) {
    console.error('[wound-up] Could not start the game:', error);
    landing.showError('The town could not be unpacked. Reload the page to try again.');
  }
  // Opt-in QA hook (?debug): browser tests read scene state and drive the loop through it. Nothing is exposed otherwise.
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __world: world, __wu: debugHandle });
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
