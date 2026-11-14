/**
 * The daily repair (PRODUCT_SPEC §8; GAMEPLAY_SYSTEMS §12.3; ADR-027): protected repeat play.
 *
 *  - Offered after Letter 5 (see GATES in progression.ts).
 *  - The repair is a pure function of the local date, so it needs no backend and the same date always gives the same one.
 *  - One completion per date: `dailyDone` holds the local date of the last completion.
 *  - Never required: nothing in progression.ts reads `dailyDone`, so no letter, machine or ending waits on it.
 *  - Reuses the repairs the game already has and adds no machine or system. A repair is only drawn once its machine stands in the town
 *    (the Well's and the Belfry's, ADR-048, come after the first two), so a player is never asked to repair a machine they have not built.
 *
 * The date is always passed in (never read from the clock) so tests are deterministic (ACCEPTANCE_TESTS §5.1).
 */

import { REPAIR_IDS, REPAIRS, type RepairDef, type RepairId } from './content';
import { dayNumber, isDateKey } from './date';
import { GATES, letterReached } from './progression';
import type { SaveV1 } from './save';

/**
 * Which repairs the daily pool holds is still for the owner to define (ADR-027). Until then it is every story repair (the Music Box's,
 * the Windmill's, and the Well's and the Belfry's from ADR-048), which gives the pool a fixed, deterministic order. To widen it, append
 * ids to this list.
 */
export const DAILY_POOL: readonly RepairId[] = REPAIR_IDS;

/**
 * The repair for a local date. Consecutive days step through the pool in order, so the player gets each repair in turn and never the
 * same one twice running. `pool` is the repairs that can be drawn (the whole `DAILY_POOL` unless a save narrows it, see `dailyOffer`).
 * Null for anything that is not a real `YYYY-MM-DD` date, or an empty pool.
 */
export function dailyRepairFor(date: string, pool: readonly RepairId[] = DAILY_POOL): RepairDef | null {
  if (!isDateKey(date) || pool.length === 0) return null;
  const n = pool.length;
  const index = ((dayNumber(date) % n) + n) % n; // days before 1970 are negative
  return REPAIRS[pool[index]];
}

/** The pool's repairs whose machine stands in the town of this save, in pool order. */
export function drawablePool(save: SaveV1): readonly RepairId[] {
  return DAILY_POOL.filter((id) => save.machines.some((m) => m.blueprintId === REPAIRS[id].blueprintId && m.placed));
}

/** Today's repair if it can be started now, else null: before Letter 5, or already done today. */
export function dailyOffer(save: SaveV1, today: string): RepairDef | null {
  if (!letterReached(save, GATES.daily.letterId, GATES.daily.status)) return null;
  if (save.dailyDone === today) return null;
  return dailyRepairFor(today, drawablePool(save));
}

/** Records today's repair as done. Returns the input unchanged when it was not on offer. */
export function completeDaily(save: SaveV1, today: string): SaveV1 {
  return dailyOffer(save, today) === null ? save : { ...save, dailyDone: today };
}
