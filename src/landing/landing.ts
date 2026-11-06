import './landing.css';

/** 'ar' = immersive-ar supported (primary, mixed reality); 'vr' = only immersive-vr; 'none' = no WebXR / not supported. */
export type XrSupport = 'checking' | 'ar' | 'vr' | 'none';
export type LandingMode = 'landing' | 'preview' | 'xr';

export interface LandingOptions {
  /** Called synchronously inside the click handler (WebXR needs the user gesture). A throw or rejection becomes a dismissible message. */
  onEnterXR: (mode: 'immersive-ar' | 'immersive-vr') => Promise<void> | void;
  /** The visitor chose the in-browser preview. This module switches to preview mode right after calling it. */
  onPreview: () => void;
  /** The visitor left the preview. This module switches back to the landing right after calling it. */
  onBack?: () => void;
  /** Optional replacement for the default controls hint shown in preview mode. */
  previewHint?: string;
}

export interface Landing {
  setSupport(s: XrSupport): void;
  setMode(m: LandingMode): void;
  /** Asset load progress 0..1 (0 reads as "starting"), or null when finished. */
  setLoading(progress01: number | null): void;
  showError(message: string): void;
  destroy(): void;
}

type EnterMode = 'immersive-ar' | 'immersive-vr';

const COPY: Record<XrSupport, { msg: string; go: string }> = {
  checking: { msg: 'Checking what this browser can do…', go: 'Checking…' },
  ar: { msg: 'Mixed reality is ready. Sit at a table, then enter.', go: 'Enter mixed reality' },
  vr: {
    msg: 'No mixed reality here, only VR. Wound Up is made for a real table; VR puts the town on a floating stand.',
    go: 'Enter in VR (no passthrough)',
  },
  none: {
    msg: 'This browser cannot enter mixed reality. Open this page on your headset to play.', // the imprint names the device
    go: 'Preview in this browser',
  },
};
const LOADING = 'Winding up the town…';
const PREVIEW = 'Preview in this browser';
const COPY_LINK = 'Copy link to open on Quest';
const HINT_POINTER = 'Click and drag the brass gear to pick it up. The mouse stands in for your hand.';
const HINT_TOUCH = 'Touch and drag the brass gear to pick it up. Your finger stands in for your hand.';
/** Faces the first paint needs; the page is revealed once they are in (or after a short grace). */
const FACES = ['900 1em "Elsie Swash Caps"', '400 1em "Elsie"', '400 1em "Cabin"', '700 1em "Cabin"'];
const FONT_GRACE_MS = 1400;

/** Toothed outline. `wobble` nudges each point so the line looks inked rather than plotted; `phase` turns the gear. */
function gearPath(teeth: number, rOut: number, rRoot: number, wobble = 0, phase = 0): string {
  const step = (Math.PI * 2) / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    [[-0.32, rRoot], [-0.17, rOut], [0.17, rOut], [0.32, rRoot]].forEach(([off, r], k) => {
      const ang = i * step - Math.PI / 2 + off * step + phase;
      const rr = r + (wobble ? Math.sin((i * 4 + k + 1) * 12.9898) * wobble : 0);
      d += `${d ? 'L' : 'M'}${(Math.cos(ang) * rr).toFixed(1)} ${(Math.sin(ang) * rr).toFixed(1)}`;
    });
  }
  return `${d}Z`;
}

/**
 * The printer's device of the title page: a 12-tooth gear driving an 8-tooth one (same tooth size, so the pitch radii are 39.5 and 26.3).
 * The big gear has a tooth on the line of centres (-30 deg), the small one a gap, hence its -7.5 deg phase.
 */
const SMALL = { x: 57, y: -32.9 };
const COG = `<svg class="wu-cog" viewBox="-48 -68 140 116" aria-hidden="true" focusable="false"><g class="wu-g1"><path d="${gearPath(12, 44, 35, 1.1)}"/><circle r="23"/><circle r="7"/><path d="M0 -23V-7M0 7V23M-23 0H-7M7 0H23"/></g><g transform="translate(${SMALL.x} ${SMALL.y})"><g class="wu-g2"><path d="${gearPath(8, 30.8, 21.8, 0.9, (-7.5 * Math.PI) / 180)}"/><circle r="6"/></g></g></svg>`;
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12H5M11 5.5 4.5 12l6.5 6.5"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

// Every message lives in the same grid cell and only one shows, so the status line is always as tall as the
// longest message at the current width: switching support state can never move anything below it.
const MESSAGES = (['checking', 'ar', 'vr', 'none'] as const).map((k) => `<span data-k="${k}">${COPY[k].msg}</span>`).join('') + `<span data-k="load">${LOADING} <b class="wu-pct"></b></span>`;

