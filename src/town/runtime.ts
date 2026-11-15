/**
 * The town's per-frame state and its events, with no ECS: `TownSystem` calls `update` once a frame, and Node tests drive it
 * directly. It owns the wake field and the shader uniforms, steps every registered machine from its solver result, plays the
 * Music Box melody from the cylinder's angle, runs Otto's kneading and the town's ambience (smoke, oven glow, pennants), and turns
 * "a machine snapped onto its plot" into a wake.
 * Nothing here allocates per frame.
 */
import { Vector3 } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';
import type { TownAudio } from '../audio/engine';
import { refreshColliderFloor } from '../interaction';
import { notesBetween } from '../audio/notes';
import type { MelodyNote } from '../audio/notes';
import { MACHINE_PLOT } from '../game/content';
import type { MachineId, PlotId } from '../game/content';
import type { InteractionIntent } from '../interaction/intents';
import { UNSNAP_DISTANCE_M } from '../interaction/snap';
import { disposeBaked } from './bake';
import { machineOfPlot, MAX_WAKE_SOURCES, plotIdFromSocketName } from './layout';
import { approach, SPIN_EASE_S, stepRig, stepScaler } from './motion';
import type { MachineRig, Scaler } from './motion';
import { plotSocket } from './scene';
import type { Town } from './scene';
import { WakeField } from './wake';
import type { WakeUniforms } from './wake-shader';
import { XRAY_SHELL, XRayView, xrayMovers } from './xray-view';

/** What the game layer wants to hear about the town. All optional. */
export interface TownEvents {
  /** A machine was released onto its own plot. The game layer records it (`GameSession.place`). */
  placed?(machine: MachineId, plot: PlotId, node: Object3D): void;
  /** A machine was lifted off its plot. */
  lifted?(machine: MachineId, plot: PlotId, node: Object3D): void;
  /** A plot's wake has just started. Not called for plots restored from a save. */
  woke?(plot: PlotId): void;
}

const TAU = Math.PI * 2;
const _at = new Vector3();
const _to = new Vector3();
/** Level of the Carousel's copy of the tune against the Music Box's own. */
const CAROUSEL_MELODY_LEVEL = 0.5;
/** A restored machine that is back this close to its plot (real metres) counts as placed again. */
const HOME_DISTANCE_M = 0.01;
/** Time constant of Otto starting to knead once the Bakery has woken, seconds. */
const KNEAD_EASE_S = SPIN_EASE_S;
/** Time constant of the change between day and night, seconds (settled in about three). */
const NIGHT_EASE_S = 0.8;

export class TownRuntime {
  readonly wake = new WakeField();
  /** What X-ray does to the picture (xray-view.ts): every registered rig is a machine it can open, and the game adds the bench machine. */
  readonly xray = new XRayView();
  private readonly xrayOf = new Map<MachineRig, () => void>();
  private readonly rigs: MachineRig[] = [];
  private readonly scalers: Scaler[] = [];
  /** Machines standing on a plot: they follow the town's scale when the stage changes it (stand to table, a new placement). */
  private readonly seated: Object3D[] = [];
  /**
   * Machines `placeRig` stood on their plot (a saved game): no snap seated them, so nothing else holds them on the socket or
   * sees them lifted or put back. The runtime does that, with the interaction layer's 3 cm rule, until a snap takes them over.
   * `away`: lifted off, in the hand or easing back to the pose it was made carriable at (GrabFeedbackSystem).
   */
  private readonly parked: Array<{ rig: MachineRig; plot: PlotId; socket: Object3D; away: boolean }> = [];
  private seenScale = Number.NaN;
  private dirty = true;
  /** 0 day to 1 night, eased towards `nightTarget`; the shader's `uWuNight`, the lamp lights and (TownSystem) the room lights follow it. */
  private nightAmount = 0;
  private nightTarget = 0;
  private lightsMoving = false;
  /** The smoke, the oven glow or a pennant is showing (ambience.ts): it moves for as long as it does, so the town is busy. */
  private ambienceShowing = false;
  private melodyLevel = 1;
  private readonly playNote = (note: MelodyNote): void => this.audio?.pluck(note.midi, note.velocity, this.melodyLevel);

