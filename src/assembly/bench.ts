/**
 * The bench of an intricate build (INTRICATE_ASSEMBLY_DESIGN §3, ADR-050): the scene side of `AssemblyDirector`. The director decides what the bench shows
 * (`director.ts`); this class is the `DirectorHost` that does it over the real scene, and the `HelperWorld` the Helper's cues and flight look things up in.
 *
 *   stage bags      a stage's big parts are made in the tray when the stage opens (the compartment each lies in is fixed up front, so the tray never reshuffles)
 *   the caddy       `fastener_caddy.glb` on the bench, one `Dispenser` bin per `SOCKET_Bin<n>`: one live piece at the mouth of the bin that is wanted
 *   armed sockets   `applyArming` on the machine's sockets; tap-to-fasten rings on the armed hardware (gaze mode)
 *   Relaxed         `seatAuto`: a piece is made at the caddy and seated the very frame it is asked for, the same commit a hand's release makes (`seatNow`)
 *   the Helper      `SceneHelper` (glow, pulse, flight) over this class's lookups
 *
 * It owns nothing the game loop owns: the parts it makes are handed to `track` (so the build disposes them and X-ray sees them), the lid and the rig belong to
 * the loop, and `src/gameplay.ts` calls `snapped`, `unsnapped`, `wrong`, `helperPressed`, `setDifficulty` and `update` from the intents and its frame.
 */
