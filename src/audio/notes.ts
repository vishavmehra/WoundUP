/**
 * The Music Box melody and the other fixed tunes. Pure data and maths: no Web Audio, so Node tests can check them.
 *
 * The specifications call for "a fixed authored melody" (TECHNICAL_ARCHITECTURE §18) but give no notes (gap G-17), so this one
 * is composed here: a gentle original waltz in C major, sixteen bars of 3/4, chosen to last exactly one turn of the Music Box
 * cylinder (MUSIC_BOX_BLUEPRINT §4: 8 wind units play one full turn, 15.7 s at 0.4 rad/s). Notes are placed by cylinder angle,
 * as pins on a real cylinder are, so the tune follows the solver: faster turning plays faster, a stopped cylinder is silent.
 * Replace `MELODY_STEPS` when the owner supplies a tune; nothing else depends on its content.
 */
import type { PlotId } from '../game/content';

/** Eighth-note steps in one cylinder turn: 16 bars of 3/4. */
export const STEPS_PER_TURN = 96;
const STEPS_PER_BAR = 6;

/** [step within the bar, MIDI note, length in steps] per bar. C5 = 72. */
const BARS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[0, 76, 2], [2, 79, 2], [4, 84, 2]], // C: E G C
  [[0, 83, 3], [3, 79, 1], [4, 81, 1], [5, 83, 1]], // G
  [[0, 81, 2], [2, 84, 2], [4, 88, 2]], // Am
  [[0, 86, 3], [3, 84, 1], [4, 81, 2]], // F
  [[0, 76, 2], [2, 79, 2], [4, 84, 2]], // C
  [[0, 86, 3], [3, 83, 1], [4, 79, 2]], // G
  [[0, 77, 2], [2, 81, 2], [4, 84, 2]], // F
  [[0, 83, 2], [2, 86, 2], [4, 79, 2]], // G, half close
  [[0, 88, 3], [3, 86, 1], [4, 84, 1], [5, 81, 1]], // Am
  [[0, 83, 3], [3, 79, 1], [4, 76, 2]], // Em
  [[0, 81, 2], [2, 84, 2], [4, 89, 2]], // F
  [[0, 88, 3], [3, 86, 1], [4, 83, 2]], // G
  [[0, 76, 2], [2, 79, 2], [4, 84, 2]], // C
  [[0, 86, 2], [2, 83, 2], [4, 79, 2]], // G
  [[0, 84, 3], [3, 79, 1], [4, 76, 2]], // C
  [[0, 84, 6]], // C, held: the tune ends on its tonic
];
/** Bass note of each bar, the low comb's "oom" of the waltz, following the chord of the bar. */
const BASS = [60, 55, 57, 53, 60, 55, 53, 55, 57, 52, 53, 55, 60, 55, 60, 48];

export interface MelodyNote {
  /** Position within the turn, 0 up to (not including) 1. */
  readonly turn: number;
  readonly midi: number;
  /** Loudness 0 to 1: bar-leading notes a little stronger, bass quieter. */
  readonly velocity: number;
}

function build(): MelodyNote[] {
  const notes: MelodyNote[] = [];
  BARS.forEach((bar, b) => {
    const base = b * STEPS_PER_BAR;
    notes.push({ turn: base / STEPS_PER_TURN, midi: BASS[b], velocity: 0.45 });
    for (const [step, midi] of bar) {
      notes.push({ turn: (base + step) / STEPS_PER_TURN, midi, velocity: step === 0 ? 0.85 : 0.7 });
    }
  });
  return notes.sort((a, c) => a.turn - c.turn);
}

/** Every pin of the cylinder, sorted by position. */
export const MELODY: readonly MelodyNote[] = build();

/**
 * Calls `emit` for every note whose pin passes the comb while the cylinder goes from `fromTurns` to `toTurns` (unwrapped turns,
 * so 2.25 is a quarter into the third turn). Forward travel only: a cylinder never plays backwards. Allocation-free.
 */
export function notesBetween(fromTurns: number, toTurns: number, emit: (note: MelodyNote) => void): void {
  if (!(toTurns > fromTurns)) return;
  const first = Math.floor(fromTurns);
  const last = Math.floor(toTurns);
  for (let turn = first; turn <= last; turn++) {
    for (let i = 0; i < MELODY.length; i++) {
      const at = turn + MELODY[i].turn;
      if (at > fromTurns && at <= toTurns) emit(MELODY[i]);
    }
  }
}

/** Equal-tempered frequency of a MIDI note (A4 = 69 = 440 Hz). */
export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** The wake chime: a short rising arpeggio per plot, all drawn from C major so any combination stays consonant. */
export const WAKE_CHIMES: Readonly<Record<PlotId, readonly number[]>> = {
  plot_music_box: [72, 76, 79, 84],
  plot_carousel: [74, 79, 83, 86],
  plot_windmill: [67, 72, 76, 79],
  plot_clock_tower: [69, 72, 76, 81],
};
