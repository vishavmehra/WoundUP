import { describe, expect, it, vi } from 'vitest';
import { ENGRAVINGS } from '../../src/game/content';
import {
  buildGiftUrl,
  decodeGift,
  encodeGift,
  GIFT_URL_TARGET_CHARS,
  hasGiftHash,
  MAX_ENCODED_CHARS,
  MAX_INFLATED_BYTES,
  MAX_PLACEMENTS,
  type Gift,
  type GiftBlueprintInfo,
  type GiftCatalogue,
  type GiftError,
  type GiftOptions,
  type GiftVerifier,
} from '../../src/game/gift';

// ---- A small content catalogue standing in for the real one ---------------------------------------------------------

/** socket id -> required, and the part ids it takes. 12 sockets, like the Music Box (DECISIONS ADR-039 item 6). */
const SOCKETS: Record<string, { required: boolean; takes: string[] }> = {
  socket_case: { required: true, takes: ['music_box_case_walnut'] },
  socket_cylinder: { required: true, takes: ['cylinder_music_box_brass'] },
  socket_comb: { required: true, takes: ['comb_music_box_brass'] },
  socket_governor: { required: true, takes: ['governor_standard_brass'] },
  socket_spring: { required: true, takes: ['spring_standard_brass', 'spring_worn_brass'] },
  socket_barrel: { required: true, takes: ['spring_barrel_brass'] },
  socket_shaft_a: { required: true, takes: ['shaft_long_brass', 'shaft_short_brass'] },
  socket_shaft_b: { required: true, takes: ['shaft_long_brass', 'shaft_short_brass'] },
  socket_gear_a: { required: true, takes: ['gear_spur_36_m1_brass', 'gear_spur_12_m1_brass', 'gear_spur_24_m1_brass'] },
  socket_gear_b: { required: true, takes: ['gear_spur_36_m1_brass', 'gear_spur_12_m1_brass', 'gear_spur_24_m1_brass'] },
  socket_key: { required: true, takes: ['winding_key_brass'] },
  socket_bracket: { required: false, takes: ['bracket_support_brass'] },
};

function catalogue(version = 1): GiftCatalogue {
  const parts = new Set(Object.values(SOCKETS).flatMap((s) => s.takes));
  const info: GiftBlueprintInfo = {
    version,
    sockets: Object.entries(SOCKETS).map(([id, s]) => ({ id, required: s.required })),
    accepts: (socketId, partId) => SOCKETS[socketId]?.takes.includes(partId) ?? false,
  };
  const blueprints = new Map<string, GiftBlueprintInfo>([['music_box', info]]);
  return { blueprint: (id) => blueprints.get(id), hasPart: (id) => parts.has(id) };
}

const yes: GiftVerifier = () => true;
const opts = (verify: GiftVerifier = yes, version = 1): GiftOptions => ({ catalogue: catalogue(version), verify });

const FULL: [string, string][] = [
  ['socket_case', 'music_box_case_walnut'],
  ['socket_cylinder', 'cylinder_music_box_brass'],
  ['socket_comb', 'comb_music_box_brass'],
  ['socket_governor', 'governor_standard_brass'],
  ['socket_spring', 'spring_standard_brass'],
  ['socket_barrel', 'spring_barrel_brass'],
  ['socket_shaft_a', 'shaft_long_brass'],
  ['socket_shaft_b', 'shaft_short_brass'],
  ['socket_gear_a', 'gear_spur_36_m1_brass'],
  ['socket_gear_b', 'gear_spur_24_m1_brass'],
  ['socket_key', 'winding_key_brass'],
  ['socket_bracket', 'bracket_support_brass'],
];

const gift = (over: Partial<Gift> = {}, pairs = FULL): Gift => ({
  blueprintId: 'music_box',
  blueprintVersion: 1,
  placements: pairs.map(([socketId, partId]) => ({ socketId, partId })),
  engraving: 'for_you',
  ...over,
});

// ---- Helpers to forge payloads, independent of the module under test ------------------------------------------------

function b64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  void w.write(bytes as BufferSource);
  void w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
const text = (s: string) => new TextEncoder().encode(s);
/** `#g=` plus a deflated, base64url-encoded payload: whatever the test wants the decoder to face. */
async function forge(payload: unknown | Uint8Array): Promise<string> {
  const bytes = payload instanceof Uint8Array ? payload : text(typeof payload === 'string' ? payload : JSON.stringify(payload));
  return `#g=${b64u(await deflateRaw(bytes))}`;
}
const valid = (over: Record<string, unknown> = {}) => ({
  v: 1,
  b: 'music_box',
  n: 1,
  p: FULL.map(([s, p]) => [s, p]),
  e: 'for_you',
  ...over,
});
const expectError = async (hash: string, error: GiftError, o: GiftOptions = opts()) => {
  const r = await decodeGift(hash, o);
  expect(r).toEqual({ ok: false, error });
};

