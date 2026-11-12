import { AssetManager, PokeInteractable, RayInteractable } from '@iwsdk/core';
import type { Entity, World } from '@iwsdk/core';
import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { Object3D } from 'three';
import { ENGRAVINGS, type EngravingId, type LetterDef, type MachineId } from '../game/content.js';
import type { GameSession } from '../game/session.js';
import type { Mode } from '../game/modes.js';
import { giftableMachines } from '../game/progression.js';
import { SocketSnapSystem } from '../interaction/socket-snap-system.js';
import { setupGlbInteraction, type GlbInteraction } from '../interaction/glb-interaction.js';
import { applyLibraryMaterials, type MaterialRegistry } from '../materials/index.js';
import type { SolveResult } from '../sim/index.js';
import { findHinge, applyHinge, Progress } from './anim.js';
import { MACHINE_NAMES, SETTING_ROWS, HINTS, describeResult, giftErrorText, windLabel, type ResultHints } from './copy.js';
import { BENCH, GIFT_SPOT, LETTER_SPOT, PAUSE_SPOT, READING_SPOT, RUN_SIGN_HEIGHT, RUN_SIGN_SLIP_HEIGHT, SHEET_PAPER, benchPoint, benchZ, latchSpot } from './layout.js';
import { createGiftLink, shortLink, showLinkInPage, type GiftHost, type ShareEnv } from './gift-flow.js';
import { paintBlueprint, paintClosing, paintLetter, paintMedallion, paintPanel, paintSlip, resultSlip, type BlueprintSlot } from './paint.js';
import { PALETTE, ensureFonts } from './palette.js';
import { Plaque, Surface, domCanvas, type CanvasFactory } from './surface.js';
import { freshLocal, viewFor, type LocalFlow, type View } from './view.js';

/** The stage root's scene node id (`STAGE_NODE_ID` in src/stage.ts, repeated so this module does not pull the placement code in). */
const STAGE_NODE = 'stage';

/** What the UI tells the integrator. The UI changes the mode itself (it calls the session); these are for the scene and the machine. */
export type FlowEvent =
  /** The lid is opening: start the town's unfolding. */
  | { type: 'trunk-opened' }
  | { type: 'letter-accepted'; letter: LetterDef }
  /** The parcel is open: put the machine's housing and parts out (`traySlots`, `revealParts`), then `showBlueprint`. */
  | { type: 'parcel-opened'; letter: LetterDef }
  /** Run was pressed: solve the machine and call `showResult`. */
  | { type: 'run' }
  /** Adjust was pressed: the session is back in Build. */
  | { type: 'adjust' }
  | { type: 'setting'; key: 'easySnap' | 'gazeMode' | 'xrayHint'; value: boolean }
  /** Restart was confirmed and progress is deleted: reset the town and the machine. */
  | { type: 'restarted' }
  | { type: 'gift-link'; machineId: MachineId; url: string; delivered: 'copied' | 'shared' | 'shown' };

export interface FlowUiOptions {
  session: GameSession;
  /** The stage root's entity. Defaults to the scene node `stage`. */
  stage?: Entity;
  /** Town scale for the session (`StageSystem.townScale`): the trunk and its latch scale with it, the bench never does. */
  townScale?: () => number;
  /** Loads a GLB under `public/assets/models/` as a fresh scene. Defaults to IWSDK's cached loader. */
  loadGlb?: (path: string) => Promise<Object3D>;
  /** The shared material library (ADR-032). The workshop GLBs carry constants-only proxy materials, so pass it. */
  materials?: MaterialRegistry;
  onEvent?: (event: FlowEvent) => void;
  gift?: GiftHost;
  share?: ShareEnv;
  createCanvas?: CanvasFactory;
  /** World position of the player's head, written into `out`. Defaults to the XR rig's head. */
  head?: (out: Vector3) => Vector3;
}

export interface BlueprintView {
  title: string;
  slots: readonly BlueprintSlot[];
}

const GLB = {
  trunk: 'tockton/trunk/trunk_main.glb',
  envelope: 'tockton/workshop/letter_envelope.glb',
  parcel: 'tockton/workshop/parcel.glb',
  sheet: 'tockton/workshop/blueprint_sheet.glb',
  tray: 'tockton/workshop/parts_tray.glb',
  bench: 'tockton/workshop/workbench.glb',
} as const;

/** One pointer target: a ray or poke click on `object` calls `press` with the object actually hit, while `active`. */
class Hot {
  active = false;
  constructor(
    readonly entity: Entity,
    readonly press: (hit: Object3D) => void,
    readonly hover?: (on: boolean) => void,
  ) {}
}

const PANEL_SMALL = { w: 0.26, h: 0.2 } as const;
const PANEL_GIFT = { w: 0.29, h: 0.3 } as const;

/**
 * The hands-first flow of Wound Up inside the headset: trunk and latch, the letter, parcel and workbench, the run sign, the
 * pause menu and the gift panel. Everything is a physical prop or a painted paper or brass plaque in the scene; nothing is DOM.
 * The mode is the session's (`GameSession`); this class only presents it and turns pinches into session commands.
 *
 * Integrator contract:
 *   const ui = new FlowUi(world, { session, townScale: () => stage.townScale, materials, onEvent, gift });
 *   await ui.init();                  // loads the GLBs and builds the props, hidden until the mode says otherwise
 *   ui.onModeChange(session.mode);    // after any mode change the UI did not make itself (assembly done, machine ran, placed)
 *   ui.setWind(units, max);           // while winding
 *   ui.showResult(solveResult);       // after a `run` event
 *   ui.update(dt);                    // every frame (FlowUiSystem does this)
 */
