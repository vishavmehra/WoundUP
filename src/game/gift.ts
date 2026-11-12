/**
 * The gift link codec: one finished machine and one preset engraving in the URL hash (PRODUCT_SPEC §13;
 * TECHNICAL_ARCHITECTURE §17; DATA_AND_BLUEPRINT_SPEC §15; BLUEPRINT_SHARING_SPEC §2 and §4).
 *
 *   encode: Gift -> validate -> JSON -> CompressionStream('deflate-raw') -> base64url -> `#g=<data>`
 *   decode: `#g=<data>` -> length cap -> alphabet -> base64url -> inflate with an output cap -> UTF-8 -> JSON
 *           -> exact-shape check -> catalogue check -> solver check -> Gift
 *
 * The URL is untrusted input (CLAUDE.md §16). The decoder never evaluates anything, copies only known fields into new
 * objects, rejects unknown fields instead of ignoring them, bounds every size before it grows, and returns a result
 * code instead of throwing. The payload carries no claimed solver result: the caller's solver recomputes it.
 *
 * This module knows nothing about the save: gift data is read-only and never reaches the recipient's save
 * (SAVE_PERSISTENCE_SPEC §13). Blueprints, parts and the solver belong to other modules and come in through
 * `GiftCatalogue` and `GiftVerifier`, so this file imports no rendering, no IWSDK and no other game module.
 */

import { ENGRAVING_IDS, isOneOf, type EngravingId } from './content';

export const GIFT_VERSION = 1;
/** PRODUCT_SPEC §13: aim for a whole link under this many characters. `encodeGift` reports the data, the caller adds the base URL. */
export const GIFT_URL_TARGET_CHARS = 1500;
/** Longest base64url data the decoder will look at, and the encoder will produce. Above the target, below anything dangerous. */
export const MAX_ENCODED_CHARS = 4096;
/** Inflate output cap in bytes: a small payload cannot expand into a large one (BLUEPRINT_SHARING_SPEC §4 step 3). */
export const MAX_INFLATED_BYTES = 8192;
export const MAX_PLACEMENTS = 32;
const ID_PATTERN = /^[a-z0-9_]{1,64}$/;
const DATA_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface GiftPlacement {
  readonly socketId: string;
  readonly partId: string;
}

/** One finished machine as a gift. No solver output and no free text. */
export interface Gift {
  readonly blueprintId: string;
  /** The blueprint's `version`, so an old link cannot silently mean a changed machine (MECHANICAL_ENGINE_V2 §7). */
  readonly blueprintVersion: number;
  readonly placements: readonly GiftPlacement[];
  readonly engraving: EngravingId;
}

export interface GiftBlueprintInfo {
  readonly version: number;
  readonly sockets: readonly { readonly id: string; readonly required: boolean }[];
  /** True when this socket takes this part (its family and accepted part ids), never inferred from appearance. */
  accepts(socketId: string, partId: string): boolean;
}

/**
 * What the codec needs from the content layer. Implement both lookups with `Map` or `Set`, never by indexing a plain
 * object: ids come from a URL and a plain-object lookup would answer for `constructor`. The codec also re-checks the
 * shape of what `blueprint` returns.
 */
export interface GiftCatalogue {
  /** Undefined for an unknown blueprint id. */
  blueprint(blueprintId: string): GiftBlueprintInfo | undefined;
  hasPart(partId: string): boolean;
}

/** The mechanical solver's verdict on the rebuilt machine: true only when it runs correctly (GAMEPLAY_SYSTEMS §9.2). */
export type GiftVerifier = (gift: Gift) => boolean;

export interface GiftOptions {
  readonly catalogue: GiftCatalogue;
  readonly verify: GiftVerifier;
}

export type GiftError =
  /** The hash holds no `g=` payload, so this is not a gift link. */
  | 'not-a-gift'
  | 'too-long'
  | 'bad-encoding'
  /** CompressionStream or DecompressionStream is missing in this browser. */
  | 'unsupported'
  | 'inflate-failed'
  | 'too-big'
  | 'bad-json'
  | 'bad-version'
  | 'bad-shape'
  | 'unknown-blueprint'
  | 'blueprint-version'
  | 'unknown-part'
  | 'unknown-engraving'
  /** Unknown socket, repeated socket, a part the socket does not take, or a required socket left empty. */
  | 'bad-assembly'
  | 'solver-rejected';

export type GiftEncodeResult =
  | { readonly ok: true; readonly data: string; readonly hash: string }
  | { readonly ok: false; readonly error: GiftError };

export type GiftDecodeResult = { readonly ok: true; readonly gift: Gift } | { readonly ok: false; readonly error: GiftError };

const fail = (error: GiftError) => ({ ok: false, error }) as const;

// ---- Validation shared by encode and decode ------------------------------------------------------------------------

/** Plain code-unit order, never locale order, so one machine always encodes to one link (MECHANICAL_ENGINE_V2 D1). */
const bySocket = (a: GiftPlacement, b: GiftPlacement) => (a.socketId < b.socketId ? -1 : a.socketId > b.socketId ? 1 : 0);

/** The checks that need the content layer. Returns the first problem, or null when the gift is sound. */
function checkAgainstCatalogue(gift: Gift, { catalogue, verify }: GiftOptions): GiftError | null {
  if (!isOneOf(ENGRAVING_IDS, gift.engraving)) return 'unknown-engraving';
  const info = catalogue.blueprint(gift.blueprintId);
  if (typeof info !== 'object' || info === null || typeof info.version !== 'number' || !Array.isArray(info.sockets)) {
    return 'unknown-blueprint';
  }
  if (info.version !== gift.blueprintVersion) return 'blueprint-version';
  const filled = new Set<string>();
  for (const { socketId, partId } of gift.placements) {
    if (!catalogue.hasPart(partId)) return 'unknown-part';
    if (filled.has(socketId) || !info.sockets.some((s) => s.id === socketId) || !info.accepts(socketId, partId)) return 'bad-assembly';
    filled.add(socketId);
  }
  if (info.sockets.some((s) => s.required && !filled.has(s.id))) return 'bad-assembly';
  try {
    return verify(gift) ? null : 'solver-rejected';
  } catch {
    return 'solver-rejected';
  }
}

