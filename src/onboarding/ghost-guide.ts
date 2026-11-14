import { AssetManager } from '@iwsdk/core';
import { AdditiveBlending, Color, CylinderGeometry, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { LessonId } from '../game/content';
import { GhostPreview } from '../interaction/ghost';
import { interactionIntents } from '../interaction/intents';
import type { InteractionIntent } from '../interaction/intents';
import { HandRig } from './hand-rig';
import { hasSocketPulse, LESSON_GESTURE, lessonSeconds } from './lessons';
import type { Gesture } from './lessons';
import { makeSample, sampleScript } from './scripts';
import type { Variant } from './scripts';
import { OnboardingTracker } from './tracker';
import type { Cue } from './tracker';

/**
 * The ghost-hand guide (PRODUCT_SPEC F15, §15): draws what the tracker decides to show. Translucent cream-and-teal hands, built from the
 * game's own hand model (`HandRig`), demonstrate the pinch that carries a part to its socket, the wrist twist on the key, the poke of a
 * plaque, the carry of the finished machine and the palm-down X-ray, over the real scene (`scripts.ts` says exactly how); the part the hand
 * carries is a ghost of the part; the socket (or the thing to act on) pulses in lamp light. In gaze and ray mode the hand stays by the lap
 * and pinches, and the target pulses or a ray runs to it. It never moves a part or a hand of the player's, and it takes itself away the
 * moment a hand holds something or the gesture is done.
 *
 * Cost: one skinned mesh for the hand, two glowing spheres and a beam, all hidden unless a showing is running, plus a ghost of one part
 * while it is carried. Nothing is allocated per frame.
 */

/** What the guide asks of the game; `host.ts` answers from the game's own state. */
export interface GuideHost {
  /** The lesson the situation calls for now, or null (nothing to teach, or a panel is up). Runs every frame. */
  lesson(): LessonId | null;
  /** A hand holds a part or the machine. Runs every frame. */
  busy(): boolean;
  /** Finds what the hand points at for `lesson` and writes it into `out`. False: nothing to show right now. Runs when a showing starts. */
  resolve(lesson: LessonId, variant: Variant, out: GuideTargets): boolean;
}

export interface GuideTargets {
  /** The thing the gesture is about (world space). */
  from: Vector3;
  /** Where a carry ends; the same point as `from` for the other gestures. */
  to: Vector3;
  /** The key's turning axis (world space, unit). */
  axis: Vector3;
  /** The player's head, filled in by the guide. */
  head: Vector3;
  /** The part whose ghost the hand carries, or null. */
  ghostSource: Object3D | null;
  /** Size of the pulse at `from` and at `to`, metres. */
  radius: number;
  toRadius: number;
}

export const makeTargets = (): GuideTargets => ({ from: new Vector3(), to: new Vector3(), axis: new Vector3(0, 0, 1), head: new Vector3(), ghostSource: null, radius: 0.03, toRadius: 0.03 });

export interface GuideOptions {
  /** The world scene: the guide's objects are in world space, unscaled by the table. */
  scene: Object3D;
  host: GuideHost;
  tracker: OnboardingTracker;
  /** Writes the head's world position into `out`. */
  head: (out: Vector3) => Vector3;
  /** Which demonstration to give: the player's hands reach, gaze and ray mode only pinch. */
  variant: () => Variant;
  /** The player did what a lesson shows: save it. */
  onLearned: (lesson: LessonId) => void;
  /** Keeps the 2D page rendering while a showing runs. */
  keepAwake?: () => void;
}

const LAMP = 0xffc66d; // warm lamp glow (CLAUDE.md §8)
const CREAM_TEAL = 0xcfe6da; // cream (#F2E6CF) cooled towards deep teal (#1F5C5C): a hand that is clearly not the player's
const BEAM = 0x6fc3b8;
const HAND_OPACITY = 0.55;
const _anchor = new Vector3();
const _quat = new Quaternion();
const _dir = new Vector3();
const _start = new Vector3();
const Y_AXIS = new Vector3(0, 1, 0);

export class GhostGuide {
  readonly tracker: OnboardingTracker;
  private readonly targets = makeTargets();
  private readonly sample = makeSample();
  private readonly handMaterial = new MeshBasicMaterial({ color: new Color(CREAM_TEAL), transparent: true, opacity: HAND_OPACITY, depthWrite: false });
  private readonly pulses: Mesh[];
  private readonly beam: Mesh;
  private rig: HandRig | null = null;
  private preview: GhostPreview | null = null;
  private variant: Variant = 'hands';
  private gesture: Gesture = 'poke';
  private wasBusy = false;
  private wasShowing = false;
  private readonly unsubscribe: () => void;

  constructor(private readonly opt: GuideOptions) {
    this.tracker = opt.tracker;
    const pulse = (): Mesh => {
      const mesh = new Mesh(
        new SphereGeometry(1, 14, 10),
        new MeshBasicMaterial({ color: new Color(LAMP), transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: AdditiveBlending }),
      );
      mesh.name = 'GhostPulse';
      mesh.renderOrder = 12;
      mesh.raycast = () => {}; // a cue is never a pointer target
      mesh.visible = false;
      return mesh;
    };
    this.pulses = [pulse(), pulse()];
    this.beam = new Mesh(
      new CylinderGeometry(0.0015, 0.0015, 1, 6).translate(0, 0.5, 0),
      new MeshBasicMaterial({ color: new Color(BEAM), transparent: true, opacity: 0.5, depthWrite: false, blending: AdditiveBlending }),
    );
    this.beam.name = 'GhostBeam';
    this.beam.renderOrder = 11;
    this.beam.raycast = () => {};
    this.beam.visible = false;
    opt.scene.add(...this.pulses, this.beam);
    this.unsubscribe = interactionIntents.subscribe((intent) => this.onIntent(intent));
  }

  /** Gives the guide its hand (loaded after start-up). Until then it shows the pulses only. */
  setHand(rig: HandRig): void {
    this.rig = rig;
    rig.setMaterial(this.handMaterial);
    rig.root.name = 'GhostHand';
    rig.root.visible = false;
    rig.root.renderOrder = 10;
    rig.root.traverse((node) => {
      node.renderOrder = 10;
      node.raycast = () => {};
    });
    this.opt.scene.add(rig.root);
  }

  /** The cue on show, for QA and the tests. */
  state(): { lesson: LessonId; kind: string; t: number; variant: Variant; hand: boolean; pulses: number } | null {
    const cue = this.tracker.cue;
    if (!cue) return null;
    return { lesson: cue.lesson, kind: cue.kind, t: cue.t, variant: this.variant, hand: this.rig?.root.visible === true, pulses: this.pulses.filter((p) => p.visible).length };
  }

  /** The player did the gesture of `lesson` (the game's flow events call this). */
  complete(lesson: LessonId): void {
    if (this.tracker.complete(lesson)) this.opt.onLearned(lesson);
  }

  /** A restart cleared the save: the lessons are new again. */
  reset(learned: readonly LessonId[]): void {
    this.tracker.reset(learned);
    this.hide();
  }

  update(dt: number): void {
    const busy = this.opt.host.busy();
    const cue = this.tracker.update(dt, this.opt.host.lesson(), busy);
    this.wasBusy = busy;
    if (!cue) return this.hide();
    if (cue.fresh && !this.begin(cue)) {
      this.tracker.abort();
      return this.hide();
    }
    this.show(cue);
  }

  dispose(): void {
    this.unsubscribe();
    this.hide();
    for (const mesh of [...this.pulses, this.beam]) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    this.rig?.root.removeFromParent();
    this.handMaterial.dispose();
  }

  private onIntent(intent: InteractionIntent): void {
    switch (intent.type) {
      case 'snapped':
        // A part the hand let go of (a hand held something a frame ago): the player did it. Parts the game seats itself are not.
        if (this.wasBusy) this.complete('grab');
        this.tracker.progress();
        break;
      case 'unsnapped':
      case 'rejected':
        this.tracker.progress();
        break;
      case 'wind':
      case 'windEnd':
        this.complete('wind');
        this.tracker.progress();
        break;
      case 'xray':
        if (intent.active) this.complete('xray');
        break;
    }
  }

  /** A showing starts: find the targets, and make the ghost of the part the hand will carry. */
  private begin(cue: Cue): boolean {
    this.variant = this.opt.variant();
    this.gesture = LESSON_GESTURE[cue.lesson];
    this.opt.head(this.targets.head);
    this.endPreview();
    if (!this.opt.host.resolve(cue.lesson, this.variant, this.targets)) return false;
    const source = this.targets.ghostSource;
    if (source && this.gesture === 'carry') this.preview = new GhostPreview(source, this.opt.scene);
    return true;
  }

  private show(cue: Cue): void {
    this.opt.keepAwake?.();
    const { targets, sample } = this;
    const length = lessonSeconds(cue.lesson);
    sampleScript(this.variant, this.gesture, cue.t, targets, sample);

    const rig = this.rig;
    if (rig && sample.alpha > 0) {
      rig.pose(sample.shape);
      rig.root.quaternion.copy(sample.quat);
      _anchor.copy(rig.anchorOf(sample.anchor)).applyQuaternion(sample.quat);
      rig.root.position.copy(sample.hand).sub(_anchor);
      this.handMaterial.opacity = HAND_OPACITY * sample.alpha;
      rig.root.visible = true;
    } else if (rig) rig.root.visible = false;

    if (this.preview) {
      if (sample.carrying) {
        this.targets.ghostSource?.getWorldQuaternion(_quat);
        this.preview.show(sample.carried, _quat, true);
      } else this.preview.hide();
    }

    // After an idle showing the hand is gone but the pulse stays until the player acts (INTERACTION_SPEC §17).
    let from = sample.pulseFrom;
    let to = sample.pulseTo;
    if (cue.kind === 'idle' && cue.t >= length) {
      const standing = 0.775 + 0.225 * Math.sin(cue.t * 7);
      if (hasSocketPulse(cue.lesson)) to = standing;
      else from = standing;
    }
    this.pulse(0, targets.from, from, targets.radius);
    this.pulse(1, targets.to, to, targets.toRadius);

    // Ray mode: a beam from the hand to what it aims at.
    const beam = this.beam;
    beam.visible = sample.beam && sample.alpha > 0 && rig !== null;
    if (beam.visible) {
      _start.copy(sample.hand);
      _dir.copy(sample.focus).sub(_start);
      const length3 = _dir.length();
      beam.visible = length3 > 0.02;
      beam.position.copy(_start);
      beam.quaternion.setFromUnitVectors(Y_AXIS, _dir.divideScalar(length3 || 1));
      beam.scale.set(1, length3, 1);
      (beam.material as MeshBasicMaterial).opacity = 0.5 * sample.alpha;
    }
    this.wasShowing = true;
  }

  private pulse(index: number, at: Vector3, intensity: number, radius: number): void {
    const mesh = this.pulses[index];
    mesh.visible = intensity > 0.01;
    if (!mesh.visible) return;
    mesh.position.copy(at);
    mesh.scale.setScalar(radius * (0.75 + 0.4 * intensity));
    (mesh.material as MeshBasicMaterial).opacity = 0.5 * intensity;
  }

  private endPreview(): void {
    this.preview?.dispose();
    this.preview = null;
  }

  private hide(): void {
    if (!this.wasShowing) return;
    this.wasShowing = false;
    if (this.rig) this.rig.root.visible = false;
    for (const mesh of this.pulses) mesh.visible = false;
    this.beam.visible = false;
    this.endPreview();
  }
}

/** Loads the hand model from the game's own origin (ADR-025: no third-party request) and rigs it. Null when it cannot, and the guide then pulses only. */
export async function loadGhostHand(): Promise<HandRig | null> {
  const key = 'wu-ghost-hand-right';
  try {
    await AssetManager.loadGLTF(`${import.meta.env.BASE_URL}assets/xr/generic-hand/right.glb`, key);
    const gltf = AssetManager.getGLTF(key);
    if (!gltf) return null;
    const rig = new HandRig(gltf.scene);
    if (!rig.ready) {
      console.warn(`[wound-up] the ghost hand model lacks joints: ${rig.missing.join(', ')}`);
      return null;
    }
    return rig;
  } catch (error) {
    console.warn('[wound-up] the ghost hand did not load; the lessons will pulse without it.', error);
    return null;
  }
}
