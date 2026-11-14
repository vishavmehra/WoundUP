import { giftErrorText } from './copy.js';
import { resolveGift } from './gift-flow.js';
import type { Gift, GiftOptions } from '../game/gift.js';
import type { Insets } from '../stage-framing.js';
import { PALETTE } from './palette.js';

/**
 * The 2D gift page (UI_UX_SPEC §18): wrapped gift, Unwrap, then the machine's card and "Make your own". It reads the URL hash
 * through the game core's decoder, so a bad link ends on an error card and never touches the game. All text is set with
 * `textContent` from closed tables: nothing from the link is ever parsed as markup.
 * The 3D reveal belongs to the scene: `onReveal` is called with the validated gift and the integrator shows the machine.
 *
 * Layout: the card never covers the machine. On a window that is wider than it is tall the card is a plate on the left and the
 * machine takes the rest; on a portrait window it is a plate along the bottom. Either way the viewer tells the page how much of
 * the window the card covers (`onLayout`), and the page frames the machine in what is left (src/stage-framing.ts).
 */
export interface GiftViewerOptions extends GiftOptions {
  /** The recipient unwrapped the gift: show and start the machine. */
  onReveal?(gift: Gift): void;
  /**
   * The part of the window the revealed card covers, measured whenever it changes; null while there is no machine on show
   * (wrapped, error, or after `destroy`). The page frames the machine inside the rest.
   */
  onLayout?(insets: Insets | null): void;
  /** Where "Make your own" goes: the game page without the gift hash. */
  makeYourOwnHref: string;
  /** The page's brass-and-cream look needs the fonts; the landing page already has them, so this is only for a bare page. */
  fontBase?: string;
}

export interface GiftViewer {
  destroy(): void;
}

/** Windows at least this wide and clearly wider than tall put the card on the left (the same rule is in the CSS below). */
const SIDE_LAYOUT = '(min-aspect-ratio: 6/5) and (min-width: 700px)';
/** Space the preview's own buttons take along the top of the window, and the gap kept between the card and the machine. */
const TOP_BAR_PX = 64;
const GAP_PX = 16;

