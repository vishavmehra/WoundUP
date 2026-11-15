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
import { AdditiveBlending, createSystem, DistanceGrabbable, Grabbed, Mesh, MeshBasicMaterial, OneHandGrabbable, PlaneGeometry, Quaternion, Vector3 } from '@iwsdk/core';
import type { Entity, Object3D, World } from '@iwsdk/core';
import { bindClockTowerAudio } from './audio';
import type { AudioEngine } from './audio';
import { planBuild } from './build-plan';
import { getBlueprint, solveAssembly, unmetDependencies, filledDependents } from './content/blueprints';
import type { Assembly, MachineBlueprint } from './content/blueprints';
import { requirePart } from './content/parts';
import { MACHINE_PLOT, REPAIRS } from './game/content';
import type { EngravingId, LetterDef, MachineId, PlotId, RepairDef } from './game/content';
import type { Gift } from './game/gift';
import type { GameSession } from './game/session';
import { interactionIntents, Socket, SnappedTo, WindKey, XRayTarget } from './interaction';
import type { InteractionIntent } from './interaction';
import { BELFRY_MODEL_PATHS } from './machines/belfry';
import { CLOCK_TOWER_MODEL_PATHS, ClockTowerRigComponent, ClockTowerSystem, clockTowerEvents, installClockTower, TheatreDoors } from './machines/clock-tower';
import { WELL_MODEL_PATHS } from './machines/well';
import type { MaterialRegistry } from './materials';
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
import type { FlowEvent, FlowUi } from './ui';
import { BENCH, benchPoint } from './ui/layout';
import { placeTrayParts } from './tray-layout';