// The title page of a horology catalogue (DESIGN.md): frame, title, device, tagline, premise, status, actions, imprint.
const TEMPLATE = `<div class="wu-frame" aria-hidden="true"></div>
<div class="wu-scale" aria-hidden="true"><i></i></div>
<main class="wu-page">
  <div class="wu-body">
    <h1 class="wu-title">Wound Up</h1>
    <div class="wu-device" aria-hidden="true"><i></i>${COG}<i></i></div>
    <p class="wu-tag"><span>Build the machines.</span> <span>Wake the town.</span> <span>Raise the curtain.</span></p>
    <p class="wu-lede">Tockton, a tiny clockwork town, sits frozen on your table until you build its machines by hand and wind them up.</p>
    <div class="wu-status"><p class="wu-msg" aria-hidden="true">${MESSAGES}</p><p class="wu-sr" role="status" aria-live="polite"></p></div>
    <div class="wu-acts">
      <button class="wu-btn wu-go" type="button"><span></span></button>
      <button class="wu-btn wu-alt" type="button"></button>
    </div>
  </div>
  <p class="wu-imprint"><span>Meta Quest 3 or 3S in Meta Quest Browser.</span> <span>Hands only. Seated at a table.</span></p>
  <div class="wu-slip" role="alert" hidden><p></p><button class="wu-x" type="button" aria-label="Dismiss this message">${CROSS}</button></div>
</main>
<div class="wu-pv" role="region" aria-label="Preview controls" inert>
  <button class="wu-btn wu-back" type="button" aria-describedby="wu-hint">${ARROW}<span>Back to start</span></button>
  <p class="wu-hint" id="wu-hint"></p>
</div>`;

/** A thrown value becomes a sentence that names the problem and the way out. */
function explain(err: unknown, mode: EnterMode): string {
  console.warn('[wound-up] could not enter', mode, err);
  const what = mode === 'immersive-vr' ? 'VR' : 'Mixed reality';
  const name = err instanceof DOMException ? err.name : '';
  const msg = err instanceof Error && !(err instanceof DOMException) ? err.message.trim() : '';
  if (name === 'SecurityError') return `${what} needs a secure connection. Open this page from its https address and try again.`;
  if (name === 'NotAllowedError') return `${what} was not allowed. Check the permission prompt inside the headset, then press the button again.`;
  if (name === 'NotSupportedError') return `This device cannot start ${what}. Try the preview, or open this page in Meta Quest Browser.`;
  if (msg) return /try|reload/i.test(msg) ? msg : `${msg} Take the headset off and on again, or reload this page, then try once more.`;
  return `${what} did not start. Reload this page and try once more.`;
}

