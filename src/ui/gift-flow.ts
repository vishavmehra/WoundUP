import { ENGRAVINGS, isOneOf, MACHINE_IDS, type EngravingId, type MachineId } from '../game/content.js';
import { buildGiftUrl, decodeGift, encodeGift, type Gift, type GiftError, type GiftOptions } from '../game/gift.js';
import { MACHINE_NAMES, engravingText } from './copy.js';
import { PALETTE } from './palette.js';

/**
 * Making and receiving a gift link (PRODUCT_SPEC §13; UI_UX_SPEC §17, §18). The codec and its validation are the game core's
 * (`src/game/gift.ts`); this file only connects them to a headset button and to the 2D gift page. A link is untrusted input:
 * what the page shows comes from the closed content lists, never from the payload's own text.
 */

/** What the integrator provides: the live assembly and the content layer's catalogue and solver check. */
export interface GiftHost {
  /** The finished machine's placements as a `Gift`, or null when it cannot be built (the button then says so). */
  build(machineId: MachineId, engraving: EngravingId): Gift | null;
  options: GiftOptions;
  /** The page's own URL, whose hash is replaced by the gift. */
  pageUrl(): string;
}

export interface ShareEnv {
  writeText?: (text: string) => Promise<void>;
  share?: (data: { url: string; title: string }) => Promise<void>;
}

export type LinkOutcome =
  | { ok: true; url: string; delivered: 'copied' | 'shared' | 'shown' }
  | { ok: false; error: GiftError | 'no-machine' };

export function browserShareEnv(): ShareEnv {
  if (typeof navigator === 'undefined') return {};
  const env: ShareEnv = {};
  if (navigator.clipboard?.writeText) env.writeText = (t) => navigator.clipboard.writeText(t);
  if (typeof navigator.share === 'function') env.share = (d) => navigator.share(d);
  return env;
}

/**
 * Builds the link and tries to hand it over: clipboard first (predictable in a headset), then the native share sheet, and
 * otherwise `shown`, which means the caller must put the link where the player can read it (`showLinkInPage`).
 */
export async function createGiftLink(host: GiftHost, machineId: MachineId, engraving: EngravingId, env: ShareEnv = browserShareEnv()): Promise<LinkOutcome> {
  const gift = host.build(machineId, engraving);
  if (!gift) return { ok: false, error: 'no-machine' };
  const encoded = await encodeGift(gift, host.options);
  if (!encoded.ok) return { ok: false, error: encoded.error };
  const url = buildGiftUrl(host.pageUrl(), encoded.data);
  try {
    if (env.writeText) {
      await env.writeText(url);
      return { ok: true, url, delivered: 'copied' };
    }
  } catch {
    /* blocked here (no user activation, or no permission): try the share sheet */
  }
  try {
    if (env.share) {
      await env.share({ url, title: 'A machine from Tockton' });
      return { ok: true, url, delivered: 'shared' };
    }
  } catch {
    /* the player closed the sheet or sharing is blocked */
  }
  return { ok: true, url, delivered: 'shown' };
}

/** A short form of the link for the in-headset label: the start of it and its length, since nobody can read 1,500 characters in a headset. */
export function shortLink(url: string, keep = 46): string {
  return url.length <= keep ? url : `${url.slice(0, keep)}… (${url.length} characters)`;
}

/**
 * The visible fallback when neither clipboard nor sharing worked: a read-only text box on the 2D page, selected, so the link
 * can be copied once the headset is off (or in the desktop preview). Returns a function that removes it.
 */
export function showLinkInPage(url: string): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const box = document.createElement('div');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Gift link');
  box.style.cssText = `position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:30;width:min(92vw,40rem);padding:12px;border:2px solid ${PALETTE.brass};border-radius:10px;background:${PALETTE.night};color:${PALETTE.cream};font:400 1rem Cabin,system-ui,sans-serif`;
  const label = document.createElement('p');
  label.textContent = 'Your gift link. Copy it and send it to someone.';
  label.style.margin = '0 0 8px';
  const area = document.createElement('textarea');
  area.readOnly = true;
  area.value = url;
  area.rows = 4;
  area.style.cssText = `width:100%;box-sizing:border-box;font:400 0.9rem ui-monospace,monospace;background:${PALETTE.cream};color:${PALETTE.ink};border:0;border-radius:6px;padding:8px`;
  area.addEventListener('focus', () => area.select());
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.style.cssText = `margin-top:8px;min-height:44px;padding:0 20px;border:2px solid ${PALETTE.ink};border-radius:8px;background:${PALETTE.brass};color:${PALETTE.ink};font:700 1rem Cabin,system-ui,sans-serif`;
  const remove = (): void => box.remove();
  close.addEventListener('click', remove);
  box.append(label, area, close);
  document.body.append(box);
  return remove;
}

// ---- The 2D gift page's model ----------------------------------------------------------------------------------------

export type GiftModel =
  | { kind: 'error'; error: GiftError }
  | { kind: 'gift'; gift: Gift; machine: string; engraving: string; parts: number };

/** Decodes a URL hash into what the page may say. Never throws; every failure is a code the page turns into its own sentence. */
export async function resolveGift(hash: string, options: GiftOptions): Promise<GiftModel> {
  const result = await decodeGift(hash, options);
  if (!result.ok) return { kind: 'error', error: result.error };
  const { gift } = result;
  return {
    kind: 'gift',
    gift,
    // The blueprint id passed the catalogue, but the words come from the closed list anyway.
    machine: isOneOf(MACHINE_IDS, gift.blueprintId) ? MACHINE_NAMES[gift.blueprintId] : 'A machine',
    engraving: engravingText(gift.engraving, ENGRAVINGS),
    parts: gift.placements.length,
  };
}
