/**
 * The town's per-frame state and its events, with no ECS: `TownSystem` calls `update` once a frame, and Node tests drive it
 * directly. It owns the wake field and the shader uniforms, steps every registered machine from its solver result, plays the
 * Music Box melody from the cylinder's angle, runs Otto's kneading, and turns "a machine snapped onto its plot" into a wake.
 * Nothing here allocates per frame.
 */
import type { Object3D } from '@iwsdk/core';
import type { TownAudio } from '../audio/engine';
import { notesBetween } from '../audio/notes';
import type { MelodyNote } from '../audio/notes';
import { MACHINE_PLOT } from '../game/content';
import type { MachineId, PlotId } from '../game/content';
import type { InteractionIntent } from '../interaction/intents';
import { machineOfPlot, MAX_WAKE_SOURCES, plotIdFromSocketName } from './layout';
import { approach, SPIN_EASE_S, stepRig, stepScaler } from './motion';
import type { MachineRig, Scaler } from './motion';
import { plotSocket } from './scene';
import type { Town } from './scene';
import { WakeField } from './wake';
import type { WakeUniforms } from './wake-shader';

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
/** Level of the Carousel's copy of the tune against the Music Box's own. */
const CAROUSEL_MELODY_LEVEL = 0.5;
/** Time constant of Otto starting to knead once the Bakery has woken, seconds. */
const KNEAD_EASE_S = SPIN_EASE_S;

export class TownRuntime {
  readonly wake = new WakeField();
  private readonly rigs: MachineRig[] = [];
  private readonly scalers: Scaler[] = [];
  private dirty = true;
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
    if (!this.rigs.includes(rig)) this.rigs.push(rig);
  }

  removeRig(rig: MachineRig): void {
    const i = this.rigs.indexOf(rig);
    if (i >= 0) this.rigs.splice(i, 1);
  }

  rigOf(machine: MachineId): MachineRig | undefined {
    return this.rigs.find((r) => r.machineId === machine);
  }

  /**
   * Puts a finished machine on its own plot as a child of the town group, which applies the town scale (a saved machine
   * reappearing when the game loads). Returns false when the town ground has no socket for the plot. Does not wake the plot:
   * `restore` does that.
   */
  placeRig(rig: MachineRig): boolean {
    const socket = plotSocket(this.town, MACHINE_PLOT[rig.machineId]);
    if (!socket) return false;
    rig.root.position.copy(socket.position); // the ground GLB sits at the town origin
    rig.root.quaternion.identity();
    rig.root.scale.setScalar(1);
    this.town.group.add(rig.root);
    this.addRig(rig);
    return true;
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
      this.scaleTo(node, this.townScale);
      this.wakePlot(plot);
      this.events.placed?.(machine, plot, node);
    } else {
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
    this.town.group.updateWorldMatrix(true, false);
    this.uniforms.uWuToTown.value.copy(this.town.group.matrixWorld).invert();

    for (let i = 0; i < this.rigs.length; i++) {
      const rig = this.rigs[i];
      stepRig(rig, dt, time);
      this.playMelody(rig);
    }
    for (let i = this.scalers.length - 1; i >= 0; i--) {
      if (stepScaler(this.scalers[i], dt)) this.scalers.splice(i, 1);
    }
    this.knead(dt);
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
