import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasGiftHash, type Gift, type GiftBlueprintInfo, type GiftOptions } from '../../src/game/gift';
import { createGiftLink, resolveGift, shortLink, type GiftHost, type ShareEnv } from '../../src/ui/gift-flow';
import { mountGiftViewer } from '../../src/ui/gift-viewer';

// A one-socket catalogue standing in for the real blueprint.
const info: GiftBlueprintInfo = {
  version: 1,
  sockets: [{ id: 'socket_case', required: true }],
  accepts: (socket, part) => socket === 'socket_case' && part === 'music_box_case_walnut',
};
const options = (verify = true): GiftOptions => ({
  catalogue: { blueprint: (id) => (id === 'music_box' ? info : undefined), hasPart: (id) => id === 'music_box_case_walnut' },
  verify: () => verify,
});
const gift: Gift = { blueprintId: 'music_box', blueprintVersion: 1, placements: [{ socketId: 'socket_case', partId: 'music_box_case_walnut' }], engraving: 'for_you' };
const host = (build: GiftHost['build'] = () => gift, opt = options()): GiftHost => ({ build, options: opt, pageUrl: () => 'https://example.test/play?x=1#old' });
const hashOf = (url: string): string => url.slice(url.indexOf('#'));

describe('createGiftLink', () => {
  it('copies the link to the clipboard first', async () => {
    const writeText = vi.fn(async () => undefined);
    const share = vi.fn(async () => undefined);
    const out = await createGiftLink(host(), 'music_box', 'for_you', { writeText, share });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.delivered).toBe('copied');
    expect(out.url.startsWith('https://example.test/play?x=1#g=')).toBe(true); // the page's old hash is replaced
    expect(hasGiftHash(hashOf(out.url))).toBe(true);
    expect(writeText).toHaveBeenCalledWith(out.url);
    expect(share).not.toHaveBeenCalled();
  });

  it('falls back to the share sheet, then to showing the link', async () => {
    const blocked: ShareEnv = { writeText: async () => Promise.reject(new Error('NotAllowedError')) };
    const shared = await createGiftLink(host(), 'music_box', 'for_you', { ...blocked, share: async () => undefined });
    expect(shared).toMatchObject({ ok: true, delivered: 'shared' });
    const cancelled = await createGiftLink(host(), 'music_box', 'for_you', { ...blocked, share: async () => Promise.reject(new Error('AbortError')) });
    expect(cancelled).toMatchObject({ ok: true, delivered: 'shown' });
    expect(await createGiftLink(host(), 'music_box', 'for_you', {})).toMatchObject({ ok: true, delivered: 'shown' });
  });

  it('reports a machine that is not on the table, and a gift the codec refuses', async () => {
    expect(await createGiftLink(host(() => null), 'music_box', 'for_you', {})).toEqual({ ok: false, error: 'no-machine' });
    const refused = await createGiftLink(host(() => gift, options(false)), 'music_box', 'for_you', {});
    expect(refused).toEqual({ ok: false, error: 'solver-rejected' });
  });
});

describe('shortLink', () => {
  it('keeps a short link whole and cuts a long one with its length', () => {
    expect(shortLink('https://a.test/#g=abc')).toBe('https://a.test/#g=abc');
    const long = `https://a.test/#g=${'x'.repeat(1500)}`;
    const s = shortLink(long, 30);
    expect(s.startsWith(long.slice(0, 30))).toBe(true);
    expect(s).toContain(`${long.length} characters`);
    expect(s.length).toBeLessThan(80);
  });
});

