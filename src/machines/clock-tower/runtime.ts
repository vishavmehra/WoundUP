// Clock Tower behaviour once it runs (PRODUCT_SPEC §6.4; SIMULATION_SPEC §9.6, §10.4): the pendulum swings and the escape wheel steps
// in time with it, the hands show the local time, the bell strikes the hour, the theatre doors open for 30 seconds.
//
// Pure TypeScript, no Three.js, no IWSDK. One time source, injected: `clock()` returns epoch milliseconds (`Date.now` in the game, a
// counter in tests). `update()` allocates nothing, so it can run every frame. The solver is not involved per frame (SOLVER §18): the
// caller sets `powered` from the last solve (`solveResult.status === 'runs'`) and, on the bench, from the spring's remaining energy.

import {
  BEAT_SECONDS,
  BELL_RECOIL_DECAY,
  BELL_RECOIL_HZ,
  BELL_RECOIL_RAD,
  BELL_RECOIL_SECONDS,
  DOORS_ANIMATION_SECONDS,
  DOORS_OPEN_SECONDS,
  ESCAPE_STEP_RAD,
  ESCAPE_STEP_SECONDS,
  MAX_FRAME_GAP_SECONDS,
  MAX_STEP_SECONDS,
  PENDULUM_AMPLITUDE_RAD,
  PENDULUM_SETTLE_SECONDS,
  STRIKER_SWING_RAD,
  STRIKER_SWING_SECONDS,
  STRIKE_INTERVAL_SECONDS,
} from './constants';
import { hourHandAngle, hourlyCamAngle, hourStartMs, minuteHandAngle, strikeCount } from './time';

const TAU = Math.PI * 2;
const STRIKE_INTERVAL_MS = STRIKE_INTERVAL_SECONDS * 1000;
const DOORS_OPEN_MS = DOORS_OPEN_SECONDS * 1000;
const MAX_FRAME_GAP_MS = MAX_FRAME_GAP_SECONDS * 1000;
/** Below this swing the pendulum counts as at rest and its beat stops advancing. */
const AT_REST_RAD = 1e-4;

const smooth = (x: number): number => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};

// ---- Events ---------------------------------------------------------------------------------------------------------

/** Every handler is optional. Handlers run inside `update()`, so they must be quick, and must not subscribe or unsubscribe. */
export interface ClockTowerListener {
  /** One pendulum beat while the clock runs, once per second. `parity` alternates 0 (tick) and 1 (tock). Play the tick sound. */
  tick?(parity: 0 | 1): void;
  /**
   * The hour has struck: `strikes` is the hour on a 12-hour dial (1 to 12) and the number of `strike` events that follow, two
   * seconds apart, the first at once. Fires at the same moment as `doorsOpen`.
   */
  hour?(strikes: number): void;
  /** One strike of the bell, `index` from 1 to `total`. Play the bell sound and ring it. */
  strike?(index: number, total: number): void;
  /** The theatre doors begin to open. They stay open `DOORS_OPEN_SECONDS` (30 s) and `ClockTowerRuntime.doorsAmount` eases 0 to 1 and back. */
  doorsOpen?(): void;
  /** The 30 seconds are over: the doors have finished closing. */
  doorsClose?(): void;
}

export class ClockTowerEvents {
  private readonly listeners: ClockTowerListener[] = [];

  /** Returns the function that removes the listener. */
  subscribe(listener: ClockTowerListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  tick(parity: 0 | 1): void {
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i].tick?.(parity);
  }
  hour(strikes: number): void {
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i].hour?.(strikes);
  }
  strike(index: number, total: number): void {
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i].strike?.(index, total);
  }
  doorsOpen(): void {
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i].doorsOpen?.();
  }
  doorsClose(): void {
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i].doorsClose?.();
  }
}

// ---- Runtime --------------------------------------------------------------------------------------------------------

export class ClockTowerRuntime {
  /** Set by the caller before `update()`: is the clock running? The hands, the pendulum and the escapement stop when it is not. */
  powered = false;

  // Outputs, written by `update()`. Each is a rotation in radians about the node's local +Z (ADR-020), counter-clockwise positive
  // seen from +Z, so the clockwise parts (hands, escape wheel, cam) are negative.
  /** The pendulum rod and bob, and the escapement anchor: they hang from one arbor and swing as one. */
  pendulumZ = 0;
  escapeWheelZ = 0;
  hourHandZ = 0;
  minuteHandZ = 0;
  hourlyCamZ = 0;
  /** The bell striker's swing about `PIV_Striker`, and the small tremble of the bell itself about its suspension point. */
  strikerZ = 0;
  bellZ = 0;
  /** True from the hour until 30 s later. */
  doorsOpen = false;
  /** How far the doors are open, 0 (shut) to 1 (open). Open the left leaf by +100 degrees and the right by -100 times this. */
  doorsAmount = 0;

  private readonly date = new Date(0);
  private started = false;
  private lastMs = 0;
  private lastHourStart = 0;

  private amplitude = 0;
  private beat = 0;
  private beatIndex = 0;
  private wheelFrom = 0;
  private wheelTo = 0;
  private wheelStepAge = ESCAPE_STEP_SECONDS;

