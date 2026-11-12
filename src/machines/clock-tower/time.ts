// Clock Tower time (PRODUCT_SPEC §6.4: "clock hands show real local time", "hourly bell strikes"). Pure functions of a Date:
// nothing here reads the clock, so tests pass known times (ACCEPTANCE_TESTS §5.1). All fields are the player's LOCAL time.

const TAU = Math.PI * 2;

/**
 * Angle of the minute hand in radians, clockwise from 12 o'clock, sweeping with the seconds: 15 minutes is PI/2.
 * The hand node turns about +Z seen from the front, which is counter-clockwise, so its rotation is the negative of this.
 */
export function minuteHandAngle(date: Date): number {
  return minuteFraction(date) * TAU;
}

/** Fraction of the hour gone, 0 to 1, with the seconds. */
function minuteFraction(date: Date): number {
  return (date.getMinutes() + (date.getSeconds() + date.getMilliseconds() / 1000) / 60) / 60;
}

/** Angle of the hour hand in radians, clockwise from 12 o'clock, on a 12-hour dial: 3 o'clock is PI/2, 15:00 too. */
export function hourHandAngle(date: Date): number {
  return (((date.getHours() % 12) + minuteFraction(date)) / 12) * TAU;
}

/**
 * The hourly cam turns once an hour with the minute hand (it trips the striker at the top of the hour): the same angle as
 * `minuteHandAngle`. Named separately because the cam is its own part with its own node.
 */
export const hourlyCamAngle = minuteHandAngle;

/** Strikes of the bell at a given hour of the day (0 to 23): the hour on a 12-hour dial, so midnight and noon strike twelve. */
export function strikeCount(hours: number): number {
  return hours % 12 || 12;
}

/** Epoch milliseconds of the start of the local hour that `date` is in. The hour changes when this value grows. */
export function hourStartMs(date: Date): number {
  return date.getTime() - (date.getMinutes() * 60_000 + date.getSeconds() * 1000 + date.getMilliseconds());
}