  constructor(
    readonly town: Town,
    private readonly uniforms: WakeUniforms,
    private readonly audio: TownAudio | null = null,
    readonly events: TownEvents = {},
  ) {}

  /** The scale the town group has now (StageSystem sets it from the table placement). A machine on its plot takes it. */
  get townScale(): number {
    return this.town.group.scale.x;
  }

  /** Registers a finished machine for animation. */
  addRig(rig: MachineRig): void {
    rig.audio = this.audio;
    if (this.rigs.includes(rig)) return;
    this.rigs.push(rig);
    // The lens opens the machine in the hand; one standing on its plot is opened by the palm only.
    this.xrayOf.set(
      rig,
      this.xray.add({ root: rig.root, prefixes: XRAY_SHELL[rig.machineId] ?? [], lens: () => this.isCarried(rig), moving: () => xrayMovers(rig) }),
    );
  }

  removeRig(rig: MachineRig): void {
    const i = this.rigs.indexOf(rig);
    if (i >= 0) this.rigs.splice(i, 1);
    this.xrayOf.get(rig)?.();
    this.xrayOf.delete(rig);
    this.release(rig.root);
    disposeBaked(rig); // the machine is gone for good: its merged geometries go with it
  }

  /** How far the town is into the night, 0 (day) to 1 (night). */
  get night(): number {
    return this.nightAmount;
  }

  /** Day or night (the saved `night` setting, PRODUCT_SPEC F16). The change eases over a few seconds; `instant` skips it (a game that loads at night). */
  setNight(on: boolean, instant = false): void {
    this.nightTarget = on ? 1 : 0;
    if (instant) {
      this.nightAmount = this.nightTarget;
      this.uniforms.uWuNight.value = this.nightAmount;
    }
  }

  /** Not standing on a plot: on the bench or in the hand. */
  private isCarried(rig: MachineRig): boolean {
    if (this.seated.includes(rig.root)) return false;
    for (let i = 0; i < this.parked.length; i++) if (this.parked[i].rig === rig) return false;
    return true;
  }

  /** True while anything the town shows is changing: a ripple, a machine running or easing, a scale ease, the night, X-ray, Otto. */
  get busy(): boolean {
    if (this.wake.active || this.scalers.length > 0 || this.nightAmount !== this.nightTarget || this.lightsMoving || this.ambienceShowing || this.xray.busy) return true;
    const knead = this.town.knead;
    if (knead && knead.action.timeScale > 0) return true;
    for (let i = 0; i < this.rigs.length; i++) if (this.rigs[i].running || this.rigs[i].speed > 0) return true;
    return false;
  }

  /** Forgets that `node` stands on a plot: its seat, its scale target and, for a restored machine, its watch. */
  private release(node: Object3D): void {
    const i = this.seated.indexOf(node);
    if (i >= 0) this.seated.splice(i, 1);
    const p = this.parked.findIndex((e) => e.rig.root === node);
    if (p >= 0) this.parked.splice(p, 1);
    const s = this.scalers.findIndex((e) => e.node === node);
    if (s >= 0) this.scalers.splice(s, 1);
  }

  rigOf(machine: MachineId): MachineRig | undefined {
    return this.rigs.find((r) => r.machineId === machine);
  }

