// The machine blueprints (Agent 2): data only. The solver is `src/sim`, the game rules are `src/game`, the scene is `src/parts`.
import { BELFRY } from './belfry';
import { CAROUSEL } from './carousel';
import { CLOCK_TOWER } from './clock-tower';
import { MUSIC_BOX } from './music-box';
import { WELL } from './well';
import { WINDMILL } from './windmill';
import type { MachineBlueprint } from './types';

export const BLUEPRINTS: readonly MachineBlueprint[] = Object.freeze([MUSIC_BOX, CAROUSEL, WINDMILL, CLOCK_TOWER, WELL, BELFRY]);

const byId: ReadonlyMap<string, MachineBlueprint> = new Map(BLUEPRINTS.map((b) => [b.id, b] as const));

/** Map lookup, so an id from a save or a URL can never answer for `constructor`. */
export const getBlueprint = (id: string): MachineBlueprint | undefined => byId.get(id);

/**
 * The blueprint socket a `snapped` intent's `socketName` (the GLB empty without `SOCKET_`) means, or undefined (the base handle, a tray slot).
 * Hardware empties repeat on every part of an asset (each gear has a `Pin`), so `carrier` says whose empty it is: the socket id of the part the empty
 * is on (a big part's `unitNode` on a stand unit counts too). Without it a name shared by several carried sockets answers for none of them.
 */
export function socketIdOfNode(blueprint: MachineBlueprint, node: string, carrier?: string): string | undefined {
  if (carrier !== undefined) return blueprint.sockets.find((s) => s.carrier === carrier && (s.node === node || s.unitNode === node))?.id;
  const named = blueprint.sockets.filter((s) => s.node === node);
  return (named.find((s) => s.family !== 'fastener' || s.carrier === undefined) ?? (named.length === 1 ? named[0] : undefined))?.id;
}
