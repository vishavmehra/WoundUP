import { createSystem, Grabbed, Matrix4, Quaternion, Types, Vector3 } from '@iwsdk/core';
import type { Entity, Object3D } from '@iwsdk/core';
import { Socket, SnappedTo, SnapPart } from './components.js';
import { isGazeModeOn, mayRemoveSeated } from './gaze-state.js';
import { GhostPreview } from './ghost.js';
import { interactionIntents, settleIntents } from './intents.js';
import {
  assistedRelease,
  createPick,
  easeOutCubic,
  isTinyFamily,
  NO_PART,
  pickSocket,
  SETTLE_OVERSHOOT_M,
  SETTLE_S,
  SNAP_TWEEN_S,
  seatedRelative,
  settleBump,
  shouldUnsnap,
  snapRadius,
  statusOf,
} from './snap.js';
import type { PartSample, SnapLevel, SocketSample } from './snap.js';

interface Seat {
  entity: Entity;
  socket: Entity;
  socketName: string;
  partId: string;
  node: Object3D;
  /** The part's world orientation in the socket's frame, fixed at the moment of snapping. */
  relative: Quaternion;
  /** Local pose when the tween started, in the part's parent space. */
  fromPosition: Vector3;
  fromQuaternion: Quaternion;
  /** Flight progress 0..1 (SNAP_TWEEN_S), then settle progress 0..1 (SETTLE_S). */
  t: number;
  settle: number;
  /** Unit direction of the flight in the part's parent space, for the settle's push; zero when the part was already home. Set on the first frame. */
  dir: Vector3;
  dirSet: boolean;
  /** How many seated parts carry this one's socket: the empties of a carrier's GLB are children of the carrier (design §5.3). Locked in this order. */
  depth: number;
}

const LEVELS: readonly string[] = ['relaxed', 'standard', 'master'];
/** How long a seated part's carrier chain may be before the depth count gives up. Real chains are three deep (comb, clip, screw). */
const MAX_DEPTH = 8;

interface Assist {
  socket: Entity | null;
  /** `now` when the tiny part last previewed a valid socket. */
  at: number;
}

const _part = new Vector3();
const _socketPos = new Vector3();
const _socketQuat = new Quaternion();
const _socketScale = new Vector3();
const _partQuat = new Quaternion();
const _relative = new Quaternion();
const _targetQuat = new Quaternion();
const _targetPos = new Vector3();
const _parentQuat = new Quaternion();
const _inverse = new Matrix4();

/**
 * Socket snapping for held parts (INTERACTION_SPEC §7.3, §8, §9; TECHNICAL_ARCHITECTURE §13). Thin: the choice of socket,
 * the radii and the orientation come from snap.ts.
 *  - While a SnapPart is held (IWSDK's `Grabbed` tag, so near grab and mouse ray both work) it previews the socket in range.
 *  - On release it seats the part in the nearest socket that takes it, and emits `snapped`; next to a socket that does not
 *    take it, it emits `rejected` and leaves the part to GrabFeedbackSystem, which returns it to its tray.
 *  - A seated part is held on its socket every frame, follows the housing, and comes out when pulled over 3 cm (`unsnapped`).
 *    In gaze mode the pinch must also have been held half a second first (INTERACTION_SPEC §9): a tap or a slip never removes a part.
 *
 * The intricate assembly (INTRICATE_ASSEMBLY_DESIGN §3.4, §5, ADR-050) adds, all inert for a machine that uses none of it:
 *  - Arming: only a socket whose `Socket.armed` is true previews and snaps; the right part at an unarmed one is rejected with reason `order`.
 *  - `seatNow`: the game seats a part exactly as a hand release would (the Helper's Place, Relaxed's hardware, tap-to-fasten).
 *  - The seat flight ends in a 90 ms settle, and the arrival is announced on `settleIntents`.
 *  - Carriers: a part's seated children keep their sockets under it, so they follow it wherever the hand or the housing takes it; a carrier
 *    seats before its children (`Seat.depth`), and a part inside a finished unit asks for a firmer pull (`Socket.unsnapM`, 6 cm).
 *  - The radius depends on the difficulty (`level`, §5.2), and a tiny part (family `fastener`) whose pinch opens within 0.15 s of a valid
 *    preview still goes home to that socket (release assist).
 *
 * TODO(P1): carrying a whole unit is covered headless (tests/interaction/intricate.test.ts) and by the grip order in glb-reader.ts, but nothing has run it
 * on a headset, and it needs the carrier GLBs to author `COL_Grip` (`wu.purpose = 'grip'`) and the stand cradles (W1). The seal fallback of design §5.3
 * (children of a finished unit lose their grab until the stage is loosened) is not built: add it only if the emulator mis-grab test (W7) asks for it.
 *
 * Register it with a priority above 0 (see installInteraction). Seated parts are positioned here, after GrabFeedbackSystem,
 * so a seated part wins over that system's return-to-tray ease, which also starts when a part is released.
 * ponytail: the preview follows the first part found in each hand, not a global closest; a second hand's part gets its own ghost.
 */