export class FlowUi {
  private readonly session: GameSession;
  private readonly local: LocalFlow;
  private readonly factory: CanvasFactory;
  private readonly head = new Vector3();
  private readonly hots: Hot[] = [];
  private readonly disposables: Array<() => void> = [];
  private world: World;
  private stage!: Entity;
  private ready = false;
  private lastScale = 1;
  private view: View | null = null;
  private shownLetter: string | null = null;

  // Animations
  private readonly lid = new Progress(1.1);
  private readonly withdraw = new Progress(0.9);
  private readonly appear = new Progress(0.7);
  private readonly flap = new Progress(0.55);
  private readonly card = new Progress(0.5);
  private readonly slide = new Progress(0.8);
  private readonly parcelFlap = new Progress(0.6);
  private readonly reveal = new Progress(0.7);
  private readonly parcelAway = new Progress(0.5);
  private pops: Array<{ object: Object3D; base: number; progress: Progress }> = [];

  // Props
  private trunk!: { root: Object3D; entity: Entity; hot: Hot; hinge: ReturnType<typeof findHinge> };
  private envelope!: { root: Object3D; entity: Entity; hot: Hot; hinge: ReturnType<typeof findHinge> };
  private bench!: { root: Object3D; entity: Entity };
  private parcel!: { root: Object3D; entity: Entity; hot: Hot; hinge: ReturnType<typeof findHinge> };
  private tray!: { root: Object3D; entity: Entity };
  private sheet!: { root: Object3D; entity: Entity; overlay: Surface };
  private cardGroup!: Group;
  private cardPaper!: Surface;
  private accept!: Plaque;
  private closingCard!: Surface;
  private hint!: Surface;
  private signGroup!: Group;
  private signSlip!: Surface;
  private runPlaque!: Plaque;
  private adjustPlaque!: Plaque;
  private pauseMed!: Surface;
  private giftMed!: Surface;
  private panelGroup!: Group;
  private panelBase!: Surface;
  private panelGiftBase!: Surface;
  private toggles!: Plaque[];
  private machineBtn!: Plaque;
  private chips!: Plaque[];
  private btnL!: Plaque;
  private btnR!: Plaque;
  private acceptHot!: Hot;
  private pauseHot!: Hot;
  private giftHot!: Hot;
  private runHot!: Hot;
  private adjustHot!: Hot;
  /** The panel's buttons: live only while the panel shows them. */
  private readonly panelHots: Hot[] = [];
  private panelKind: 'none' | 'pause' | 'restart' | 'gift' = 'none';
  private readonly glbs: GlbInteraction[] = [];

  // Content state
  private blueprint: BlueprintView | null = null;
  private filled = new Set<string>();
  private wind = { units: 0, max: 8 };
  private giftState = { machines: [] as MachineId[], index: 0, engraving: ENGRAVINGS[0].id as EngravingId, busy: false, lines: [] as string[] };
  private closeLinkBox: (() => void) | null = null;

  constructor(
    world: World,
    private readonly opt: FlowUiOptions,
  ) {
    this.world = world;
    this.session = opt.session;
    this.factory = opt.createCanvas ?? domCanvas;
    this.local = freshLocal();
    // A returning player's town is already out: the introduction plays once (PRODUCT_SPEC §3.2).
    if (this.session.mode !== 'intro') this.local.trunk = 'gone';
  }

  // ---- Public API --------------------------------------------------------------------------------------------------------

  /** Loads the props and builds the surfaces. Call once, after the scene exists and before the first frame that needs the UI. */
  async init(): Promise<void> {
    await ensureFonts();
    const stage = this.opt.stage ?? this.world.getSceneEntity(STAGE_NODE);
    if (!stage?.object3D) throw new Error('FlowUi needs the stage root (scene node "stage").');
    this.stage = stage;
    const load = this.opt.loadGlb ?? defaultLoad;
    const [trunk, envelope, parcel, sheet, tray, bench] = await Promise.all([GLB.trunk, GLB.envelope, GLB.parcel, GLB.sheet, GLB.tray, GLB.bench].map((p) => load(p)));
    const roots = [trunk, envelope, parcel, sheet, tray, bench];
    if (this.opt.materials) await this.libraryMaterials(roots, this.opt.materials);
    this.buildTrunk(trunk);
    this.buildBench(bench, tray, sheet, parcel);
    this.buildEnvelope(envelope);
    this.buildSurfaces();
    this.lastScale = this.scale();
    this.ready = true;
    this.applySnap();
    this.sync();
  }

  /** Call after any mode change the UI did not make itself. */
  onModeChange(_mode?: Mode): void {
    this.sync();
  }

  /** Wind counter and the Run control while winding (INTERACTION_SPEC §10, UI_UX_SPEC §12). */
  setWind(units: number, max: number): void {
    this.wind = { units, max };
    if (this.ready) this.paintSign();
  }

  /** The solver's verdict after Run: the machine shows it, and a small label says it in words (UI_UX_SPEC §13). */
  showResult(result: Pick<SolveResult, 'status' | 'jamReason' | 'wrongTargets' | 'missingSockets'>, hints?: ResultHints): void {
    this.local.result = describeResult(result, hints);
    this.sync();
  }

  /** The blueprint sheet's content: the machine's name and its numbered slots. */
  showBlueprint(view: BlueprintView): void {
    this.blueprint = view;
    this.filled = new Set();
    if (this.ready) this.paintBlueprint();
  }