// ---- Tests ------------------------------------------------------------------------------------------------------------

describe('gift link round trip', () => {
  it('encodes one finished machine and decodes the same machine back', async () => {
    const encoded = await encodeGift(gift(), opts());
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.hash).toBe(`#g=${encoded.data}`);
    expect(encoded.data).toMatch(/^[A-Za-z0-9_-]+$/); // base64url: no +, / or = padding
    const decoded = await decodeGift(encoded.hash, opts());
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.gift.blueprintId).toBe('music_box');
      expect(decoded.gift.blueprintVersion).toBe(1);
      expect(decoded.gift.engraving).toBe('for_you');
      expect(decoded.gift.placements).toHaveLength(12);
      expect(new Map(decoded.gift.placements.map((p) => [p.socketId, p.partId]))).toEqual(new Map(FULL));
    }
  });

  it.each(ENGRAVINGS.map((e) => e.id))('carries the %s engraving', async (engraving) => {
    const encoded = await encodeGift(gift({ engraving }), opts());
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodeGift(encoded.hash, opts());
    expect(decoded.ok && decoded.gift.engraving).toBe(engraving);
  });

  it('gives the same link for the same machine however the parts are listed', async () => {
    const a = await encodeGift(gift(), opts());
    const b = await encodeGift(gift({}, [...FULL].reverse()), opts());
    const c = await encodeGift(gift(), opts());
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) {
      expect(b.data).toBe(a.data);
      expect(c.data).toBe(a.data);
    }
  });

  it('keeps a full Music Box link well under the 1500-character target (PRODUCT_SPEC §13)', async () => {
    const encoded = await encodeGift(gift({ engraving: 'made_this_for_you' }), opts());
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const url = buildGiftUrl('https://wound-up.example.app/play/', encoded.data);
    expect(url.length).toBeLessThan(GIFT_URL_TARGET_CHARS);
    expect(encoded.data.length).toBeLessThan(MAX_ENCODED_CHARS);
  });

  it('builds a link on the page URL, replacing any hash it already has', () => {
    expect(buildGiftUrl('https://a.example/x', 'abc')).toBe('https://a.example/x#g=abc');
    expect(buildGiftUrl('https://a.example/x#old=1', 'abc')).toBe('https://a.example/x#g=abc');
  });

  it('recognises a gift hash', () => {
    expect(hasGiftHash('#g=abc')).toBe(true);
    expect(hasGiftHash('g=abc')).toBe(true);
    for (const no of ['', '#', '#x=1', '#gift=abc', '#G=abc', '#/g=abc', 'abc']) expect(hasGiftHash(no)).toBe(false);
  });

  it('runs the solver once on a good gift, with the machine rebuilt from the link', async () => {
    const encoded = await encodeGift(gift(), opts());
    if (!encoded.ok) throw new Error('encode failed');
    const verify = vi.fn<GiftVerifier>(() => true);
    await decodeGift(encoded.hash, opts(verify));
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0][0].placements).toHaveLength(12);
  });
});

describe('encoding refuses a gift the viewer would refuse', () => {
  const cases: [string, Gift, GiftError, GiftOptions?][] = [
    ['an unknown blueprint', gift({ blueprintId: 'steam_engine' }), 'unknown-blueprint'],
    ['a blueprint version that is not current', gift({ blueprintVersion: 2 }), 'blueprint-version'],
    ['an unknown part', gift({}, FULL.map(([s, p]) => (s === 'socket_key' ? [s, 'rocket_engine_brass'] : [s, p]))), 'unknown-part'],
    ['a part the socket does not take', gift({}, FULL.map(([s, p]) => (s === 'socket_key' ? [s, 'shaft_long_brass'] : [s, p]))), 'bad-assembly'],
    ['an unknown socket', gift({}, [...FULL, ['socket_moon', 'shaft_long_brass']]), 'bad-assembly'],
    ['the same socket twice', gift({}, [...FULL, ['socket_key', 'winding_key_brass']]), 'bad-assembly'],
    ['an empty required socket', gift({}, FULL.filter(([s]) => s !== 'socket_cylinder')), 'bad-assembly'],
    ['an engraving that is not a preset', gift({ engraving: 'free text' as never }), 'unknown-engraving'],
    ['a malformed id', gift({}, [...FULL.slice(0, 11), ['Socket Bracket!', 'bracket_support_brass']]), 'bad-shape'],
    ['too many parts', gift({}, Array.from({ length: MAX_PLACEMENTS + 1 }, (_, i) => [`socket_${i}`, 'shaft_long_brass'] as [string, string])), 'bad-shape'],
    ['a machine the solver rejects', gift(), 'solver-rejected', opts(() => false)],
    ['a solver that crashes', gift(), 'solver-rejected', opts(() => { throw new Error('boom'); })],
  ];
  it.each(cases)('%s', async (_name, g, error, o = opts()) => {
    expect(await encodeGift(g, o)).toEqual({ ok: false, error });
  });

  it('allows an empty optional socket', async () => {
    expect((await encodeGift(gift({}, FULL.slice(0, 11)), opts())).ok).toBe(true);
  });
});

