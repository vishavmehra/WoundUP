import { createSystem, GrabSystem, Grabbed, Quaternion, Vector3 } from '@iwsdk/core';
import type { Entity, Object3D } from '@iwsdk/core';
import { MIN_GRAB_RADIUS_M } from './glb-reader.js';
import { HANDS, readWristPose } from './hand-pose.js';
import type { Hand } from './hand-pose.js';
import { interactionIntents } from './intents.js';
import { WindKey } from './components.js';
import { MAX_WIND_UNITS, twistAbout, WindTracker } from './wind.js';

/** One hand turning one key. Created when a pinch takes the key, dropped when it lets go. */
interface Session {
  key: Entity;
  object: Object3D;
  tracker: WindTracker;
  /** Turning axis in the key's local space, unit length. */
  localAxis: Vector3;
  /** The same axis in the world when the pinch began. */
  worldAxis: Vector3;
  startWrist: Quaternion;
  startKey: Quaternion;
}

const _wristPos = new Vector3();
const _wristQuat = new Quaternion();
const _tip = new Vector3();
const _keyPos = new Vector3();
const _relative = new Quaternion();
const _turn = new Quaternion();

/**
 * The wind gesture (INTERACTION_SPEC §10): pinch the key, twist the wrist, release to finish. The maths is in wind.ts.
 *  - Takes the key whose origin is within `grabRadius` of the index fingertip when the pinch starts, unless that hand is
 *    already holding something (a held part wins, INTERACTION_SPEC §18).
 *  - Twist is the wrist's rotation since the pinch, about the key's axis. The key's mesh turns with it.
 *  - Emits `wind` for each unit gained and `windEnd` on release. `WindKey.units` keeps the running total.
 * Hands only. Gaze-and-pinch winding ("each pinch adds one unit", INTERACTION_SPEC §10) is a separate input for the gaze task.
 */
export class WindSystem extends createSystem({
  keys: { required: [WindKey] },
  held: { required: [Grabbed] },
}) {
  private readonly sessions: Record<Hand, Session | null> = { left: null, right: null };

  update(): void {
    const frame = this.xrFrame as XRFrame | null; // typed non-null, but null outside an XR frame
    const space = this.xrManager.getReferenceSpace();
    for (let i = 0; i < HANDS.length; i++) {
      const hand = HANDS[i];
      const select = this.input.xr.getSelectState(hand);
      const session = this.sessions[hand];
      if (session) {
        // The key entity can be destroyed under a hand (level reset): end the grab instead of writing to a dead entity.
        const ended = select.end || !select.active || !session.key.active || !this.readWrist(frame, space, hand);
        if (ended) this.finish(hand, session);
        else this.step(hand, session);
      } else if (select.start && this.readWrist(frame, space, hand)) {
        this.tryStart(hand);
      }
    }
  }

  private readWrist(frame: XRFrame | null, space: XRReferenceSpace | null, hand: Hand): boolean {
    return readWristPose(this.input.xr, frame, space, this.player, hand, _wristPos, _wristQuat);
  }

  private tryStart(hand: Hand): void {
    if (this.holdsAPart(hand)) return;
    this.player.indexTipSpaces[hand].getWorldPosition(_tip);

    let nearest: Entity | undefined;
    let nearestDistance = Infinity;
    this.queries.keys.entities.forEach((entity) => {
      const object = entity.object3D;
      if (!object) return;
      object.getWorldPosition(_keyPos);
      const distance = _tip.distanceTo(_keyPos);
      const reach = Math.max(entity.getValue(WindKey, 'grabRadius') ?? 0, MIN_GRAB_RADIUS_M);
      if (distance <= reach && distance < nearestDistance) {
        nearest = entity;
        nearestDistance = distance;
      }
    });
    const key = nearest as Entity | undefined;
    const object = key?.object3D;
    if (!key || !object) return;

    const tracker = new WindTracker(key.getValue(WindKey, 'units') ?? 0, key.getValue(WindKey, 'maxUnits') ?? MAX_WIND_UNITS);
    if (tracker.capacity === 0) return; // already at the maximum

    const [ax, ay, az] = key.getVectorView(WindKey, 'axis');
    const localAxis = new Vector3(ax, ay, az);
    if (localAxis.lengthSq() < 1e-9) localAxis.set(0, 0, 1);
    localAxis.normalize();
    object.updateWorldMatrix(true, false);
    this.sessions[hand] = {
      key,
      object,
      tracker,
      localAxis,
      worldAxis: localAxis.clone().transformDirection(object.matrixWorld),
      startWrist: _wristQuat.clone(),
      startKey: object.quaternion.clone(),
    };
  }

  private step(hand: Hand, session: Session): void {
    // Rotation since the pinch, in the world frame, then its twist about the key's axis.
    _relative.copy(session.startWrist).invert().premultiply(_wristQuat);
    const { tracker } = session;
    const gained = tracker.update(twistAbout(_relative, session.worldAxis));

    // The key follows the wrist, up to the ratchet and the maximum.
    _turn.setFromAxisAngle(session.localAxis, tracker.keyAngle);
    session.object.quaternion.copy(session.startKey).multiply(_turn);

    if (gained > 0) {
      session.key.setValue(WindKey, 'units', tracker.units);
      interactionIntents.emit({ type: 'wind', key: session.key, units: tracker.units, gained, hand });
    }
  }

  private finish(hand: Hand, session: Session): void {
    this.sessions[hand] = null;
    interactionIntents.emit({
      type: 'windEnd',
      key: session.key,
      units: session.tracker.units,
      gained: session.tracker.gained,
      hand,
    });
  }

  /** Is this hand holding a part right now? Checked when a pinch starts: GrabSystem has already run this frame. */
  private holdsAPart(hand: Hand): boolean {
    const grab = this.world.getSystem(GrabSystem);
    if (!grab) return false;
    let holding = false;
    this.queries.held.entities.forEach((entity) => {
      if (grab.getHolderHand(entity) === hand) holding = true;
    });
    return holding;
  }
}
