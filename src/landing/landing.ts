import './landing.css';

/** 'ar' = immersive-ar supported (primary, mixed reality); 'vr' = only immersive-vr; 'none' = no WebXR / not supported. */
export type XrSupport = 'checking' | 'ar' | 'vr' | 'none';
export type LandingMode = 'landing' | 'preview' | 'xr';

/** A rectangle in CSS pixels of the viewport. */
export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LandingOptions {
  /** Called synchronously inside the click handler (WebXR needs the user gesture). A throw or rejection becomes a dismissible message. */
  onEnterXR: (mode: 'immersive-ar' | 'immersive-vr') => Promise<void> | void;
  /** The visitor chose the in-browser preview. This module switches to preview mode right after calling it. */
  onPreview: () => void;
  /** The visitor left the preview. This module switches back to the landing right after calling it. */
  onBack?: () => void;
  /** Optional replacement for the default controls hint shown in preview mode. */
  previewHint?: string;
  /**
   * Optional. Reports the part of the viewport the landing plate does not cover, so the 3D view can centre the
   * diorama there (for example with camera.setViewOffset). Fires on mount, on resize and on every mode change;
   * in preview and XR it is the whole viewport.
   */
  onStage?: (free: StageRect) => void;
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
    msg: 'Wound Up is played on a Meta Quest 3 or 3S, in Meta Quest Browser. Open this page there to enter.',
    go: 'Preview in this browser',
  },
};
const LOADING = 'Winding up the town…';
const PREVIEW = 'Preview in this browser';
const COPY_LINK = 'Copy link to open on Quest';
const HINT_POINTER = 'Click and drag the brass gear to pick it up. The mouse stands in for your hand.';
const HINT_TOUCH = 'Touch and drag the brass gear to pick it up. Your finger stands in for your hand.';
/** Faces the first paint needs; the plate is revealed once they are in (or after a short grace). */
const FACES = ['900 1em "Elsie Swash Caps"', '400 1em "Elsie"', '400 1em "Cabin"', '700 1em "Cabin"'];
const FONT_GRACE_MS = 1400;
/** Same query as the stage-left layout in landing.css. */
const STAGE_LEFT = '(min-width: 62.5rem) and (min-aspect-ratio: 5 / 4)';

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

/** Seven graduation marks around the support dial (centre 38,42). */
const gaugeTicks = Array.from({ length: 7 }, (_, i) => {
  const a = (Math.PI * i) / 6;
  const at = (r: number) => `${(38 - Math.cos(a) * r).toFixed(1)} ${(42 - Math.sin(a) * r).toFixed(1)}`;
  return `M${at(33)}L${at(37)}`;
}).join('');

/**
 * Full stop of the wordmark: a 12-tooth gear driving an 8-tooth one (same tooth size, so the pitch radii are 39.5 and 26.3).
 * The big gear has a tooth on the line of centres (-30 deg), the small one a gap, hence its -7.5 deg phase.
 */
const SMALL = { x: 57, y: -32.9 };
const COG = `<svg class="wu-cog" viewBox="-48 -68 140 116" aria-hidden="true" focusable="false"><g class="wu-g1"><path d="${gearPath(12, 44, 35, 1.1)}"/><circle r="23"/><circle r="7"/><path d="M0 -23V-7M0 7V23M-23 0H-7M7 0H23"/></g><g transform="translate(${SMALL.x} ${SMALL.y})"><g class="wu-g2"><path d="${gearPath(8, 30.8, 21.8, 0.9, (-7.5 * Math.PI) / 180)}"/><circle r="6"/></g></g></svg>`;
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12H5M11 5.5 4.5 12l6.5 6.5"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const GAUGE = `<svg class="wu-gauge" viewBox="0 0 76 48" aria-hidden="true" focusable="false"><path d="M8 42A30 30 0 0 1 68 42"/><path class="wu-zone" d="M53 16A30 30 0 0 1 68 42"/><path d="${gaugeTicks}"/><g class="wu-needle"><path d="M38 42V15"/></g><circle class="wu-hub" cx="38" cy="42" r="3.4"/></svg>`;

// Every message lives in the same grid cell and only one shows, so the status window is always as tall as the
// longest message at the current width: switching support state can never move anything below it.
const MESSAGES = (['checking', 'ar', 'vr', 'none'] as const).map((k) => `<span data-k="${k}">${COPY[k].msg}</span>`).join('') + `<span data-k="load">${LOADING} <b class="wu-pct"></b></span>`;