describe('decoding hostile input (CLAUDE.md §16; DATA_AND_BLUEPRINT_SPEC §15)', () => {
  it.each(['', '#', '#x=1', '#gift=abc', 'hello', '#/g=abc'])('says %j is not a gift', async (hash) => {
    await expectError(hash, 'not-a-gift');
  });

  it('rejects a link over the length cap before decoding anything', async () => {
    await expectError(`#g=${'A'.repeat(MAX_ENCODED_CHARS + 1)}`, 'too-long');
    await expectError(`#g=${'A'.repeat(1_000_000)}`, 'too-long');
  });

  it.each([
    ['an empty payload', '#g='],
    ['padding characters', '#g=AAAA=='],
    ['standard base64 symbols', '#g=ab+/cd'],
    ['spaces', '#g=ab cd'],
    ['percent escapes', '#g=ab%20cd'],
    ['a second parameter', '#g=abcd&x=1'],
    ['a length no encoder produces', '#g=abcde'],
    ['markup', '#g=<script>alert(1)</script>'],
  ])('rejects %s as bad encoding', async (_name, hash) => {
    await expectError(hash, 'bad-encoding');
  });

  it('rejects base64url that is not a deflate stream', async () => {
    await expectError(`#g=${b64u(new Uint8Array(40).fill(0xff))}`, 'inflate-failed');
    await expectError(`#g=${b64u(text('plain text, never compressed'))}`, 'inflate-failed');
  });

  it('rejects a truncated stream', async () => {
    const hash = await forge(valid());
    const cut = hash.slice(0, hash.length - 12);
    const r = await decodeGift(cut, opts());
    expect(r.ok).toBe(false);
  });

  it('stops a small payload that inflates into a large one (a zip bomb)', async () => {
    const bomb = await forge(`"${'a'.repeat(2_000_000)}"`);
    expect(bomb.length).toBeLessThan(MAX_ENCODED_CHARS); // it fits the length cap, so only the output cap can stop it
    await expectError(bomb, 'too-big');
    const justOver = await forge(`"${'a'.repeat(MAX_INFLATED_BYTES)}"`);
    await expectError(justOver, 'too-big');
  });

  it('rejects bytes that are not UTF-8, and text that is not JSON', async () => {
    await expectError(await forge(new Uint8Array([0xff, 0xfe, 0xfd, 0x80])), 'bad-json');
    await expectError(await forge('{"v":1,'), 'bad-json');
    await expectError(await forge('not json'), 'bad-json');
    await expectError(await forge(''), 'bad-json');
    await expectError(await forge('['.repeat(5000)), 'bad-json'); // too deep or never closed
  });

  it.each([
    ['null', 'null'],
    ['a number', '7'],
    ['a string', '"gift"'],
    ['an array', '[1]'],
  ])('rejects JSON that is %s', async (_name, json) => {
    await expectError(await forge(json), 'bad-shape');
  });

  it.each([
    ['version 2', valid({ v: 2 })],
    ['version as text', valid({ v: '1' })],
    ['no version', (() => { const p: Record<string, unknown> = valid(); delete p.v; return p; })()],
  ])('rejects %s as an unknown version', async (_name, payload) => {
    await expectError(await forge(payload), 'bad-version');
  });

  it.each([
    ['an extra field', valid({ extra: 1 })],
    ['a missing field', (() => { const p: Record<string, unknown> = valid(); delete p.n; return p; })()],
    ['blueprint id as a number', valid({ b: 7 })],
    ['blueprint id with bad characters', valid({ b: '../../music_box' })],
    ['blueprint id too long', valid({ b: 'a'.repeat(65) })],
    ['blueprint version as text', valid({ n: '1' })],
    ['blueprint version zero', valid({ n: 0 })],
    ['blueprint version fractional', valid({ n: 1.5 })],
    ['parts as an object', valid({ p: {} })],
    ['a part entry as a string', valid({ p: ['socket_case'] })],
    ['a part entry with three items', valid({ p: [['socket_case', 'music_box_case_walnut', 'x']] })],
    ['a part entry with a number', valid({ p: [['socket_case', 7]] })],
    ['a part id with markup', valid({ p: [['socket_case', '<img src=x onerror=alert(1)>']] })],
    ['a url as a part id', valid({ p: [['socket_case', 'https://evil.example/model.glb']] })],
    ['too many parts', valid({ p: Array.from({ length: MAX_PLACEMENTS + 1 }, (_, i) => [`socket_${i}`, 'shaft_long_brass']) })],
    ['an own __proto__ field', JSON.parse('{"v":1,"b":"music_box","n":1,"p":[],"e":"for_you","__proto__":{"admin":true}}')],
  ])('rejects %s as a bad shape', async (_name, payload) => {
    await expectError(await forge(typeof payload === 'string' ? payload : JSON.stringify(payload)), 'bad-shape');
  });

  it('does not pollute Object.prototype', async () => {
    await decodeGift(await forge('{"v":1,"b":"music_box","n":1,"p":[],"e":"for_you","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'), opts());
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects an engraving that is not one of the eight presets, including free text', async () => {
    for (const e of ['Happy new year', 'FOR_YOU', '', 7, null, ['for_you'], '<b>hi</b>']) {
      await expectError(await forge(valid({ e })), 'unknown-engraving');
    }
  });

  it('rejects unknown blueprints, parts and blueprint versions', async () => {
    await expectError(await forge(valid({ b: 'steam_engine' })), 'unknown-blueprint');
    await expectError(await forge(valid({ n: 2 })), 'blueprint-version');
    const withPart = (partId: string) => valid({ p: FULL.map(([s, p]) => (s === 'socket_key' ? [s, partId] : [s, p])) });
    await expectError(await forge(withPart('rocket_engine_brass')), 'unknown-part');
    await expectError(await forge(withPart('shaft_long_brass')), 'bad-assembly'); // a real part, but not for that socket
  });

  it('rejects an invalid assembly: unknown or repeated sockets, empty required sockets', async () => {
    await expectError(await forge(valid({ p: [...FULL, ['socket_moon', 'shaft_long_brass']] })), 'bad-assembly');
    await expectError(await forge(valid({ p: [...FULL, ['socket_key', 'winding_key_brass']] })), 'bad-assembly');
    await expectError(await forge(valid({ p: FULL.filter(([s]) => s !== 'socket_comb') })), 'bad-assembly');
    await expectError(await forge(valid({ p: [] })), 'bad-assembly');
  });

  it('rejects a machine the solver says does not run, and never trusts a claimed result', async () => {
    await expectError(await forge(valid()), 'solver-rejected', opts(() => false));
    await expectError(await forge(valid({ result: 'runs' })), 'bad-shape'); // there is no result field to claim
  });

  it('does not run the solver on a payload that already failed structurally', async () => {
    const verify = vi.fn<GiftVerifier>(() => true);
    await decodeGift(await forge(valid({ b: 'steam_engine' })), opts(verify));
    await decodeGift(await forge(valid({ extra: 1 })), opts(verify));
    await decodeGift('#g=%%%', opts(verify));
    expect(verify).not.toHaveBeenCalled();
  });

  it('is safe against a catalogue that indexes a plain object, as ids come from a URL', async () => {
    const naive: GiftCatalogue = {
      blueprint: (id) => ({ music_box: catalogue().blueprint('music_box') }[id as 'music_box']),
      hasPart: () => true,
    };
    for (const b of ['constructor', 'toString', '__proto__', 'hasownproperty', 'valueof']) {
      const r = await decodeGift(await forge(valid({ b })), { catalogue: naive, verify: yes });
      expect(r.ok).toBe(false);
    }
  });

  it('never throws and never returns payload text', async () => {
    for (const hash of ['#g=A', '#g=AAAA', '#g=AAAAAAAAAAAAAAAAAAAA', '#g=-_-_-_-_', `#g=${'_'.repeat(MAX_ENCODED_CHARS)}`]) {
      const r = await decodeGift(hash, opts());
      expect(r.ok).toBe(false);
      expect(Object.keys(r).sort()).toEqual(['error', 'ok']);
    }
  });
});

describe('a missing native compression API', () => {
  it('reports unsupported instead of throwing', async () => {
    const CS = globalThis.CompressionStream;
    const DS = globalThis.DecompressionStream;
    try {
      // @ts-expect-error simulating an older browser
      delete globalThis.CompressionStream;
      // @ts-expect-error simulating an older browser
      delete globalThis.DecompressionStream;
      expect(await encodeGift(gift(), opts())).toEqual({ ok: false, error: 'unsupported' });
      expect(await decodeGift('#g=AAAA', opts())).toEqual({ ok: false, error: 'unsupported' });
    } finally {
      globalThis.CompressionStream = CS;
      globalThis.DecompressionStream = DS;
    }
  });
});
