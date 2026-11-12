/**
 * The daily repair (PRODUCT_SPEC §8; GAMEPLAY_SYSTEMS §12.3; ADR-027): protected repeat play.
 *
 *  - Offered after Letter 5 (see GATES in progression.ts).
 *  - The repair is a pure function of the local date, so it needs no backend and the same date always gives the same one.
 *  - One completion per date: `dailyDone` holds the local date of the last completion.
 *  - Never required: nothing in progression.ts reads `dailyDone`, so no letter, machine or ending waits on it.
 *  - Reuses the repairs the game already has and adds no machine or system.
 *
 * The date is always passed in (never read from the clock) so tests are deterministic (ACCEPTANCE_TESTS §5.1).
 */

import { REPAIR_IDS, REPAIRS, type RepairDef, type RepairId } from './content';
import { dayNumber, isDateKey } from './date';
import { GATES, letterReached } from './progression';
import type { SaveV1 } from './save';

/**
 * Which repairs the daily pool holds is still for the owner to define (ADR-027). Until then it is the two documented
 * story repairs, which gives the pool a fixed, deterministic order. To widen it, append ids to this list.
 */
export const DAILY_POOL: readonly RepairId[] = REPAIR_IDS;

/**
 * The repair for a local date. Consecutive days step through the pool in order, so with two repairs the player gets
 * each on alternate days and never the same one twice running. Null for anything that is not a real `YYYY-MM-DD` date.
 */
export function dailyRepairFor(date: string): RepairDef | null {
  if (!isDateKey(date)) return null;
  const n = DAILY_POOL.length;
  const index = ((dayNumber(date) % n) + n) % n; // days before 1970 are negative
  return REPAIRS[DAILY_POOL[index]];
}

/** Today's repair if it can be started now, else null: before Letter 5, or already done today. */
export function dailyOffer(save: SaveV1, today: string): RepairDef | null {
  if (!letterReached(save, GATES.daily.letterId, GATES.daily.status)) return null;
  if (save.dailyDone === today) return null;
  return dailyRepairFor(today);
}

/** Records today's repair as done. Returns the input unchanged when it was not on offer. */
export function completeDaily(save: SaveV1, today: string): SaveV1 {
  return dailyOffer(save, today) === null ? save : { ...save, dailyDone: today };
}
