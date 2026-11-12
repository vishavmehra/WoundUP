// Which GLBs a machine needs, so they can be fetched in the background while the player reads the letter (never at startup).
import { requirePart } from '../content/parts';
import type { MachineBlueprint } from '../content/blueprints';

/**
 * Asset ids of the housing and of every part the build can use: the intended parts, the tray (decoys included) and
 * `extraPartIds` (the faulty part of a repair). No duplicates; the housing comes first, so it is ready before the parts.
 */
export function machineAssetIds(blueprint: MachineBlueprint, extraPartIds: readonly string[] = []): string[] {
  const ids = new Set<string>([blueprint.housing.assetId]);
  const partIds = [...Object.values(blueprint.intended), ...blueprint.tray.map((t) => t.partId), ...extraPartIds];
  for (const id of partIds) ids.add(requirePart(id).visual.assetId);
  return [...ids];
}
