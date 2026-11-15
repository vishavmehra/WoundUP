// The placement rules that follow from socket `dependencies` and `carrier` (MUSIC_BOX_BLUEPRINT §7.1 "Removal", DATA §6, INTRICATE_ASSEMBLY_DESIGN §4.3
// R3): pure, so the game layer can decide on a `snapped` or `unsnapped` intent without reading the scene. The solver never enforces order; this does.
import type { Assembly } from './solve';
import type { MachineBlueprint, SocketDefinition } from './types';

const socketOf = (bp: MachineBlueprint, id: string) => bp.sockets.find((s) => s.id === id);

/**
 * The socket whose part physically carries this socket's empty, or undefined when it seats in the housing. Hardware is always carried
 * (a pin by its gear). A big part's `carrier` is true only while a unit is built on a stand (`stand`): in place it seats in the housing's own empty.
 */
export const carrierOf = (socket: SocketDefinition, stand: boolean): string | undefined =>
  socket.carrier !== undefined && (stand || socket.family === 'fastener') ? socket.carrier : undefined;

/** `socketId` and every socket that travels with its part when it is pulled out: the sockets it carries, and the ones they carry. */
export function movesWith(bp: MachineBlueprint, socketId: string, stand = false): ReadonlySet<string> {
  const moving = new Set<string>([socketId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const s of bp.sockets) {
      const carrier = carrierOf(s, stand);
      if (carrier !== undefined && moving.has(carrier) && !moving.has(s.id)) {
        moving.add(s.id);
        grew = true;
      }
    }
  }
  return moving;
}

/**
 * Sockets that must be filled before `socketId` may take a part, and are still empty. Empty when it may be filled. `onStand` are carrier sockets whose
 * part sits on a stand: it is present although its housing socket is empty (R2).
 */
export function unmetDependencies(bp: MachineBlueprint, assembly: Assembly, socketId: string, onStand?: ReadonlySet<string>): string[] {
  return (socketOf(bp, socketId)?.dependencies ?? []).filter((d) => assembly[d] === undefined && onStand?.has(d) !== true);
}

/**
 * Filled sockets that come loose when the part in `socketId` is pulled out: those that depend on it, or on a socket that travels with it. While there
 * are any the part may not be removed on its own (it takes them with it). Sockets carried by the pulled part are not listed: a carrier travels with its
 * children (R3). `stand` is true while units are built on a stand.
 */
export function filledDependents(bp: MachineBlueprint, assembly: Assembly, socketId: string, stand = false): string[] {
  const moving = movesWith(bp, socketId, stand);
  return bp.sockets
    .filter((s) => !moving.has(s.id) && assembly[s.id] !== undefined && (s.dependencies ?? []).some((d) => moving.has(d)))
    .map((s) => s.id);
}
