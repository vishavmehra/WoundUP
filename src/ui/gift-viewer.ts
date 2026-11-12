import { giftErrorText } from './copy.js';
import { resolveGift } from './gift-flow.js';
import type { Gift, GiftOptions } from '../game/gift.js';
import { PALETTE } from './palette.js';

/**
 * The 2D gift page (UI_UX_SPEC §18): wrapped gift, Unwrap, then the machine's card and "Make your own". It reads the URL hash
 * through the game core's decoder, so a bad link ends on an error card and never touches the game. All text is set with
 * `textContent` from closed tables: nothing from the link is ever parsed as markup.
 * The 3D reveal belongs to the scene: `onReveal` is called with the validated gift and the integrator shows the machine.
 */
export interface GiftViewerOptions extends GiftOptions {
  /** The recipient unwrapped the gift: show and start the machine. */
  onReveal?(gift: Gift): void;
  /** Where "Make your own" goes: the game page without the gift hash. */
  makeYourOwnHref: string;
  /** The page's brass-and-cream look needs the fonts; the landing page already has them, so this is only for a bare page. */
  fontBase?: string;
}

export interface GiftViewer {
  destroy(): void;
}

const CSS = `
.wu-gift{position:fixed;inset:0;display:grid;place-items:center;padding:16px;background:rgba(7,25,26,.72);color:${PALETTE.cream};font:400 clamp(1rem,.62rem + 1vmin,1.4rem)/1.5 Cabin,"Gill Sans","Trebuchet MS",system-ui,sans-serif;z-index:20}
.wu-gift[data-state=revealed]{place-items:end center;background:transparent;pointer-events:none}
.wu-gift__card{pointer-events:auto;box-sizing:border-box;width:min(100%,30rem);padding:1.6em 1.4em;border:2px solid ${PALETTE.brass};border-radius:14px;background:${PALETTE.walnut};text-align:center;box-shadow:0 12px 40px rgba(7,25,26,.6)}
.wu-gift h1{margin:0 0 .3em;font:400 clamp(1.8rem,1.2rem + 2.4vmin,2.8rem)/1.1 Elsie,Georgia,serif}
.wu-gift p{margin:.3em 0 1em}
.wu-gift__engraving{font:400 1.5em/1.2 Elsie,Georgia,serif;color:${PALETTE.lamp}}
.wu-gift a,.wu-gift button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 1.4em;margin:.25em;border:2px solid ${PALETTE.ink};border-radius:10px;background:${PALETTE.brass};color:${PALETTE.ink};font:700 1.05em Cabin,system-ui,sans-serif;text-decoration:none;cursor:pointer}
.wu-gift a:hover,.wu-gift button:hover{background:${PALETTE.brassLit}}
.wu-gift a.wu-gift__ghost{background:transparent;color:${PALETTE.cream};border-color:${PALETTE.brass}}
.wu-gift :focus-visible{outline:2px solid ${PALETTE.lamp};outline-offset:3px}
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

  const make = (): HTMLAnchorElement => {
    const a = el('a', 'Make your own', 'wu-gift__ghost');
    a.href = options.makeYourOwnHref;
    return a;
  };
  const show = (nodes: Node[], state: string, focus?: HTMLElement): void => {
    card.replaceChildren(...nodes);
    shell.dataset.state = state;
    focus?.focus();
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
      show([el('h1', model.machine), el('p', model.engraving, 'wu-gift__engraving'), el('p', `${model.parts} parts, all in place. Turn it and watch it run.`), again, make()], 'revealed', again);
    });
    show([el('h1', 'A gift for you'), el('p', 'Someone built this machine for you in Tockton.'), unwrap], 'wrapped', unwrap);
  }
  return {
    destroy() {
      shell.remove();
      style.remove();
    },
  };
}