  /** Ticks a slot on the sheet as a part is seated or removed. */
  setSlotFilled(slotId: string, filled: boolean): void {
    if (filled === this.filled.has(slotId)) return;
    if (filled) this.filled.add(slotId);
    else this.filled.delete(slotId);
    if (this.ready) this.paintBlueprint();
  }

  /** World positions of the tray's compartments, in order (the `SOCKET_SlotNN` empties of parts_tray.glb). */
  traySlots(): Vector3[] {
    const slots: Array<{ name: string; position: Vector3 }> = [];
    this.tray.root.updateWorldMatrix(true, true);
    this.tray.root.traverse((n) => {
      if (/^SOCKET_Slot\d+$/.test(n.name)) slots.push({ name: n.name, position: n.getWorldPosition(new Vector3()) });
    });
    return slots.sort((a, b) => (a.name < b.name ? -1 : 1)).map((s) => s.position);
  }

  /**
   * Parts appear in the tray: part `i` is moved to compartment `i` (position only) and pops in, 0.12 s apart. Call it before the
   * parts take their rest pose, since a part that is let go returns to where it was when the scene was loaded.
   */
  revealParts(parts: readonly Object3D[]): void {
    const slots = this.traySlots();
    parts.forEach((object, i) => {
      const slot = slots[i];
      if (slot) {
        const local = object.parent ? object.parent.worldToLocal(slot.clone()) : slot;
        object.position.copy(local);
      }
      const base = object.scale.x;
      const progress = new Progress(0.35);
      progress.go(1, i * 0.12);
      object.scale.setScalar(base * 0.001);
      this.pops.push({ object, base, progress });
    });
  }

  /** Per frame. Steps animations and poses props; allocates nothing. */
  update(dt: number): void {
    if (!this.ready) return;
    const s = this.scale();
    if (s !== this.lastScale) {
      this.lastScale = s;
      this.poseTrunk();
      this.poseBench();
    }
    this.stepTrunk(dt);
    if (this.appear.moving || this.flap.moving || this.card.moving) this.stepLetter(dt);
    if (this.slide.moving || this.parcelFlap.moving || this.reveal.moving || this.parcelAway.moving) this.stepBench(dt);
    if (this.pops.length) this.stepPops(dt);
  }

  dispose(): void {
    this.closeLinkBox?.();
    for (const g of this.glbs) g.dispose();
    for (const d of this.disposables) d();
    for (const h of this.hots) this.setHot(h, false);
    this.ready = false;
  }

  // ---- Building ---------------------------------------------------------------------------------------------------------

  private scale(): number {
    return this.opt.townScale?.() ?? 1;
  }

  private mount(object: Object3D, parent: Entity = this.stage): Entity {
    return this.world.createTransformEntity(object, { parent });
  }

  /** Makes `entity`'s object answer to rays and pokes (INTERACTION_SPEC §13) once `setHot(hot, true)` is called. */
  private hot(entity: Entity, press: (hit: Object3D) => void, hover?: (on: boolean) => void): Hot {
    const hot = new Hot(entity, press, hover);
    const object = entity.object3D as Object3D;
    object.addEventListener('click', (e) => {
      if (hot.active) press(e.object);
    });
    object.addEventListener('pointerenter', () => hot.active && hover?.(true));
    object.addEventListener('pointerleave', () => hover?.(false));
    this.hots.push(hot);
    return hot;
  }

  private setHot(hot: Hot, active: boolean): void {
    if (hot.active === active) return;
    hot.active = active;
    if (active) {
      hot.entity.addComponent(RayInteractable, {});
      hot.entity.addComponent(PokeInteractable, {});
    } else {
      hot.entity.removeComponent(RayInteractable);
      hot.entity.removeComponent(PokeInteractable);
      hot.hover?.(false);
    }
  }

  /** A surface or plaque as a pressable child of `parent`, at `position`. */
  private button(surface: Surface, parent: Entity, press: () => void, hover?: (on: boolean) => void): Hot {
    return this.hot(this.mount(surface.mesh, parent), () => press(), hover);
  }

  private async libraryMaterials(roots: Object3D[], registry: MaterialRegistry): Promise<void> {
    const names = new Set<string>();
    for (const root of roots) {
      root.traverse((n) => {
        const m = (n as Mesh).material;
        for (const mat of Array.isArray(m) ? m : m ? [m] : []) if (mat.name.startsWith('Mat_')) names.add(mat.name);
      });
    }
    await registry.loadTextures(names);
    for (const root of roots) applyLibraryMaterials(root, registry);
  }

  private buildTrunk(root: Object3D): void {
    const entity = this.mount(root);
    this.glbs.push(setupGlbInteraction(this.world, root));
    const hot = this.hot(entity, (hit) => {
      if ((hit.userData.wuProxy as { purpose?: string } | undefined)?.purpose === 'latch') this.pinchLatch();
    });
    this.trunk = { root, entity, hot, hinge: findHinge(root, 'PIV_Lid') };
    root.visible = false;
  }

  private buildEnvelope(root: Object3D): void {
    const entity = this.mount(root);
    this.glbs.push(setupGlbInteraction(this.world, root));
    const hot = this.hot(entity, () => this.openEnvelope());
    this.envelope = { root, entity, hot, hinge: findHinge(root, 'PIV_Flap') };
    root.visible = false;
  }

