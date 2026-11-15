/**
 * The playable loop: the glue between the game session (`src/game`), the flow UI (`src/ui`), the part loader (`src/parts`),
 * the interaction intents (`src/interaction`), the solver (`src/sim` through the content layer) and the town (`src/town`).
 * It decides nothing the lower layers already decide: modes and progression are the session's, correctness is the solver's,
 * snapping is the interaction layer's, the wake is the town's. This file only turns one into the next.
 *
 *   trunk -> letter -> parcel: housing on the bench, parts in the tray, blueprint sheet     (FlowUi events, PartLoader)
 *   hands seat parts: `snapped` / `unsnapped` intents; dependencies enforced; key gets WindKey; all required filled -> Wind
 *   hands wind the key (`wind` intent); Run: solve, show the verdict; a machine that runs correctly becomes a finished,
 *   carriable machine (`buildMachine`) on the bench, running for as long as its spring lasts -> Place
 *   the hand carries it onto its plot: `placed` -> session.machinePlaced, the town wakes, the next letter arrives
 *
 * Not a hand-made machine: a socket that has no GLB empty yet, or whose intended part has no grab collider (the Carousel and
 * most of the Windmill, `docs/PRODUCTION_AUDIT.md`), is filled by the game with its intended part, so the story is never stuck
 * on a socket nobody can reach. The wrong part of a repair on such a socket cannot be replaced yet (Letter 5).
 *
 * The Clock Tower (Letter 6, ADR-047) is such a machine: no GLB carries a mount for its movement, so the game seats it and the solver
 * judges it. Finished, it is driven by `ClockTowerSystem` (pendulum, escapement, real-time hands, the hourly strikes), which this
 * loop powers while it runs and for good once it stands on its plot; placing it rings the hour at once and opens the theatre doors.
 *
 * The daily repair (ADR-027) is a build that starts from the town's "Repair" medallion: the same housing, tray and run as a story repair,
 * and `session.dailyRepairVerified` instead of a letter when it runs correctly.
 */