describe('resolveGift (the viewer page model)', () => {
  it('turns a good link into names from the closed lists', async () => {
    const made = await createGiftLink(host(), 'music_box', 'for_you', {});
    if (!made.ok) throw new Error('setup');
    const model = await resolveGift(hashOf(made.url), options());
    expect(model).toMatchObject({ kind: 'gift', machine: 'Music Box', engraving: 'For you', parts: 1 });
  });

  it('refuses everything else with a code and never throws', async () => {
    const bad = ['', '#', '#g=', '#g=!!!', '#g=AAAA', `#g=${'A'.repeat(5000)}`, '#x=1', '#g=%3Cscript%3E', '#g=\u0000'];
    for (const hash of bad) {
      const m = await resolveGift(hash, options());
      expect(m.kind).toBe('error');
    }
    const made = await createGiftLink(host(), 'music_box', 'for_you', {});
    if (!made.ok) throw new Error('setup');
    const stale = await resolveGift(hashOf(made.url), { ...options(), catalogue: { blueprint: () => ({ ...info, version: 2 }), hasPart: () => true } });
    expect(stale).toEqual({ kind: 'error', error: 'blueprint-version' });
  });
});

// ---- The viewer page, against a very small stand-in for the DOM -------------------------------------------------------

class El {
  children: Array<El | string> = [];
  attrs: Record<string, string> = {};
  listeners: Record<string, Array<() => void>> = {};
  dataset: Record<string, string> = {};
  className = '';
  href = '';
  type = '';
  removed = false;
  focused = false;
  /** What `getBoundingClientRect` answers: a test sets it to say where the browser would have laid this element out. */
  rect = { left: 0, top: 0, right: 0, bottom: 0 };
  constructor(readonly tag: string) {}
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number } {
    return this.rect;
  }
  set textContent(text: string) {
    this.children = [text];
  }
  get textContent(): string {
    return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  append(...nodes: Array<El | string>): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: Array<El | string>): void {
    this.children = nodes;
  }
  addEventListener(type: string, fn: () => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  click(): void {
    for (const fn of this.listeners.click ?? []) fn();
  }
  focus(): void {
    this.focused = true;
  }
  remove(): void {
    this.removed = true;
  }
  find(tag: string): El[] {
    return this.children.flatMap((c) => (typeof c === 'string' ? [] : [...(c.tag === tag ? [c] : []), ...c.find(tag)]));
  }
}

const withDom = (): void => {
  vi.stubGlobal('document', { createElement: (tag: string) => new El(tag) });
};
afterEach(() => vi.unstubAllGlobals());