  private buildBench(benchRoot: Object3D, trayRoot: Object3D, sheetRoot: Object3D, parcelRoot: Object3D): void {
    const bench = this.mount(benchRoot);
    this.bench = { root: benchRoot, entity: bench };
    const trayEntity = this.mount(trayRoot, bench);
    trayRoot.position.set(BENCH.tray.x, BENCH.tray.y, BENCH.tray.z);
    this.tray = { root: trayRoot, entity: trayEntity };
    const sheetEntity = this.mount(sheetRoot, bench);
    sheetRoot.position.set(BENCH.blueprint.x, BENCH.blueprint.y, BENCH.blueprint.z);
    const overlay = new Surface(this.factory, SHEET_PAPER.w, SHEET_PAPER.h);
    overlay.mesh.rotation.x = -Math.PI / 2;
    overlay.mesh.position.y = SHEET_PAPER.y;
    sheetRoot.add(overlay.mesh);
    this.sheet = { root: sheetRoot, entity: sheetEntity, overlay };
    const parcelEntity = this.mount(parcelRoot, bench);
    parcelRoot.position.set(BENCH.blueprint.x, BENCH.blueprint.y, BENCH.blueprint.z);
    this.glbs.push(setupGlbInteraction(this.world, parcelRoot));
    const hot = this.hot(parcelEntity, () => this.openParcel());
    this.parcel = { root: parcelRoot, entity: parcelEntity, hot, hinge: findHinge(parcelRoot, 'PIV_Flap') };
    for (const o of [benchRoot, trayRoot, sheetRoot, parcelRoot]) o.visible = false;
  }

  private buildSurfaces(): void {
    const f = this.factory;
    const stage = this.stage;
    const place = (s: Surface, p: { x: number; y: number; z: number }): void => {
      s.mesh.position.set(p.x, p.y, p.z);
      s.mesh.visible = false;
      this.mount(s.mesh, stage);
    };

    // The reading card and its Accept plaque share a group so they rise and face the player together.
    this.cardGroup = new Group();
    this.cardGroup.visible = false;
    const cardEntity = this.mount(this.cardGroup);
    this.cardPaper = new Surface(f, 0.22, 0.15);
    this.cardGroup.add(this.cardPaper.mesh);
    this.accept = new Plaque(f, 0.09, 0.034);
    this.accept.mesh.name = 'UI_Accept';
    this.accept.mesh.position.set(0, -0.108, 0.003);
    this.acceptHot = this.button(this.accept, cardEntity, () => this.acceptLetter(), (on) => this.accept.set('Accept', on ? 'hover' : 'idle'));
    this.accept.set('Accept');
    this.closingCard = new Surface(f, 0.22, 0.12);
    place(this.closingCard, READING_SPOT);
    this.hint = new Surface(f, 0.15, 0.04);
    place(this.hint, { x: 0, y: 0.2, z: 0.1 });

    // Pause and gift medallions.
    this.pauseMed = new Surface(f, 0.05, 0.05);
    this.giftMed = new Surface(f, 0.05, 0.05);
    this.pauseMed.mesh.name = 'UI_Pause';
    this.giftMed.mesh.name = 'UI_Gift';
    place(this.pauseMed, PAUSE_SPOT);
    place(this.giftMed, GIFT_SPOT);
    const medHover = (s: Surface, glyph: 'pause' | 'gift', label: string) => (on: boolean) => s.paint(`${glyph}|${on}`, (c, w) => paintMedallion(c, w, glyph, label, on));
    const pauseHover = medHover(this.pauseMed, 'pause', 'Pause');
    const giftHover = medHover(this.giftMed, 'gift', 'Gift');
    pauseHover(false);
    giftHover(false);
    this.pauseHot = this.hot(this.mount(this.pauseMed.mesh), () => this.pauseGame(), pauseHover);
    this.giftHot = this.hot(this.mount(this.giftMed.mesh), () => this.openGift(), giftHover);

    // The run sign: a post, the Run plaque, an Adjust plaque after a failed run, and one slip for the counter or the result.
    this.signGroup = new Group();
    this.signGroup.visible = false;
    const signEntity = this.mount(this.signGroup, this.bench.entity);
    const post = new Mesh(new CylinderGeometry(0.0025, 0.0025, RUN_SIGN_HEIGHT - 0.012, 8), new MeshBasicMaterial({ color: PALETTE.brass }));
    post.position.set(0, (RUN_SIGN_HEIGHT - 0.012) / 2, -0.004); // behind the plaques, so it never pokes through them
    this.signGroup.add(post);
    this.runPlaque = new Plaque(f, 0.075, 0.032);
    this.runPlaque.mesh.position.set(0, RUN_SIGN_HEIGHT, 0);
    this.runPlaque.mesh.name = 'UI_Run';
    this.adjustPlaque = new Plaque(f, 0.075, 0.032);
    this.adjustPlaque.mesh.name = 'UI_Adjust';
    this.adjustPlaque.mesh.position.set(0, RUN_SIGN_HEIGHT - 0.04, 0); // under Run, so no plaque hangs over the blueprint
    this.signSlip = new Surface(f, 0.15, 0.056);
    this.signSlip.mesh.position.set(0, RUN_SIGN_SLIP_HEIGHT, 0);
    this.signGroup.add(this.signSlip.mesh);
    this.runHot = this.button(this.runPlaque, signEntity, () => this.opt.onEvent?.({ type: 'run' }), (on) => this.paintRun(on));
    this.adjustHot = this.button(this.adjustPlaque, signEntity, () => this.adjust(), (on) => this.adjustPlaque.set('Adjust', on ? 'hover' : 'idle'));
    this.adjustPlaque.set('Adjust');
    this.signGroup.position.set(BENCH.runSign.x, BENCH.runSign.y, BENCH.runSign.z);
    this.bench.root.add(this.signGroup);

    // Pause, restart and gift panels share one group at the reading spot.
    this.panelGroup = new Group();
    this.panelGroup.visible = false;
    const panelEntity = this.mount(this.panelGroup);
    this.panelBase = new Surface(f, PANEL_SMALL.w, PANEL_SMALL.h);
    this.panelGiftBase = new Surface(f, PANEL_GIFT.w, PANEL_GIFT.h);
    this.panelGroup.add(this.panelBase.mesh, this.panelGiftBase.mesh);
    this.toggles = SETTING_ROWS.map((row, i) => {
      const p = new Plaque(f, 0.21, 0.032);
      p.mesh.name = `UI_Toggle_${row.key}`;
      p.mesh.position.z = 0.003;
      this.panelGroup.add(p.mesh);
      this.hotButton(p, panelEntity, () => this.toggle(i));
      return p;
    });
    this.btnL = new Plaque(f, 0.115, 0.034);
    this.btnR = new Plaque(f, 0.115, 0.034);
    this.machineBtn = new Plaque(f, 0.21, 0.032);
    this.btnL.mesh.name = 'UI_PanelLeft';
    this.btnR.mesh.name = 'UI_PanelRight';
    this.machineBtn.mesh.name = 'UI_Machine';
    for (const p of [this.btnL, this.btnR, this.machineBtn]) {
      p.mesh.position.z = 0.003;
      this.panelGroup.add(p.mesh);
    }
    this.hotButton(this.btnL, panelEntity, () => this.panelLeft());
    this.hotButton(this.btnR, panelEntity, () => this.panelRight());
    this.hotButton(this.machineBtn, panelEntity, () => this.cycleMachine());
    this.chips = ENGRAVINGS.map((e, i) => {
      const p = new Plaque(f, 0.122, 0.03);
      p.mesh.name = `UI_Engraving_${e.id}`;
      p.mesh.position.set(i % 2 === 0 ? -0.067 : 0.067, 0.028 - Math.floor(i / 2) * 0.036, 0.003);
      this.panelGroup.add(p.mesh);
      this.hotButton(p, panelEntity, () => this.pickEngraving(e.id));
      return p;
    });
  }