import { AdditiveBlending, createSystem, DistanceGrabbable, Grabbed, Mesh, MeshBasicMaterial, OneHandGrabbable, PlaneGeometry, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import type { Entity, Object3D, World } from '@iwsdk/core';
import { needsDirector } from './assembly/director';
import { Bench } from './assembly/bench';
import { AssemblyFeedback } from './assembly/feedback';
import type { RevealHinge } from './assembly/feedback';
import { bindClockTowerAudio } from './audio';
import type { AudioEngine } from './audio';
import { planBuild } from './build-plan';
import { getBlueprint, giftPlacements, INTRICATE_ASSEMBLY, solveAssembly, unmetDependencies, filledDependents } from './content/blueprints';
import type { Assembly, MachineBlueprint, StagesPlan } from './content/blueprints';
import { isFastener, requirePart } from './content/parts';
import { LESSON_IDS, MACHINE_PLOT, REPAIRS } from './game/content';
import type { Difficulty, EngravingId, LetterDef, MachineId, PlotId, RepairDef } from './game/content';
import type { Gift } from './game/gift';
import type { GameSession } from './game/session';
import { interactionIntents, isGazeModeOn, Socket, SnappedTo, SocketSnapSystem, WindKey, XRayTarget } from './interaction';
import type { InteractionIntent } from './interaction';
import { BELFRY_MODEL_PATHS } from './machines/belfry';
import { CLOCK_TOWER_MODEL_PATHS, ClockTowerRigComponent, ClockTowerSystem, clockTowerEvents, installClockTower, TheatreDoors } from './machines/clock-tower';
import { WELL_MODEL_PATHS } from './machines/well';
import { applyLibraryMaterials } from './materials';
import type { MaterialRegistry } from './materials';
import { installOnboarding } from './onboarding';
import type { GameplayView, GhostGuide } from './onboarding';
import { machineAssetIds, PartLoader } from './parts';
import type { MachineInstance, PartInstance } from './parts';
import { MAX_WIND_UNITS } from './sim';
import type { SolveResult } from './sim';
import { STAGE_NODE_ID, StageSystem } from './stage';
import { BLUEPRINT_SOCKET_IDS, buildMachine, loadModel, makeCarriable, PLOTS, TownRuntime } from './town';
import { PAD_TOP_M } from './town/layout';
import type { MachineRig } from './town';
import type { LidHinge } from './town/motion';
import { XRAY_SHELL, xrayZoneOf } from './town/xray-view';
import { HELPER_COPY } from './ui';
import type { FlowEvent, FlowUi, TownLoad } from './ui';
import { Progress, townRevealScale } from './ui/anim';
import { BENCH, benchPoint, CADDY_AT } from './ui/layout';
import { placeTrayParts } from './tray-layout';

/** A finished machine keeps running after it is placed for at most this long (the Music Box plays one cylinder turn), seconds. */
const PLACED_RUN_CAP_S = 16;
/** The fastener caddy (ADR-050): a child of the bench, in the build zone's front strip (INTRICATE_ASSEMBLY_DESIGN §3.3, `CADDY_AT`). */
const CADDY_MODEL_PATH = 'tockton/workshop/fastener_caddy.glb';
/** After Run the power path walks the machine for this long before the lid shuts for the reveal (design §10.4), seconds. */
const REVEAL_AFTER_S = 0.8;
const Z_AXIS = new Vector3(0, 0, 1);
const _spin = new Quaternion();

interface Build {
  readonly blueprint: MachineBlueprint;
  readonly machine: MachineInstance;
  readonly parts: PartInstance[];
  /** Parts the game seats itself (no reachable socket, or nothing to pinch). */
  readonly fixed: Assembly;
  readonly repair: RepairDef | null;
  /** The local date this build is the daily repair of (`session.dailyRepairVerified` takes it), or null for a letter's build. */
  readonly daily: string | null;
  key: Entity | null;
}

interface Carried {
  readonly rig: MachineRig;
  readonly entity: Entity;
  /** The plot the machine was dropped on while the session could not take it (paused): committed on the first update that can. */
  pending: { machine: MachineId; plot: PlotId } | null;
}

export interface GameplayOptions {
  session: GameSession;
  materials: MaterialRegistry;
  audio: AudioEngine;
  /** Resolves when the shared library textures are in (rigs must be made carriable after that, GrabFeedbackSystem clones the materials). */
  texturesReady: Promise<void>;
  /** The 2D render budget's `wake`. */
  keepAwake: () => void;
}

/** Which blueprint a letter is about, and the repair when it is one. */
function planOf(letter: LetterDef | null): { blueprint: MachineBlueprint; repair: RepairDef | null } | null {
  if (!letter) return null;
  const objective = letter.objective;
  const repair = objective.type === 'repair_fault' ? REPAIRS[objective.repairId] : null;
  const blueprint = getBlueprint(objective.type === 'build_and_run' ? objective.blueprintId : (repair?.blueprintId ?? ''));
  return blueprint ? { blueprint, repair } : null;
}

/** The machine of a repair that has no letter of its own (the daily repair). */
function planOfRepair(repair: RepairDef): { blueprint: MachineBlueprint; repair: RepairDef } | null {
  const blueprint = getBlueprint(repair.blueprintId);
  return blueprint ? { blueprint, repair } : null;
}

/**
 * A machine that does not run down once it stands in the town: the wind-driven one (it is the wind's), and the Clock Tower, whose
 * hourly bell could not ring if it stopped with its spring (ADR-047). The others play out their spring (`PLACED_RUN_CAP_S`).
 */
const keepsRunning = (machine: MachineId, result: Pick<SolveResult, 'continuous'>): boolean => result.continuous || machine === 'clock_tower';

/** The files of the finished machines that the town loads by itself (no part loader), for a warm-up while the letter is read. */
const FINISHED_MODEL_PATHS: Readonly<Record<string, readonly string[] | undefined>> = {
  clock_tower: CLOCK_TOWER_MODEL_PATHS,
  well: WELL_MODEL_PATHS,
  belfry: BELFRY_MODEL_PATHS,
};

export class Gameplay {
  /** Set by `index.ts` once the UI exists (it needs this object's callbacks first). */
  ui!: FlowUi;
  loader!: PartLoader;

  private readonly stage: Object3D;
  /**
   * The town, once `attachTown` has run; null before. A first-time player's page is usable before the town's models are in (they are 4.4
   * MiB, and the town stays hidden until the trunk opens), so everything here that needs the town either waits for `townReady` (an async
   * step: the bench, the finished machine) or does nothing until it exists (a plain flag, `townShown`, is kept for it).
   */
  private runtime: TownRuntime | null = null;
  /** The trunk has opened: the town is to be shown, as soon as there is one. */
  private townShown = false;
  /** Whether the town's models are in; the flow UI shows a wait cue, or a retry, once the trunk has opened and they are not. */
  private townLoad: TownLoad = 'loading';
  /** The town settling to its size when it arrives after the trunk opened (the player saw the wait cue), rather than appearing at once. */
  private readonly arrival = new Progress(0.5);
  /**
   * Resolves with the town when `attachTown` has run. A failed load does not settle it: the player is told and can try again (`townFailed`,
   * `townLoading`), and whatever waits for the town (the bench) goes on when a try succeeds, so a retry never leaves an empty workbench.
   */
  readonly townReady: Promise<TownRuntime>;
  private resolveTown!: (town: TownRuntime) => void;
  private build: Build | null = null;
  /** Unregisters the bench machine from the X-ray view (town.xray): the lens opens it while it is on the bench. */
  private xrayBench: (() => void) | null = null;
  private buildToken = 0;
  private windUnits = 0;
  private busy = false;
  private carried: Carried | null = null;
  /** Machines standing on their plots. `entity` is the one that holds the plot socket (null for a restored machine, which the town holds itself). */
  private readonly placed = new Map<MachineId, { rig: MachineRig; entity: Entity | null }>();
  private readonly built = new Map<string, Assembly>();
  private runs: Array<{ rig: MachineRig; left: number }> = [];
  private seating: Entity[] | null = null;
  private lid: LidHinge | null = null;
  private readonly unsubscribe: () => void;
  private readonly unbindTowerAudio: () => void;
  /** The warm patch on the plot a carried machine belongs on ("Carry it to the glowing plot"), made on first use. */
  private glow: Mesh | null = null;
  private clock = 0;
  /** Today's daily repair, from the moment its medallion was pressed until it is placed (or the story is restarted). */
  private daily: { repair: RepairDef; date: string } | null = null;
  /** The finished Clock Tower, if one exists (carried, or standing on its plot): the entity that holds its `ClockTowerRig`. */
  private tower: { rig: MachineRig; entity: Entity } | null = null;
  private towerPowered = false;
  /** Machines whose finished model files are already being fetched (see `preload`). */
  private readonly warmed = new Set<string>();
  private towerSystem: ClockTowerSystem | undefined;
  /** The ghost-hand onboarding (src/onboarding, PRODUCT_SPEC F15): set by `installGameplay` once the town and the UI exist. */
  guide: GhostGuide | null = null;
  /** The theatre facade's doors (PIV_DoorL, PIV_DoorR), opened by the tower's hour; `doorsWereOpen` shuts them once it stops. */
  private readonly doors = new TheatreDoors();
  private doorsWereOpen = false;
  /** The intricate build in progress (ADR-050): the caddy, the stage bags, the Helper. Null for every build that keeps today's flow. */
  private bench: Bench | null = null;
  private caddy: Object3D | null = null;
  /** Presentation of the intricate assembly (snap voices, glints, the lid's reveal), made on first use; it outlives the build because the reveal comes after it. */
  private feedback: AssemblyFeedback | null = null;
  /** The finished machine while its reveal plays: the power path walks it, the lid shuts and lifts, then it runs. */
  private reveal: { rig: MachineRig; result: SolveResult; wait: number } | null = null;

  constructor(
    private readonly world: World,
    private readonly opt: GameplayOptions,
  ) {
    const stage = world.getSceneObject(STAGE_NODE_ID);
    if (!stage) throw new Error(`Scene node "${STAGE_NODE_ID}" is missing.`);
    this.stage = stage;
    this.unsubscribe = interactionIntents.subscribe((intent) => this.onIntent(intent));
    this.unbindTowerAudio = bindClockTowerAudio(opt.audio, clockTowerEvents);
    this.townReady = new Promise<TownRuntime>((resolve) => {
      this.resolveTown = resolve;
    });
  }

  /** The town, or null while its models are still loading (see `townReady`). */
  get town(): TownRuntime | null {
    return this.runtime;
  }

  /** Keeps the 2D page rendering (the render budget's `wake`). */
  keepAwake(): void {
    this.opt.keepAwake();
  }

  private get session(): GameSession {
    return this.opt.session;
  }

  private get townScale(): number {
    return this.world.getSystem(StageSystem)?.townScale ?? 1;
  }

  // ---- Start-up -----------------------------------------------------------------------------------------------------

  /** What the story needs whether or not the town is in yet: the next letter's models. */
  start(): void {
    this.ui.setTownLoad(this.townLoad);
    this.preload(this.session.letter);
  }

  /**
   * The town's models are in and it stands under the stage (`installTown`). Shows it when the trunk has opened (a returning player's
   * town is visible at once) and restores a returning player's town: the plots that were awake and the machines that stood on them.
   */
  async attachTown(town: TownRuntime): Promise<void> {
    this.runtime = town;
    this.setTownLoad('ready');
    town.town.group.visible = this.townShown || this.session.mode !== 'intro';
    if (this.townShown) {
      // The trunk opened before the town was in and the player has been looking at the wait cue: the town settles in instead of appearing.
      town.town.group.scale.setScalar(this.townScale * townRevealScale(0));
      this.arrival.jump(0);
      this.arrival.go(1);
    }
    const missing = this.doors.resolve(town.town.theatre);
    if (missing.length > 0) console.warn(`[wound-up] the theatre facade has no ${missing.join(', ')}: its doors will not open.`);
    const standing = this.session.save.machines.filter((m) => m.placed && m.plotId);
    town.restore(standing.map((m) => m.plotId as PlotId));
    this.resolveTown(town);
    if (standing.length === 0) return;
    await this.opt.texturesReady;
    for (const record of standing) {
      const blueprint = getBlueprint(record.blueprintId);
      const rig = await buildMachine(record.blueprintId, loadModel, this.opt.materials, BLUEPRINT_SOCKET_IDS);
      if (!rig || !blueprint) continue;
      const result = this.solve(blueprint, blueprint.intended, MAX_WIND_UNITS);
      rig.result = result;
      rig.running = result !== null && keepsRunning(record.blueprintId, result); // a saved Windmill or Clock Tower runs again, a saved Music Box waits for its next letter
      const xray = xrayZoneOf(rig.root); // at the bench scale, before placeRig eases it to the town's
      if (!town.placeRig(rig)) continue;
      // Nothing carries a restored machine, so the town holds it; it still needs an entity, for the palm gesture (and the Clock Tower's rig component).
      let entity: Entity;
      if (record.blueprintId === 'clock_tower') entity = this.attachTower(rig, null);
      else {
        entity = this.world.createEntity();
        entity.object3D = rig.root;
      }
      entity.addComponent(XRayTarget, xray);
      this.placed.set(record.blueprintId, { rig, entity });
    }
  }

  /** The town's models could not be loaded: the flow UI says so and offers a retry (`townLoading` is the retry); whatever waits for the town goes on waiting. */
  townFailed(): void {
    this.setTownLoad('failed');
  }

  /** The town's models are being loaded (again): the flow UI shows "Waking Tockton…". */
  townLoading(): void {
    this.setTownLoad('loading');
  }

  private setTownLoad(state: TownLoad): void {
    this.townLoad = state;
    this.ui.setTownLoad(state);
  }

  /** The town's events (installTown `events`). */
  readonly townEvents = {
    placed: (machine: MachineId, plot: PlotId, node: Object3D): void => this.onPlaced(machine, plot, node),
    lifted: (_machine: MachineId, _plot: PlotId, node: Object3D): void => {
      if (this.carried?.rig.root === node) this.carried.pending = null;
    },
    woke: (): void => this.opt.keepAwake(),
  };

  /** FlowUi's `onEvent`. */
  readonly onFlow = (event: FlowEvent): void => {
    this.opt.keepAwake();
    this.lessonDone(event.type);
    switch (event.type) {
      case 'trunk-opened':
        this.townShown = true;
        if (this.runtime) this.runtime.town.group.visible = true; // not in yet: `attachTown` shows it
        this.preload(this.session.letter);
        break;
      case 'letter-accepted':
        this.preload(event.letter);
        break;
      case 'daily-repair': {
        this.daily = { repair: event.repair, date: event.date };
        const plan = planOfRepair(event.repair);
        if (plan) this.loader.preload(machineAssetIds(plan.blueprint, [event.repair.faultyPartId]));
        break;
      }
      case 'parcel-opened':
        this.startBuild(event.letter).catch((e: unknown) => console.error('[wound-up] could not set the workbench:', e));
        break;
      case 'run':
        this.run().catch((e: unknown) => console.error('[wound-up] run failed:', e));
        break;
      case 'adjust':
        this.resetWind();
        break;
      case 'restarted':
        this.reset();
        break;
      case 'cue':
        this.cue(event.cue);
        break;
      case 'difficulty':
        this.setLevel(event.value);
        this.bench?.setDifficulty(event.value);
        break;
      case 'helper':
        this.bench?.helperPressed(event.long, !isGazeModeOn());
        break;
      default:
        break; // setting (Easy Snap is applied by the UI), gift-link
    }
  };

  /** The player's level sets how far a hand's release reaches a socket (design §5.2). */
  setLevel(level: Difficulty | null): void {
    const system = this.world.getSystem(SocketSnapSystem);
    if (system) system.config.level.value = level ?? 'standard';
  }

  /** The player did what a ghost-hand lesson shows: the flow event is the proof (a press on the latch, the letter, the parcel, Run). */
  private lessonDone(event: FlowEvent['type']): void {
    if (event === 'trunk-opened') this.guide?.complete('latch');
    else if (event === 'letter-accepted') this.guide?.complete('letter');
    else if (event === 'parcel-opened') this.guide?.complete('parcel');
    else if (event === 'run') this.guide?.complete('run');
  }

  private cue(cue: 'latch' | 'paper' | 'button'): void {
    const audio = this.opt.audio;
    if (cue === 'latch') audio.snap();
    else audio.pluck(cue === 'paper' ? 79 : 72, 0.3);
  }

  private preload(letter: LetterDef | null): void {
    const plan = planOf(letter);
    if (!plan) return;
    this.loader.preload(machineAssetIds(plan.blueprint, plan.repair ? [plan.repair.faultyPartId] : []));
    const finished = FINISHED_MODEL_PATHS[plan.blueprint.id];
    if (finished && !this.warmed.has(plan.blueprint.id)) {
      // The finished tower, well or belfry is made from a dozen files by the town's loader (its own cache): have them parsed before Run is pressed.
      this.warmed.add(plan.blueprint.id);
      for (const path of finished) loadModel(path).catch((e: unknown) => console.warn(`[wound-up] could not preload "${path}":`, e));
    }
  }

  // ---- Per frame ----------------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.seating) {
      const parts = this.seating;
      this.seating = null;
      for (const entity of parts) entity.removeComponent(Grabbed); // SocketSnapSystem seats each one now, in dependency order
    }
    if (!this.session.save.townPlaced) {
      const phase = this.world.getSystem(StageSystem)?.placement;
      if (phase === 'table' || phase === 'stand') this.session.townPlaced();
    }
    const carried = this.carried;
    if (carried?.pending && this.session.mode === 'place') this.commitPlacement(carried, carried.pending.machine, carried.pending.plot);
    this.updateGlow(dt);
    this.updateArrival(dt);
    this.guide?.update(dt);
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const run = this.runs[i];
      run.left -= dt;
      if (run.left > 0) continue;
      run.rig.running = false;
      this.runs.splice(i, 1);
    }
    this.syncTower();
    this.updateDoors();
    this.updateAssembly(dt);
  }

  /** The intricate build's frame: the caddy's pieces, the director and the Helper, then the glints and the reveal (after `SocketSnapSystem`, which seats the parts). */
  private updateAssembly(dt: number): void {
    this.bench?.update(dt);
    const reveal = this.reveal;
    if (reveal && reveal.wait > 0) {
      reveal.wait -= dt;
      if (reveal.wait <= 0) this.feedbackFor().onReveal(() => this.startRunning(reveal.rig, reveal.result));
    }
    if (this.feedback) {
      this.feedback.update(dt, this.world.camera);
      if (this.bench || this.reveal || this.feedback.liveGlints > 0) this.opt.keepAwake();
    }
  }

  /** The presentation of the intricate assembly, made on first use (it needs the stage). */
  private feedbackFor(): AssemblyFeedback {
    return (this.feedback ??= new AssemblyFeedback(
      this.stage,
      this.opt.audio,
      {
        locate: (socketId, out) => this.locate(socketId, out),
        lid: (): RevealHinge | null => this.reveal?.rig.lid ?? this.lid,
      },
      { stages: 7 },
    ));
  }

  /** The world position of what stands in solver socket `socketId`: the finished machine's own node during the reveal, else the part on the bench. */
  private locate(socketId: string, out: Vector3): boolean {
    const rotor = this.reveal?.rig.rotors.find((r) => r.socketId === socketId);
    const object = rotor?.node ?? (this.build?.machine.sockets.get(socketId)?.getValue(Socket, 'occupant') as Entity | null | undefined)?.object3D;
    if (!object) return false;
    object.getWorldPosition(out);
    return true;
  }

  // ---- The Clock Tower (ADR-047) ------------------------------------------------------------------------------------

  /** Puts the `ClockTowerRig` component on the tower's entity (the carry entity, or a plain one for a tower restored from a save). */
  private attachTower(rig: MachineRig, carry: Entity | null): Entity {
    let entity = carry;
    if (!entity) {
      entity = this.world.createEntity();
      entity.object3D = rig.root;
    }
    entity.addComponent(ClockTowerRigComponent, { powered: false });
    this.tower = { rig, entity };
    this.towerPowered = false;
    return entity;
  }

  /** The tower's clock runs exactly while its rig does: the spring's seconds on the bench, for good once it stands on its plot. */
  private syncTower(): void {
    const tower = this.tower;
    if (!tower || tower.rig.running === this.towerPowered) return;
    this.towerPowered = tower.rig.running;
    tower.entity.setValue(ClockTowerRigComponent, 'powered', this.towerPowered);
  }

  /** The theatre doors follow the tower's hour: open for 30 seconds, then shut again (also when the tower is taken away mid-hour). */
  private updateDoors(): void {
    const runtime = this.clockTower()?.runtime ?? null;
    const open = runtime?.doorsOpen === true;
    if (open || this.doorsWereOpen) this.doors.apply(open && runtime ? runtime.doorsAmount : 0);
    this.doorsWereOpen = open;
  }

  /** The tower is on its plot: its clock runs, and the hour rings at once so the town sees the payoff (the real hour rings on the hour). */
  private towerPlaced(): void {
    this.syncTower();
    this.clockTower()?.runtime?.triggerStrikes();
  }

  /** The tower's system, looked up once (it is registered by `installGameplay`, so it exists from the first frame). */
  private clockTower(): ClockTowerSystem | undefined {
    return (this.towerSystem ??= this.world.getSystem(ClockTowerSystem));
  }

  /** The town that arrived late settles to the scale the stage gives it (read each frame: a table placement may change it meanwhile). */
  private updateArrival(dt: number): void {
    const town = this.runtime;
    if (!this.arrival.moving || !town) return;
    this.arrival.step(dt);
    town.town.group.scale.setScalar(this.townScale * townRevealScale(this.arrival.eased));
    this.opt.keepAwake();
  }

  /** The plot of the machine in the hand breathes in lamp light until the machine is put down on it. */
  private updateGlow(dt: number): void {
    const plot = this.carried ? PLOTS[MACHINE_PLOT[this.carried.rig.machineId]] : null;
    const town = this.runtime;
    if (!plot || !town) {
      if (this.glow) this.glow.visible = false;
      return;
    }
    if (!this.glow) {
      this.glow = new Mesh(
        new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new MeshBasicMaterial({ color: 0xffc66d, transparent: true, opacity: 0.35, depthWrite: false, blending: AdditiveBlending }),
      );
      this.glow.name = 'PlotGlow';
      this.glow.renderOrder = 2;
      town.town.group.add(this.glow);
    }
    this.clock += dt;
    this.glow.visible = true;
    this.glow.position.set(plot.x, PAD_TOP_M + 0.0008, plot.z);
    this.glow.scale.set(plot.halfW * 2, 1, plot.halfD * 2);
    (this.glow.material as MeshBasicMaterial).opacity = 0.22 + 0.16 * (0.5 + 0.5 * Math.sin(this.clock * 3));
    this.opt.keepAwake();
  }

  // ---- Building -----------------------------------------------------------------------------------------------------

  private async startBuild(letter: LetterDef | null): Promise<void> {
    const daily = this.daily; // set by the `daily-repair` event: the parcel then holds today's repair, whatever letter is waiting
    const plan = daily ? planOfRepair(daily.repair) : planOf(letter);
    if (!plan) return;
    const { blueprint, repair } = plan;
    this.disposeBuild();
    const token = ++this.buildToken;
    const town = this.runtime ?? (await this.townReady); // the bench machine joins the town's X-ray view; the town is long in by the time a letter has been read
    if (token !== this.buildToken) return;
    // A repair starts from the machine as it stands in the town: it comes back to the bench, the plot stays awake.
    const standing = this.placed.get(blueprint.id as MachineId);
    if (repair && standing) this.removePlaced(blueprint.id as MachineId);

    const at = benchPoint(this.townScale, BENCH.build);
    const machine = await this.loader.spawnMachine(blueprint.id, { parent: this.stage, position: [at.x, at.y, at.z] });
    if (token !== this.buildToken) return machine.dispose();
    this.xrayBench = town.xray.add({
      root: machine.object,
      prefixes: XRAY_SHELL[blueprint.id] ?? [],
      lens: () => true,
      moving: () => this.seatedParts(), // the gears and shafts in their sockets are the mechanism that glows (they are not children of the housing)
    });
    this.lid = openLid(machine.object);

    // What each socket takes from the player, and what the game seats itself (src/build-plan.ts). The intricate build (ADR-050) is the first build of a machine
    // that tells its build in stages, at the player's level; a repair and the daily repair keep the build they had, their hardware seated by the game.
    const level = this.session.save.settings.difficulty;
    const staged = INTRICATE_ASSEMBLY && level !== null && repair === null && daily === null && blueprint.stages !== undefined;
    const { fixed, seatNow, spawnIds, handBuilt, stages } = planBuild(blueprint, repair, machine.sockets.size, (socketId) => machine.sockets.has(socketId), staged ? level : undefined);
    const build: Build = { blueprint, machine, parts: [], fixed, repair, daily: daily?.date ?? null, key: null };
    const traySpawned = spawnIds.length - seatNow.length;
    this.build = build;
    const deep = staged && needsDirector(blueprint, stages);
    if (deep) {
      this.setLevel(level);
      if (!(await this.startDeep(build, stages, token, at))) return;
    } else if (handBuilt) {
      // Each part lies in the compartment made for it (parts_tray.glb, src/tray-layout.ts), in its final pose from the start: the pose it is
      // spawned in is the one it returns to when it is let go.
      const slots = this.ui.traySlots().map((v) => this.stage.worldToLocal(v));
      const lies = placeTrayParts(
        spawnIds.map((id) => ({ assetId: requirePart(id).visual.assetId, family: requirePart(id).family })),
        slots,
        _at.set(at.x, at.y + 0.05, at.z),
      );
      const spawned = await Promise.all(
        spawnIds.map((partId, i) => this.loader.spawnPart(partId, { parent: this.stage, position: lies[i].position, quaternion: lies[i].quaternion, machine })),
      );
      if (token !== this.buildToken) return void spawned.forEach((part) => part.dispose());
      for (const part of spawned) {
        build.parts.push(part);
        for (const warning of part.warnings) console.warn(`[wound-up] ${part.partId}: ${warning}`);
      }
      this.ui.revealParts(spawned.map((part) => part.object)); // pops them in; it also moves part i to compartment i, so each goes back to its own
      spawned.forEach((part, i) => part.object.position.set(...lies[i].position));
      if (seatNow.length > 0) this.seat(build, spawned.slice(traySpawned), seatNow);
    }
    this.ui.showBlueprint({
      title: blueprint.name,
      slots: blueprint.sockets.filter((s) => s.family !== 'fastener').map((s) => ({ id: s.id, label: requirePart(blueprint.intended[s.id]).name })), // hardware is not a slot (ADR-050)
    });
    this.windUnits = 0;
    for (const socketId of Object.keys(fixed)) this.ui.setSlotFilled(socketId, true);
    this.bench?.begin(); // after the sheet: the director puts the stage list on it
    this.checkComplete();
  }

  /**
   * The intricate build's bench (ADR-050, design §3): the caddy on the bench, the director with its stage bags, the dispensers and the Helper. The hardware files
   * are loaded first, so a piece can be made in the very frame the dispenser or the game asks for it. False when the build was replaced while this was loading.
   */
  private async startDeep(build: Build, plan: StagesPlan, token: number, at: { readonly x: number; readonly y: number; readonly z: number }): Promise<boolean> {
    const { blueprint, machine } = build;
    const hardwareAssets = new Set(Object.values(blueprint.intended).filter(isFastener).map((partId) => requirePart(partId).visual.assetId));
    const [caddy] = await Promise.all([this.loadCaddy(), ...[...hardwareAssets].map((assetId) => this.loader.load(assetId))]);
    if (token !== this.buildToken) {
      caddy?.removeFromParent();
      return false;
    }
    this.caddy = caddy;
    // Every big part of the build has its compartment from the start (so the tray never reshuffles as bags open); a stage's parts are made when it opens.
    const bigIds = plan.stages.flatMap((st) => st.bag.big);
    const slots = this.ui.traySlots().map((v) => this.stage.worldToLocal(v));
    const lies = placeTrayParts(
      bigIds.map((id) => ({ assetId: requirePart(id).visual.assetId, family: requirePart(id).family })),
      slots,
      _at.set(at.x, at.y + 0.05, at.z),
    );
    this.bench = new Bench({
      world: this.world,
      stage: this.stage,
      loader: this.loader,
      machine,
      blueprint,
      plan,
      ui: this.ui,
      audio: this.opt.audio,
      feedback: this.feedbackFor(),
      copy: HELPER_COPY,
      caddy,
      lies,
      assembly: () => this.assembly(),
      track: (part) => void build.parts.push(part),
      untrack: (part) => {
        const i = build.parts.indexOf(part);
        if (i >= 0) build.parts.splice(i, 1);
      },
      anyHeld: () => {
        for (const part of build.parts) if (part.entity.hasComponent(Grabbed)) return true;
        return false;
      },
      onSeated: () => this.checkComplete(),
      quiet: () => (this.session.mode !== 'build' && this.session.mode !== 'wind') || this.ui.panelOpen(),
    });
    this.feedbackFor().reset();
    return true;
  }

  /** The fastener caddy on the bench (design §3.3), or null when its file does not load: Relaxed plays without it, the others lose their bins. */
  private async loadCaddy(): Promise<Object3D | null> {
    try {
      const model = await loadModel(CADDY_MODEL_PATH);
      const root = model.scene.clone(true);
      applyLibraryMaterials(root, this.opt.materials);
      root.name = 'FastenerCaddy';
      root.position.set(CADDY_AT.x, CADDY_AT.y, CADDY_AT.z);
      this.ui.benchRoot.add(root);
      return root;
    } catch (error) {
      console.warn('[wound-up] The fastener caddy did not load.', error);
      return null;
    }
  }

  /** The parts of the bench machine that stand in a socket now. Allocates: X-ray asks when it turns on. */
  private seatedParts(): Object3D[] {
    return this.build ? this.build.parts.filter((p) => p.entity.hasComponent(SnappedTo)).map((p) => p.object) : [];
  }

  /** Puts each part in its socket the way a hand would: at the socket, held for a frame, then let go (SocketSnapSystem seats it). */
  private seat(build: Build, parts: readonly PartInstance[], plan: ReadonlyArray<readonly [socketId: string, partId: string]>): void {
    const free = [...parts];
    const entities: Entity[] = [];
    for (const [socketId, partId] of plan) {
      const index = free.findIndex((p) => p.partId === partId);
      const socket = build.machine.sockets.get(socketId);
      const node = socket?.getValue(Socket, 'node') as Object3D | undefined;
      if (index < 0 || !node) continue;
      const [part] = free.splice(index, 1);
      node.getWorldPosition(_at);
      part.object.parent?.worldToLocal(_at);
      part.object.position.copy(_at);
      part.entity.addComponent(Grabbed);
      entities.push(part.entity);
    }
    this.seating = entities; // released next frame, in blueprint (dependency) order
  }

  private assembly(): Assembly {
    const build = this.build;
    return build ? { ...build.fixed, ...build.machine.assembly() } : {};
  }

  private checkComplete(): void {
    const build = this.build;
    if (!build || this.session.mode !== 'build') return;
    const assembly = this.assembly();
    if (!build.blueprint.sockets.every((s) => !s.required || assembly[s.id] !== undefined)) return;
    if (this.session.assemblyComplete()) {
      // No key a hand can reach (the Windmill has none, the Carousel's is not placeable yet): the machine comes wound.
      const keyByHand = build.blueprint.sockets.some((s) => s.family === 'winding_key' && !(s.id in build.fixed));
      if (!keyByHand) this.windUnits = MAX_WIND_UNITS;
      this.ui.setWind(this.windUnits, MAX_WIND_UNITS);
      this.ui.onModeChange();
    }
  }

  private socketIdOf(build: Build, socket: Entity): string | undefined {
    for (const [id, entity] of build.machine.sockets) if (entity === socket) return id;
    return undefined;
  }

  private onIntent(intent: InteractionIntent): void {
    const build = this.build;
    switch (intent.type) {
      case 'snapped': {
        const socketId = build ? this.socketIdOf(build, intent.socket) : undefined;
        if (!build || socketId === undefined) {
          // A plot socket: the town's. `bindInteractionAudio(audio, { snaps: false })` leaves every snap click to this layer, so the machine's click on its plot sounds here.
          this.opt.audio.snap();
          return;
        }
        if (unmetDependencies(build.blueprint, this.assembly(), socketId).length > 0) {
          intent.part.removeComponent(SnappedTo); // the socket is not ready for it: out again, and the tray takes it back
          this.opt.audio.bonk();
          this.bench?.wrong();
          return;
        }
        if (requirePart(intent.partId).family === 'winding_key') {
          intent.part.addComponent(WindKey, { axis: [0, 0, 1], maxUnits: MAX_WIND_UNITS });
          build.key = intent.part;
        }
        if (!this.bench) this.opt.audio.snap(); // an intricate build's bench plays it, in the voice of the part's material, and reads the step engine (bench.ts)
        if (!isFastener(intent.partId)) this.ui.setSlotFilled(socketId, true); // hardware is not a slot (ADR-050)
        this.checkComplete();
        break;
      }
      case 'unsnapped': {
        if (!build) return;
        const socketId = this.socketIdOf(build, intent.socket);
        if (socketId === undefined) return;
        if (!isFastener(intent.partId)) this.ui.setSlotFilled(socketId, false);
        if (build.key === intent.part) {
          intent.part.removeComponent(WindKey);
          build.key = null;
          this.windUnits = 0;
        }
        // Whatever stood on this part comes loose with it (MUSIC_BOX_BLUEPRINT §7.1 "Removal"); `unsnapped` repeats for each.
        for (const dependent of filledDependents(build.blueprint, build.machine.assembly(), socketId)) {
          const occupant = build.machine.sockets.get(dependent)?.getValue(Socket, 'occupant') as Entity | null | undefined;
          occupant?.removeComponent(SnappedTo);
        }
        if (this.session.mode === 'wind' && this.session.backToBuild()) {
          this.ui.onModeChange();
          this.opt.keepAwake();
        }
        break;
      }
      case 'rejected':
        this.bench?.wrong(); // a wrong attempt: it counts towards the Helper's offer
        break;
      case 'wind':
      case 'windEnd':
        this.windUnits = intent.units;
        if (this.build) this.ui.setWind(intent.units, MAX_WIND_UNITS);
        this.opt.keepAwake();
        break;
      default:
        break;
    }
  }

  private resetWind(): void {
    this.windUnits = 0;
    this.build?.key?.setValue(WindKey, 'units', 0);
    this.ui.setWind(0, MAX_WIND_UNITS);
  }

  // ---- Run ----------------------------------------------------------------------------------------------------------

  private solve(blueprint: MachineBlueprint, assembly: Assembly, windUnits: number): SolveResult | null {
    const outcome = solveAssembly(blueprint, assembly, windUnits);
    if (outcome.ok) return outcome.result;
    console.error('[wound-up] the solver rejected the machine:', outcome.errors);
    return null;
  }

  private async run(): Promise<void> {
    const build = this.build;
    if (!build || this.busy || this.session.mode !== 'wind') return;
    const result = this.solve(build.blueprint, this.assembly(), this.windUnits);
    if (!result) return;
    this.ui.showResult(result, { speedRatio: speedRatio(build.blueprint, result) });
    if (result.status !== 'runs') return; // the machine is still on the bench: Adjust takes it back to Build
    this.busy = true;
    try {
      await this.finish(build, result);
    } finally {
      this.busy = false;
    }
  }

  /** The machine ran correctly: the bench machine becomes the finished one (the same parts, now turning), and Place starts. */
  private async finish(build: Build, result: SolveResult): Promise<void> {
    const id = build.blueprint.id as MachineId;
    await this.opt.texturesReady; // GrabFeedbackSystem clones the materials of what it is given: they must be final
    const town = this.runtime ?? (await this.townReady);
    const rig = await buildMachine(id, loadModel, this.opt.materials, BLUEPRINT_SOCKET_IDS);
    if (!rig || this.build !== build) return;
    const deep = this.bench !== null; // an intricate build ends in the reveal (design §10.4)
    const housing = build.machine.object;
    rig.root.position.copy(housing.position);
    rig.root.quaternion.copy(housing.quaternion);
    this.stage.add(rig.root);
    if (rig.lid && this.lid) rig.lid.angle = rig.lid.openRad; // the lid was open on the bench: no flicker when the rig takes over
    this.built.set(id, this.assembly());
    this.disposeBuild();

    rig.result = result;
    if (deep) {
      // The power path walks the standing machine, then the lid shuts, a held breath, and it lifts as the melody starts (`startRunning`).
      rig.running = false;
      this.reveal = { rig, result, wait: REVEAL_AFTER_S };
      this.feedbackFor().onFirstRun(build.blueprint);
    } else {
      rig.running = true;
      this.runs.push({ rig, left: result.continuous ? PLACED_RUN_CAP_S : Math.min(result.runSeconds, PLACED_RUN_CAP_S) });
    }
    town.addRig(rig);
    this.carried = { rig, entity: makeCarriable(this.world, rig), pending: null };
    if (id === 'clock_tower') this.attachTower(rig, this.carried.entity);

    if (build.daily !== null) this.session.dailyRepairVerified(build.daily);
    else if (build.repair) this.session.repairVerified(build.repair.id);
    this.session.machineRanCorrectly(id);
    this.ui.onModeChange();
    this.opt.keepAwake();
  }

  /** The reveal's lid is lifting: the machine runs for as long as its spring lasts, as a build that is not intricate does at once. */
  private startRunning(rig: MachineRig, result: SolveResult): void {
    if (this.reveal?.rig === rig) this.reveal = null;
    rig.running = true;
    this.runs = this.runs.filter((r) => r.rig !== rig);
    this.runs.push({ rig, left: result.continuous ? PLACED_RUN_CAP_S : Math.min(result.runSeconds, PLACED_RUN_CAP_S) });
    this.opt.keepAwake();
  }

  // ---- Place --------------------------------------------------------------------------------------------------------

  private onPlaced(machine: MachineId, plot: PlotId, node: Object3D): void {
    this.opt.keepAwake();
    const carried = this.carried;
    if (!carried || carried.rig.root !== node) return;
    carried.pending = { machine, plot };
    if (this.session.mode === 'place') this.commitPlacement(carried, machine, plot);
  }

  private commitPlacement(carried: Carried, machine: MachineId, plot: PlotId): void {
    carried.pending = null;
    if (MACHINE_PLOT[machine] !== plot || !this.session.machinePlaced(machine, plot)) return;
    this.carried = null;
    this.placed.set(machine, { rig: carried.rig, entity: carried.entity });
    // A machine on its plot stays there: nothing carries it off again (it would return to the bench, which is gone).
    carried.entity.removeComponent(OneHandGrabbable);
    carried.entity.removeComponent(DistanceGrabbable);
    const blueprint = getBlueprint(machine);
    const full = blueprint ? this.solve(blueprint, this.built.get(machine) ?? blueprint.intended, MAX_WIND_UNITS) : null;
    if (full) {
      carried.rig.result = full;
      carried.rig.running = true; // it plays as the town wakes
      this.runs = this.runs.filter((r) => r.rig !== carried.rig);
      this.runs.push({ rig: carried.rig, left: keepsRunning(machine, full) ? Infinity : Math.min(full.runSeconds, PLACED_RUN_CAP_S) });
    }
    if (machine === 'clock_tower') this.towerPlaced();
    this.guide?.complete('place');
    this.daily = null;
    this.ui.onModeChange();
    this.preload(this.session.letter);
  }

  private removePlaced(machine: MachineId): void {
    const standing = this.placed.get(machine);
    if (!standing) return;
    this.placed.delete(machine);
    this.retire(standing.rig, standing.entity);
  }

  /** Takes a machine off the town. Destroying its entity frees the plot socket it was seated in. */
  private retire(rig: MachineRig, entity: Entity | null): void {
    if (this.tower?.rig === rig) {
      this.tower = null;
      this.towerPowered = false;
    }
    entity?.destroy();
    this.runtime?.removeRig(rig);
    this.runs = this.runs.filter((r) => r.rig !== rig);
    rig.root.removeFromParent();
  }

  // ---- Clean-up -----------------------------------------------------------------------------------------------------

  /** Takes the bench machine and its parts away. The build is forgotten first, so the `unsnapped` of each destroyed part is ignored. */
  private disposeBuild(): void {
    const build = this.build;
    this.build = null;
    this.bench?.end(); // before the parts go: it hands the pieces still waiting in the caddy back
    this.bench = null;
    this.caddy?.removeFromParent();
    this.caddy = null;
    this.seating = null;
    this.lid = null;
    this.buildToken++;
    this.xrayBench?.(); // the housing gets its shared materials back before it is disposed
    this.xrayBench = null;
    if (!build) return;
    for (const part of build.parts) part.dispose();
    build.machine.dispose();
  }

  /** Restart was confirmed: back to the frozen town and the trunk. The session and the UI have reset themselves. */
  private reset(): void {
    this.disposeBuild();
    this.reveal = null;
    this.feedback?.reset();
    if (this.carried) {
      this.retire(this.carried.rig, this.carried.entity);
      this.carried = null;
    }
    for (const { rig, entity } of this.placed.values()) this.retire(rig, entity);
    this.placed.clear();
    this.built.clear();
    this.runs = [];
    this.windUnits = 0;
    this.daily = null;
    this.townShown = false;
    this.runtime?.reset();
    if (this.runtime) this.runtime.town.group.visible = false;
    this.guide?.reset(this.session.save.learned);
  }

  /** Read-only windows onto the loop for the onboarding guide (src/onboarding/host.ts). */
  guideView(): GameplayView {
    return {
      world: this.world,
      session: this.session,
      ui: this.ui,
      town: () => this.runtime,
      stage: this.stage,
      townScale: () => this.townScale,
      // The stage root is hidden until the table (or the stand) is chosen, and a 2D page has no hands to teach: no lesson before both hold.
      presenting: () => this.stage.visible && this.world.visibilityState.peek() !== VisibilityState.NonImmersive,
      build: () => this.build,
      carried: () => this.carried,
      windUnits: () => this.windUnits,
      assembly: () => this.assembly(),
    };
  }

  /** The gift panel's machine: what the player built, or the intended build for one restored from a save. Null for a machine without a blueprint. */
  giftOf(machineId: MachineId, engraving: EngravingId): Gift | null {
    const blueprint = getBlueprint(machineId);
    if (!blueprint) return null;
    const assembly = this.built.get(machineId) ?? blueprint.intended;
    return {
      blueprintId: machineId,
      blueprintVersion: blueprint.version,
      placements: giftPlacements(blueprint, assembly), // the big parts only: hardware is implied (ADR-050)
      engraving,
    };
  }

  dispose(): void {
    this.guide?.dispose();
    this.unsubscribe();
    this.unbindTowerAudio();
    this.disposeBuild();
    this.feedback?.dispose();
    this.feedback = null;
  }

  // ---- QA -----------------------------------------------------------------------------------------------------------

  /** Opt-in (`?debug`): drives the loop without hands, for the browser and emulator tests. */
  debug() {
    const town = (): TownRuntime | null => this.runtime;
    return {
      session: this.session,
      ui: this.ui,
      /** The town runtime, null while the town is still loading (`townReady`). */
      get town(): TownRuntime | null {
        return town();
      },
      townReady: this.townReady,
      /** Whether the town's models are in (`loading`, `ready`) or could not be loaded (`failed`). */
      townLoad: (): TownLoad => this.townLoad,
      state: () => ({
        mode: this.session.mode,
        build: this.build ? { blueprint: this.build.blueprint.id, parts: this.build.parts.length, seated: Object.keys(this.build.machine.assembly()).length, fixed: Object.keys(this.build.fixed).length } : null,
        bench: this.bench
          ? {
              level: this.bench.difficulty,
              stage: this.bench.director.steps?.stage ?? null,
              armed: this.bench.director.steps?.armed ?? [],
              next: this.bench.director.steps?.next ?? null,
              /** The catalogue id of the part the next step takes, and whether it is hardware (a piece from the caddy). */
              nextPart: this.build ? (this.build.blueprint.intended[this.bench.director.steps?.next ?? ''] ?? null) : null,
              complete: this.bench.director.steps?.complete ?? false,
              offer: this.bench.director.ladder.view.offer,
              slip: this.bench.director.ladder.view.slip,
              caddy: this.bench.binReport(),
            }
          : null,
        revealing: this.reveal !== null,
        windUnits: this.windUnits,
        carried: Boolean(this.carried),
        placed: [...this.placed.keys()],
        letter: this.session.letter?.id ?? null,
        daily: this.daily?.repair.id ?? null,
      }),
      /** The ghost-hand cue on show (lesson, kind, seconds, variant), or null. */
      guide: () => this.guide?.state() ?? null,
      /** Which lessons are learned: the tracker's and the save's. */
      lessons: () => ({ learned: [...this.session.save.learned], tracker: this.guide ? LESSON_IDS.filter((id) => this.guide?.tracker.isLearned(id)) : [] }),
      /** A click on the UI target named `name` (a ray or poke), as pointer events deliver it; `hit` names the child that was hit (the trunk's `COL_Latch`). */
      press: (name: string, hit?: string): boolean => {
        // The three props keep their GLB's root name (`Scene`): they are the first three targets, in build order.
        const all = this.ui.pressables();
        const alias = ['trunk', 'parcel', 'envelope'].indexOf(name);
        const target = alias >= 0 ? all[alias] : all.find((p) => p.name === name && p.active);
        if (target?.active) target.object.dispatchEvent({ type: 'click', object: (hit ? target.object.getObjectByName(hit) : null) ?? target.object } as never);
        return Boolean(target?.active);
      },
      /** Seats every tray part in the socket the blueprint intends, like a player who knows the machine. */
      seatAll: (): number => {
        const build = this.build;
        if (!build) return 0;
        if (this.bench) {
          // The intricate build: one armed step after another. A stage's tray opens when the stage before it closes and the game seats Relaxed's hardware a few frames
          // later, so call it again (`seatAllByHelper` in tests/e2e/support/flow.ts does) until the machine is complete.
          let n = 0;
          while (this.bench.debugSeatNext()) n++;
          return n;
        }
        const loose = build.parts.filter((p) => !p.entity.hasComponent(SnappedTo));
        const plan = Object.entries(build.blueprint.intended).filter(([id, partId]) => !(id in build.fixed) && build.machine.sockets.has(id) && !build.machine.assembly()[id] && loose.some((p) => p.partId === partId));
        this.seat(build, loose, plan);
        return plan.length;
      },
      /** The intricate build's bench (the director, the dispenser, the Helper), or null. */
      bench: (): Bench | null => this.bench,
      /** World position of the tray compartment a part (by id) was made to lie in: where it returns to when let go. Null when the bench has no such part. */
      homeOf: (partId: string): { x: number; y: number; z: number } | null => {
        const home = this.bench?.restOf(partId, _at);
        return home ? { x: _at.x, y: _at.y, z: _at.z } : null;
      },
      /** World position of the empty of blueprint socket `id` on the bench machine (a hardware seat only exists while its carrier is seated), or null. */
      socketAt: (id: string): { x: number; y: number; z: number } | null => {
        const node = this.build?.machine.sockets.get(id)?.getValue(Socket, 'node') as Object3D | undefined;
        if (!node) return null;
        node.getWorldPosition(_at);
        return { x: _at.x, y: _at.y, z: _at.z };
      },
      /** A hand pulls the seated part `partId` out of its socket. */
      pull: (partId: string): boolean => {
        const part = this.build?.parts.find((p) => p.partId === partId && p.entity.hasComponent(SnappedTo));
        part?.entity.removeComponent(SnappedTo);
        return Boolean(part);
      },
      /** The key is wound to `units`, as if by hand. */
      wind: (units: number): void => {
        const key = this.build?.key;
        if (!key) return;
        key.setValue(WindKey, 'units', units);
        interactionIntents.emit({ type: 'windEnd', key, units, gained: units, hand: 'right' });
      },
      /** The carried machine is dropped on its own plot, like a hand letting go of it there. */
      dropOnPlot: (): boolean => {
        const carried = this.carried;
        if (!carried) return false;
        const socket = this.runtime?.town.ground.getObjectByName(`SOCKET_${plotNode(carried.rig.machineId)}`);
        if (!socket) return false;
        socket.getWorldPosition(_at);
        carried.rig.root.parent?.worldToLocal(_at);
        carried.rig.root.position.copy(_at);
        carried.entity.addComponent(Grabbed);
        this.seating = [carried.entity];
        return true;
      },
    };
  }
}

