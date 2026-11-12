// Numbers of the Clock Tower behaviour (PRODUCT_SPEC §6.4, SIMULATION_SPEC §9.6, §10.4).
// Basis codes as in MACHINE_SLOT_MAPPINGS: S = written specification, M = read from the manifest or a generator, P = proposal
// (no document fixes the value; the integrator or the owner may change it here and nowhere else).
// Angles are radians, times are seconds, unless the name ends in MS.

/**
 * One pendulum beat: the time between two escapement drops. P: no document gives a period (G-13; the manifest says
 * "Swing amplitude and period are open"), so this is the seconds-pendulum beat of a grandfather clock, believable and easy to
 * hear as tick, tock.
 */
export const BEAT_SECONDS = 1;
/** One swing there and back: two beats. */
export const PENDULUM_PERIOD_SECONDS = 2 * BEAT_SECONDS;
/**
 * Swing each side of vertical, 8 degrees. P: wide enough to read through the entrance arch at 1:1 size (the 7 cm rod of
 * `pendulum_clock` moves its bob about 8 mm); a real clock swings 2 to 4 degrees.
 */
export const PENDULUM_AMPLITUDE_RAD = 0.14;
/** The swing builds up to, and dies away from, full amplitude with this time constant, so the pendulum never jumps. P. */
export const PENDULUM_SETTLE_SECONDS = 0.4;

/** M `blender/scripts/gen_escapement.py`: 24 hooked teeth. */
export const ESCAPE_TEETH = 24;
/**
 * The wheel advances half a tooth pitch at every beat: an anchor escapement lets one tooth pass per swing there and back.
 * Seen from +Z the wheel turns clockwise (M generator), so its rotation about +Z is negative.
 */
export const ESCAPE_STEP_RAD = Math.PI / ESCAPE_TEETH;
/** How long one advance takes. The rest of the beat the wheel is locked on a pallet. P. */
export const ESCAPE_STEP_SECONDS = 0.15;
/** Mean speed of the escape wheel in step with the pendulum: 2*PI / 48 s = 0.1309 rad/s. */
export const ESCAPE_WHEEL_RAD_PER_S = ESCAPE_STEP_RAD / BEAT_SECONDS;

/** Gap between two strikes of the bell. P: slow enough for each strike to ring out; twelve strikes then last 22 s. */
export const STRIKE_INTERVAL_SECONDS = 2;
/** S PRODUCT_SPEC §6.4: the theatre doors open for 30 seconds, counted from the hour. */
export const DOORS_OPEN_SECONDS = 30;
/** The doors take this long to swing open, and again to close. P. */
export const DOORS_ANIMATION_SECONDS = 1.5;

/** The striker swings out to the bell and back in this time. P. */
export const STRIKER_SWING_SECONDS = 0.35;
export const STRIKER_SWING_RAD = 0.5;
/** The bell trembles after a strike: amplitude, decay rate (1/s), frequency (Hz) and how long to bother (s). P. */
export const BELL_RECOIL_RAD = 0.04;
export const BELL_RECOIL_DECAY = 2.2;
export const BELL_RECOIL_HZ = 2.5;
export const BELL_RECOIL_SECONDS = 3;

/**
 * A pause longer than this between two updates (a sleeping headset, a debugger) is not a frame: the hour boundary inside it
 * is not struck, and the pendulum is not advanced by it. P.
 */
export const MAX_FRAME_GAP_SECONDS = 5;
/** Longest span the animation integrates in one update, so a slow frame cannot throw the pendulum. P. */
export const MAX_STEP_SECONDS = 0.25;
