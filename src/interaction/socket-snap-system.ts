import { createSystem, Grabbed, Matrix4, Quaternion, Types, Vector3 } from '@iwsdk/core';
import type { Entity, Object3D } from '@iwsdk/core';
import { Socket, SnappedTo, SnapPart } from './components.js';
import { GhostPreview } from './ghost.js';
import { interactionIntents } from './intents.js';
import {
  createPick,
  easeOutCubic,
  NO_PART,
  pickSocket,
  SNAP_TWEEN_S,
  seatedRelative,
  shouldUnsnap,
  snapRadius,
} from './snap.js';
import type { PartSample, SocketSample } from './snap.js';

interface Seat {
  socket: Entity;
  socketName: string;
  partId: string;
  node: Object3D;
  /** The part's world orientation in the socket's frame, fixed at the moment of snapping. */
  relative: Quaternion;
  /** Local pose when the tween started, in the part's parent space. */
  fromPosition: Vector3;
  fromQuaternion: Quaternion;
  t: number;
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
  { easySnap: { type: Types.Boolean, default: false } },
) {
  private socketEntities: Entity[] = [];
  private nodes: Object3D[] = [];
  private axisOnly: boolean[] = [];
  private samples: SocketSample[] = [];
  private readonly seats = new Map<Entity, Seat>();
  private readonly ghosts = new Map<Entity, GhostPreview>();
  private readonly part: PartSample = { x: 0, y: 0, z: 0, id: '', family: '', key: 0 };
  private readonly pick = createPick();
  private dt = 0;
  private readonly onHeld = (entity: Entity): void => this.updateHeld(entity);
  private readonly onSeat = (seat: Seat, entity: Entity): void => this.lock(entity, seat);

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
    if (this.queries.held.entities.size > 0) {
      this.refreshSamples();
      this.queries.held.entities.forEach(this.onHeld);
    }
    if (this.seats.size > 0) this.seats.forEach(this.onSeat);
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
      if (!shouldUnsnap(_part.distanceTo(_socketPos))) {
        this.ghosts.get(entity)?.hide(); // still seated, nothing to preview
        return;
      }
      entity.removeComponent(SnappedTo); // clearSeat frees the socket and emits `unsnapped`
    }

    this.fillPart(entity, _part);
    if (!pickSocket(this.part, this.samples, snapRadius(this.config.easySnap.peek()), this.pick)) {
      this.ghosts.get(entity)?.hide();
      return;
    }
    this.seatPose(object, this.pick.index);
    let ghost = this.ghosts.get(entity);
    if (!ghost) {
      ghost = new GhostPreview(object, this.scene);
      this.ghosts.set(entity, ghost);
    }
    ghost.show(_socketPos, _targetQuat, this.pick.status === 'valid');
  }

  /** The hand let go of a part: seat it, reject it, or leave it for GrabFeedbackSystem to send back. */
  private release(entity: Entity): void {
    const ghost = this.ghosts.get(entity);
    if (ghost) {
      ghost.dispose();
      this.ghosts.delete(entity);
    }
    const object = entity.object3D;
    if (!object) return;

    const seat = this.seats.get(entity);
    if (seat) {
      // Let go while still seated (pulled less than 3 cm): ease back in.
      seat.t = 0;
      seat.fromPosition.copy(object.position);
      seat.fromQuaternion.copy(object.quaternion);
      return;
    }

    this.refreshSamples();
    object.getWorldPosition(_part);
    this.fillPart(entity, _part);
    if (!pickSocket(this.part, this.samples, snapRadius(this.config.easySnap.peek()), this.pick)) return;

    const index = this.pick.index;
    const socket = this.socketEntities[index];
    const socketName = socket.getValue(Socket, 'name') as string;
    if (this.pick.status !== 'valid') {
      interactionIntents.emit({
        type: 'rejected',
        part: entity,
        socket,
        socketName,
        partId: this.part.id,
        reason: this.pick.status,
      });
      return;
    }

    this.seatPose(object, index);
    this.seats.set(entity, {
      socket,
      socketName,
      partId: this.part.id,
      node: this.nodes[index],
      relative: _relative.clone(),
      fromPosition: object.position.clone(),
      fromQuaternion: object.quaternion.clone(),
      t: 0,
    });
    this.samples[index].occupant = entity.index;
    socket.setValue(Socket, 'occupant', entity);
    entity.addComponent(SnappedTo, { socket });
    interactionIntents.emit({ type: 'snapped', part: entity, socket, socketName, partId: this.part.id });
  }

  private clearSeat(entity: Entity): void {
    const seat = this.seats.get(entity);
    if (!seat) return;
    this.seats.delete(entity);
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

  /** Holds a seated part on its socket: eases it in first, then follows the socket exactly, even when the housing moves. */
  private lock(entity: Entity, seat: Seat): void {
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

    if (seat.t < 1) {
      seat.t = Math.min(1, seat.t + this.dt / SNAP_TWEEN_S);
      const eased = easeOutCubic(seat.t);
      object.position.lerpVectors(seat.fromPosition, _targetPos, eased);
      object.quaternion.slerpQuaternions(seat.fromQuaternion, _targetQuat, eased);
    } else {
      object.position.copy(_targetPos);
      object.quaternion.copy(_targetQuat);
    }
  }
}