const _at = new Vector3();

/** `music_box` -> `PlotMusicBox`, the town ground's socket name. */
function plotNode(machine: MachineId): string {
  return `Plot${MACHINE_PLOT[machine].slice(5).replace(/(^|_)(\w)/g, (_m, _s, c: string) => c.toUpperCase())}`;
}

/** Measured over intended speed of the machine's first speed target, for the "too fast" and "too slow" wording; undefined without one. */
function speedRatio(blueprint: MachineBlueprint, result: SolveResult): number | undefined {
  const [first] = Object.entries(blueprint.targets.angularVelocity ?? {});
  if (!first || first[1] === 0) return undefined;
  const measured = result.angularVelocity[first[0]];
  return measured === undefined ? undefined : Math.abs(measured) / Math.abs(first[1]);
}

/** The Music Box's lid stands open on the bench so the sockets can be reached; the finished machine closes it when it stops. */
function openLid(root: Object3D): LidHinge | null {
  const pivot = root.getObjectByName('PIV_Lid');
  const lid = root.getObjectByName('MusicBoxCase_Lid');
  if (!pivot || !lid) return null;
  pivot.attach(lid);
  const openDeg = (pivot.userData.wu as { openDeg?: number } | undefined)?.openDeg ?? 100;
  const hinge: LidHinge = { pivot, rest: pivot.quaternion.clone(), openRad: (openDeg * Math.PI) / 180, angle: 0 };
  hinge.angle = hinge.openRad;
  pivot.quaternion.copy(hinge.rest).multiply(_spin.setFromAxisAngle(Z_AXIS, hinge.angle));
  return hinge;
}

const running = new WeakMap<World, Gameplay>();

/** Steps the loop every frame, after the interaction systems (10) and the town (11). Registered by `installGameplay`. */
export class GameplaySystem extends createSystem({}) {
  update(dt: number): void {
    running.get(this.world)?.update(dt);
  }
}

export function installGameplay(world: World, gameplay: Gameplay): void {
  running.set(world, gameplay);
  gameplay.guide = installOnboarding(gameplay.guideView(), () => gameplay.keepAwake());
  world.registerSystem(GameplaySystem, { priority: 12 });
  installClockTower(world); // after the interaction systems (10), the town (11) and this loop: see src/machines/clock-tower/INTEGRATION.md
}
