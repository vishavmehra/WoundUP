import { createSystem, GrabSystem, Grabbed, OneHandGrabbable, Quaternion, Vector3 } from '@iwsdk/core';
import type { Entity, Object3D } from '@iwsdk/core';
import { MIN_GRAB_RADIUS_M } from './glb-reader.js';
import { HANDS, readWristPose } from './hand-pose.js';
import type { Hand } from './hand-pose.js';
import { interactionIntents } from './intents.js';
import { SnappedTo, WindKey } from './components.js';
import { isGazeModeOn, isWindTap } from './gaze-state.js';
import { keyPulledOut, MAX_WIND_UNITS, twistAbout, WindTracker } from './wind.js';

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
  /** Where the index fingertip was when the pinch began, to measure a pull along the axis. */
  tipStart: Vector3;
}

const _wristPos = new Vector3();
const _wristQuat = new Quaternion();
const _tip = new Vector3();
const _keyPos = new Vector3();
const _relative = new Quaternion();
const _turn = new Quaternion();
const _pull = new Vector3();

/**
 * The wind gesture (INTERACTION_SPEC §10): pinch the key, twist the wrist, release to finish. The maths is in wind.ts.
 *  - Takes the key whose origin is within `grabRadius` of the index fingertip when the pinch starts, unless that hand is
 *    already holding another part (a held part wins, INTERACTION_SPEC §18). The key may itself be what the pinch took: IWSDK's
 *    near grab claims a seated key like any part (BUG-1), so a pinch on the key is a wind pinch.
 *  - A seated key does not follow the hand (its grab handle neither moves nor turns it, see `holdInPlace`): the wrist winds it, and
 *    only a deliberate pull of the fingertip along the key's axis takes it out (`keyPulledOut`, INTERACTION_SPEC §9). Then the key
 *    is a held part again, carried by the pinch.
 *  - Twist is the wrist's rotation since the pinch, about the key's axis. The key's mesh turns with it.
 *  - Emits `wind` for each unit gained and `windEnd` on release. `WindKey.units` keeps the running total.
 * Gaze mode (INTERACTION_SPEC §10): no twist. A pinch on the key that ends within half a second without pulling it out is a tap, and
 * a tap adds one unit; the wind counter and the Run plaque are the UI's. Holding the pinch and pulling takes the key out instead.
 * Hands: the key is the near-grab part of a pinch and a wrist twist, as above.
 */
