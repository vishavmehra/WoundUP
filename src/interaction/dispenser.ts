import { DistanceGrabbable, Grabbed, OneHandGrabbable, Quaternion, RayInteractable, Vector3 } from '@iwsdk/core';
import type { Entity, Object3D } from '@iwsdk/core';
import { ReturnsToRest } from '../returns-to-rest-component.js';
import { SnappedTo } from './components.js';
import { interactionIntents } from './intents.js';
import type { InteractionIntent } from './intents.js';
import { easeOutCubic } from './snap.js';

/**
 * The fastener caddy's bins (INTRICATE_ASSEMBLY_DESIGN §3.5, §5.1, ADR-050). Tiny parts are handed out one live piece at a time:
 * a bin that is wanted holds exactly one grabbable piece at its mouth, and when that piece is seated the next rolls up to the mouth
 * in 0.25 s. The dormant stock is the caddy's own decoration (one InstancedMesh a bin, not here), so the live grabbables of the whole
 * bench stay under IWSDK's 60 and nothing small is within reach of a wrong pick (ASSET_OPTIMISATION_BUDGET §4.2).
 *
 *  - A piece is made by the caller's `spawn` (the part loader; it adds the SnapPart) and placed here. It becomes grabbable only once it is at the
 *    mouth: `ReturnsToRest` is added then, so GrabModeSystem adds the grab and GrabFeedbackSystem records the mouth as its rest. A piece the
 *    player lets go of, or that a socket rejects (including `order`), eases back to the mouth by itself.
 *  - A piece that is seated loses its grab for good: the grab and `ReturnsToRest` are removed (hardware is never pulled out; it leaves with its
 *    part, §5.4). If its part is then removed, the piece goes back into its bin (`discard`, stock up by one) and rolls again when the bin is wanted.
 *  - Which bins are wanted is the game's: Standard and Relaxed want the bin of the current step's hardware only, Master all of the stage's.
 *    A bin that stops being wanted withdraws its unseated piece (once it is not in a hand).
 *
 * Plain class, no ECS system: the director calls `update(delta)` each frame and `dispose()` when the build ends. It reads `interactionIntents`.
 */

/** Seconds for the next piece to roll to the mouth (design §3.5). */
export const ROLL_S = 0.25;
/** The next piece waits this far below the mouth, in the world, and rises to it. */
export const ROLL_DROP_M = 0.012;

export interface BinSpec {
  /** Stable id of the bin on the caddy, for example `bin1`. */
  readonly id: string;
  /** The mouth: the `SOCKET_Bin<n>` empty. The live piece waits at its world pose. */
  readonly mouth: Object3D;
  /** The hardware this bin holds now (a catalogue part id). Changed by `load`. */
  readonly partId: string;
  /** Pieces left, the live one included. */
  readonly stock: number;
  /** The brass lamp: on while the bin is the one to take from (Standard, Relaxed). */
  readonly lamp?: (on: boolean) => void;
}

export interface DispenserOptions {
  /** Makes one piece of `partId` for `binId`: an entity with a `SnapPart` and an object3D in the scene. The dispenser places it. Undefined: none could be made. */
  spawn: (partId: string, binId: string) => Entity | undefined;
  /** Takes a piece out of play: a seated piece that came loose, a live piece of a bin no longer wanted, or what is left at `dispose`. */
  discard: (entity: Entity) => void;
}

interface Roll {
  entity: Entity;
  t: number;
  from: Vector3;
  to: Vector3;
  quaternion: Quaternion;
}

interface Bin {
  id: string;
  mouth: Object3D;
  partId: string;
  stock: number;
  lamp?: (on: boolean) => void;
  /** The piece waiting at the mouth, grabbable. */
  live: Entity | null;
  roll: Roll | null;
  lit: boolean;
}

const _world = new Vector3();
const _worldQuat = new Quaternion();
const _parentQuat = new Quaternion();

/** Local pose in `object`'s parent of the world point `world` plus the mouth's orientation. */
function toLocal(object: Object3D, world: Vector3, worldQuat: Quaternion, position: Vector3, quaternion: Quaternion): void {
  const parent = object.parent;
  position.copy(world);
  quaternion.copy(worldQuat);
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  parent.worldToLocal(position);
  parent.getWorldQuaternion(_parentQuat).invert();
  quaternion.premultiply(_parentQuat);
}

export class Dispenser {
  private readonly bins = new Map<string, Bin>();
  /** Dispensed pieces that are seated, with their bin: what returns to the stock when its part comes out. */
  private readonly seated = new Map<Entity, Bin>();
  private wanted: ReadonlySet<string> | 'all' = new Set();
  private readonly unsubscribe: () => void;

  constructor(private readonly options: DispenserOptions) {
    this.unsubscribe = interactionIntents.subscribe((intent) => this.onIntent(intent));
  }

  addBin(spec: BinSpec): void {
    this.bins.set(spec.id, { id: spec.id, mouth: spec.mouth, partId: spec.partId, stock: spec.stock, lamp: spec.lamp, live: null, roll: null, lit: false });
    this.sync();
  }

  /** Puts `count` pieces of `partId` in a bin: the next bag. A live piece of another part is withdrawn. */
  load(binId: string, partId: string, count: number): void {
    const bin = this.bins.get(binId);
    if (!bin) return;
    if (bin.partId !== partId) this.withdraw(bin, true);
    bin.partId = partId;
    bin.stock = Math.max(0, Math.floor(count));
    this.sync();
  }

