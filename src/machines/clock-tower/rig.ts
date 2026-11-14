// Binds a ClockTowerRuntime to the nodes of the Clock Tower's GLBs. No IWSDK: it works on a loaded glTF scene graph (three only),
// so Vitest runs it in node. Node names are the mesh names of the manifest (`assets/manifest/glb-manifest.json`) and the
// `PIV_` empties of the generators (`blender/scripts/gen_pendulum.py`, `gen_escapement.py`).

import { Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import { THEATRE_DOOR_OPEN_RAD } from './constants.js';
import { MOVEMENT_PARTS, movementNodeName, trainRatios } from './movement.js';
import type { TrainSocket } from './movement.js';
import type { ClockTowerRuntime } from './runtime.js';

export const CLOCK_TOWER_NODE = {
  /** Root of `pendulum_clock` (the bob is its child). Origin is the suspension point, `PIV_Suspension`. */
  pendulum: 'Pendulum_Rod',
  anchor: 'EscapementAnchor',
  escapeWheel: 'EscapeWheel',
  cam: 'Cam_HourlyChime',
  /**
   * `clock_hands`: both meshes have their origin at the shared pivot (manifest `originAndPivot`). The minute hand is a CHILD of the
   * hour hand in the GLB (`gen_clock_tower.py`), so it inherits the hour hand's turn: `ClockTowerNodes` takes that off again.
   */
  hourHand: 'ClockHands_Hour',
  minuteHand: 'ClockHands_Minute',
  /** `clock_bell`: origin at the suspension point; the striker turns about the `PIV_Striker` empty. */
  bell: 'ClockBell_Bell',
  striker: 'ClockBell_Striker',
  strikerPivot: 'PIV_Striker',
} as const;

/** One node that turns about its local +Z (ADR-020), from the pose it had when it was found. */
interface Hinge {
  readonly object: Object3D;
  readonly rest: Quaternion;
  readonly restPosition: Vector3;
  /** Turning point in the node's parent space, or null to turn about the node's own origin. */
  readonly pivot: Vector3 | null;
}

const Z_AXIS = new Vector3(0, 0, 1);
const _turn = new Quaternion();

function turn(hinge: Hinge | null, angle: number): void {
  if (hinge === null) return;
  const { object, rest, restPosition, pivot } = hinge;
  object.quaternion.copy(rest).multiply(_turn.setFromAxisAngle(Z_AXIS, angle));
  if (pivot !== null) {
    // The node's origin is not on its axis: swing it round the pivot, in the parent's XY plane (the axis is +Z).
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const dx = restPosition.x - pivot.x;
    const dy = restPosition.y - pivot.y;
    object.position.set(pivot.x + dx * c - dy * s, pivot.y + dx * s + dy * c, restPosition.z);
  }
}

/** Puts a hinge's node back at the pose it had when it was found. */
function restore(hinge: Hinge | null): void {
  if (hinge === null) return;
  hinge.object.quaternion.copy(hinge.rest);
  hinge.object.position.copy(hinge.restPosition);
}

/** A part of the going train: it turns by `ratio` times the escape wheel's angle (the solver's speed ratio, signed, times the part's axle direction). */
interface TrainHinge {
  readonly hinge: Hinge;
  readonly ratio: number;
}

export class ClockTowerNodes {
  private readonly train: TrainHinge[] = [];
  private pendulum: Hinge | null = null;
  private anchor: Hinge | null = null;
  private escapeWheel: Hinge | null = null;
  private cam: Hinge | null = null;
  private hourHand: Hinge | null = null;
  private minuteHand: Hinge | null = null;
  private bell: Hinge | null = null;
  private striker: Hinge | null = null;
  /** The minute hand hangs under the hour hand, so the hour hand's turn reaches it and must be taken off its own. */
  private minuteUnderHour = false;

  /**
   * Looks the nodes up under `root` (the Clock Tower's object) and remembers their rest pose. Call it again when parts are added
   * (the nodes only exist once their part is installed) or when the clock starts again. The nodes found last time are put back at
   * their rest pose first, so a second call does not take a turned pose for the rest pose. Returns the node names it did not find,
   * empty when the tower is whole. `apply` skips a missing node, so a tower without a bell still ticks.
   */
  resolve(root: Object3D): string[] {
    this.restoreAll();
    root.updateWorldMatrix(true, true);
    const missing: string[] = [];
    const find = (name: string, pivotName?: string): Hinge | null => {
      const object = root.getObjectByName(name);
      if (!object) {
        missing.push(name);
        return null;
      }
      let pivot: Vector3 | null = null;
      const marker = pivotName === undefined ? undefined : root.getObjectByName(pivotName);
      if (marker && object.parent) {
        pivot = marker.getWorldPosition(new Vector3());
        object.parent.worldToLocal(pivot);
      } else if (pivotName !== undefined) {
        missing.push(pivotName);
      }
      return { object, rest: object.quaternion.clone(), restPosition: object.position.clone(), pivot };
    };
    const n = CLOCK_TOWER_NODE;
    this.pendulum = find(n.pendulum);
    this.anchor = find(n.anchor);
    this.escapeWheel = find(n.escapeWheel);
    this.cam = find(n.cam);
    this.hourHand = find(n.hourHand);
    this.minuteHand = find(n.minuteHand);
    this.bell = find(n.bell);
    this.striker = find(n.striker, n.strikerPivot);
    this.minuteUnderHour =
      this.hourHand !== null && this.minuteHand !== null && this.hourHand.object.getObjectById(this.minuteHand.object.id) !== undefined;
    this.train.length = 0;
    const ratios = trainRatios();
    for (const part of MOVEMENT_PARTS) {
      if (!(part.socket in ratios)) continue; // the cam is not of the train: it follows the hour (`cam` above)
      const hinge = find(movementNodeName(part.socket));
      if (hinge) this.train.push({ hinge, ratio: ratios[part.socket as TrainSocket] * part.sign });
    }
    return missing;
  }

  private restoreAll(): void {
    restore(this.pendulum);
    restore(this.anchor);
    restore(this.escapeWheel);
    restore(this.cam);
    restore(this.hourHand);
    restore(this.minuteHand);
    restore(this.bell);
    restore(this.striker);
    for (let i = 0; i < this.train.length; i++) restore(this.train[i].hinge);
  }

  /** Writes the runtime's rotations to the nodes. No allocation. */
  apply(runtime: ClockTowerRuntime): void {
    turn(this.pendulum, runtime.pendulumZ);
    turn(this.anchor, runtime.pendulumZ);
    turn(this.escapeWheel, runtime.escapeWheelZ);
    turn(this.cam, runtime.hourlyCamZ);
    turn(this.hourHand, runtime.hourHandZ);
    turn(this.minuteHand, this.minuteUnderHour ? runtime.minuteHandZ - runtime.hourHandZ : runtime.minuteHandZ);
    turn(this.bell, runtime.bellZ);
    turn(this.striker, runtime.strikerZ);
    // The escapement regulates the train: every gear, the barrel and the spring advance with the wheel, by the solver's ratios.
    const wheel = runtime.escapeWheelZ;
    for (let i = 0; i < this.train.length; i++) turn(this.train[i].hinge, wheel * this.train[i].ratio);
  }
}

/** Hinge pivots of the theatre facade (`blender/scripts/gen_theatre.py`); the leaves are their children. */
export const THEATRE_DOOR_NODE = { left: 'PIV_DoorL', right: 'PIV_DoorR' } as const;

const Y_AXIS = new Vector3(0, 1, 0);

/**
 * The theatre doors, which belong to the town layer's facade GLB, not to the tower. The town layer calls `resolve(facadeRoot)` once
 * and `apply(runtime.doorsAmount)` each frame (or only while `runtime.doorsOpen`, then once more with 0 after `doorsClose`).
 */
export class TheatreDoors {
  private left: Object3D | null = null;
  private right: Object3D | null = null;
  private readonly leftRest = new Quaternion();
  private readonly rightRest = new Quaternion();

  /** Returns the pivot names it did not find, empty when both are there. */
  resolve(root: Object3D): string[] {
    // The leaves found last time go back to shut first, so that a second call does not take an open pose for the shut pose.
    this.left?.quaternion.copy(this.leftRest);
    this.right?.quaternion.copy(this.rightRest);
    const missing: string[] = [];
    this.left = root.getObjectByName(THEATRE_DOOR_NODE.left) ?? null;
    this.right = root.getObjectByName(THEATRE_DOOR_NODE.right) ?? null;
    if (this.left) this.leftRest.copy(this.left.quaternion);
    else missing.push(THEATRE_DOOR_NODE.left);
    if (this.right) this.rightRest.copy(this.right.quaternion);
    else missing.push(THEATRE_DOOR_NODE.right);
    return missing;
  }

  /** `amount` is `ClockTowerRuntime.doorsAmount`: 0 shut, 1 fully open. No allocation. */
  apply(amount: number): void {
    const a = amount * THEATRE_DOOR_OPEN_RAD;
    if (this.left) this.left.quaternion.copy(this.leftRest).multiply(_turn.setFromAxisAngle(Y_AXIS, a));
    if (this.right) this.right.quaternion.copy(this.rightRest).multiply(_turn.setFromAxisAngle(Y_AXIS, -a));
  }
}