  /** A plaque that is a child of the panel group: it is already in the group's tree, so only its entity is created here. */
  private hotButton(plaque: Plaque, parent: Entity, press: () => void): void {
    const entity = this.world.createTransformEntity(plaque.mesh, { parent });
    this.panelHots.push(this.hot(entity, () => press()));
  }

  // ---- Sync: the mode state decides what exists (view.ts) ---------------------------------------------------------------

  private sync(): void {
    if (!this.ready) return;
    const letter = this.session.letter;
    const view = viewFor(this.session.modeState, this.local, { letter, closing: this.session.closing, giftAvailable: this.session.giftAvailable });
    const before = this.view;
    this.view = view;

    // A returning or restarted session: put the props back to their start.
    if (this.session.mode === 'intro' && this.local.trunk === 'gone') this.resetTrunk();
    if ((letter?.id ?? null) !== this.shownLetter) {
      this.shownLetter = letter?.id ?? null;
      this.local.envelope = 'sealed';
      this.flap.jump(0);
      this.card.jump(0);
      this.appear.jump(0);
      if (letter) this.appear.go(1, this.local.trunk === 'withdrawing' ? 1.6 : 0.4);
    }
    if (view.bench && !before?.bench) this.resetBench();
    if (!view.bench && before?.bench) this.local.result = null;

    // While a panel is up, nothing under it answers (a paused game stays as it was, and untouched).
    const free = view.panel === 'none';

    // Trunk
    this.trunk.root.visible = view.trunk;
    this.setHot(this.trunk.hot, free && view.trunk && this.local.trunk === 'closed');
    this.poseTrunk();

    // Letter
    const showEnvelope = view.envelope !== 'hidden';
    this.envelope.root.visible = showEnvelope && this.appear.value > 0;
    this.setHot(this.envelope.hot, free && view.envelope === 'sealed' && this.appear.value >= 1);
    this.poseLetter();
    this.setHot(this.acceptHot, free && view.envelope === 'open' && this.card.value >= 1);
    if (letter) this.paintLetter(letter);
    const closing = this.session.closing;
    this.closingCard.mesh.visible = view.closingCard;
    if (closing) this.closingCard.paint(closing, (c, w, h) => paintClosing(c, w, h, closing));
    this.faceIfShown(this.closingCard.mesh, view.closingCard);

    // Bench
    for (const o of [this.bench.root]) o.visible = view.bench;
    this.parcel.root.visible = view.parcel !== 'hidden' && this.parcelAway.value < 1;
    this.setHot(this.parcel.hot, free && view.parcel === 'closed');
    this.tray.root.visible = view.tray;
    this.sheet.root.visible = view.blueprint;
    this.poseBench();
    this.signGroup.visible = view.runSign;
    if (view.runSign) this.faceHead(this.signGroup, true);
    this.paintSign();
    if (view.blueprint) this.paintBlueprint();

    // Medallions and the hint slip
    this.pauseMed.mesh.visible = view.pauseButton;
    this.giftMed.mesh.visible = view.giftButton;
    this.faceIfShown(this.pauseMed.mesh, view.pauseButton);
    this.faceIfShown(this.giftMed.mesh, view.giftButton);
    this.setHot(this.pauseHot, free && view.pauseButton);
    this.setHot(this.giftHot, free && view.giftButton);
    this.showHint(view);

    // Panels
    this.showPanel(view.panel);
  }

