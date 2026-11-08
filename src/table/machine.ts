import { chooseSurface, type SurfaceInfo, type TableChoice, type Vec3Like } from '../placement.js';

/**
 * The placement decision as a state machine (SPATIAL_WORLD_SYSTEM §4, TECHNICAL_ARCHITECTURE §6.4, ADR-026).
 *
 * One decision per session: wait for the first tracked head pose, give the headset up to about 2 seconds to report
 * surfaces, choose once, create an anchor at the chosen pose and follow it. Anything missing, unsuitable or failing ends
 * on the floating stand, silently. Pure TypeScript: the WebXR calls sit behind `SpatialFrame`, so every path here is
 * unit-tested with fakes and no engine, and the system that owns the stage stays thin.
 */

/** PRODUCT_SPEC §3.2: "waits at most about 2 seconds for a surface before using the stand". */
export const COLLECT_WINDOW_S = 2;
/**
 * Delays before the second and third attempt to create the anchor: the first two of IWSDK's own retry delays
 * (audit D §4.3). A rejected promise after the third attempt means the stand.
 */
export const ANCHOR_RETRY_DELAYS_S: ReadonlyArray<number> = [0.25, 0.5];
/**
 * If no anchor exists this long after the choice, the stand is used. Not in the specs: it stops a promise that never
 * settles from leaving the player with no town at all (the town stays hidden until the anchor holds, SPATIAL §6).
 */
export const ANCHOR_BUDGET_S = 2;

/** Eye position and gaze in the session's reference space. */
export interface HeadPose {
  position: Vec3Like;
  forward: Vec3Like;
}

/** A rigid transform in reference space: position and unit quaternion. */
export interface RefPose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

/**
 * What the machine needs from the XR frame it is run in. `WebXrSpatial` implements it with raw WebXR; tests fake it.
 * `A` is the anchor handle: opaque to the machine, but it must be deletable.
 */
export interface SpatialFrame<A extends { delete(): void }> {
  /** The session can report surfaces and make anchors, and is a mixed-reality one (not immersive-vr). */
  canPlaceOnTable(): boolean;
  /** The tracked head, or null while the headset has no pose. May return one reused object. */
  head(): HeadPose | null;
  /** Reported surfaces now, or null when the frame cannot list them. */
  surfaces(): ReadonlyArray<SurfaceInfo> | null;
  /** Starts creating an anchor at the pose; null when the frame cannot make anchors. May reject. */
  createAnchor(pose: RefPose): Promise<A> | null;
  /** Writes the anchor's current pose into `out`. False when the anchor is not tracked right now. */
  readAnchor(anchor: A, out: RefPose): boolean;
}

/** Deleting an anchor can throw once the session is gone; there is nothing left to release then. */
function release(anchor: { delete(): void }): void {
  try {
    anchor.delete();
  } catch {
    // ignored on purpose
  }
}

export type PlacementPhase = 'idle' | 'awaiting-pose' | 'collecting' | 'anchoring' | 'table' | 'stand';

/** Why the stand is showing. For QA and the emulator evidence; never shown to the player (PS §3.2: no error message). */
export type StandReason = 'no-table-support' | 'no-suitable-surface' | 'anchor-failed';

/** What the stage should do after this frame. */
export type PlacementStep =
  /** Nothing. */
  | 'none'
  /** Place (or place again) the floating stand from the current eye position. */
  | 'stand'
  /** The anchor holds: show the town on the table. `pose` and `townScale` are ready. */
  | 'table-start'
  /** Still on the table: `pose` may have been refined by tracking. */
  | 'table';