export class SocketSnapSystem extends createSystem(
  {
    sockets: { required: [Socket] },
    held: { required: [SnapPart, Grabbed] },
    seated: { required: [SnapPart, SnappedTo] },
  },
  { easySnap: { type: Types.Boolean, default: false }, level: { type: Types.String, default: 'standard' } },
) {
  private socketEntities: Entity[] = [];
  private nodes: Object3D[] = [];
  private axisOnly: boolean[] = [];
  private samples: SocketSample[] = [];
  private readonly seats = new Map<Entity, Seat>();
  /** `seats` in lock order: carriers before what they carry. Rebuilt when a seat is made or cleared, never per frame. */
  private readonly order: Seat[] = [];
  private readonly byObject = new Map<Object3D, Seat>();
  /** Gaze mode: seconds each seated part has been held in the current pinch. */
  private readonly heldFor = new Map<Entity, number>();
  private readonly ghosts = new Map<Entity, GhostPreview>();
  /** Release assist: the socket each held tiny part last previewed as valid, and when. */
  private readonly assist = new Map<Entity, Assist>();
  private readonly part: PartSample = { x: 0, y: 0, z: 0, id: '', family: '', key: 0 };
  private readonly pick = createPick();
  private dt = 0;
  private now = 0;
  private readonly onHeld = (entity: Entity): void => this.updateHeld(entity);
  private readonly onSeat = (seat: Seat): void => this.lock(seat);

  init(): void {
    this.queries.sockets.subscribe('qualify', () => this.rebuildSockets());
    this.queries.sockets.subscribe('disqualify', () => this.rebuildSockets());
    this.queries.held.subscribe('disqualify', (entity) => this.release(entity));
    // Fires for unsnapping, for the game layer removing SnappedTo, and for a destroyed part: the socket is freed in every case.
    this.queries.seated.subscribe('disqualify', (entity) => this.clearSeat(entity));
    this.rebuildSockets();
    this.cleanupFuncs.push(() => {
      this.ghosts.forEach((ghost) => ghost.dispose());
      this.ghosts.clear();
    });
  }

  update(delta: number): void {
    this.dt = delta;
    this.now += delta;
    if (this.queries.held.entities.size > 0) {
      this.refreshSamples();
      this.queries.held.entities.forEach(this.onHeld);
    }
    if (this.order.length > 0) this.order.forEach(this.onSeat);
  }

  /**
   * Seats `entity` in `socket` as if a hand had let go of it there, and returns true. The game's own placements go through here (the Helper's
   * Place, Relaxed's hardware, tap-to-fasten), so a placement by the game is indistinguishable from one by a hand: the same `snapped` intent, the
   * same `SnappedTo` and `Socket.occupant`, the same flight and settle. It does not need the socket to be armed (the game places hardware the
   * player is never asked for). Returns false and changes nothing when the part is held or already seated, is not a SnapPart, or the socket is
   * unknown, takes another part, or is occupied. No `rejected` intent: a caller that asked knows.
   */
  seatNow(entity: Entity, socket: Entity): boolean {
    const object = entity.object3D;
    if (!object || !entity.hasComponent(SnapPart) || this.seats.has(entity) || this.queries.held.entities.has(entity)) return false;
    const index = this.socketEntities.indexOf(socket);
    if (index < 0) return false;
    this.refreshSamples();
    object.getWorldPosition(_part);
    this.fillPart(entity, _part);
    this.markOwn(object);
    if (this.samples[index].own === true) return false; // never into its own child seat
    const status = statusOf(this.samples[index], this.part);
    if (status !== 'valid' && status !== 'order') return false;
    this.commit(entity, index, object);
    return true;
  }

  private radius(): number {
    const level = this.config.level.peek();
    return snapRadius(this.config.easySnap.peek(), (LEVELS.includes(level) ? level : 'standard') as SnapLevel);
  }

  private rebuildSockets(): void {
    this.socketEntities = [];
    this.nodes = [];
    this.axisOnly = [];
    this.samples = [];
    this.queries.sockets.entities.forEach((entity) => {
      const node = entity.getValue(Socket, 'node') as Object3D | undefined;
      if (!node) return;
      const occupant = entity.getValue(Socket, 'occupant');
      this.socketEntities.push(entity);
      this.nodes.push(node);
      this.axisOnly.push(Boolean(entity.getValue(Socket, 'axisOnly')));
      this.samples.push({
        x: 0,
        y: 0,
        z: 0,
        accepts: (entity.getValue(Socket, 'accepts') as string[] | undefined) ?? [],
        occupant: occupant ? occupant.index : NO_PART,
        armed: entity.getValue(Socket, 'armed') as boolean,
      });
    });
  }

  private refreshSamples(): void {
    for (let i = 0; i < this.samples.length; i++) {
      this.nodes[i].getWorldPosition(_socketPos);
      const sample = this.samples[i];
      sample.x = _socketPos.x;
      sample.y = _socketPos.y;
      sample.z = _socketPos.z;
      sample.armed = this.socketEntities[i].getValue(Socket, 'armed') as boolean;
    }
  }

  /** Flags the sockets that are empties of `object` itself: a carrier carried next to its own child seats must not preview, snap or be rejected there. */
  private markOwn(object: Object3D): void {
    for (let i = 0; i < this.nodes.length; i++) {
      let own = false;
      for (let p: Object3D | null = this.nodes[i]; p; p = p.parent) {
        if (p === object) {
          own = true;
          break;
        }
      }
      this.samples[i].own = own;
    }
  }

  private fillPart(entity: Entity, position: Vector3): void {
    this.part.x = position.x;
    this.part.y = position.y;
    this.part.z = position.z;
    this.part.id = entity.getValue(SnapPart, 'partId') as string;
    this.part.family = entity.getValue(SnapPart, 'family') as string;
    this.part.key = entity.index;
  }

  /** The socket pose a part would take, with the orientation rule that both the preview and the commit use. */
  private seatPose(object: Object3D, index: number): void {
    const node = this.nodes[index];
    node.getWorldPosition(_socketPos);
    node.getWorldQuaternion(_socketQuat);
    object.getWorldQuaternion(_partQuat);
    seatedRelative(_partQuat, _socketQuat, this.axisOnly[index], _relative);
    _targetQuat.copy(_socketQuat).multiply(_relative);
  }

  private updateHeld(entity: Entity): void {
    const object = entity.object3D;
    if (!object) return;
    object.getWorldPosition(_part);

    const seat = this.seats.get(entity);
    if (seat) {
      seat.node.getWorldPosition(_socketPos);
      const held = (this.heldFor.get(entity) ?? 0) + this.dt;
      this.heldFor.set(entity, held);
      const limit = seat.socket.getValue(Socket, 'unsnapM') as number;
      if (!shouldUnsnap(_part.distanceTo(_socketPos), limit) || !mayRemoveSeated(isGazeModeOn(), held)) {
        this.ghosts.get(entity)?.hide(); // still seated, nothing to preview
        return;
      }
      entity.removeComponent(SnappedTo); // clearSeat frees the socket and emits `unsnapped`
    }

    this.fillPart(entity, _part);
    this.markOwn(object);
    if (!pickSocket(this.part, this.samples, this.radius(), this.pick)) {
      this.ghosts.get(entity)?.hide();
      return;
    }
    if (this.pick.status === 'valid' && isTinyFamily(this.part.family)) this.remember(entity, this.socketEntities[this.pick.index]);
    this.seatPose(object, this.pick.index);
    let ghost = this.ghosts.get(entity);
    if (!ghost) {
      ghost = new GhostPreview(object, this.scene);
      this.ghosts.set(entity, ghost);
    }
    ghost.show(_socketPos, _targetQuat, this.pick.status === 'valid');
  }

  private remember(entity: Entity, socket: Entity): void {
    const a = this.assist.get(entity);
    if (a) {
      a.socket = socket;
      a.at = this.now;
    } else {
      this.assist.set(entity, { socket, at: this.now });
    }
  }

  /** The hand let go of a part: seat it, reject it, or leave it for GrabFeedbackSystem to send back. */
  private release(entity: Entity): void {
    this.heldFor.delete(entity);
    const assist = this.assist.get(entity);
    this.assist.delete(entity);
    const ghost = this.ghosts.get(entity);
    if (ghost) {
      ghost.dispose();
      this.ghosts.delete(entity);
    }
    const object = entity.object3D;
    if (!object) return;

    const seat = this.seats.get(entity);
    if (seat) {
      // Let go while still seated (pulled less than the unsnap limit): ease back in.
      this.restart(seat, object);
      return;
    }

    this.refreshSamples();
    object.getWorldPosition(_part);
    this.fillPart(entity, _part);
    this.markOwn(object);
    const radius = this.radius();
    const found = pickSocket(this.part, this.samples, radius, this.pick);
    if (found && this.pick.status === 'valid') {
      this.commit(entity, this.pick.index, object);
      return;
    }
    // Release assist: a tiny part whose pinch opened a moment after a valid preview goes home to that socket (design §5.2).
    if (assist?.socket) {
      const rescued = this.socketEntities.indexOf(assist.socket);
      if (rescued >= 0 && statusOf(this.samples[rescued], this.part) === 'valid') {
        const s = this.samples[rescued];
        if (assistedRelease(this.now - assist.at, Math.hypot(s.x - _part.x, s.y - _part.y, s.z - _part.z), radius)) {
          this.commit(entity, rescued, object);
          return;
        }
      }
    }
    if (!found) return;

    const reason = this.pick.status;
    if (reason === 'valid') return; // unreachable: a valid pick was seated above
    const socket = this.socketEntities[this.pick.index];
    interactionIntents.emit({
      type: 'rejected',
      part: entity,
      socket,
      socketName: socket.getValue(Socket, 'name') as string,
      partId: this.part.id,
      reason,
    });
  }

  /** Seats the part (`this.part` already filled for it) in socket `index`: the one place a seat is made, for a hand's release and for `seatNow`. */
  private commit(entity: Entity, index: number, object: Object3D): void {
    const socket = this.socketEntities[index];
    const socketName = socket.getValue(Socket, 'name') as string;
    const partId = this.part.id;
    this.seatPose(object, index);
    const seat: Seat = {
      entity,
      socket,
      socketName,
      partId,
      node: this.nodes[index],
      relative: _relative.clone(),
      fromPosition: object.position.clone(),
      fromQuaternion: object.quaternion.clone(),
      t: 0,
      settle: 0,
      dir: new Vector3(),
      dirSet: false,
      depth: 0,
    };
    this.seats.set(entity, seat);
    this.reorder();
    this.samples[index].occupant = entity.index;
    socket.setValue(Socket, 'occupant', entity);
    entity.addComponent(SnappedTo, { socket });
    interactionIntents.emit({ type: 'snapped', part: entity, socket, socketName, partId });
  }

  private clearSeat(entity: Entity): void {
    const seat = this.seats.get(entity);
    if (!seat) return;
    this.seats.delete(entity);
    this.reorder();
    const index = this.socketEntities.indexOf(seat.socket);
    if (index >= 0) this.samples[index].occupant = NO_PART;
    if (this.queries.sockets.entities.has(seat.socket)) seat.socket.setValue(Socket, 'occupant', null);
    interactionIntents.emit({
      type: 'unsnapped',
      part: entity,
      socket: seat.socket,
      socketName: seat.socketName,
      partId: seat.partId,
    });
  }

  /** Orders the seats so that what carries a socket is locked before the part seated in it: a child never trails its carrier by a frame while the carrier is still flying home. */
  private reorder(): void {
    this.byObject.clear();
    this.order.length = 0;
    for (const seat of this.seats.values()) {
      const object = seat.entity.object3D;
      if (object) this.byObject.set(object, seat);
    }
    for (const seat of this.seats.values()) {
      seat.depth = this.depthOf(seat, 0);
      this.order.push(seat);
    }
    this.order.sort((a, b) => a.depth - b.depth);
  }

  /** Seated carriers above this seat's socket empty: 0 for a socket of the housing, 1 for the pin on a gear that sits in the housing, and so on. */
  private depthOf(seat: Seat, depth: number): number {
    if (depth >= MAX_DEPTH) return depth;
    for (let p: Object3D | null = seat.node.parent; p; p = p.parent) {
      const carrier = this.byObject.get(p);
      if (carrier && carrier !== seat) return 1 + this.depthOf(carrier, depth + 1);
    }
    return 0;
  }

  /** Starts the flight again from where the part is now (a pull that stayed under the unsnap limit, then let go). */
  private restart(seat: Seat, object: Object3D): void {
    seat.t = 0;
    seat.settle = 0;
    seat.dirSet = false;
    seat.fromPosition.copy(object.position);
    seat.fromQuaternion.copy(object.quaternion);
  }

  /** Holds a seated part on its socket: eases it in first, settles, then follows the socket exactly, even when the housing or a carrier moves. */
  private lock(seat: Seat): void {
    const entity = seat.entity;
    if (this.queries.held.entities.has(entity)) return; // the hand is moving it
    const object = entity.object3D;
    const parent = object?.parent;
    if (!object || !parent) return;

    seat.node.updateWorldMatrix(true, false);
    seat.node.matrixWorld.decompose(_socketPos, _socketQuat, _socketScale);
    _targetQuat.copy(_socketQuat).multiply(seat.relative);
    // World pose -> the part's parent space.
    parent.updateWorldMatrix(true, false);
    _inverse.copy(parent.matrixWorld).invert();
    _targetPos.copy(_socketPos).applyMatrix4(_inverse);
    parent.getWorldQuaternion(_parentQuat).invert();
    _targetQuat.premultiply(_parentQuat);

    if (!seat.dirSet) {
      seat.dirSet = true;
      seat.dir.subVectors(_targetPos, seat.fromPosition);
      if (seat.dir.lengthSq() > 1e-12) seat.dir.normalize();
      else seat.dir.set(0, 0, 0); // already home: nothing to push
    }

    if (seat.t < 1) {
      seat.t = Math.min(1, seat.t + this.dt / SNAP_TWEEN_S);
      const eased = easeOutCubic(seat.t);
      object.position.lerpVectors(seat.fromPosition, _targetPos, eased);
      object.quaternion.slerpQuaternions(seat.fromQuaternion, _targetQuat, eased);
      if (seat.t >= 1) {
        settleIntents.emit({ type: 'settled', part: entity, socket: seat.socket, socketName: seat.socketName, partId: seat.partId });
      }
    } else if (seat.settle < 1) {
      seat.settle = Math.min(1, seat.settle + this.dt / SETTLE_S);
      object.position.copy(_targetPos).addScaledVector(seat.dir, SETTLE_OVERSHOOT_M * settleBump(seat.settle));
      object.quaternion.copy(_targetQuat);
    } else {
      object.position.copy(_targetPos);
      object.quaternion.copy(_targetQuat);
    }
  }
}
