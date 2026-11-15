import { describe, expect, it } from 'vitest';
import { getBlueprint, giftCatalogue, giftPlacements, MUSIC_BOX, solveAssembly, verifyGift, withImplied } from '../../src/content/blueprints';
import { ENGRAVING_IDS } from '../../src/game/content';
import { decodeGift, encodeGift, MAX_PLACEMENTS } from '../../src/game/gift';
import type { Gift } from '../../src/game/gift';

// INTRICATE_ASSEMBLY_DESIGN §11.5: hardware is implied. A gift names the 12 big parts, an old link is still valid, and the receiving side fills the hardware.

const options = { catalogue: giftCatalogue, verify: verifyGift };
const ENGRAVING = ENGRAVING_IDS[0];
const gift = (placements: Gift['placements']): Gift => ({ blueprintId: 'music_box', blueprintVersion: 1, placements, engraving: ENGRAVING });

/** The 12 placements of every gift link written before ADR-050: the big parts, nothing else. */
const OLD_PLACEMENTS: Gift['placements'] = [
  ['bracket_left', 'bracket_support_brass'],
  ['bracket_right', 'bracket_support_brass'],
  ['arbor', 'shaft_short_brass'],
  ['cylinder', 'cylinder_music_box_brass'],
  ['comb', 'comb_music_box_polished_brass'],
  ['cylinder_wheel', 'gear_spur_20_m1_brass'],
  ['governor_wheel', 'gear_spur_16_m1_brass'],
  ['main_spring', 'spring_standard_brass'],
  ['spring_pinion', 'gear_spur_10_m1_brass'],
  ['governor', 'governor_standard_brass'],
  ['governor_pinion', 'gear_spur_12_m1_brass'],
  ['winding_key', 'winding_key_polished_brass'],
].map(([socketId, partId]) => ({ socketId, partId }));

/** A link as the old build wrote it: the payload JSON, deflated and base64url, with no help from the current encoder. */
async function forge(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (const b of out) binary += String.fromCharCode(b);
  return `#g=${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

describe('gifts and hardware', () => {
  it('offers the codec the 12 big sockets and none of the hardware', () => {
    const info = giftCatalogue.blueprint('music_box')!;
    expect(info.sockets).toHaveLength(12);
    expect(info.sockets.every((s) => s.required)).toBe(true);
    expect(info.accepts('arbor', 'shaft_short_brass')).toBe(true);
    expect(info.accepts('bush_left', 'bush_split_8_brass')).toBe(false); // a hardware socket is not in a gift
    expect(info.accepts('pin_governor_wheel', 'pin_taper_2_polished_brass')).toBe(false);
  });

  it('writes the sender\'s 34 sockets as 12 placements, which is under the cap and what an old link held', () => {
    const placements = giftPlacements(MUSIC_BOX, MUSIC_BOX.intended);
    expect(placements).toHaveLength(12);
    expect(placements.length).toBeLessThanOrEqual(MAX_PLACEMENTS);
    expect(placements).toEqual(Object.entries(MUSIC_BOX.intended).filter(([id]) => OLD_PLACEMENTS.some((p) => p.socketId === id)).map(([socketId, partId]) => ({ socketId, partId })));
    expect(new Set(placements.map((p) => p.socketId))).toEqual(new Set(OLD_PLACEMENTS.map((p) => p.socketId)));
    // a machine without hardware is untouched
    const windmill = getBlueprint('windmill')!;
    expect(giftPlacements(windmill, windmill.intended)).toHaveLength(Object.keys(windmill.intended).length);
  });

  it('fills the hardware from the intended build on the receiving side, and keeps a part that is already there', () => {
    const received = withImplied(MUSIC_BOX, Object.fromEntries(OLD_PLACEMENTS.map((p) => [p.socketId, p.partId])));
    expect(received).toEqual(expect.objectContaining({ pin_governor_wheel: 'pin_taper_2_polished_brass', anchor_spring: 'pin_dowel_3_polished_brass' }));
    expect(Object.keys(received)).toHaveLength(34);
    expect(withImplied(MUSIC_BOX, { bush_left: 'washer_plain_8_brass' }).bush_left).toBe('washer_plain_8_brass');
    const outcome = solveAssembly(MUSIC_BOX, received);
    expect(outcome.ok && outcome.result.status).toBe('runs');
  });

  it('encodes and decodes a gift of 12 placements, and the solver is satisfied once the hardware is implied', async () => {
    const encoded = await encodeGift(gift(giftPlacements(MUSIC_BOX, MUSIC_BOX.intended)), options);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodeGift(encoded.hash, options);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.gift.placements).toHaveLength(12);
  });

  it('still decodes a link written before ADR-050: the same 12 placements, no version bump', async () => {
    expect(MUSIC_BOX.version).toBe(1);
    const old = await forge({ v: 1, b: 'music_box', n: 1, p: OLD_PLACEMENTS.map((p) => [p.socketId, p.partId]), e: ENGRAVING });
    const decoded = await decodeGift(old, options);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.gift.placements).toHaveLength(12);
      expect(verifyGift(decoded.gift)).toBe(true);
    }
  });

  it('refuses a link that lists hardware, so no payload grows past the 12 and a forged one cannot name a pin', async () => {
    const all = Object.entries(MUSIC_BOX.intended).map(([socketId, partId]) => ({ socketId, partId }));
    expect(await encodeGift(gift(all), options)).toEqual({ ok: false, error: 'bad-shape' }); // 34 pairs are over the cap of 32
    const withOne = [...OLD_PLACEMENTS, { socketId: 'pin_governor_wheel', partId: 'pin_taper_2_polished_brass' }];
    expect(await encodeGift(gift(withOne), options)).toEqual({ ok: false, error: 'bad-assembly' });
  });

  it('still refuses a gift that leaves a big part out, and one that runs wrong', async () => {
    expect(await encodeGift(gift(OLD_PLACEMENTS.slice(1)), options)).toEqual({ ok: false, error: 'bad-assembly' });
    const worn = OLD_PLACEMENTS.map((p) => (p.socketId === 'main_spring' ? { ...p, partId: 'spring_worn_brass' } : p));
    expect(await encodeGift(gift(worn), options)).toEqual({ ok: false, error: 'solver-rejected' });
  });
});
