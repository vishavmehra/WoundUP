// What the gift codec (src/game/gift.ts) needs from the content layer: a catalogue to validate a payload against, and the
// solver's verdict on the rebuilt machine (DATA_AND_BLUEPRINT_SPEC §15). Both are Map and Set lookups, never plain-object
// indexing: ids come from a URL.
import type { Gift, GiftBlueprintInfo, GiftCatalogue, GiftVerifier } from '../../game/gift';
import { hasPart } from '../parts/catalogue';
import { getBlueprint } from './registry';
import { solveAssembly } from './solve';

export const giftCatalogue: GiftCatalogue = {
  blueprint(blueprintId: string): GiftBlueprintInfo | undefined {
    const bp = getBlueprint(blueprintId);
    if (!bp) return undefined;
    const accepted = new Map(bp.sockets.map((s) => [s.id, new Set(s.acceptedPartIds ?? [])] as const));
    return {
      version: bp.version,
      sockets: bp.sockets.map((s) => ({ id: s.id, required: s.required })),
      accepts: (socketId, partId) => accepted.get(socketId)?.has(partId) === true,
    };
  },
  hasPart,
};

/** True only when the gift rebuilds a machine that runs correctly, fully wound (GAMEPLAY_SYSTEMS §9.2). */
export const verifyGift: GiftVerifier = (gift: Gift): boolean => {
  const bp = getBlueprint(gift.blueprintId);
  if (!bp) return false;
  const outcome = solveAssembly(bp, Object.fromEntries(gift.placements.map((p) => [p.socketId, p.partId])));
  return outcome.ok && outcome.result.status === 'runs';
};
