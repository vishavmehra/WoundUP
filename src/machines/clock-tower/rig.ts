// Binds a ClockTowerRuntime to the nodes of the Clock Tower's GLBs. No IWSDK: it works on a loaded glTF scene graph (three only),
// so Vitest runs it in node. Node names are the mesh names of the manifest (`assets/manifest/glb-manifest.json`) and the
// `PIV_` empties of the generators (`blender/scripts/gen_pendulum.py`, `gen_escapement.py`).

import { Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { ClockTowerRuntime } from './runtime';

export const CLOCK_TOWER_NODE = {
  /** Root of `pendulum_clock` (the bob is its child). Origin is the suspension point, `PIV_Suspension`. */
  pendulum: 'Pendulum_Rod',
  anchor: 'EscapementAnchor',
  escapeWheel: 'EscapeWheel',
  cam: 'Cam_HourlyChime',
  /** `clock_hands`: both meshes have their origin at the shared pivot (manifest `originAndPivot`). */
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

export class ClockTowerNodes {
  private pendulum: Hinge | null = null;
  private anchor: Hinge | null = null;
  private escapeWheel: Hinge | null = null;
  private cam: Hinge | null = null;
  private hourHand: Hinge | null = null;
  private minuteHand: Hinge | null = null;
  private bell: Hinge | null = null;
  private striker: Hinge | null = null;

  /**
   * Looks the nodes up under `root` (the Clock Tower's object) and remembers their rest pose. Call it again when parts are added
   * (the nodes only exist once their part is installed). Returns the node names it did not find, empty when the tower is whole.
   * `apply` skips a missing node, so a tower without a bell still ticks.
   */
  resolve(root: Object3D): string[] {
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
    return missing;
  }

  /** Writes the runtime's rotations to the nodes. No allocation. */
  apply(runtime: ClockTowerRuntime): void {
    turn(this.pendulum, runtime.pendulumZ);
    turn(this.anchor, runtime.pendulumZ);
    turn(this.escapeWheel, runtime.escapeWheelZ);
    turn(this.cam, runtime.hourlyCamZ);
    turn(this.hourHand, runtime.hourHandZ);
    turn(this.minuteHand, runtime.minuteHandZ);
    turn(this.bell, runtime.bellZ);
    turn(this.striker, runtime.strikerZ);
  }
}
