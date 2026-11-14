// The machine blueprints (Agent 2): data only. The solver is `src/sim`, the game rules are `src/game`, the scene is `src/parts`.
import { CAROUSEL } from './carousel';
import { CLOCK_TOWER } from './clock-tower';
import { MUSIC_BOX } from './music-box';
import { WINDMILL } from './windmill';
import type { MachineBlueprint } from './types';

export const BLUEPRINTS: readonly MachineBlueprint[] = Object.freeze([MUSIC_BOX, CAROUSEL, WINDMILL, CLOCK_TOWER]);

const byId: ReadonlyMap<string, MachineBlueprint> = new Map(BLUEPRINTS.map((b) => [b.id, b] as const));

/** Map lookup, so an id from a save or a URL can never answer for `constructor`. */
export const getBlueprint = (id: string): MachineBlueprint | undefined => byId.get(id);

/** The blueprint socket a `snapped` intent's `socketName` (the GLB empty without `SOCKET_`) means, or undefined (the base handle, a tray slot). */
export const socketIdOfNode = (blueprint: MachineBlueprint, node: string): string | undefined => blueprint.sockets.find((s) => s.node === node)?.id;