  /**
   * Puts a finished machine on its own plot (a saved machine reappearing when the game loads), the way a carried one stands
   * there: a child of the stage root at the town scale, so it can be lifted and carried again. Returns false when the town
   * ground has no socket for the plot. Does not wake the plot: `restore` does that.
   */
  placeRig(rig: MachineRig): boolean {
    const plot = MACHINE_PLOT[rig.machineId];
    const socket = plotSocket(this.town, plot);
    if (!socket) return false;
    rig.root.quaternion.identity();
    rig.restored = true;
    this.standOn(rig.root, socket);
    if (!this.seated.includes(rig.root)) this.seated.push(rig.root);
    if (!this.parked.some((e) => e.rig === rig)) this.parked.push({ rig, plot, socket, away: false });
    this.addRig(rig);
    return true;
  }

  /** Puts `root` on `socket` at the town scale, as a child of the stage root (or of the town group when there is none). */
  private standOn(root: Object3D, socket: Object3D): void {
    const home = this.town.group.parent;
    this.town.group.updateWorldMatrix(true, true);
    if (home) {
      if (root.parent !== home) home.add(root);
      home.worldToLocal(socket.getWorldPosition(_at));
      root.position.copy(_at);
      root.scale.setScalar(this.townScale);
    } else {
      if (root.parent !== this.town.group) this.town.group.add(root); // no stage root (a test): the group's own scale applies
      root.position.copy(socket.position);
      root.scale.setScalar(1);
    }
  }

  /** Starts the wake of `plot` (or finishes it at once with `instant`). False when it was already awake. */
  wakePlot(plot: PlotId, instant = false): boolean {
    if (!this.wake.wake(plot, instant)) return false;
    this.dirty = true;
    if (!instant) {
      this.audio?.chime(plot);
      this.events.woke?.(plot);
    }
    return true;
  }

  /** Restores a save: the plots are simply awake, with no ripple and no chime. */
  restore(plots: readonly PlotId[]): void {
    for (const plot of plots) this.wakePlot(plot, true);
  }

  /** Back to the frozen town. Machines are the caller's to remove. */
  reset(): void {
    this.wake.reset();
    this.dirty = true;
  }

  /** The interaction layer's `snapped` and `unsnapped` of a plot socket. Other intents and sockets are ignored. */
  handleIntent(intent: InteractionIntent): void {
    if (intent.type !== 'snapped' && intent.type !== 'unsnapped') return;
    const plot = plotIdFromSocketName(intent.socketName);
    const node = intent.part.object3D;
    if (!plot || !node) return;
    const machine = machineOfPlot(plot);
    if (intent.type === 'snapped') {
      const p = this.parked.findIndex((e) => e.rig.root === node);
      if (p >= 0) this.parked.splice(p, 1); // SocketSnapSystem holds it on the socket from here
      if (!this.seated.includes(node)) this.seated.push(node);
      this.scaleTo(node, this.townScale);
      this.wakePlot(plot);
      this.events.placed?.(machine, plot, node);
    } else {
      const i = this.seated.indexOf(node);
      if (i >= 0) this.seated.splice(i, 1);
      this.scaleTo(node, 1);
      this.events.lifted?.(machine, plot, node);
    }
  }

  private scaleTo(node: Object3D, target: number): void {
    const existing = this.scalers.find((s) => s.node === node);
    if (existing) existing.target = target;
    else this.scalers.push({ node, target });
  }