describe('mountGiftViewer', () => {
  it('shows a wrapped gift, reveals the validated machine on Unwrap and offers Make your own', async () => {
    withDom();
    const made = await createGiftLink(host(), 'music_box', 'for_you', {});
    if (!made.ok) throw new Error('setup');
    const root = new El('div');
    const revealed: Gift[] = [];
    await mountGiftViewer(root as unknown as HTMLElement, hashOf(made.url), { ...options(), makeYourOwnHref: '/', onReveal: (g) => revealed.push(g) });
    const shell = root.find('section')[0];
    expect(shell.dataset.state).toBe('wrapped');
    const unwrap = shell.find('button')[0];
    expect(unwrap.textContent).toBe('Unwrap');
    expect(unwrap.focused).toBe(true);
    expect(revealed).toHaveLength(0);
    unwrap.click();
    expect(revealed).toEqual([gift]);
    expect(shell.dataset.state).toBe('revealed');
    expect(shell.textContent).toContain('Music Box');
    expect(shell.textContent).toContain('For you');
    expect(shell.find('a')[0]).toMatchObject({ href: '/' });
    shell.find('button')[0].click(); // Show it again
    expect(revealed).toHaveLength(2);
  });

  it('ends a bad link on an error card, without revealing anything', async () => {
    withDom();
    const root = new El('div');
    const onReveal = vi.fn();
    await mountGiftViewer(root as unknown as HTMLElement, '#g=AAAA<img src=x onerror=alert(1)>', { ...options(), makeYourOwnHref: '/', onReveal });
    const shell = root.find('section')[0];
    expect(shell.dataset.state).toBe('error');
    expect(shell.textContent).not.toContain('<img');
    expect(shell.textContent).not.toContain('onerror');
    expect(shell.find('button')).toHaveLength(0);
    expect(shell.find('a')).toHaveLength(1);
    expect(onReveal).not.toHaveBeenCalled();
  });

  /** A window with the pieces the viewer measures with: the layout query, the height, resize and the card's own observer. */
  function withWindow(sideLayout: boolean) {
    const resize: Array<() => void> = [];
    const observed: Array<() => void> = [];
    vi.stubGlobal('window', {
      innerHeight: 812,
      matchMedia: () => ({ matches: sideLayout }),
      addEventListener: (_type: string, fn: () => void) => resize.push(fn),
      removeEventListener: (_type: string, fn: () => void) => resize.splice(resize.indexOf(fn), 1),
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(readonly callback: () => void) {
          observed.push(callback);
        }
        observe(): void {}
        disconnect(): void {
          observed.length = 0;
        }
      },
    );
    return { resize, observed };
  }

  it('tells the page how much of a portrait window the revealed card covers: the bottom, never the machine above it', async () => {
    withDom();
    const win = withWindow(false);
    const made = await createGiftLink(host(), 'music_box', 'for_you', {});
    if (!made.ok) throw new Error('setup');
    const root = new El('div');
    const layouts: Array<unknown> = [];
    const viewer = await mountGiftViewer(root as unknown as HTMLElement, hashOf(made.url), { ...options(), makeYourOwnHref: '/', onLayout: (i) => layouts.push(i) });
    expect(layouts).toEqual([null]); // wrapped: no machine on show, so nothing to make room for
    const shell = root.find('section')[0];
    const card = shell.children[0] as El;
    card.rect = { left: 20, top: 520, right: 355, bottom: 760 };
    shell.find('button')[0].click(); // Unwrap
    expect(layouts.at(-1)).toEqual({ top: 64, right: 16, bottom: 812 - 520 + 16, left: 16 });
    card.rect = { left: 20, top: 480, right: 355, bottom: 760 }; // the card grew: the observer and a resize both re-measure
    win.observed[0]();
    expect(layouts.at(-1)).toMatchObject({ bottom: 812 - 480 + 16 });
    card.rect = { left: 20, top: 540, right: 355, bottom: 760 };
    win.resize[0]();
    expect(layouts.at(-1)).toMatchObject({ bottom: 812 - 540 + 16 });
    viewer.destroy();
    expect(layouts.at(-1)).toBeNull();
    expect(win.resize).toHaveLength(0);
  });

  it('covers only the left of a wide window: the card is a plate beside the machine', async () => {
    withDom();
    withWindow(true);
    const made = await createGiftLink(host(), 'music_box', 'for_you', {});
    if (!made.ok) throw new Error('setup');
    const root = new El('div');
    const layouts: Array<unknown> = [];
    await mountGiftViewer(root as unknown as HTMLElement, hashOf(made.url), { ...options(), makeYourOwnHref: '/', onLayout: (i) => layouts.push(i) });
    const shell = root.find('section')[0];
    (shell.children[0] as El).rect = { left: 43, top: 300, right: 443, bottom: 600 };
    shell.find('button')[0].click();
    expect(layouts.at(-1)).toEqual({ top: 64, right: 16, bottom: 16, left: 443 + 16 });
  });

  it('reports nothing to make room for on an error card', async () => {
    withDom();
    withWindow(false);
    const root = new El('div');
    const layouts: Array<unknown> = [];
    await mountGiftViewer(root as unknown as HTMLElement, '#nope', { ...options(), makeYourOwnHref: '/', onLayout: (i) => layouts.push(i) });
    expect(layouts.at(-1)).toBeNull();
  });

  it('removes itself on destroy', async () => {
    withDom();
    const root = new El('div');
    const viewer = await mountGiftViewer(root as unknown as HTMLElement, '#nope', { ...options(), makeYourOwnHref: '/' });
    viewer.destroy();
    expect(root.find('section')[0].removed).toBe(true);
  });
});