export class TablePlacementMachine<A extends { delete(): void }> {
  private current: PlacementPhase = 'idle';
  private reason: StandReason | null = null;
  private scale = 1;
  /** The town's pose in reference space once it is on the table. Starts at the chosen pose, then follows the anchor. */
  readonly pose: RefPose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };

  private windowStart = 0;
  private standDue = false;
  private choice: TableChoice | null = null;
  private chosenAt = 0;
  private anchor: A | null = null;
  /** createAnchor calls started for this choice. */
  private attempts = 0;
  private pending = false;
  private failed = false;
  private retryAt = 0;
  /** Bumped whenever earlier anchor promises stop mattering (session ended, gave up). */
  private generation = 0;

  get phase(): PlacementPhase {
    return this.current;
  }
  /** Town scale, 0.75 to 1 on a table, 1 on the stand. Applies to the town group only (INTERACTION_SPEC §3). */
  get townScale(): number {
    return this.scale;
  }
  get standReason(): StandReason | null {
    return this.reason;
  }

  /** A session started: forget everything and make a new choice at the first tracked pose (ACCEPTANCE TBL-09). */
  begin(): void {
    this.reset();
    this.current = 'awaiting-pose';
  }

  /** The session ended. */
  end(): void {
    this.reset();
  }

  /**
   * The player recentred the headset view. Only the stand moves for that, from the new eye position; a town anchored to
   * a table stays on its table, and a choice that is still being made is unaffected (PS §3.2, ADR-019, ADR-026).
   */
  recentre(): void {
    if (this.current === 'stand') this.standDue = true;
  }

  /** Run once per XR frame with the frame's spatial data. `time` is seconds, monotonic within the session. */
  update(time: number, spatial: SpatialFrame<A>): PlacementStep {
    switch (this.current) {
      case 'awaiting-pose':
        if (!spatial.head()) return 'none';
        if (!spatial.canPlaceOnTable()) return this.toStand('no-table-support', spatial);
        this.current = 'collecting';
        this.windowStart = time;
        return 'none';

      case 'collecting': {
        if (time - this.windowStart < COLLECT_WINDOW_S) return 'none';
        const head = spatial.head();
        if (!head) return 'none'; // tracking is out right now; the choice needs the eyes, so wait for them
        const surfaces = spatial.surfaces();
        const choice = surfaces ? chooseSurface(surfaces, head.position, head.forward) : null;
        if (!choice) return this.toStand('no-suitable-surface', spatial);
        this.startAnchoring(choice, time);
        return this.stepAnchoring(time, spatial);
      }

      case 'anchoring':
        return this.stepAnchoring(time, spatial);

      case 'table':
        // Tracking loss, plane updates, visibility changes and recentring change nothing here: keep the last pose.
        spatial.readAnchor(this.anchor!, this.pose);
        return 'table';

      case 'stand':
        return this.stepStand(spatial);

      default:
        return 'none';
    }
  }

  private reset(): void {
    this.generation++;
    this.deleteAnchor();
    this.current = 'idle';
    this.reason = null;
    this.scale = 1;
    this.choice = null;
    this.standDue = false;
    this.attempts = 0;
    this.pending = false;
    this.failed = false;
    this.retryAt = 0;
  }

  private deleteAnchor(): void {
    const anchor = this.anchor;
    this.anchor = null;
    if (anchor) release(anchor);
  }

  private toStand(reason: StandReason, spatial: SpatialFrame<A>): PlacementStep {
    this.generation++; // a late anchor from an abandoned attempt is deleted, not used
    this.current = 'stand';
    this.reason = reason;
    this.scale = 1;
    this.choice = null;
    this.standDue = true;
    return this.stepStand(spatial);
  }

  /** The stand is placed from the eyes, so it waits for a tracked head. */
  private stepStand(spatial: SpatialFrame<A>): PlacementStep {
    if (!this.standDue || !spatial.head()) return 'none';
    this.standDue = false;
    return 'stand';
  }

  private startAnchoring(choice: TableChoice, time: number): void {
    this.choice = choice;
    this.chosenAt = time;
    this.attempts = 0;
    this.pending = false;
    this.failed = false;
    this.retryAt = time;
    this.current = 'anchoring';
    const half = choice.yaw / 2;
    Object.assign(this.pose, { x: choice.x, y: choice.y, z: choice.z, qx: 0, qy: Math.sin(half), qz: 0, qw: Math.cos(half) });
  }

  private stepAnchoring(time: number, spatial: SpatialFrame<A>): PlacementStep {
    if (this.anchor) {
      this.current = 'table';
      this.scale = this.choice!.scale;
      spatial.readAnchor(this.anchor, this.pose); // false keeps the chosen pose, which is what the anchor was made at
      return 'table-start';
    }
    if (time - this.chosenAt > ANCHOR_BUDGET_S) return this.toStand('anchor-failed', spatial);
    if (this.failed) {
      this.failed = false;
      const delay = ANCHOR_RETRY_DELAYS_S[this.attempts - 1];
      if (delay === undefined) return this.toStand('anchor-failed', spatial); // every attempt was used
      this.retryAt = time + delay;
    }
    if (!this.pending && time >= this.retryAt) {
      let request: Promise<A> | null;
      try {
        request = spatial.createAnchor(this.pose);
      } catch {
        request = Promise.reject(new Error('createAnchor threw'));
      }
      if (!request) return this.toStand('anchor-failed', spatial); // this frame cannot make anchors at all
      this.attempts++;
      this.pending = true;
      const generation = this.generation;
      request.then(
        (anchor) => {
          if (generation !== this.generation) return release(anchor); // the session or the attempt is over
          this.anchor = anchor;
          this.pending = false;
        },
        () => {
          if (generation !== this.generation) return;
          this.pending = false;
          this.failed = true;
        },
      );
    }
    return 'none';
  }
}
