// What the gift codec (src/game/gift.ts) needs from the content layer: a catalogue to validate a payload against, and the
// solver's verdict on the rebuilt machine (DATA_AND_BLUEPRINT_SPEC §15). Both are Map and Set lookups, never plain-object
// indexing: ids come from a URL.
//
// Hardware is `implied` (INTRICATE_ASSEMBLY_DESIGN §11.5): a gift names the machine's big parts only, so a link keeps its 12 placements, an old link is
// still valid (no `blueprint.version` bump), and whoever rebuilds the machine for a viewer fills the hardware from `intended` (`withImplied`).
import type { Gift, GiftBlueprintInfo, GiftCatalogue, GiftVerifier } from '../../game/gift';
import { hasPart } from '../parts/catalogue';
import { getBlueprint } from './registry';
import { solveAssembly } from './solve';
import type { Assembly } from './solve';
import type { MachineBlueprint } from './types';

/** `assembly` without the sockets a gift never carries: what the sender puts in `Gift.placements`. */
export function giftPlacements(bp: MachineBlueprint, assembly: Assembly): Gift['placements'] {
  const implied = new Set(bp.sockets.filter((s) => s.implied === true).map((s) => s.id));
  return Object.entries(assembly)
    .filter(([socketId]) => !implied.has(socketId))
    .map(([socketId, partId]) => ({ socketId, partId }));
}

/** `assembly` plus the implied sockets the blueprint intends, which win over nothing: a socket that is already filled keeps its part. For the receiving side. */
export function withImplied(bp: MachineBlueprint, assembly: Assembly): Assembly {
  const out: Record<string, string> = { ...assembly };
  for (const s of bp.sockets) if (s.implied === true && out[s.id] === undefined) out[s.id] = bp.intended[s.id];
  return out;
}

export const giftCatalogue: GiftCatalogue = {
  blueprint(blueprintId: string): GiftBlueprintInfo | undefined {
    const bp = getBlueprint(blueprintId);
    if (!bp) return undefined;
    const shared = bp.sockets.filter((s) => s.implied !== true);
    const accepted = new Map(shared.map((s) => [s.id, new Set(s.acceptedPartIds ?? [])] as const));
    return {
      version: bp.version,
      sockets: shared.map((s) => ({ id: s.id, required: s.required })),
      accepts: (socketId, partId) => accepted.get(socketId)?.has(partId) === true,
    };
  },
  hasPart,
};

/** True only when the gift rebuilds a machine that runs correctly, fully wound (GAMEPLAY_SYSTEMS §9.2). */
export const verifyGift: GiftVerifier = (gift: Gift): boolean => {
  const bp = getBlueprint(gift.blueprintId);
  if (!bp) return false;
  const outcome = solveAssembly(bp, withImplied(bp, Object.fromEntries(gift.placements.map((p) => [p.socketId, p.partId]))));
  return outcome.ok && outcome.result.status === 'runs';
};