  private sequence = false;
  private sequenceStartMs = 0;
  private strikesDone = 0;
  private strikesTotal = 0;
  private lastStrikeMs = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly clock: () => number = Date.now,
    readonly events: ClockTowerEvents = new ClockTowerEvents(),
  ) {}

  /**
   * Rings the hour now, as if the clock had just struck, then opens the doors. `strikes` defaults to the hour on the dial. For the
   * moment the tower is first set running, and for the demo video: otherwise the player would wait for the real hour (the
   * written behaviour is "on the hour"). Ignored, returning false, while a sequence is already running.
   */
  triggerStrikes(strikes?: number): boolean {
    const now = this.clock();
    this.date.setTime(now);
    const count = strikes === undefined ? strikeCount(this.date.getHours()) : Math.min(12, Math.max(1, Math.round(strikes)));
    return this.beginStrikes(now, count);
  }

  /** Advances everything to the time `clock()` now reads. Call once per frame. */
  update(): void {
    const now = this.clock();
    const first = !this.started;
    const gapMs = first ? 0 : now - this.lastMs;
    const dt = gapMs <= 0 ? 0 : Math.min(gapMs / 1000, MAX_STEP_SECONDS);
    const date = this.date;
    date.setTime(now);

    // The hour is struck when the local hour changes between two updates, and only when the update followed the last one closely:
    // a clock jumping forward after a sleep, or a first frame, has not "heard" the hour go by.
    const hourStart = hourStartMs(date);
    if (!first && this.powered && hourStart > this.lastHourStart && gapMs <= MAX_FRAME_GAP_MS) {
      this.beginStrikes(hourStart, strikeCount(date.getHours()));
    }
    this.lastHourStart = hourStart;
    this.lastMs = now;
    this.started = true;

    this.updatePendulum(dt);
    if (this.powered) {
      this.hourHandZ = -hourHandAngle(date);
      this.minuteHandZ = -minuteHandAngle(date);
      this.hourlyCamZ = -hourlyCamAngle(date);
    }
    this.updateStrikes(now);
  }

  /** The pendulum is a controlled animation (SIMULATION §9.6): a cosine whose extremes fall on the beats, where the escapement drops. */
  private updatePendulum(dt: number): void {
    this.amplitude += ((this.powered ? PENDULUM_AMPLITUDE_RAD : 0) - this.amplitude) * (1 - Math.exp(-dt / PENDULUM_SETTLE_SECONDS));
    if (this.powered || this.amplitude > AT_REST_RAD) this.beat += dt / BEAT_SECONDS;
    this.pendulumZ = this.amplitude * Math.cos(Math.PI * this.beat);

    const index = Math.floor(this.beat);
    if (index > this.beatIndex) {
      this.beatIndex = index;
      if (this.powered) {
        // The drop: the wheel advances half a tooth, in step with this very beat.
        this.wheelFrom = this.wheelTo;
        this.wheelTo -= ESCAPE_STEP_RAD;
        this.wheelStepAge = 0;
        this.events.tick(((index + 1) & 1) as 0 | 1);
      }
    }
    this.wheelStepAge += dt;
    this.escapeWheelZ = this.wheelFrom + (this.wheelTo - this.wheelFrom) * smooth(this.wheelStepAge / ESCAPE_STEP_SECONDS);
  }

  private beginStrikes(startMs: number, strikes: number): boolean {
    if (this.sequence) return false;
    this.sequence = true;
    this.sequenceStartMs = startMs;
    this.strikesDone = 0;
    this.strikesTotal = strikes;
    this.lastStrikeMs = Number.NEGATIVE_INFINITY;
    this.doorsOpen = true;
    this.events.hour(strikes);
    this.events.doorsOpen();
    return true;
  }

  private updateStrikes(now: number): void {
    if (this.sequence) {
      const elapsed = now - this.sequenceStartMs;
      while (this.strikesDone < this.strikesTotal && elapsed >= this.strikesDone * STRIKE_INTERVAL_MS) {
        this.lastStrikeMs = this.sequenceStartMs + this.strikesDone * STRIKE_INTERVAL_MS;
        this.strikesDone++;
        this.events.strike(this.strikesDone, this.strikesTotal);
      }
      if (elapsed >= DOORS_OPEN_MS) {
        this.sequence = false;
        this.doorsOpen = false;
        this.doorsAmount = 0;
        this.events.doorsClose();
      } else {
        const t = elapsed / 1000;
        this.doorsAmount = Math.min(smooth(t / DOORS_ANIMATION_SECONDS), smooth((DOORS_OPEN_SECONDS - t) / DOORS_ANIMATION_SECONDS));
      }
    }

    const since = (now - this.lastStrikeMs) / 1000; // Infinity before the first strike; a clock set back makes it negative
    const swinging = since >= 0 && since < STRIKER_SWING_SECONDS;
    this.strikerZ = swinging ? STRIKER_SWING_RAD * Math.sin((Math.PI * since) / STRIKER_SWING_SECONDS) : 0;
    const trembling = since >= 0 && since < BELL_RECOIL_SECONDS;
    this.bellZ = trembling ? BELL_RECOIL_RAD * Math.exp(-BELL_RECOIL_DECAY * since) * Math.sin(TAU * BELL_RECOIL_HZ * since) : 0;
  }
}
