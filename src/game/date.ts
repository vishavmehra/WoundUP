/**
 * Local calendar dates as `YYYY-MM-DD` strings: the form `dailyDone` is saved in (SAVE_PERSISTENCE_SPEC §4.4) and the
 * seed of the daily repair (ADR-027). Callers pass the date in; nothing here reads the clock, so tests are deterministic
 * (ACCEPTANCE_TESTS §5.1).
 */

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** The player's local calendar date, not UTC: the daily repair rolls over at local midnight. */
export function dateKey(date: Date): string {
  const p = (n: number, width: number) => String(n).padStart(width, '0');
  return `${p(date.getFullYear(), 4)}-${p(date.getMonth() + 1, 2)}-${p(date.getDate(), 2)}`;
}

/** True for a real calendar date written exactly as `YYYY-MM-DD` (so `2026-02-30` and `2026-1-5` are rejected). */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_KEY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** Whole days since 1970-01-01 for a valid date key: consecutive days give consecutive numbers. */
export function dayNumber(key: string): number {
  const m = DATE_KEY.exec(key);
  if (!m || !isDateKey(key)) throw new RangeError('not a YYYY-MM-DD date');
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY);
}