  // ---- Actions (a pinch or a poke) ---------------------------------------------------------------------------------------

  private pinchLatch(): void {
    if (this.local.trunk !== 'closed') return;
    this.local.trunk = 'opening';
    this.lid.go(1);
    this.sync();
  }

  private stepTrunk(dt: number): void {
    if (!this.lid.moving && !this.withdraw.moving) return;
    this.lid.step(dt);
    this.withdraw.step(dt);
    this.poseTrunk();
    if (this.local.trunk === 'opening' && this.lid.value >= 0.5) {
      this.local.trunk = 'withdrawing';
      this.session.openTrunk();
      this.withdraw.go(1, 1.3); // the opened lid stays a moment while the town unfolds, then the trunk sinks away (TOCKTON_DIMENSIONS §4, T1)
      this.opt.onEvent?.({ type: 'trunk-opened' });
      this.sync();
    } else if (this.local.trunk === 'withdrawing' && this.withdraw.value >= 1) {
      this.local.trunk = 'gone';
      this.sync();
    }
  }

  private poseTrunk(): void {
    const t = this.trunk;
    if (t.hinge) applyHinge(t.hinge.node, t.hinge.pivot, this.lid.eased);
    const s = this.scale();
    const e = this.withdraw.eased;
    t.root.scale.setScalar(Math.max(0.001, s * (1 - e)));
    t.root.position.y = -0.2 * s * e;
  }

  private openEnvelope(): void {
    if (this.local.envelope !== 'sealed') return;
    this.local.envelope = 'open';
    this.flap.go(1);
    this.card.go(1, 0.25);
    this.sync();
  }

  private stepLetter(dt: number): void {
    const appeared = this.appear.value;
    const carded = this.card.value;
    this.appear.step(dt);
    this.flap.step(dt);
    this.card.step(dt);
    this.poseLetter();
    // What can be pressed depends on how far the animations have got (the envelope once it has settled, Accept once the card is up).
    const crossed = (before: number, after: number): boolean => (before === 0) !== (after === 0) || (before < 1) !== (after < 1);
    if (crossed(appeared, this.appear.value) || crossed(carded, this.card.value)) this.sync();
  }

  private poseLetter(): void {
    const env = this.envelope;
    const a = this.appear.eased;
    env.root.position.set(LETTER_SPOT.x, LETTER_SPOT.y + 0.06 * (1 - a), LETTER_SPOT.z);
    env.root.scale.setScalar(0.4 + 0.6 * a);
    if (env.hinge) applyHinge(env.hinge.node, env.hinge.pivot, this.flap.eased);
    const c = this.card.eased;
    this.cardGroup.visible = this.card.value > 0 && this.view?.envelope === 'open' && this.view.panel === 'none';
    this.cardGroup.position.set(READING_SPOT.x, LETTER_SPOT.y + 0.02 + (READING_SPOT.y - LETTER_SPOT.y - 0.02) * c, LETTER_SPOT.z + (READING_SPOT.z - LETTER_SPOT.z) * c);
    this.cardGroup.scale.setScalar(0.25 + 0.75 * c);
    if (this.cardGroup.visible && !this.cardGroup.userData.faced) {
      this.cardGroup.userData.faced = true;
      this.faceHead(this.cardGroup);
    }
    if (!this.cardGroup.visible) this.cardGroup.userData.faced = false;
  }

  private acceptLetter(): void {
    const letter = this.session.letter;
    if (!letter || this.local.envelope !== 'open') return;
    if (!this.session.acceptLetter(letter.id)) return;
    this.local.parcel = 'closed';
    this.opt.onEvent?.({ type: 'letter-accepted', letter });
    this.sync();
  }

  private resetBench(): void {
    this.local.parcel = 'closed';
    this.parcelFlap.jump(0);
    this.parcelAway.jump(0);
    this.reveal.jump(0);
    this.slide.jump(0);
    this.slide.go(1);
    this.filled = new Set();
  }

  private openParcel(): void {
    if (this.local.parcel !== 'closed' || !this.view?.bench) return;
    this.local.parcel = 'open';
    this.parcelFlap.go(1);
    this.parcelAway.go(1, 0.7);
    this.reveal.go(1, 0.7);
    const letter = this.session.letter;
    this.sync();
    if (letter) this.opt.onEvent?.({ type: 'parcel-opened', letter });
  }

  private stepBench(dt: number): void {
    this.slide.step(dt);
    this.parcelFlap.step(dt);
    this.parcelAway.step(dt);
    this.reveal.step(dt);
    this.poseBench();
  }

  private poseBench(): void {
    const s = this.scale();
    const e = this.slide.eased;
    this.bench.root.position.set(0, 0, benchZ(s) + 0.22 * (1 - e));
    if (this.parcel.hinge) applyHinge(this.parcel.hinge.node, this.parcel.hinge.pivot, this.parcelFlap.eased);
    const gone = this.parcelAway.eased;
    this.parcel.root.scale.setScalar(Math.max(0.001, 1 - gone));
    this.parcel.root.visible = this.view ? this.view.parcel !== 'hidden' && gone < 1 : false;
    const r = this.reveal.eased;
    this.sheet.root.scale.set(1, Math.max(0.001, r), 1);
    this.tray.root.position.y = BENCH.tray.y - 0.02 * (1 - r);
  }