  /** One frame. `time` is seconds since the start, for the lamps. */
  update(dt: number, time: number): void {
    if (this.wake.update(dt)) this.dirty = true;
    if (this.dirty) {
      const wakeUniforms = this.uniforms.uWuWake.value;
      for (let i = 0; i < MAX_WAKE_SOURCES; i++) wakeUniforms[i].set(this.wake.radius[i], this.wake.glow[i]);
      this.dirty = false;
    }
    const scale = this.townScale;
    if (scale !== this.seenScale) {
      this.seenScale = scale;
      for (let i = 0; i < this.seated.length; i++) this.scaleTo(this.seated[i], scale);
      for (let i = 0; i < this.parked.length; i++) {
        const parked = this.parked[i];
        if (!parked.away) this.standOn(parked.rig.root, parked.socket); // the plot moved with the scale
      }
    }
    if (this.nightAmount !== this.nightTarget) {
      this.nightAmount = Math.abs(this.nightTarget - this.nightAmount) < 1e-3 ? this.nightTarget : approach(this.nightAmount, this.nightTarget, dt, NIGHT_EASE_S);
      this.uniforms.uWuNight.value = this.nightAmount;
    }
    this.lightsMoving = this.town.dressing?.update(dt, this.nightAmount, this.wake) ?? false;
    this.watchParked();
    this.town.group.updateWorldMatrix(true, false);
    this.uniforms.uWuToTown.value.copy(this.town.group.matrixWorld).invert();

    for (let i = 0; i < this.rigs.length; i++) {
      const rig = this.rigs[i];
      stepRig(rig, dt, time);
      this.playMelody(rig);
    }
    for (let i = this.scalers.length - 1; i >= 0; i--) {
      const scaler = this.scalers[i];
      if (!stepScaler(scaler, dt)) continue;
      this.scalers.splice(i, 1);
      refreshColliderFloor(scaler.node); // the grab colliders keep their 1.2 cm minimum at the new size
    }
    this.knead(dt);
    this.ambienceShowing = this.town.ambience.update(dt, time, this.wake, this.nightAmount, this.windmillSpeed());
    this.xray.update(dt);
  }

  /** The eased run factor of the Windmill in the town, 0 when it is not there. A loop, not `rigOf`, so a frame allocates nothing. */
  private windmillSpeed(): number {
    for (let i = 0; i < this.rigs.length; i++) if (this.rigs[i].machineId === 'windmill') return this.rigs[i].speed;
    return 0;
  }

  /**
   * A restored machine pulled more than 3 cm off its plot is lifted: bench size again, and the game layer is told. Back within
   * 1 cm of the plot (it eased home, or the hand returned it) it is placed again at the town scale.
   */
  private watchParked(): void {
    for (let i = 0; i < this.parked.length; i++) {
      const parked = this.parked[i];
      const root = parked.rig.root;
      parked.socket.getWorldPosition(_at);
      root.getWorldPosition(_to);
      const apart = _at.distanceTo(_to);
      if (!parked.away && apart > UNSNAP_DISTANCE_M) {
        parked.away = true;
        const seat = this.seated.indexOf(root);
        if (seat >= 0) this.seated.splice(seat, 1);
        this.scaleTo(root, 1);
        this.events.lifted?.(parked.rig.machineId, parked.plot, root);
      } else if (parked.away && apart <= HOME_DISTANCE_M) {
        parked.away = false;
        if (!this.seated.includes(root)) this.seated.push(root);
        this.scaleTo(root, this.townScale);
        this.events.placed?.(parked.rig.machineId, parked.plot, root);
      }
    }
  }

  /** The cylinder (or the Carousel's platform) is a music-box cylinder: the pins that pass the comb since last frame ring. */
  private playMelody(rig: MachineRig): void {
    const rotor = rig.melody;
    if (!rotor || rig.speed === 0) return;
    const turns = rotor.theta / TAU;
    if (turns <= rig.melodyAt) return;
    this.melodyLevel = rig.machineId === 'carousel' ? CAROUSEL_MELODY_LEVEL : 1;
    notesBetween(rig.melodyAt, turns, this.playNote);
    rig.melodyAt = turns;
  }

  /** Otto kneads from the moment the Windmill's wake has reached the Bakery (settled) and eases to a stop if it is reset. */
  private knead(dt: number): void {
    const k = this.town.knead;
    if (!k) return;
    const awake = this.wake.isSettled('plot_windmill');
    k.action.timeScale = approach(k.action.timeScale, awake ? 1 : 0, dt, KNEAD_EASE_S);
    if (k.action.timeScale < 1e-3) k.action.timeScale = 0;
    else k.mixer.update(dt);
  }
}