/** A finished machine keeps running after it is placed for at most this long (the Music Box plays one cylinder turn), seconds. */
const PLACED_RUN_CAP_S = 16;
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
  /** Set by `index.ts` once the town and the UI exist (they need this object's callbacks first). */
  town!: TownRuntime;
  ui!: FlowUi;
  loader!: PartLoader;

  private readonly stage: Object3D;
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
  /** The theatre facade's doors (PIV_DoorL, PIV_DoorR), opened by the tower's hour; `doorsWereOpen` shuts them once it stops. */
  private readonly doors = new TheatreDoors();
  private doorsWereOpen = false;

  constructor(
    private readonly world: World,
    private readonly opt: GameplayOptions,
  ) {
    const stage = world.getSceneObject(STAGE_NODE_ID);
    if (!stage) throw new Error(`Scene node "${STAGE_NODE_ID}" is missing.`);
    this.stage = stage;
    this.unsubscribe = interactionIntents.subscribe((intent) => this.onIntent(intent));
    this.unbindTowerAudio = bindClockTowerAudio(opt.audio, clockTowerEvents);
  }

  private get session(): GameSession {
    return this.opt.session;
  }

  private get townScale(): number {
    return this.world.getSystem(StageSystem)?.townScale ?? 1;
  }

  // ---- Start-up -----------------------------------------------------------------------------------------------------

  /** A returning player's town: the plots that were awake, the machines that stood on them, and the next letter's models. */
  async start(): Promise<void> {
    this.town.town.group.visible = this.session.mode !== 'intro';
    const missing = this.doors.resolve(this.town.town.theatre);
    if (missing.length > 0) console.warn(`[wound-up] the theatre facade has no ${missing.join(', ')}: its doors will not open.`);
    this.preload(this.session.letter);
    const standing = this.session.save.machines.filter((m) => m.placed && m.plotId);
    this.town.restore(standing.map((m) => m.plotId as PlotId));
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
      if (!this.town.placeRig(rig)) continue;
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
    switch (event.type) {
      case 'trunk-opened':
        this.town.town.group.visible = true;
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
      default:
        break; // setting (Easy Snap is applied by the UI), gift-link
    }
  };

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
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const run = this.runs[i];
      run.left -= dt;
      if (run.left > 0) continue;
      run.rig.running = false;
      this.runs.splice(i, 1);
    }
    this.syncTower();
    this.updateDoors();
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

  /** The plot of the machine in the hand breathes in lamp light until the machine is put down on it. */
  private updateGlow(dt: number): void {
    const plot = this.carried ? PLOTS[MACHINE_PLOT[this.carried.rig.machineId]] : null;
    if (!plot) {
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
      this.town.town.group.add(this.glow);
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
    // A repair starts from the machine as it stands in the town: it comes back to the bench, the plot stays awake.
    const standing = this.placed.get(blueprint.id as MachineId);
    if (repair && standing) this.removePlaced(blueprint.id as MachineId);

    const at = benchPoint(this.townScale, BENCH.build);
    const machine = await this.loader.spawnMachine(blueprint.id, { parent: this.stage, position: [at.x, at.y, at.z] });
    if (token !== this.buildToken) return machine.dispose();
    this.xrayBench = this.town.xray.add({
      root: machine.object,
      prefixes: XRAY_SHELL[blueprint.id] ?? [],
      lens: () => true,
      moving: () => this.seatedParts(), // the gears and shafts in their sockets are the mechanism that glows (they are not children of the housing)
    });
    this.lid = openLid(machine.object);

    // What each socket takes from the player, and what the game seats itself (src/build-plan.ts).
    const { fixed, seatNow, spawnIds, handBuilt } = planBuild(blueprint, repair, machine.sockets.size, (socketId) => machine.sockets.has(socketId));
    const build: Build = { blueprint, machine, parts: [], fixed, repair, daily: daily?.date ?? null, key: null };
    const traySpawned = spawnIds.length - seatNow.length;
    this.build = build;
    if (handBuilt) {
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
      slots: blueprint.sockets.map((s) => ({ id: s.id, label: requirePart(blueprint.intended[s.id]).name })),
    });
    this.windUnits = 0;
    for (const socketId of Object.keys(fixed)) this.ui.setSlotFilled(socketId, true);
    this.checkComplete();
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
        if (!build) return;
        const socketId = this.socketIdOf(build, intent.socket);
        if (socketId === undefined) return; // a plot socket: the town's
        if (unmetDependencies(build.blueprint, this.assembly(), socketId).length > 0) {
          intent.part.removeComponent(SnappedTo); // the socket is not ready for it: out again, and the tray takes it back
          this.opt.audio.bonk();
          return;
        }
        if (requirePart(intent.partId).family === 'winding_key') {
          intent.part.addComponent(WindKey, { axis: [0, 0, 1], maxUnits: MAX_WIND_UNITS });
          build.key = intent.part;
        }
        this.ui.setSlotFilled(socketId, true);
        this.checkComplete();
        break;
      }
      case 'unsnapped': {
        if (!build) return;
        const socketId = this.socketIdOf(build, intent.socket);
        if (socketId === undefined) return;
        this.ui.setSlotFilled(socketId, false);
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
    const rig = await buildMachine(id, loadModel, this.opt.materials, BLUEPRINT_SOCKET_IDS);
    if (!rig || this.build !== build) return;
    const housing = build.machine.object;
    rig.root.position.copy(housing.position);
    rig.root.quaternion.copy(housing.quaternion);
    this.stage.add(rig.root);
    if (rig.lid && this.lid) rig.lid.angle = rig.lid.openRad; // the lid was open on the bench: no flicker when the rig takes over
    this.built.set(id, this.assembly());
    this.disposeBuild();

    rig.result = result;
    rig.running = true;
    this.runs.push({ rig, left: result.continuous ? PLACED_RUN_CAP_S : Math.min(result.runSeconds, PLACED_RUN_CAP_S) });
    this.town.addRig(rig);
    this.carried = { rig, entity: makeCarriable(this.world, rig), pending: null };
    if (id === 'clock_tower') this.attachTower(rig, this.carried.entity);

    if (build.daily !== null) this.session.dailyRepairVerified(build.daily);
    else if (build.repair) this.session.repairVerified(build.repair.id);
    this.session.machineRanCorrectly(id);
    this.ui.onModeChange();
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
    this.town.removeRig(rig);
    this.runs = this.runs.filter((r) => r.rig !== rig);
    rig.root.removeFromParent();
  }

  // ---- Clean-up -----------------------------------------------------------------------------------------------------

  /** Takes the bench machine and its parts away. The build is forgotten first, so the `unsnapped` of each destroyed part is ignored. */
  private disposeBuild(): void {
    const build = this.build;
    this.build = null;
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
    this.town.reset();
    this.town.town.group.visible = false;
  }

  /** The gift panel's machine: what the player built, or the intended build for one restored from a save. Null for a machine without a blueprint. */
  giftOf(machineId: MachineId, engraving: EngravingId): Gift | null {
    const blueprint = getBlueprint(machineId);
    if (!blueprint) return null;
    const assembly = this.built.get(machineId) ?? blueprint.intended;
    return {
      blueprintId: machineId,
      blueprintVersion: blueprint.version,
      placements: Object.entries(assembly).map(([socketId, partId]) => ({ socketId, partId })),
      engraving,
    };
  }

  dispose(): void {
    this.unsubscribe();
    this.unbindTowerAudio();
    this.disposeBuild();
  }

  // ---- QA -----------------------------------------------------------------------------------------------------------

  /** Opt-in (`?debug`): drives the loop without hands, for the browser and emulator tests. */
  debug() {
    return {
      session: this.session,
      ui: this.ui,
      town: this.town,
      state: () => ({
        mode: this.session.mode,
        build: this.build ? { blueprint: this.build.blueprint.id, parts: this.build.parts.length, seated: Object.keys(this.build.machine.assembly()).length, fixed: Object.keys(this.build.fixed).length } : null,
        windUnits: this.windUnits,
        carried: Boolean(this.carried),
        placed: [...this.placed.keys()],
        letter: this.session.letter?.id ?? null,
        daily: this.daily?.repair.id ?? null,
      }),
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
        const loose = build.parts.filter((p) => !p.entity.hasComponent(SnappedTo));
        const plan = Object.entries(build.blueprint.intended).filter(([id, partId]) => !(id in build.fixed) && build.machine.sockets.has(id) && !build.machine.assembly()[id] && loose.some((p) => p.partId === partId));
        this.seat(build, loose, plan);
        return plan.length;
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
        const socket = this.town.town.ground.getObjectByName(`SOCKET_${plotNode(carried.rig.machineId)}`);
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
  world.registerSystem(GameplaySystem, { priority: 12 });
  installClockTower(world); // after the interaction systems (10), the town (11) and this loop: see src/machines/clock-tower/INTEGRATION.md
}