  private stepPops(dt: number): void {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.progress.step(dt);
      const e = p.progress.eased;
      p.object.scale.setScalar(Math.max(0.001, p.base * e));
      if (p.progress.value >= 1) {
        p.object.scale.setScalar(p.base);
        this.pops.splice(i, 1);
      }
    }
  }

  private adjust(): void {
    if (!this.session.backToBuild()) return;
    this.local.result = null;
    this.opt.onEvent?.({ type: 'adjust' });
    this.sync();
  }

  private pauseGame(): void {
    if (this.session.pause()) this.sync();
  }

  private openGift(): void {
    if (this.session.openGift()) this.sync();
  }

  private resetTrunk(): void {
    this.local.trunk = 'closed';
    this.lid.jump(0);
    this.withdraw.jump(0);
    this.poseTrunk();
  }

  // ---- Panels: pause, restart, gift -------------------------------------------------------------------------------------

  private showPanel(kind: View['panel']): void {
    const was = this.panelKind;
    this.panelKind = kind;
    this.panelGroup.visible = kind !== 'none';
    if (kind === 'none') {
      for (const hot of this.panelHots) this.setHot(hot, false);
      return;
    }
    this.panelGroup.position.set(READING_SPOT.x, READING_SPOT.y, READING_SPOT.z);
    if (was === 'none') this.faceHead(this.panelGroup);
    const gift = kind === 'gift';
    this.panelBase.mesh.visible = !gift;
    this.panelGiftBase.mesh.visible = gift;
    const settings = this.session.save.settings;
    if (kind === 'pause') {
      this.panelBase.paint('pause', (c, w, h) => paintPanel(c, w, h, 'Paused'));
      SETTING_ROWS.forEach((row, i) => {
        const on = settings[row.key];
        this.toggles[i].set(`${row.label}: ${on ? 'On' : 'Off'}`, on ? 'on' : 'idle');
        this.toggles[i].mesh.position.y = 0.055 - i * 0.04;
      });
      this.btnL.set('Resume');
      this.btnR.set('Restart chapter');
    } else if (kind === 'restart') {
      this.panelBase.paint('restart', (c, w, h) => paintPanel(c, w, h, 'Start over?', ['This clears your progress.', 'Your settings stay.'], 0.32));
      this.btnL.set('Keep playing');
      this.btnR.set('Restart');
    } else {
      this.paintGiftPanel();
    }
    for (const t of this.toggles) t.mesh.visible = kind === 'pause';
    for (const c of this.chips) c.mesh.visible = gift;
    this.machineBtn.mesh.visible = gift;
    const row = kind === 'pause' ? -0.075 : kind === 'restart' ? -0.05 : -0.122;
    this.btnL.mesh.position.set(-0.067, row, 0.003);
    this.btnR.mesh.position.set(0.067, row, 0.003);
    for (const hot of this.panelHots) this.setHot(hot, (hot.entity.object3D as Object3D).visible);
  }

  private panelLeft(): void {
    if (this.panelKind === 'pause') {
      if (this.session.resume()) this.sync();
    } else if (this.panelKind === 'restart') {
      if (this.session.cancelRestart()) this.sync();
    } else if (this.panelKind === 'gift') void this.makeLink();
  }

  private panelRight(): void {
    if (this.panelKind === 'pause') {
      if (this.session.requestRestart()) this.sync();
    } else if (this.panelKind === 'restart') {
      if (this.session.confirmRestart()) {
        this.local.trunk = 'gone'; // `sync` resets the trunk because the mode is the introduction again
        this.local.result = null;
        this.blueprint = null;
        this.filled = new Set();
        this.opt.onEvent?.({ type: 'restarted' });
        this.sync();
      }
    } else if (this.panelKind === 'gift') {
      this.closeLinkBox?.();
      this.closeLinkBox = null;
      if (this.session.closeGift()) this.sync();
    }
  }

  private toggle(i: number): void {
    const row = SETTING_ROWS[i];
    const value = !this.session.save.settings[row.key];
    if (!this.session.setSetting(row.key, value)) return;
    if (row.key === 'easySnap') this.applySnap();
    this.opt.onEvent?.({ type: 'setting', key: row.key, value });
    this.sync();
  }

  private applySnap(): void {
    const system = this.world.getSystem(SocketSnapSystem);
    if (system) system.config.easySnap.value = this.session.save.settings.easySnap;
  }

  private cycleMachine(): void {
    const g = this.giftState;
    if (g.machines.length < 2) return;
    g.index = (g.index + 1) % g.machines.length;
    g.lines = [];
    this.paintGiftPanel();
  }

  private pickEngraving(id: EngravingId): void {
    this.giftState.engraving = id;
    this.giftState.lines = [];
    this.paintGiftPanel();
  }

  private paintGiftPanel(): void {
    const g = this.giftState;
    if (this.panelKind === 'gift' && g.machines.length === 0) {
      g.machines = [...giftableMachines(this.session.save)];
      g.index = 0;
    }
    const machine = g.machines[g.index];
    const lines = g.lines.length ? g.lines : ['Pick words to engrave,', 'then make the link.'];
    this.panelGiftBase.paint(`gift|${lines.join('/')}`, (c, w, h) => paintPanel(c, w, h, 'Send a gift', lines, 0.14));
    this.machineBtn.set(machine ? `Machine: ${MACHINE_NAMES[machine]}` : 'No machine yet', g.machines.length > 1 ? 'idle' : 'disabled');
    ENGRAVINGS.forEach((e, i) => this.chips[i].set(e.text, e.id === g.engraving ? 'on' : 'idle'));
    this.btnL.set(g.busy ? 'Making link…' : 'Make link', machine && !g.busy ? 'idle' : 'disabled');
    this.btnR.set('Close');
  }

  private async makeLink(): Promise<void> {
    const g = this.giftState;
    const machine = g.machines[g.index];
    const host = this.opt.gift;
    if (!machine || !host || g.busy) return;
    g.busy = true;
    this.paintGiftPanel();
    const outcome = await createGiftLink(host, machine, g.engraving, this.opt.share);
    g.busy = false;
    if (outcome.ok) {
      this.closeLinkBox?.();
      this.closeLinkBox = outcome.delivered === 'shown' ? showLinkInPage(outcome.url) : null;
      g.lines = [
        outcome.delivered === 'copied' ? 'Link copied.' : outcome.delivered === 'shared' ? 'Link shared.' : 'Copy was blocked here. The link waits on the page.',
        shortLink(outcome.url, 40),
      ];
      this.opt.onEvent?.({ type: 'gift-link', machineId: machine, url: outcome.url, delivered: outcome.delivered });
    } else {
      g.lines = [outcome.error === 'no-machine' ? 'That machine is not on the table.' : giftErrorText(outcome.error).title];
    }
    this.paintGiftPanel();
  }

  // ---- Painting and facing ---------------------------------------------------------------------------------------------

  private paintLetter(letter: LetterDef): void {
    this.cardPaper.paint(letter.id, (c, w, h) => paintLetter(c, w, h, letter));
  }

  private paintSign(): void {
    const { units, max } = this.wind;
    const r = this.local.result;
    if (r) this.signSlip.paint(`r|${r.status}|${r.title}|${r.hint}`, (c, w, h) => resultSlip(c, w, h, r));
    else this.signSlip.paint(`w|${units}|${max}`, (c, w, h) => paintSlip(c, w, h, windLabel(units, max), units > 0 ? 'Press Run' : HINTS.wind, units > 0 ? 'good' : 'warn'));
    this.paintRun(false);
    const controls = this.view?.runControls === true && this.view.panel === 'none';
    this.runPlaque.mesh.visible = controls;
    this.adjustPlaque.mesh.visible = controls && r !== null && !r.canContinue;
    this.setHot(this.runHot, controls && units > 0);
    this.setHot(this.adjustHot, this.adjustPlaque.mesh.visible);
  }

  private paintRun(hover: boolean): void {
    const enabled = this.wind.units > 0;
    this.runPlaque.set(this.local.result ? 'Run again' : 'Run', !enabled ? 'disabled' : hover ? 'hover' : 'idle');
  }

  private paintBlueprint(): void {
    const b = this.blueprint;
    if (!b) return;
    const key = `${b.title}|${b.slots.map((s) => s.id).join(',')}|${[...this.filled].sort().join(',')}`;
    this.sheet.overlay.paint(key, (c, w, h) => paintBlueprint(c, w, h, b.title, b.slots, this.filled));
  }

  private showHint(view: View): void {
    const mode = this.session.mode;
    let text = '';
    let at = { x: 0, y: 0, z: 0 };
    const s = this.scale();
    if (mode === 'intro' && this.local.trunk === 'closed') {
      text = HINTS.latch;
      const l = latchSpot(s);
      at = { x: l.x, y: l.y + 0.07, z: l.z + 0.06 };
    } else if (view.envelope === 'sealed' && this.appear.value >= 1) {
      text = HINTS.envelope;
      at = { x: LETTER_SPOT.x, y: LETTER_SPOT.y + 0.075, z: LETTER_SPOT.z + 0.02 };
    } else if (view.parcel === 'closed') {
      text = HINTS.parcel;
      const p = benchPoint(s, BENCH.blueprint);
      at = { x: p.x, y: p.y + 0.1, z: p.z };
    } else if (view.placeHint) {
      text = HINTS.place;
      const p = benchPoint(s, BENCH.build);
      at = { x: p.x, y: p.y + 0.17, z: p.z };
    }
    if (view.panel !== 'none') text = '';
    this.hint.mesh.visible = text !== '';
    if (!text) return;
    this.hint.paint(text, (c, w, h) => paintSlip(c, w, h, text, '', 'good'));
    this.hint.mesh.position.set(at.x, at.y, at.z);
    this.faceHead(this.hint.mesh);
  }

  private faceIfShown(object: Object3D, shown: boolean): void {
    if (shown) this.faceHead(object);
  }

  /** Turns `object`'s +Z towards the player's head. `upright` turns it about the vertical axis only (the run sign's post must not lean). */
  private faceHead(object: Object3D, upright = false): void {
    const head = this.opt.head ? this.opt.head(this.head) : defaultHead(this.world, this.head);
    object.parent?.updateWorldMatrix(true, false);
    object.updateWorldMatrix(true, false);
    if (upright) head.y = object.getWorldPosition(_here).y;
    object.lookAt(head);
  }

  /** Every pointer target the UI owns, by its object's name, and whether it answers to rays and pokes right now. For tests and QA. */
  pressables(): Array<{ name: string; active: boolean; object: Object3D; entity: Entity }> {
    return this.hots.map((h) => ({ name: (h.entity.object3D as Object3D).name, active: h.active, object: h.entity.object3D as Object3D, entity: h.entity }));
  }

  /** Last-resort access for tests and QA. */
  get currentView(): View | null {
    return this.view;
  }
  get localFlow(): Readonly<LocalFlow> {
    return this.local;
  }
}

const _here = new Vector3();

const defaultLoad = async (path: string): Promise<Object3D> => {
  const gltf = await AssetManager.loadGLTF(`${import.meta.env.BASE_URL}assets/models/${path}`);
  return gltf.scene.clone(true);
};

const defaultHead = (world: World, out: Vector3): Vector3 => world.player.head.getWorldPosition(out);

