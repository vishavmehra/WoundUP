// The start state of a story repair (PRODUCT_SPEC §8): the machine as the player built it, with its one wrong part, and a tray
// holding the right one. The faulty and correct part ids come from the game core (`REPAIRS` in src/game/content.ts).
// With the intricate assembly (INTRICATE_ASSEMBLY_DESIGN §8.3, §9.3, rule R6) a repair stays short: the faulty part's unit comes out as one and goes back as one.
import { getBlueprint } from './registry';
import { movesWith } from './rules';
import type { Assembly } from './solve';
import type { TrayEntry } from './types';

export interface RepairStart {
  /** The correct build with the faulty part in place of the correct one. Hardware included. */
  readonly assembly: Assembly;
  /** The socket the faulty part sits in. */
  readonly faultySocket: string;
  /** Just the correct part: the repairs have no decoys (DATA §9.1 lists decoys for Letters 3, 4 and 6 only). */
  readonly tray: readonly TrayEntry[];
  /**
   * The sockets whose parts the player may pull in this repair: the faulty socket, then everything its unit carries (a spring's washer, pinion, pin, key,
   * key screw; a gear's pin), in socket order. Pulling the faulty part takes them with it. The rest of the machine is not meant to be taken apart.
   */
  readonly unlocked: readonly string[];
  /**
   * The replacement arrives with these seated on it, socket id to part id: the power unit swaps as a bundle (2 placements and the winding, design §8.3).
   * Empty when the unit holds nothing but hardware: a faulty gear is replaced bare and its pin goes back through `reseat`.
   */
  readonly bundle: Assembly;
  /** The hardware of the unit that the player (or, in Relaxed, the game) seats again after placing the replacement, in socket order. Empty when `bundle` carries it. */
  readonly reseat: readonly string[];
}

/** Undefined when the blueprint is unknown or the correct part does not sit in exactly one socket of the intended build. */
export function repairStart(repair: { blueprintId: string; faultyPartId: string; correctPartId: string }): RepairStart | undefined {
  const blueprint = getBlueprint(repair.blueprintId);
  if (!blueprint) return undefined;
  const sockets = Object.entries(blueprint.intended).filter(([, id]) => id === repair.correctPartId);
  if (sockets.length !== 1) return undefined;
  const faultySocket = sockets[0][0];
  // The unit is what travels with the faulty part when it is lifted out whole, so every carrier counts (the `stand` view of the carriers, not the in-place one).
  const moving = movesWith(blueprint, faultySocket, true);
  const unit = blueprint.sockets.filter((s) => moving.has(s.id) && s.id !== faultySocket);
  const hasIdentity = unit.some((s) => s.family !== 'fastener');
  return {
    assembly: { ...blueprint.intended, [faultySocket]: repair.faultyPartId },
    faultySocket,
    tray: [{ partId: repair.correctPartId, quantity: 1 }],
    unlocked: [faultySocket, ...unit.map((s) => s.id)],
    bundle: hasIdentity ? Object.fromEntries(unit.map((s) => [s.id, blueprint.intended[s.id]] as const)) : {},
    reseat: hasIdentity ? [] : unit.map((s) => s.id),
  };
}
