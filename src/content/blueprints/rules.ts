// The placement rules that follow from socket `dependencies` (MUSIC_BOX_BLUEPRINT §7.1 "Removal", DATA §6): pure, so the game
// layer can decide on a `snapped` or `unsnapped` intent without reading the scene. The solver never enforces order; this does.
import type { Assembly } from './solve';
import type { MachineBlueprint } from './types';

const socketOf = (bp: MachineBlueprint, id: string) => bp.sockets.find((s) => s.id === id);

/** Sockets that must be filled before `socketId` may take a part, and are still empty. Empty when it may be filled. */
export function unmetDependencies(bp: MachineBlueprint, assembly: Assembly, socketId: string): string[] {
  return (socketOf(bp, socketId)?.dependencies ?? []).filter((d) => assembly[d] === undefined);
}

/** Filled sockets that depend on `socketId`. While there are any, the part in `socketId` may not be removed. */
export function filledDependents(bp: MachineBlueprint, assembly: Assembly, socketId: string): string[] {
  return bp.sockets.filter((s) => s.dependencies?.includes(socketId) === true && assembly[s.id] !== undefined).map((s) => s.id);
}
