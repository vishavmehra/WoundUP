/**
 * The help card shown with the emulated headset. Every control it names is IWER's own panel (@iwer/devui 2.8.0, read from
 * its source and checked against DEFAULT_KEYMAP in tests/emulator/help.test.ts): the two hand panels at the bottom of the
 * window, the top bar, and its Play mode.
 */
export const HELP_TITLE = 'Emulated Quest 3';

export const HELP_LEDE = 'A headset simulated in your browser, not a real one. Your hands are the two panels at the bottom of the window.';

export const HELP_STEPS: ReadonlyArray<{ readonly term: string; readonly text: string }> = [
  { term: 'Move a hand', text: 'Drag the arrows on a hand to move it. Click them to switch between moving and turning it.' },
  { term: 'Pinch', text: 'Drag along a Pinch bar to close that hand; the pin button keeps it held. Pinching is how you grab, snap and wind.' },
  { term: 'Look around', text: 'Press the play button in the top bar. The mouse turns your head and both hands follow it. Hold left click to pinch with the left hand, right click for the right. Shift + W A S D walks, Esc leaves.' },
];

/** On a small window the card would cover the scene, so it starts folded into its tab there. */
const SMALL_WINDOW = '(max-height: 34rem), (max-width: 40rem)';

const STORAGE_KEY = 'wound-up.emulator-help';

const readHidden = (): boolean => {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'hidden';
  } catch {
    return false;
  }
};
const writeHidden = (hidden: boolean): void => {
  try {
    sessionStorage.setItem(STORAGE_KEY, hidden ? 'hidden' : 'shown');
  } catch {
    /* private window or blocked storage: the card simply opens again next page load */
  }
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** A card the visitor can dismiss and bring back from a small tab. The element belongs to the emulator's container, so it exists only while a session runs. */
export function mountHelpCard(): HTMLElement {
  const root = el('div', 'wu-emu-help');

  const card = el('section', 'wu-emu-card');
  card.setAttribute('aria-labelledby', 'wu-emu-title');
  const head = el('header', 'wu-emu-head');
  const title = el('h2', 'wu-emu-title', HELP_TITLE);
  title.id = 'wu-emu-title';
  const close = el('button', 'wu-emu-x');
  close.type = 'button';
  close.setAttribute('aria-label', 'Hide the controls card');
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  head.append(title, close);
  const lede = el('p', 'wu-emu-lede', HELP_LEDE);
  const list = el('dl', 'wu-emu-steps');
  for (const step of HELP_STEPS) {
    const row = el('div', 'wu-emu-step');
    row.append(el('dt', 'wu-emu-term', step.term), el('dd', 'wu-emu-text', step.text));
    list.append(row);
  }
  card.append(head, lede, list);

  const tab = el('button', 'wu-emu-tab', 'Emulated Quest 3: controls');
  tab.type = 'button';

  const show = (open: boolean): void => {
    card.hidden = !open;
    tab.hidden = open;
    tab.setAttribute('aria-expanded', String(open));
    writeHidden(!open);
  };
  close.addEventListener('click', () => {
    show(false);
    tab.focus({ preventScroll: true });
  });
  tab.addEventListener('click', () => {
    show(true);
    close.focus({ preventScroll: true });
  });
  show(!readHidden() && !matchMedia(SMALL_WINDOW).matches);

  root.append(card, tab);
  return root;
}