  /** The bins to take from now: ids, or `'all'` (Master). Pieces appear and withdraw to match. */
  setWanted(ids: Iterable<string> | 'all'): void {
    this.wanted = ids === 'all' ? 'all' : new Set(ids);
    this.sync();
  }

  /** The grabbable piece waiting in a bin, if any. */
  liveOf(binId: string): Entity | null {
    return this.bins.get(binId)?.live ?? null;
  }

  /** The live piece that a socket accepting `accepts` (part ids) could take: the one tap-to-fasten seats. */
  liveFor(accepts: readonly string[]): Entity | undefined {
    for (const bin of this.bins.values()) if (bin.live !== null && accepts.includes(bin.partId)) return bin.live;
    return undefined;
  }

  stockOf(binId: string): number {
    return this.bins.get(binId)?.stock ?? 0;
  }

  isRolling(binId: string): boolean {
    return this.bins.get(binId)?.roll != null;
  }

  update(delta: number): void {
    for (const bin of this.bins.values()) {
      const roll = bin.roll;
      if (!roll) continue;
      const object = roll.entity.object3D;
      if (!object) {
        bin.roll = null;
        continue;
      }
      roll.t = Math.min(1, roll.t + delta / ROLL_S);
      object.position.lerpVectors(roll.from, roll.to, easeOutCubic(roll.t));
      if (roll.t >= 1) {
        object.position.copy(roll.to);
        this.arrive(bin, roll);
      }
    }
    this.sync();
  }

  /** Stops listening and discards every piece still waiting. Seated pieces belong to their machine now. */
  dispose(): void {
    this.unsubscribe();
    for (const bin of this.bins.values()) this.withdraw(bin, true);
    this.bins.clear();
    this.seated.clear();
  }

  // ---- internals ----

  private isWanted(bin: Bin): boolean {
    return this.wanted === 'all' || this.wanted.has(bin.id);
  }

  /** One decision pass: bins that are wanted and empty start a roll, bins that are not wanted withdraw, lamps follow. */
  private sync(): void {
    for (const bin of this.bins.values()) {
      const wanted = this.isWanted(bin);
      if (!wanted) this.withdraw(bin, false);
      else if (bin.live === null && bin.roll === null && bin.stock > 0) this.startRoll(bin);
      const lit = wanted && (bin.live !== null || bin.roll !== null);
      if (lit !== bin.lit) {
        bin.lit = lit;
        bin.lamp?.(lit);
      }
    }
  }

  private startRoll(bin: Bin): void {
    const entity = this.options.spawn(bin.partId, bin.id);
    const object = entity?.object3D;
    if (!entity || !object) return;
    bin.mouth.getWorldPosition(_world);
    bin.mouth.getWorldQuaternion(_worldQuat);
    const to = new Vector3();
    const quaternion = new Quaternion();
    toLocal(object, _world, _worldQuat, to, quaternion);
    _world.y -= ROLL_DROP_M;
    const from = new Vector3();
    toLocal(object, _world, _worldQuat, from, new Quaternion());
    object.position.copy(from);
    object.quaternion.copy(quaternion);
    bin.roll = { entity, t: 0, from, to, quaternion };
  }

  /** The piece is at the mouth: it can be taken now. */
  private arrive(bin: Bin, roll: Roll): void {
    bin.roll = null;
    bin.live = roll.entity;
    roll.entity.addComponent(ReturnsToRest, {}); // the grab is added by GrabModeSystem; the rest pose recorded is the mouth
  }

  /**
   * Takes back the piece of a bin: the one at the mouth (unless a hand holds it; the next pass tries again) and one still rolling. `force` ignores the hand,
   * for `load` and `dispose`.
   */
  private withdraw(bin: Bin, force: boolean): void {
    if (bin.roll) {
      this.options.discard(bin.roll.entity);
      bin.roll = null;
    }
    const live = bin.live;
    // A piece that is seated is no longer the bin's to take back, and may be so a moment before `onIntent` hears of it: the game loop's handler of the same
    // `snapped` runs first, and its next step can already stop wanting this bin.
    if (live === null || live.hasComponent(SnappedTo) || (!force && live.hasComponent(Grabbed))) return;
    bin.live = null;
    this.options.discard(live);
  }

  private binOfLive(entity: Entity): Bin | undefined {
    for (const bin of this.bins.values()) if (bin.live === entity) return bin;
    return undefined;
  }

  private onIntent(intent: InteractionIntent): void {
    if (intent.type === 'snapped') {
      const bin = this.binOfLive(intent.part);
      // The game may have sent it straight back (a dependency bounce): then it is still a loose piece and still live.
      if (!bin || !intent.part.hasComponent(SnappedTo)) return;
      bin.live = null;
      bin.stock = Math.max(0, bin.stock - 1);
      this.seated.set(intent.part, bin);
      // Seated hardware is never grabbed again: it leaves with its part (design §5.4).
      for (const c of [ReturnsToRest, OneHandGrabbable, DistanceGrabbable, RayInteractable]) intent.part.removeComponent(c);
      this.sync();
    } else if (intent.type === 'unsnapped') {
      const bin = this.seated.get(intent.part);
      if (!bin) return;
      this.seated.delete(intent.part);
      bin.stock += 1; // back in its bin
      this.options.discard(intent.part);
      this.sync();
    }
  }
}