import { Grabbed } from '@iwsdk/core';
import type { Entity, Object3D, World } from '@iwsdk/core';
import { AdditiveBlending, Color, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import type { AudioEngine } from '../audio';
import type { Assembly, MachineBlueprint, SocketDefinition, StagePlan, StagesPlan } from '../content/blueprints';
import { partVoice, requirePart } from '../content/parts';
import type { Difficulty } from '../game/content';
import { applyArming, Dispenser, interactionIntents, seatNow, Socket, SnappedTo, TapToFasten } from '../interaction';
import type { InteractionIntent } from '../interaction';
import type { MachineInstance, PartInstance, PartLoader } from '../parts';
import type { TrayPlacement } from '../tray-layout';
import { AssemblyDirector } from './director';
import type { DirectorHost, StepListView } from './director';
import type { AssemblyFeedback } from './feedback';
import type { HelperCopy, HelperPress, HelperState, HelperTarget } from './helper';
import { SceneHelper } from './helper-cues';
import type { HelperWorld } from './helper-cues';

/** The caddy's four bins (`SOCKET_Bin1` to `SOCKET_Bin4`) and the lamp of each (`PIV_Lamp1` to `PIV_Lamp4`). */
export const CADDY_BINS = 4;
/** The bench slides in for 0.8 s (`FlowUi`); a piece that rests at a bin's mouth must be made after that, or its rest pose is where the mouth was. */
const LAMP_RADIUS_M = 0.0026;
const LAMP = 0xffc66d;

/** What the bench needs from the flow UI: `FlowUi` implements it. */
export interface BenchUi {
  revealParts(parts: readonly Object3D[]): void;
  setAssembly(view: StepListView | null): void;
  setHelper(state: HelperState): void;
  /** True while the bench is still sliding in (the caddy's mouths are moving). */
  benchMoving(): boolean;
  /** True while a panel (pause, gift, difficulty) is on screen. */
  panelOpen(): boolean;
}

export interface BenchOptions {
  readonly world: World;
  /** The stage root: parts, the Helper's cues and its flight live here. */
  readonly stage: Object3D;
  readonly loader: PartLoader;
  readonly machine: MachineInstance;
  readonly blueprint: MachineBlueprint;
  readonly plan: StagesPlan;
  readonly ui: BenchUi;
  readonly audio: AudioEngine;
  readonly feedback: AssemblyFeedback;
  readonly copy: HelperCopy;
  /** The caddy model already on the bench (its `SOCKET_Bin<n>` empties are the bins), or null: the build plays with no bins (Relaxed needs none). */
  readonly caddy: Object3D | null;
  /** Where each big part of the whole build lies, in `plan.stages` order of `bag.big`: the compartments are chosen once, for all of them. */
  readonly lies: readonly TrayPlacement[];
  /** The build as it stands (the game-seated parts and what the machine holds). */
  readonly assembly: () => Assembly;
  /** The parts the bench makes belong to the build: it disposes them and X-ray sees them. */
  readonly track: (part: PartInstance) => void;
  readonly untrack: (part: PartInstance) => void;
  /** True while a hand holds a part. */
  readonly anyHeld: () => boolean;
  /** A part was seated and its own hardware seats are bound: the game loop checks again whether the machine is complete (a unit put back with its pieces on it is). */
  readonly onSeated: () => void;
  /** The Helper is quiet: no build or wind in progress, or a panel up. */
  readonly quiet: () => boolean;
}

const _v = new Vector3();

export class Bench implements DirectorHost, HelperWorld {
  readonly director: AssemblyDirector;
  readonly dispenser: Dispenser;
  readonly helperScene: SceneHelper;
  private readonly tap: TapToFasten;
  private readonly byEntity = new Map<Entity, PartInstance>();
  /** Where each tray part lies and the pose a refused flight sends it back to. */
  private readonly rest = new Map<Object3D, { x: number; y: number; z: number }>();
  private readonly socketById: ReadonlyMap<string, SocketDefinition>;
  private readonly bins: Array<{ id: string; mouth: Object3D; lamp: Mesh | null; lit: boolean }> = [];
  private readonly lampMaterial = new MeshBasicMaterial({ color: new Color(LAMP), transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  private readonly lampGeometry = new SphereGeometry(LAMP_RADIUS_M, 10, 8);
  private lampsOn = true;
  private wanted: string[] = [];
  private wantedDirty = false;
  private ended = false;
  private traysMade = 0;
  private readonly unsubscribe: () => void;
  /** What the director is told each frame, reused: nothing is allocated per frame. */
  private readonly frame = { held: false, panelOpen: false };

  constructor(private readonly opt: BenchOptions) {
    this.socketById = new Map(opt.blueprint.sockets.map((s) => [s.id, s] as const));
    this.dispenser = new Dispenser({
      spawn: (partId) => this.spawnPiece(partId)?.entity,
      discard: (entity) => this.discard(entity),
    });
    this.tap = new TapToFasten(opt.world, this.dispenser);
    this.helperScene = new SceneHelper(opt.stage, this);
    this.director = new AssemblyDirector({ blueprint: opt.blueprint, plan: opt.plan, host: this, scene: this.helperScene, copy: opt.copy });
    this.makeBins();
    // Subscribed after the dispenser, so a seated piece is already counted out of its bin when the director reads the step engine and fills the next bag.
    this.unsubscribe = interactionIntents.subscribe((intent) => this.onIntent(intent));
  }

  /** The build starts: the director opens the first bag and puts the first step on the sheet. */
  begin(): void {
    this.director.begin(this.opt.assembly());
  }

  get difficulty(): Difficulty {
    return this.director.difficulty;
  }

  /** The build is over (the machine ran, the story restarted): cues away, the caddy goes, the pieces still waiting are discarded. Seated parts are the build's. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.unsubscribe();
    this.director.end();
    this.tap.dispose();
    this.dispenser.dispose();
    this.helperScene.dispose();
    for (const bin of this.bins) bin.lamp?.removeFromParent();
    this.lampGeometry.dispose();
    this.lampMaterial.dispose();
    this.byEntity.clear();
    this.rest.clear();
    this.opt.ui.setAssembly(null);
  }

  /** The part entity's instance, for the loop's `snapped` handler. */
  partOf(entity: Entity): PartInstance | undefined {
    return this.byEntity.get(entity);
  }

  // ---- Intents and the hooks of the game loop -------------------------------------------------------------------------

  private onIntent(intent: InteractionIntent): void {
    if (this.ended) return;
    if (intent.type === 'snapped') {
      if (!intent.part.hasComponent(SnappedTo)) return; // the game loop sent it straight back (a dependency bounce): it is a wrong attempt, not a seat
      const id = this.idOf(intent.socket);
      if (id !== undefined) this.snapped(id, intent.part, intent.partId);
    } else if (intent.type === 'unsnapped') {
      const id = this.idOf(intent.socket);
      if (id !== undefined) this.unsnapped(id, intent.part);
    }
  }

  /** The blueprint socket id of a socket entity of the machine, or undefined (a plot socket, a hardware seat whose carrier has left). */
  private idOf(socket: Entity): string | undefined {
    for (const [id, entity] of this.opt.machine.sockets) if (entity === socket) return id;
    return undefined;
  }

  /** A part was seated in `socketId` (a hand's release, the Helper, Relaxed's hardware): its hardware seats join the machine, it sounds, the director reads the step engine. */
  private snapped(socketId: string, entity: Entity, partId: string): void {
    if (this.ended) return;
    const part = this.byEntity.get(entity);
    if (part) this.opt.machine.bindCarried(part, socketId);
    const object = entity.object3D;
    if (object) this.opt.feedback.onSnap(partVoice(partId), object);
    this.director.snapped(socketId, this.opt.assembly());
    this.opt.onSeated();
  }

  /** A part left `socketId`: the hardware seats it carries stop being sockets of the machine (the pieces stay on it). */
  private unsnapped(socketId: string, entity: Entity): void {
    if (this.ended) return;
    const part = this.byEntity.get(entity);
    if (part) this.opt.machine.unbindCarried(part);
    this.director.unsnapped(socketId, this.opt.assembly());
  }

  wrong(): void {
    if (!this.ended) this.director.wrong();
  }

  helperPressed(long: boolean, hands: boolean): HelperPress {
    return this.ended ? 'none' : this.director.helperPressed(long, hands);
  }

  setDifficulty(level: Difficulty): void {
    if (!this.ended) this.director.setDifficulty(level, this.opt.assembly());
  }

  update(dt: number): void {
    if (this.ended) return;
    if (this.wantedDirty && !this.opt.ui.benchMoving()) this.applyWanted();
    this.dispenser.update(dt);
    this.frame.held = this.opt.anyHeld();
    this.frame.panelOpen = this.opt.quiet();
    this.director.update(dt, this.frame);
  }

  /** `?debug`: where the part `partId` lies when at rest (its tray compartment), in world space, written into `out`. False when there is no such part. */
  restOf(partId: string, out: Vector3): boolean {
    for (const part of this.byEntity.values()) {
      const home = part.partId === partId ? this.rest.get(part.object) : undefined;
      if (!home) continue;
      out.set(home.x, home.y, home.z);
      part.object.parent?.localToWorld(out);
      return true;
    }
    return false;
  }

  /** `?debug`: what each bin of the caddy holds, how many pieces are left, and whether a piece waits at its mouth or is rolling there. */
  binReport(): Array<{ bin: string; part: string; stock: number; live: boolean; rolling: boolean }> {
    return this.bins.map((bin) => ({ bin: bin.id, part: this.binPart.get(bin.id) ?? '', stock: this.dispenser.stockOf(bin.id), live: this.dispenser.liveOf(bin.id) !== null, rolling: this.dispenser.isRolling(bin.id) }));
  }

  /** `?debug`: the part for the first armed socket is seated as a player who knows the machine would, one step. False when nothing is armed. */
  debugSeatNext(): boolean {
    const armed = this.director.steps?.armed ?? [];
    for (const socketId of armed) {
      const socket = this.opt.machine.sockets.get(socketId);
      const partId = this.opt.blueprint.intended[socketId];
      if (!socket || !partId) continue;
      const piece = this.pieceFor(partId, socketId);
      if (piece && seatNow(this.opt.world, piece.entity, socket)) return true;
    }
    return false;
  }

  // ---- DirectorHost ---------------------------------------------------------------------------------------------------

  openTray(index: number, stage: StagePlan, first: boolean): void {
    this.traysMade = Math.max(this.traysMade, index + 1);
    const offset = this.opt.plan.stages.slice(0, index).reduce((n, st) => n + st.bag.big.length, 0);
    const jobs = stage.bag.big.map((partId, j) => {
      const lie = this.opt.lies[offset + j];
      return this.opt.loader.spawnPart(partId, { parent: this.opt.stage, position: lie?.position, quaternion: lie?.quaternion, machine: this.opt.machine });
    });
    Promise.all(jobs)
      .then((parts) => {
        if (this.ended) {
          parts.forEach((part) => part.dispose());
          return;
        }
        parts.forEach((part) => this.adopt(part));
        this.opt.ui.revealParts(parts.map((part) => part.object)); // pops them in; it also moves part i to compartment i, so each goes back to its own
        parts.forEach((part, j) => {
          const lie = this.opt.lies[offset + j];
          if (lie) part.object.position.set(...lie.position);
          this.rest.set(part.object, { x: part.object.position.x, y: part.object.position.y, z: part.object.position.z });
          for (const warning of part.warnings) console.warn(`[wound-up] ${part.partId}: ${warning}`);
        });
        if (!first) this.opt.audio.pluck(79, 0.25); // the next bag's paper rustle
      })
      .catch((e: unknown) => console.error('[wound-up] could not open the bag of a stage:', e));
  }

  openCaddy(_index: number, stage: StagePlan): void {
    // The stage's hardware, one entry per placement, grouped by kind: a bin per kind (a bin already holding the kind is filled up again).
    const counts = new Map<string, number>();
    for (const partId of stage.bag.hardware) counts.set(partId, (counts.get(partId) ?? 0) + 1);
    const used = new Set<string>();
    for (const [partId, count] of counts) {
      const bin = this.binFor(partId, used);
      if (!bin) continue;
      used.add(bin.id);
      this.dispenser.load(bin.id, partId, count);
    }
  }

  setArmed(armed: readonly string[], _level: Difficulty): void {
    applyArming(this.opt.machine.sockets, armed);
    this.tap.sync(this.opt.machine.sockets, armed.filter((id) => this.socketById.get(id)?.family === 'fastener'));
  }

  setCaddy(live: readonly string[], lamp: boolean): void {
    this.lampsOn = lamp;
    const ids = this.bins.filter((bin) => this.dispenser.stockOf(bin.id) > 0 && live.includes(this.binPart.get(bin.id) ?? '')).map((bin) => bin.id);
    this.wanted = ids;
    this.wantedDirty = true;
    if (!this.opt.ui.benchMoving()) this.applyWanted();
    this.showLamps();
  }

  setView(view: StepListView): void {
    this.opt.ui.setAssembly(view);
  }

  setHelper(state: HelperState): void {
    this.opt.ui.setHelper(state);
  }

  stageClosed(index: number, stage: StagePlan): void {
    const parts: Object3D[] = [];
    for (const id of stage.sockets) {
      const object = (this.opt.machine.sockets.get(id)?.getValue(Socket, 'occupant') as Entity | null | undefined)?.object3D;
      if (object) parts.push(object);
    }
    this.opt.feedback.onStage(index, parts);
  }

  seatAuto(socketId: string): boolean {
    const socket = this.opt.machine.sockets.get(socketId);
    const partId = this.opt.blueprint.intended[socketId];
    if (!socket || !partId || socket.getValue(Socket, 'occupant') !== null) return false;
    const piece = this.spawnPiece(partId);
    if (!piece) return false;
    const node = socket.getValue(Socket, 'node') as Object3D | undefined;
    const from = this.bins[0]?.mouth ?? node;
    if (from) {
      from.getWorldPosition(_v);
      piece.object.parent?.worldToLocal(_v);
      piece.object.position.copy(_v);
    }
    if (seatNow(this.opt.world, piece.entity, socket)) return true;
    this.discard(piece.entity);
    return false;
  }

  // ---- HelperWorld ----------------------------------------------------------------------------------------------------

  part(target: HelperTarget): Object3D | null {
    if (target.kind === 'wind') return this.keyObject();
    if (target.hardware) return (this.dispenser.liveFor([target.partId])?.object3D as Object3D | undefined) ?? null;
    for (const part of this.byEntity.values()) {
      if (part.partId === target.partId && !part.entity.hasComponent(SnappedTo)) return part.object;
    }
    return null;
  }

  socket(target: HelperTarget): Object3D | null {
    return (this.opt.machine.sockets.get(target.socketId)?.getValue(Socket, 'node') as Object3D | undefined) ?? null;
  }

  free(target: HelperTarget): boolean {
    const socket = this.opt.machine.sockets.get(target.socketId);
    return socket !== undefined && socket.getValue(Socket, 'armed') === true && socket.getValue(Socket, 'occupant') === null;
  }

  seat(target: HelperTarget, part: Object3D): boolean {
    const entity = this.entityOf(part);
    const socket = this.opt.machine.sockets.get(target.socketId);
    if (entity && socket && seatNow(this.opt.world, entity, socket)) return true;
    const home = this.rest.get(part);
    if (home) part.position.set(home.x, home.y, home.z); // refused: back where it lay
    return false;
  }

  held(part: Object3D): boolean {
    return this.entityOf(part)?.hasComponent(Grabbed) ?? false;
  }

  chime(): void {
    this.opt.audio.pluck(84, 0.2);
  }

  // ---- Parts ----------------------------------------------------------------------------------------------------------

  private adopt(part: PartInstance): void {
    this.byEntity.set(part.entity, part);
    this.opt.track(part);
  }

  private entityOf(object: Object3D): Entity | undefined {
    for (const [entity, part] of this.byEntity) if (part.object === object) return entity;
    return undefined;
  }

  private keyObject(): Object3D | null {
    for (const part of this.byEntity.values()) if (requirePart(part.partId).family === 'winding_key' && part.entity.hasComponent(SnappedTo)) return part.object;
    return null;
  }

  /** A piece of hardware, made in this frame (the assets were preloaded with the letter). It is not grabbable: the dispenser makes the live one so when it reaches the mouth. */
  private spawnPiece(partId: string): PartInstance | undefined {
    try {
      const part = this.opt.loader.spawnLoaded(partId, { parent: this.opt.stage, machine: this.opt.machine, loose: true });
      this.adopt(part);
      return part;
    } catch (e) {
      console.warn(`[wound-up] could not make "${partId}":`, e);
      return undefined;
    }
  }

  /** The part to seat for `socketId` in the debug helper: a loose tray part, a piece of hardware made on the spot. */
  private pieceFor(partId: string, socketId: string): PartInstance | undefined {
    if (this.socketById.get(socketId)?.family === 'fastener') return this.spawnPiece(partId);
    for (const part of this.byEntity.values()) if (part.partId === partId && !part.entity.hasComponent(SnappedTo)) return part;
    return undefined;
  }

  private discard(entity: Entity): void {
    const part = this.byEntity.get(entity);
    if (!part) return;
    this.byEntity.delete(entity);
    this.rest.delete(part.object);
    this.opt.untrack(part);
    part.dispose();
  }

  // ---- The caddy ------------------------------------------------------------------------------------------------------

  /** Which part each bin holds now (the dispenser keeps the stock; the id is read from what `load` was told). */
  private readonly binPart = new Map<string, string>();

  private makeBins(): void {
    const caddy = this.opt.caddy;
    if (!caddy) return;
    for (let n = 1; n <= CADDY_BINS; n++) {
      const mouth = caddy.getObjectByName(`SOCKET_Bin${n}`);
      if (!mouth) continue;
      let lamp: Mesh | null = null;
      const node = caddy.getObjectByName(`PIV_Lamp${n}`);
      if (node) {
        lamp = new Mesh(this.lampGeometry, this.lampMaterial);
        lamp.name = `CaddyLamp${n}`;
        lamp.raycast = () => undefined;
        lamp.visible = false;
        node.add(lamp);
      }
      const bin = { id: `bin${n}`, mouth, lamp, lit: false };
      this.bins.push(bin);
      this.dispenser.addBin({
        id: bin.id,
        mouth,
        partId: '',
        stock: 0,
        lamp: (on) => {
          bin.lit = on;
          this.showLamps();
        },
      });
    }
  }

  private binFor(partId: string, used: ReadonlySet<string>): { id: string } | undefined {
    const holding = this.bins.find((bin) => this.binPart.get(bin.id) === partId && !used.has(bin.id));
    const free = this.bins.find((bin) => !used.has(bin.id) && this.dispenser.stockOf(bin.id) === 0);
    const bin = holding ?? free;
    if (bin) this.binPart.set(bin.id, partId);
    return bin;
  }

  private applyWanted(): void {
    this.wantedDirty = false;
    this.dispenser.setWanted(this.wanted);
  }

  private showLamps(): void {
    for (const bin of this.bins) if (bin.lamp) bin.lamp.visible = bin.lit && this.lampsOn;
  }
}