const CSS = `
.wu-gift{position:fixed;inset:0;display:grid;box-sizing:border-box;padding:12px;color:${PALETTE.cream};font:400 clamp(1rem,.62rem + 1vmin,1.3rem)/1.45 Cabin,"Gill Sans","Trebuchet MS",system-ui,sans-serif;z-index:20}
.wu-gift[data-state=wrapped],.wu-gift[data-state=error]{place-items:center;background:radial-gradient(ellipse at 50% 40%,rgba(31,92,92,.55),${PALETTE.night} 72%)}
.wu-gift[data-state=revealed]{place-items:end center;padding-bottom:calc(5rem + env(safe-area-inset-bottom,0px));background:transparent;pointer-events:none}
.wu-gift__card{pointer-events:auto;position:relative;box-sizing:border-box;width:min(100%,28rem);padding:1.1em 1.2em 1.15em;border:2px solid ${PALETTE.brass};border-radius:10px;background:linear-gradient(180deg,color-mix(in srgb,${PALETTE.walnut} 88%,${PALETTE.cream}),${PALETTE.walnut} 55%,color-mix(in srgb,${PALETTE.walnut} 80%,${PALETTE.ink}));text-align:center;box-shadow:inset 0 0 0 5px ${PALETTE.walnut},inset 0 0 0 6px rgba(201,162,39,.5),0 14px 40px rgba(7,25,26,.65)}
.wu-gift[data-state=wrapped] .wu-gift__card,.wu-gift[data-state=error] .wu-gift__card{padding:1.6em 1.5em 1.5em}
.wu-gift h1{margin:0 0 .15em;font:400 clamp(1.7rem,1.2rem + 2vmin,2.5rem)/1.1 Elsie,Georgia,serif;color:${PALETTE.cream}}
.wu-gift p{margin:.25em 0 .8em}
.wu-gift__engraving{margin:.05em 0 .35em!important;font:400 1.3em/1.2 Elsie,Georgia,serif;color:${PALETTE.lamp}}
.wu-gift__rule{height:1px;margin:.55em auto .7em;width:70%;background:linear-gradient(90deg,transparent,${PALETTE.brass},transparent)}
.wu-gift__actions{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem;margin-top:.4em}
.wu-gift a,.wu-gift button{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;min-width:44px;padding:0 1.3em;border:2px solid ${PALETTE.ink};border-radius:8px;background:${PALETTE.brass};color:${PALETTE.ink};font:700 1em Cabin,system-ui,sans-serif;text-decoration:none;cursor:pointer;box-shadow:0 2px 0 ${PALETTE.brassDark}}
.wu-gift a:hover,.wu-gift button:hover{background:${PALETTE.brassLit}}
.wu-gift a.wu-gift__ghost{background:transparent;color:${PALETTE.cream};border-color:${PALETTE.brass};box-shadow:none}
.wu-gift a.wu-gift__ghost:hover{background:rgba(201,162,39,.18)}
.wu-gift :focus-visible{outline:2px solid ${PALETTE.lamp};outline-offset:3px}
.wu-gift__parcel{position:relative;width:5.2rem;height:3.6rem;margin:0 auto 1rem;border:2px solid ${PALETTE.ink};border-radius:4px;background:linear-gradient(90deg,transparent calc(50% - .45rem),${PALETTE.teal} calc(50% - .45rem),${PALETTE.teal} calc(50% + .45rem),transparent calc(50% + .45rem)),linear-gradient(180deg,transparent calc(50% - .4rem),${PALETTE.teal} calc(50% - .4rem),${PALETTE.teal} calc(50% + .4rem),transparent calc(50% + .4rem)),${PALETTE.cream};box-shadow:0 .35rem 0 -.1rem rgba(7,25,26,.5)}
.wu-gift__parcel::after{content:"";position:absolute;left:50%;top:50%;width:1.1rem;height:1.1rem;margin:-.55rem 0 0 -.55rem;border:2px solid ${PALETTE.ink};border-radius:50%;background:${PALETTE.brass}}
@media ${SIDE_LAYOUT}{
.wu-gift[data-state=revealed]{place-items:center start;padding:12px 12px 12px clamp(16px,3vw,56px)}
.wu-gift[data-state=revealed] .wu-gift__card{width:clamp(17rem,28vw,25rem);padding:1.4em 1.4em 1.5em}
.wu-gift[data-state=revealed] .wu-gift__actions{flex-direction:column;align-items:stretch}
}
@media (max-width:420px){.wu-gift__card{padding:.95em 1em 1em}.wu-gift p{margin-bottom:.6em}}
@media (prefers-reduced-motion:no-preference){.wu-gift__card{animation:wu-gift-in .5s cubic-bezier(.16,1,.3,1)}@keyframes wu-gift-in{from{opacity:0;transform:translateY(12px)}}}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export async function mountGiftViewer(root: HTMLElement, hash: string, options: GiftViewerOptions): Promise<GiftViewer> {
  const style = el('style', CSS);
  const shell = el('section', undefined, 'wu-gift');
  shell.setAttribute('aria-label', 'A gift from Tockton');
  const card = el('div', undefined, 'wu-gift__card');
  card.setAttribute('role', 'status');
  shell.append(card);
  root.append(style, shell);
  card.append(el('h1', 'Opening your gift…'));

  /** How much of the window the card covers, told to the page whenever it may have changed. Needs a real window; a test DOM has none. */
  const canMeasure = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const publish = (): void => {
    if (!options.onLayout || !canMeasure) return;
    if (shell.dataset.state !== 'revealed') return options.onLayout(null);
    const box = card.getBoundingClientRect();
    options.onLayout(
      window.matchMedia(SIDE_LAYOUT).matches
        ? { top: TOP_BAR_PX, right: GAP_PX, bottom: GAP_PX, left: box.right + GAP_PX }
        : { top: TOP_BAR_PX, right: GAP_PX, bottom: window.innerHeight - box.top + GAP_PX, left: GAP_PX },
    );
  };
  const observer = canMeasure && typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
  observer?.observe(card);
  if (canMeasure) window.addEventListener('resize', publish);

  const make = (): HTMLAnchorElement => {
    const a = el('a', 'Make your own', 'wu-gift__ghost');
    a.href = options.makeYourOwnHref;
    return a;
  };
  const show = (nodes: Node[], state: string, focus?: HTMLElement): void => {
    card.replaceChildren(...nodes);
    shell.dataset.state = state;
    focus?.focus();
    publish();
  };

  const model = await resolveGift(hash, options);
  if (model.kind === 'error') {
    const text = giftErrorText(model.error);
    card.setAttribute('role', 'alert');
    show([el('h1', text.title), el('p', text.body), make()], 'error');
  } else {
    const unwrap = el('button', 'Unwrap');
    unwrap.type = 'button';
    unwrap.addEventListener('click', () => {
      options.onReveal?.(model.gift);
      const again = el('button', 'Show it again');
      again.type = 'button';
      again.addEventListener('click', () => options.onReveal?.(model.gift));
      const actions = el('div', undefined, 'wu-gift__actions');
      actions.append(again, make());
      show([el('h1', model.machine), el('p', model.engraving, 'wu-gift__engraving'), el('div', undefined, 'wu-gift__rule'), el('p', `${model.parts} parts, all in place. Watch it run.`), actions], 'revealed', again);
    });
    show([el('div', undefined, 'wu-gift__parcel'), el('h1', 'A gift for you'), el('p', 'Someone built this machine for you in Tockton.'), unwrap], 'wrapped', unwrap);
  }
  return {
    destroy() {
      observer?.disconnect();
      if (canMeasure) window.removeEventListener('resize', publish);
      shell.remove();
      style.remove();
      options.onLayout?.(null);
    },
  };
}