/** The exact payload shape, field by field: `{ v, b, n, p: [[socket, part], ...], e }`. Unknown fields are rejected. */
function readPayload(value: unknown): Gift | GiftError {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'bad-shape';
  const o = value as Record<string, unknown>;
  if (o.v !== GIFT_VERSION) return 'bad-version';
  const keys = Object.keys(o);
  if (keys.length !== 5 || !['v', 'b', 'n', 'p', 'e'].every((k) => keys.includes(k))) return 'bad-shape';
  const { b, n, p, e } = o;
  if (typeof b !== 'string' || !ID_PATTERN.test(b)) return 'bad-shape';
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return 'bad-shape';
  if (!Array.isArray(p) || p.length > MAX_PLACEMENTS) return 'bad-shape';
  if (!isOneOf(ENGRAVING_IDS, e)) return 'unknown-engraving';
  const placements: GiftPlacement[] = [];
  for (const pair of p as unknown[]) {
    if (!Array.isArray(pair) || pair.length !== 2) return 'bad-shape';
    const [socketId, partId] = pair as unknown[];
    if (typeof socketId !== 'string' || typeof partId !== 'string') return 'bad-shape';
    if (!ID_PATTERN.test(socketId) || !ID_PATTERN.test(partId)) return 'bad-shape';
    placements.push({ socketId, partId });
  }
  return { blueprintId: b, blueprintVersion: n, placements: placements.sort(bySocket), engraving: e };
}

// ---- base64url and the native streams ------------------------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Null for anything that is not canonical-length base64url. */
function fromBase64Url(data: string): Uint8Array | null {
  if (!DATA_PATTERN.test(data) || data.length % 4 === 1) return null;
  try {
    const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Pushes `input` through a transform stream and collects the output, giving up (and cancelling the stream) the moment
 * the output passes `cap` bytes. Resolves to null when the cap was hit; rejects when the stream errors.
 */
async function pipeThrough(
  input: Uint8Array,
  stream: { readonly writable: WritableStream<BufferSource>; readonly readable: ReadableStream<Uint8Array> },
  cap: number,
): Promise<Uint8Array | null> {
  const writer = stream.writable.getWriter();
  // A bad stream errors the readable side too, which is where the failure is reported; these only avoid unhandled rejections.
  writer.write(input as BufferSource).catch(() => undefined);
  writer.close().catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// ---- Public API ----------------------------------------------------------------------------------------------------

/** True when a URL hash carries a gift (`#g=...`), so the app opens the viewer instead of the game. */
export function hasGiftHash(hash: string): boolean {
  return typeof hash === 'string' && /^#?g=/.test(hash);
}

/** The full link for a page: `<page>#g=<data>`, replacing any hash the page URL already has. */
export function buildGiftUrl(pageUrl: string, data: string): string {
  return `${pageUrl.split('#')[0]}#g=${data}`;
}

/** Validates a finished machine and turns it into `{ data, hash }`. Refuses anything the viewer would refuse. */
export async function encodeGift(gift: Gift, options: GiftOptions): Promise<GiftEncodeResult> {
  if (typeof CompressionStream === 'undefined') return fail('unsupported');
  // Use the decoder's own shape and catalogue checks, so a link the viewer would refuse is never produced.
  const placements = [...gift.placements].sort(bySocket);
  const payload = { v: GIFT_VERSION, b: gift.blueprintId, n: gift.blueprintVersion, p: placements.map((x) => [x.socketId, x.partId]), e: gift.engraving };
  const read = readPayload(payload);
  if (typeof read === 'string') return fail(read);
  const problem = checkAgainstCatalogue(read, options);
  if (problem !== null) return fail(problem);

  let compressed: Uint8Array | null;
  try {
    compressed = await pipeThrough(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream('deflate-raw'), Infinity);
  } catch {
    return fail('unsupported');
  }
  if (compressed === null) return fail('unsupported');
  const data = toBase64Url(compressed);
  if (data.length > MAX_ENCODED_CHARS) return fail('too-long');
  return { ok: true, data, hash: `#g=${data}` };
}

/**
 * Reads a gift from `location.hash`. Never throws. Every failure is a code for the error card; none of the payload's
 * own text is ever returned or shown.
 */
export async function decodeGift(hash: string, options: GiftOptions): Promise<GiftDecodeResult> {
  if (!hasGiftHash(hash)) return fail('not-a-gift');
  if (hash.length > MAX_ENCODED_CHARS + 3) return fail('too-long'); // before copying or decoding anything (the 3 is `#g=`)
  const data = hash.slice(hash.indexOf('=') + 1);
  const compressed = fromBase64Url(data);
  if (compressed === null) return fail('bad-encoding');
  if (typeof DecompressionStream === 'undefined') return fail('unsupported');

  let inflated: Uint8Array | null;
  try {
    inflated = await pipeThrough(compressed, new DecompressionStream('deflate-raw'), MAX_INFLATED_BYTES);
  } catch {
    return fail('inflate-failed');
  }
  if (inflated === null) return fail('too-big');

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inflated));
  } catch {
    return fail('bad-json');
  }
  const read = readPayload(value);
  if (typeof read === 'string') return fail(read);
  const problem = checkAgainstCatalogue(read, options);
  return problem === null ? { ok: true, gift: read } : fail(problem);
}
