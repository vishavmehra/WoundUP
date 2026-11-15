// What a build starts with: which parts the game seats itself, which lie in the tray for the hands, and whether there is a tray at all.
// Pure (no ECS, no IWSDK) so Vitest can hold it to the real blueprints; `Gameplay.startBuild` is the one caller.
import { INTRICATE_ASSEMBLY, planStages, repairStart } from './content/blueprints';
import type { Assembly, MachineBlueprint, StagesPlan } from './content/blueprints';
import { requirePart } from './content/parts';
import type { Difficulty, RepairDef } from './game/content';
import { dropSeatedByGame } from './tray-layout';

export interface BuildPlan {
  /** Parts the game seats itself (no reachable socket, or nothing to pinch). */
  readonly fixed: Assembly;
  /** Every part id the tray holds for the hands, in tray order (the game-seated ones already taken out of a first build's tray). */
  readonly trayIds: readonly string[];
  /** A repair starts from the machine as it stood: its parts that a hand can reach, which the game puts in their sockets the way a hand would. */
  readonly seatNow: ReadonlyArray<readonly [socketId: string, partId: string]>;
  /** The parts that are spawned: the pinchable ones of the tray, then those of `seatNow`. */
  readonly spawnIds: readonly string[];
  /** True when there are parts to show on the bench (and so a tray). */
  readonly handBuilt: boolean;
  /**
   * The stages of the build at the difficulty asked (design §6, R5): what the player places, what the game seats and the bag of each stage. With
   * `INTRICATE_ASSEMBLY` false, or no difficulty, it is the Relaxed plan whose hardware the game has already seated in `fixed`.
   */
  readonly stages: StagesPlan;
}

/**
 * `socketCount` is how many sockets the housing GLB gives the player, and `hasSocket` says which blueprint socket one of them is.
 *
 * A first build whose tray still holds parts after the game has seated its own shows the tray even if no socket can be reached: those
 * parts are the decoys. The Clock Tower is such a build (Letter 6, ADR-047): its movement is seated by the game, and the worn spring
 * and the 12-tooth bevel gear still lie in the tray, where the player may try them. No socket takes either, so they stay loose.
 *
 * `difficulty` is the player's level (ADR-050). Left out, the build is planned as it was before ADR-050: hardware that has no reachable socket is
 * seated by the game and the rest is placed by hand. With the fallback switch `INTRICATE_ASSEMBLY` false, every piece of hardware is seated by the game
 * at the start whatever the level (design §12.4), and nothing else changes.
 */
export function planBuild(
  blueprint: MachineBlueprint,
  repair: RepairDef | null,
  socketCount: number,
  hasSocket: (socketId: string) => boolean,
  difficulty?: Difficulty,
): BuildPlan {
  const stages = planStages(blueprint, difficulty ?? 'standard', { intricate: INTRICATE_ASSEMBLY });
  const start = repair ? repairStart(repair) : undefined;
  const target: Assembly = start ? start.assembly : {};
  const trayIds: string[] = [];
  for (const entry of start ? start.tray : blueprint.tray) for (let i = 0; i < entry.quantity; i++) trayIds.push(entry.partId);
  // With a difficulty the director runs the bags and the caddy (design §3.5): hardware sits on a part's own empty, which no `hasSocket` can answer before that
  // part is built into the machine, so it is the player's (or the bundle's) and never seated by the game just because the housing has no socket for it.
  const directed = difficulty !== undefined && INTRICATE_ASSEMBLY;
  const handPlaced = (socketId: string, partId: string): boolean =>
    (hasSocket(socketId) || (directed && requirePart(partId).family === 'fastener')) && requirePart(partId).grab.enabled;
  const fixed: Record<string, string> = {};
  const seatedAtStart = new Set(stages.seat === 'at-start' ? stages.atStart : []);
  for (const [socketId, partId] of Object.entries(start ? start.assembly : blueprint.intended)) {
    if (seatedAtStart.has(socketId) || !handPlaced(socketId, partId)) fixed[socketId] = partId;
  }
  if (!start) dropSeatedByGame(trayIds, fixed); // a part the game seats itself has no place in the tray
  const seatNow = Object.entries(target).filter(([socketId]) => !(socketId in fixed));
  const pinchable = trayIds.filter((id) => requirePart(id).grab.enabled);
  const spawnIds = [...pinchable, ...seatNow.map(([, partId]) => partId)];
  const handBuilt = socketCount > 0 || seatNow.length > 0 || (!start && pinchable.length > 0);
  return { fixed, trayIds, seatNow, spawnIds, handBuilt, stages };
}