export function mountLanding(root: HTMLElement, options: LandingOptions): Landing {
  const html = document.documentElement;
  html.dataset.wuMode = 'landing'; // landing.css blurs and dims #scene-container from this

  const el = document.createElement('div');
  el.className = 'wu';
  el.dataset.mode = 'landing';
  el.dataset.support = 'checking';
  el.dataset.load = 'done';
  el.dataset.ready = '0';
  el.innerHTML = TEMPLATE; // static markup only; every dynamic string below goes through textContent
  root.append(el);

  const q = <T extends HTMLElement>(sel: string): T => {
    const node = el.querySelector<T>(sel);
    if (!node) throw new Error(`landing: missing ${sel}`);
    return node;
  };
  const page = q('.wu-page');
  const pv = q('.wu-pv');
  const go = q<HTMLButtonElement>('.wu-go');
  const goText = q('.wu-go span');
  const alt = q<HTMLButtonElement>('.wu-alt');
  const back = q<HTMLButtonElement>('.wu-back');
  const hint = q('.wu-hint');
  const pct = q('.wu-pct');
  const sr = q('.wu-sr');
  const slip = q('.wu-slip');
  const slipText = q('.wu-slip p');
  const dismiss = q('.wu-x');
  const messages = Array.from(el.querySelectorAll<HTMLElement>('.wu-msg > span'));

  let support: XrSupport = 'checking';
  let mode: LandingMode = 'landing';
  let progress: number | null = null;
  let busy = false;
  let copied = false;
  let alive = true;
  let spoken = '';
  let quarter = -1;
  let returnFocus: HTMLElement | null = null;
  let copiedTimer = 0;
  const ac = new AbortController();
  const on = (t: EventTarget, type: string, fn: () => void) => t.addEventListener(type, fn, { signal: ac.signal });

  const put = (node: HTMLElement, text: string) => {
    if (node.textContent !== text) node.textContent = text;
  };
  const say = (text: string) => {
    if (text !== spoken) put(sr, (spoken = text));
  };

  function render(): void {
    const p = progress;
    const copy = COPY[support];
    el.dataset.support = support;
    el.dataset.load = p === null ? 'done' : p > 0 ? 'run' : 'wait';
    el.style.setProperty('--p', String(p ?? 1));

    const label = busy ? (support === 'vr' ? 'Opening VR…' : 'Opening mixed reality…') : copy.go; // progress is the status line's job
    put(goText, label);
    go.setAttribute('aria-disabled', String(busy || p !== null || support === 'checking'));
    go.setAttribute('aria-busy', String(busy));
    alt.setAttribute('aria-disabled', String(busy || p !== null || support === 'checking'));
    put(alt, copied ? 'Link copied' : support === 'none' ? COPY_LINK : PREVIEW);

    const shown = p !== null ? 'load' : support;
    messages.forEach((m) => m.classList.toggle('on', m.dataset.k === shown));
    if (p !== null) {
      const pc = Math.round(p * 100);
      put(pct, pc > 0 ? `${pc}%` : '');
      const q4 = Math.min(Math.floor(p * 4), 3);
      if (q4 !== quarter) {
        quarter = q4;
        say(pc > 0 ? `Winding up the town, ${q4 * 25} percent.` : 'Winding up the town.');
      }
    } else {
      quarter = -1;
      say(busy ? label : copied ? 'Link copied.' : copy.msg);
    }
  }

  function placeSlip(): void {
    // The slip floats over the foot of the page, so the button that was just pressed never moves when a problem appears.
    (mode === 'preview' ? pv : page).append(slip);
  }

  function clearError(): void {
    slip.hidden = true;
    slipText.textContent = '';
  }
  function showError(message: string): void {
    slipText.textContent = message;
    slip.hidden = false;
    // The layer is hidden in 'xr', so a problem reported there brings the landing back to show it.
    if (mode === 'xr') setMode('landing');
    else placeSlip();
  }

  function setMode(next: LandingMode): void {
    if (next === mode) return;
    const prev = mode;
    mode = next;
    el.dataset.mode = next;
    html.dataset.wuMoved = ''; // arms the focus pull only now, so a page load never shows a sharp world going soft
    html.dataset.wuMode = next;
    page.toggleAttribute('inert', next !== 'landing');
    pv.toggleAttribute('inert', next !== 'preview');
    placeSlip();
    if (next === 'preview') {
      // the hint belongs to the mode, so it is set here whoever asked for the preview
      put(hint, options.previewHint ?? (matchMedia('(pointer: coarse)').matches ? HINT_TOUCH : HINT_POINTER));
      back.focus({ preventScroll: true });
    } else if (next === 'landing') {
      // Back from the preview: the action that opened it. Back from a session (or an error during one): the action that entered it.
      (prev === 'preview' ? (returnFocus ?? go) : go).focus({ preventScroll: true });
    }
  }

  function startPreview(from: HTMLElement): void {
    returnFocus = from;
    clearError();
    try {
      options.onPreview();
    } catch (err) {
      console.warn('[wound-up] preview failed', err);
      showError('The preview could not start. Reload this page and try once more.');
      return;
    }
    setMode('preview');
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href.split('#')[0]);
      copied = true;
      clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => {
        copied = false;
        if (!alive) return;
        // The revert is not news: empty the live region silently instead of reading the status out again unprompted.
        put(sr, '');
        spoken = COPY[support].msg; // so render() below treats the status as already said
        render();
      }, 2600);
      render();
    } catch {
      showError("The link could not be copied. Copy the address from your browser's address bar instead.");
    }
  }

  async function enter(m: EnterMode): Promise<void> {
    clearError();
    busy = true;
    render();
    try {
      await options.onEnterXR(m); // reached synchronously from the click, so the user gesture is intact
    } catch (err) {
      showError(explain(err, m));
    } finally {
      busy = false;
      if (alive) render();
    }
  }

  on(go, 'click', () => {
    if (go.getAttribute('aria-disabled') === 'true') return;
    if (support === 'none') startPreview(go);
    else void enter(support === 'vr' ? 'immersive-vr' : 'immersive-ar');
  });
  on(alt, 'click', () => {
    if (alt.getAttribute('aria-disabled') === 'true') return;
    if (support === 'none') void copyLink();
    else startPreview(alt);
  });
  on(back, 'click', () => {
    options.onBack?.();
    setMode('landing');
  });
  on(dismiss, 'click', () => {
    clearError();
    (mode === 'preview' ? back : go).focus({ preventScroll: true });
  });

  // Hold the reveal until the faces are in, so the first visible frame is already final (no swap, no shift).
  const reveal = () => {
    if (alive) requestAnimationFrame(() => alive && (el.dataset.ready = '1'));
  };
  const fonts: FontFaceSet | undefined = document.fonts;
  if (fonts) {
    Promise.race([Promise.all(FACES.map((f) => fonts.load(f))), new Promise((r) => setTimeout(r, FONT_GRACE_MS))]).then(reveal, reveal);
  } else {
    reveal();
  }

  render();

  return {
    setSupport(s) {
      support = s;
      render();
    },
    setMode,
    setLoading(p) {
      progress = p === null ? null : Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
      render();
    },
    showError,
    destroy() {
      alive = false;
      ac.abort();
      clearTimeout(copiedTimer);
      delete html.dataset.wuMode;
      delete html.dataset.wuMoved;
      el.remove();
    },
  };
}