const TEMPLATE = `<!--
THESIS: the landing is one paper object on a clockmaker's bench, a catalogue plate laid on a frozen teal night whose own instruments (ruler loader, support dial, meshing-gear full stop) do the talking. It refuses the dark hero with floating glass cards.
OWN-WORLD: deep-teal ground; cream paper plate with printed double rule, aged edges and grain; Elsie Swash Caps Black wordmark, Elsie headings, Cabin text; brass key-plate action and brass-on-ink measuring scale; lamp glow only for problem slips.
STORY: a visitor sees a clockwork town waiting to be wound, learns plainly that it needs a Quest, and takes one honest action: enter, preview, or copy the link.
FIRST VIEWPORT: stage-left plate (28rem at most) over the live diorama: wordmark with gear pair, three-beat tagline, premise, support dial, brass action; a bottom sheet on narrow screens.
FORM: dial bezel (index 5 of 7, seed bbdae49d) realised at plate scale: measuring scale, subsidiary support dial, gear train.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
-->
<main class="wu-plate">
  <div class="wu-scale" aria-hidden="true"><i></i></div>
  <div class="wu-a">
    <h1 class="wu-title" style="--i:0">Wound Up${COG}</h1>
    <p class="wu-tag" style="--i:1"><span>Build the machines.</span> <span>Wake the town.</span> <span>Raise the curtain.</span></p>
    <p class="wu-lede" style="--i:2">Tockton, a tiny clockwork town, sits frozen on your table. Build its machines with your hands, wind them up, and bring it to life.</p>
    <div class="wu-status" style="--i:3">${GAUGE}<p class="wu-msg" aria-hidden="true">${MESSAGES}</p><p class="wu-sr" role="status" aria-live="polite"></p></div>
  </div>
  <div class="wu-b">
    <div class="wu-slip" role="alert" hidden><p></p><button class="wu-x" type="button" aria-label="Dismiss this message">${CROSS}</button></div>
    <div class="wu-acts" style="--i:4">
      <button class="wu-btn wu-go" type="button"><span></span></button>
      <button class="wu-btn wu-alt" type="button"></button>
    </div>
    <section class="wu-need" style="--i:5" aria-labelledby="wu-need-h">
      <h2 id="wu-need-h">What you will need</h2>
      <dl>
        <div><dt>Headset</dt><dd>Meta Quest 3 or 3S, in Meta Quest Browser.</dd></div>
        <div><dt>Hands</dt><dd>Hand tracking on in Quest settings. No controllers needed.</dd></div>
        <div><dt>Seat</dt><dd>A chair and a table, within arm's reach.</dd></div>
      </dl>
    </section>
    <p class="wu-fine" style="--i:6">No account or sign-up. Progress stays in this browser.</p>
  </div>
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
  const plate = q('.wu-plate');
  const pv = q('.wu-pv');
  const go = q<HTMLButtonElement>('.wu-go');
  const goText = q('.wu-go span');
  const alt = q<HTMLButtonElement>('.wu-alt');
  const back = q<HTMLButtonElement>('.wu-back');
  const hint = q('.wu-hint');
  const pct = q('.wu-pct');
  const sr = q('.wu-sr');
  const acts = q('.wu-acts');
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

    const label = busy ? (support === 'vr' ? 'Opening VR…' : 'Opening mixed reality…') : p !== null ? LOADING : copy.go;
    put(goText, label);
    go.setAttribute('aria-disabled', String(busy || p !== null || support === 'checking'));
    go.setAttribute('aria-busy', String(busy));
    alt.setAttribute('aria-disabled', String(busy || p !== null));
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
    // Below the actions, so the button that was just pressed never moves when a problem appears.
    if (mode === 'preview') pv.append(slip);
    else acts.after(slip);
  }

  let stageFrame = 0;
  function reportStage(): void {
    if (!options.onStage) return;
    cancelAnimationFrame(stageFrame);
    stageFrame = requestAnimationFrame(() => {
      if (!alive) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      let free: StageRect = { x: 0, y: 0, width: w, height: h };
      if (mode === 'landing') {
        const right = plate.offsetLeft + plate.offsetWidth;
        free = matchMedia(STAGE_LEFT).matches
          ? { x: right, y: 0, width: Math.max(0, w - right), height: h }
          : { x: 0, y: 0, width: w, height: Math.max(0, plate.offsetTop) };
      }
      options.onStage?.(free);
    });
  }
  function clearError(): void {
    slip.hidden = true;
    slipText.textContent = '';
  }
  function showError(message: string): void {
    slipText.textContent = message;
    slip.hidden = false;
    placeSlip();
    // On a phone the slip can land below the sheet's fold: bring it into view (scrolls only the sheet, only as far as needed).
    slip.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function setMode(next: LandingMode): void {
    if (next === mode) return;
    const prev = mode;
    mode = next;
    el.dataset.mode = next;
    plate.toggleAttribute('inert', next !== 'landing');
    pv.toggleAttribute('inert', next !== 'preview');
    placeSlip();
    reportStage();
    if (next === 'preview') {
      // the hint belongs to the mode, so it is set here whoever asked for the preview
      put(hint, options.previewHint ?? (matchMedia('(pointer: coarse)').matches ? HINT_TOUCH : HINT_POINTER));
      back.focus({ preventScroll: true });
    } else if (next === 'landing' && prev === 'preview') (returnFocus ?? go).focus({ preventScroll: true });
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
        if (alive) render();
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

  // Hold the reveal until the three faces are in, so the first visible frame is already final (no swap, no shift).
  const reveal = () => {
    if (alive) requestAnimationFrame(() => alive && (el.dataset.ready = '1'));
  };
  const fonts: FontFaceSet | undefined = document.fonts;
  if (fonts) {
    Promise.race([Promise.all(FACES.map((f) => fonts.load(f))), new Promise((r) => setTimeout(r, FONT_GRACE_MS))]).then(reveal, reveal);
  } else {
    reveal();
  }

  // When the sheet scrolls, a fade at its foot says there is more below (the .more class draws it).
  const updateMore = () => plate.classList.toggle('more', plate.scrollHeight - plate.scrollTop - plate.clientHeight > 6);
  plate.addEventListener('scroll', updateMore, { passive: true, signal: ac.signal });
  const ro = new ResizeObserver(() => {
    updateMore();
    reportStage();
  });
  [el, plate, q('.wu-a'), q('.wu-b')].forEach((n) => ro.observe(n)); // content growth does not resize a max-height plate, its groups do
  ac.signal.addEventListener('abort', () => ro.disconnect());

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
      cancelAnimationFrame(stageFrame);
      el.remove();
    },
  };
}
