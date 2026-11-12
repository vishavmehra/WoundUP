// The start state of a story repair (PRODUCT_SPEC §8): the machine as the player built it, with its one wrong part, and a tray
// holding the right one. The faulty and correct part ids come from the game core (`REPAIRS` in src/game/content.ts).
import { getBlueprint } from './registry';
import type { Assembly } from './solve';
import type { TrayEntry } from './types';

export interface RepairStart {
  /** The correct build with the faulty part in place of the correct one. */
  readonly assembly: Assembly;
  /** The socket the faulty part sits in. */
  readonly faultySocket: string;
  /** Just the correct part: the repairs have no decoys (DATA §9.1 lists decoys for Letters 3, 4 and 6 only). */
  readonly tray: readonly TrayEntry[];
}

/** Undefined when the blueprint is unknown or the correct part does not sit in exactly one socket of the intended build. */
export function repairStart(repair: { blueprintId: string; faultyPartId: string; correctPartId: string }): RepairStart | undefined {
  const blueprint = getBlueprint(repair.blueprintId);
  if (!blueprint) return undefined;
  const sockets = Object.entries(blueprint.intended).filter(([, id]) => id === repair.correctPartId);
  if (sockets.length !== 1) return undefined;
  const faultySocket = sockets[0][0];
  return {
    assembly: { ...blueprint.intended, [faultySocket]: repair.faultyPartId },
    faultySocket,
    tray: [{ partId: repair.correctPartId, quantity: 1 }],
  };
}