export class WindSystem extends createSystem({
  keys: { required: [WindKey] },
  held: { required: [Grabbed] },
  heldKeys: { required: [WindKey, Grabbed] },
  seatedKeys: { required: [WindKey, SnappedTo, OneHandGrabbable] }, // a seated key a hand can near-grab (gaze mode's ray grab is another component)
}) {
  private readonly sessions: Record<Hand, Session | null> = { left: null, right: null };
  /** Gaze mode: when, where and by which hand each key was taken by a pinch. */
  private readonly taps = new Map<Entity, { at: number; position: Vector3; hand: Hand }>();
  private clock = 0;

  init(): void {
    this.queries.heldKeys.subscribe('qualify', (entity) => {
      const object = entity.object3D;
      if (!object || !isGazeModeOn()) return;
      // Asked now, while the grab handle still holds the pointer: by the time Grabbed goes away it no longer says who held it.
      this.taps.set(entity, { at: this.clock, position: object.getWorldPosition(new Vector3()), hand: this.holderOf(entity) });
    });
    this.queries.heldKeys.subscribe('disqualify', (entity) => this.endTap(entity));
    this.queries.seatedKeys.subscribe('qualify', (entity) => this.holdInPlace(entity, true));
    this.queries.seatedKeys.subscribe('disqualify', (entity) => this.holdInPlace(entity, false));
    this.queries.seatedKeys.entities.forEach((entity) => this.holdInPlace(entity, true));
  }

  /**
   * A seated key that hands pinch (near grab, `OneHandGrabbable`) is held but not moved: the grab handle reads `translate` and `rotate`
   * each time it moves the object, so switching them off leaves the key in its socket while the wrist winds it. They come back on when
   * the key leaves the socket. Gaze mode's ray grab (`DistanceGrabbable`) is not touched: there a tap winds (see `endTap`).
   */
  private holdInPlace(entity: Entity, on: boolean): void {
    if (!entity.active || !entity.hasComponent(OneHandGrabbable)) return;
    entity.setValue(OneHandGrabbable, 'translate', !on);
    entity.setValue(OneHandGrabbable, 'rotate', !on);
  }

  /** The pinch on a key ended: wind one unit when it was a tap. */
  private endTap(entity: Entity): void {
    const tap = this.taps.get(entity);
    this.taps.delete(entity);
    const object = entity.object3D;
    if (!tap || !object || !entity.active) return;
    const units = entity.getValue(WindKey, 'units') ?? 0;
    if (units >= (entity.getValue(WindKey, 'maxUnits') ?? MAX_WIND_UNITS)) return;
    if (!isWindTap(this.clock - tap.at, object.getWorldPosition(_tip).distanceTo(tap.position))) return;
    const { hand } = tap;
    entity.setValue(WindKey, 'units', units + 1);
    interactionIntents.emit({ type: 'wind', key: entity, units: units + 1, gained: 1, hand });
    interactionIntents.emit({ type: 'windEnd', key: entity, units: units + 1, gained: 1, hand });
  }

  /** The hand that pinched the key, as GrabSystem reports it; the right hand when it cannot say. */
  private holderOf(entity: Entity): Hand {
    return this.world.getSystem(GrabSystem)?.getHolderHand(entity) ?? 'right';
  }

  update(delta: number): void {
    this.clock += delta;
    if (isGazeModeOn()) return; // the twist is for hands; in gaze mode a tap winds (see endTap)
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
    const { holdsOther, heldKey } = this.heldBy(hand);
    if (holdsOther) return;
    this.player.indexTipSpaces[hand].getWorldPosition(_tip);

    // The key this very pinch took, whatever its distance from the fingertip (the grab decided), else the nearest one within reach.
    let nearest: Entity | undefined = heldKey;
    let nearestDistance = Infinity;
    if (!nearest) {
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
    }
    const key = nearest as Entity | undefined;
    const object = key?.object3D;
    if (!key || !object) return;

    const tracker = new WindTracker(key.getValue(WindKey, 'units') ?? 0, key.getValue(WindKey, 'maxUnits') ?? MAX_WIND_UNITS);
    // Already at the maximum: nothing to wind, but a key the pinch took can still be pulled out, so it keeps a session (without `windEnd`).
    if (tracker.capacity === 0 && !heldKey) return;

    const [ax, ay, az] = key.getVectorView(WindKey, 'axis');
    const localAxis = new Vector3(ax, ay, az);
    if (localAxis.lengthSq() < 1e-9) localAxis.set(0, 0, 1);
    localAxis.normalize();
    object.updateWorldMatrix(true, false);
    // A grab that began before the key was seated, or a swapped grab component, must not carry the key: hold it in the socket now.
    this.holdInPlace(key, key.hasComponent(SnappedTo));
    this.sessions[hand] = {
      key,
      object,
      tracker,
      localAxis,
      worldAxis: localAxis.clone().transformDirection(object.matrixWorld),
      startWrist: _wristQuat.clone(),
      startKey: object.quaternion.clone(),
      tipStart: _tip.clone(),
    };
  }

  private step(hand: Hand, session: Session): void {
    // A seated key the hand holds comes out when the fingertip is pulled far enough along the key's axis (INTERACTION_SPEC §9).
    if (session.key.hasComponent(Grabbed)) {
      this.player.indexTipSpaces[hand].getWorldPosition(_tip);
      _pull.copy(_tip).sub(session.tipStart);
      if (keyPulledOut(_pull.dot(session.worldAxis))) {
        this.pullOut(hand, session, _pull);
        return;
      }
    }
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
    if (session.tracker.capacity === 0) return; // a full key was only held: nothing was wound
    interactionIntents.emit({
      type: 'windEnd',
      key: session.key,
      units: session.tracker.units,
      gained: session.tracker.gained,
      hand,
    });
  }

  /**
   * The key leaves its socket with the pinching hand. It is put where the hand has carried it (the pull is the fingertip's travel
   * since the pinch), un-turned, and its grab handle starts following the hand from there. Removing `SnappedTo` frees the socket and
   * makes SocketSnapSystem emit `unsnapped`; from here on it is an ordinary held part (let go in the air, it returns to the tray).
   */
  private pullOut(hand: Hand, session: Session, pull: Vector3): void {
    const { key, object } = session;
    object.quaternion.copy(session.startKey);
    if (object.parent) {
      object.getWorldPosition(_keyPos).add(pull);
      object.parent.worldToLocal(_keyPos);
      object.position.copy(_keyPos);
    }
    this.finish(hand, session);
    if (key.hasComponent(SnappedTo)) key.removeComponent(SnappedTo);
    // The handle measures the hand from where the grab began: start again from here, or the key would jump back to the socket.
    const handle = key.getComponents().find((c) => c.id === 'Handle');
    const store = handle ? (key.getValue(handle, 'instance') as { save?(): void } | null) : null;
    store?.save?.();
  }

  /**
   * What this hand is holding right now (GrabSystem has already run this frame): a winding key, or another part. A pinch on a
   * seated key near-grabs it, so the key is no reason to refuse; another part in the hand is (INTERACTION_SPEC §18).
   */
  private heldBy(hand: Hand): { holdsOther: boolean; heldKey: Entity | undefined } {
    const result: { holdsOther: boolean; heldKey: Entity | undefined } = { holdsOther: false, heldKey: undefined };
    const grab = this.world.getSystem(GrabSystem);
    if (!grab) return result;
    this.queries.held.entities.forEach((entity) => {
      if (grab.getHolderHand(entity) !== hand) return;
      if (entity.hasComponent(WindKey)) result.heldKey = entity;
      else result.holdsOther = true;
    });
    return result;
  }
}
