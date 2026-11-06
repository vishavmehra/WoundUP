---
name: Wound Up
description: Build the machines. Wake the town. Raise the curtain.
colors:
  brass: "#c9a227"
  brass-lit: "#f2da86"
  walnut: "#5b3a24"
  ink: "#2a1a0f"
  cream: "#f2e6cf"
  lamp: "#ffc66d"
  teal: "#1f5c5c"
  night: "#07191a"
  frost: "#bed6d3"
typography:
  title:
    fontFamily: "Elsie Swash Caps, Bodoni 72, Didot, Bodoni MT, Georgia, serif"
    fontSize: "min(17dvh, 15.5vw)"
    fontWeight: 900
    lineHeight: 1
  tagline:
    fontFamily: "Elsie, Georgia, Times New Roman, serif"
    fontSize: "max(1.2em, calc(var(--title) * 0.192))"
    fontWeight: 400
    lineHeight: 1.2
  tagline-portrait:
    fontFamily: "Elsie, Georgia, Times New Roman, serif"
    fontSize: "calc(var(--title) * 0.33)"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "Cabin, Gill Sans, Trebuchet MS, system-ui, sans-serif"
    fontSize: "clamp(0.9rem, 0.62rem + 0.85vmin, 1.7rem)"
    fontWeight: 400
    lineHeight: 1.5
  body-portrait:
    fontFamily: "Cabin, Gill Sans, Trebuchet MS, system-ui, sans-serif"
    fontSize: "clamp(0.9375rem, 0.62rem + 1.1vw, 1.5rem)"
    fontWeight: 400
    lineHeight: 1.5
  button:
    fontFamily: "Cabin, Gill Sans, Trebuchet MS, system-ui, sans-serif"
    fontSize: "1.14em"
    fontWeight: 700
    lineHeight: 1.15
components:
  button-brass:
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    height: "max(2.875rem, 3.2em)"
  button-ghost:
    backgroundColor: "{colors.night}"
    textColor: "{colors.cream}"
    height: "max(2.75rem, 2.7em)"
  problem-slip:
    backgroundColor: "{colors.lamp}"
    textColor: "{colors.ink}"
---

# Design System: Wound Up

Scope: the entry screen and the desktop-preview chrome in `src/landing/landing.css` and `landing.ts`. The 3D scene behind them belongs to the lead; this system only filters and frames it. Every colour is one of the five bible colours (brass, walnut, cream, teal, lamp) or a tint or shade of one. The brief is `docs/APP_AND_WEBSITE_GUIDELINES.md` section 2.

## North star: the frontispiece

The window is the title page of an antique horology catalogue. Title, printer's device, tagline, premise and imprint are printed in cream and brass straight onto the night. Behind the print the live world waits frozen and out of focus. Entering turns the page: the print lifts away while the world comes into focus, colour returns and the stand rises into place. That is the one authored moment, and it doubles as the wake ripple in miniature. The composition is centred and fills the window. There is no plate, card or sheet, and nothing is left-aligned.

## Colour

- **Night workshop ground** (`html`/`body`, behind the transparent canvas): `night` under deep teal walls at the sides, one lamp overhead on walnut at the top, and a walnut bench rising from the foot. The preview shows this ground unchanged around the sharp stand.
- **Lamp is the light source.** The brightest warm area on screen is the pool of lamplight behind the title (`.wu::before`, 0.22 alpha). The overhead lamp on the body is lower and fainter, so the two read as one lamp. Lamp also fills the problem slip and marks the loader's leading edge, the focus ring and text selection.
- **Brass** is the primary action (a nine-sliced plaque, light-to-dark gradient), the frame, the swelled rules and the loader. **Brass-lit** is line art printed in brass: the gear device. It is never used for type.
- **Cream** carries every word on the world: title, tagline, premise, status, ghost buttons and imprint (the brief: cream is for type). **Ink** is text on brass and lamp.
- **Frost** marks the cold, unwound ticks of the loader ruler.
- **Khaki rule:** warm light and teal meet only in the dark. A thin mix of the two complementaries reads as khaki, so the walnut and lamp pools stay above the stand and the stand itself is frozen and cool.

## The world behind the print

- **Landing:** `html[data-wu-mode="landing"] #scene-container` gets `filter: blur(clamp(5px, 1.1dvh, 14px)) saturate(0.35) brightness(0.82)` and `transform: translateY(9dvh) scale(1.06)`. The blur is light enough that the rim, inlay ring and gear still read as an object. The saturation follows the art bible's frozen state, and a 0.14 teal veil in the scrim adds the cool cast. The stand sits below the title block, behind the actions, so its rim never crosses the tagline.
- **Preview and xr:** `filter: none; transform: none`. The change runs over 1.25s on the shared ease-out, and only after the first mode change (`html[data-wu-moved]`), so a page load never shows a sharp world going soft. With reduced motion it is instant.
- **Scrim** (`.wu::before`): grain, lamp pool, walnut pool behind the title, walnut bench at the foot, teal veil, and a night vignette from 0.1 at the centre to 0.72 at the edge. It fades out in preview.
- **Contrast** is measured with text and shadows hidden, against the brightest pixel behind each line box. On the reference render (`world.png`), the lowest values over the ten-size sweep are title 4.87, tagline 4.64 (at 320x568; 5.3 or higher elsewhere), and lede, status, buttons and imprint 6.07 or higher. On the live WebGL canvas: tagline 4.64 (at 320x568), everything else 7.6 or higher. Those figures were taken with the tagline in brass-lit and the status in a pale lamp tint. Both are cream now. Cream is lighter than brass-lit, so the tagline minimum rises to about 5.2. It is a touch darker than the old status tint, so the status minimum falls by about 3%, to roughly 5.9. Both are estimates from the luminance change and have not been re-measured.
- **Page-level rules are scoped.** `overflow: hidden` on `html` and `body`, the body ground, and `#scene-container { position: fixed; inset: 0 }` all live under `html[data-wu-mode]`. That attribute exists only while the landing is mounted: `mountLanding` sets it and `destroy()` removes it. IWSDK sets no inline style on the container, and three.js gives its canvas `display: block` and the window size inline. A gift viewer on the same page that needs to scroll must scroll inside its own element, or unmount the landing.
- **GPU cost:** this is a full-window CSS filter over the canvas, capped at a 14px blur. The lead's render budget holds the canvas still in landing mode (`renderBudget.setMode('still')`), so the filter is not re-run every frame. In xr the filter is off. Measured: a steady 16.7ms rAF (median and p95) in landing and preview in desktop Chromium on SwiftShader. Not yet profiled in Quest Browser 2D.

## Typography

Elsie Swash Caps 900 for the title, Elsie 400 for the tagline, and Cabin 400/700 for everything you read or press. All are self-hosted woff2 under `/fonts/`. Ligatures are off everywhere, because Elsie's standard ligatures are decorative (its `st` is a swash) and the title and tagline should set as plain letters.

- **Title** `min(17dvh, 15.5vw)`, cream, one line at every window size. Portrait uses `min(15dvh, 16.6vw)`. It is the display voice of a title page and scales with the page, so it runs past 6rem on large windows on purpose. It may wrap (balanced) only when a reader's own text spacing makes it wider than the page.
- **Tagline**, cream, set as three whole beats, each sentence its own span. In landscape it runs on one line at about 0.19 of the title (`max(1.2em, calc(var(--title) * 0.192))`). In portrait the beats stack at `calc(var(--title) * 0.33)`, which is larger because the title is limited by width there.
- **Body em** is set from the short side of the window, so the whole composition scales as one object. The lede is one sentence (`text-wrap: balance`). The status line uses tabular lining numerals. The imprint sits at the foot.

## Layout

- `.wu` is fixed, full-window, centred text. Inside the frame, `.wu-page` is a grid with rows `2fr auto 3fr`, so the title block sits at the optical centre above the true one. The imprint is pinned to the foot.
- **Frame:** a thick-and-thin brass rule inset from the window, ticked like a railroad minute track, with a clock dial quartered into its four corners (`border-image`, rounds to any size).
- **Fit, never scroll:** every length derives from the window. Landscape windows under 44rem tall put the two actions side by side. The lede and imprint drop only below 336px tall, or below 512px tall in portrait. Below 30rem tall or wide, the slip tips in at the head. Harness: page scroll, inner scroll and offscreen are empty at 1440x900, 1920x1080, 2560x1440, 1366x657, 1280x600, 844x390, 565x787, 390x844 and 320x568.
- **Window queries in px:** the drop and last-resort queries are written in px, not rem. They follow the window, so a reader who raises the browser's default text size keeps the premise and requirements line in an ordinary window.
- **Safety valve:** `.wu-page` has a single `minmax(0, 1fr)` column and `overflow-y: auto`. At normal settings the print fits, so it never scrolls. When a reader enlarges text or its spacing (WCAG 1.4.12), the page scrolls inside the frame, so no action is pushed out of the window or clipped at the side.
- **Last resort** (below 280px tall or 256px wide, outside the matrix): the device is hidden and the title block is zoomed to 0.78, so touch targets fall below 44px there. This is accepted and still needs an ADR.

## Components

- **Loader ruler** (`.wu-scale`, aria-hidden): an ink strip along the window's top edge. Frost ticks sit under brass ticks, the brass revealed by `clip-path` from `--p`, with a lamp leading edge. While the fraction is unknown it sweeps over 2.8s (static at 35% with reduced motion). It slides off once `data-load="done"`, leaving the frame as the only edge ornament.
- **Printer's device:** two swelled brass rules around a 12-tooth gear meshing with an 8-tooth gear (inline SVG). On reveal they tick one tooth each, once.
- **Primary** (`.wu-go`): the brass plaque with concave corners and an ink inset rule, Cabin 700 ink. Hover lifts 1px and brightens. While loading or checking it keeps the brass plaque at `brightness(0.7)`, so the hierarchy holds and it never turns into a ghost.
- **Secondary** (`.wu-alt`): a ghost plaque (night at 44%, brass hairline) with cream text. Disabled is 0.74 opacity. Both actions use `aria-disabled`, not `disabled`, so they stay focusable.
- **Status:** every message sits in one grid cell and only one shows, so switching state never moves anything. A separate visually hidden `.wu-sr` (`role="status"`, `aria-live="polite"`) announces. It speaks only for changes the visitor caused or needs: when "Link copied." expires, the region is emptied silently instead of reading the support message out again. With support `none` the status names no device; the imprint does.
- **Erratum slip** (`.wu-slip`, `role="alert"`): a lamp plaque tipped in at the foot of the page (at the head on small windows), so the pressed button never moves. `showError()` in xr mode switches back to the landing first, because the layer is hidden in xr.
- **Preview chrome:** a small "Back to start" ghost plaque at the top left and a `.wu-hint` ghost plaque centred at the foot, both clear of the stand. The top left also keeps Back clear of the "Enter XR" pill that the IWSDK emulator (IWER) pins at top centre in dev. The region is `inert` outside preview, and `.wu` passes the pointer through to the world.

## States and accessibility

- `data-mode` (landing, preview, xr), `data-support` (checking, ar, vr, none), `data-load` (wait, run, done), `data-ready` (fonts in, or a 1.4s grace). The H1 is hidden in preview and xr.
- Focus: a 2px lamp outline with 3px offset (ink inside the slip). Entering the preview focuses "Back to start". Leaving it returns focus to the action that opened it. Returning from a session, or from an error raised during one, focuses the primary action. Forced colours: plaques get a 2px `CanvasText` border. Text size adjust is pinned at 100%.

## Motion

One easing: `cubic-bezier(0.16, 1, 0.3, 1)`. One authored moment, entering preview: the world clears over 1.25s, the print lifts 4dvh and fades over 0.5 to 0.9s, the frame fades and scales 1.03, and the preview chrome fades in after 0.35s. Apart from that: the gear tick on reveal, the loader sweep while waiting, and 0.25s button feedback. Reduced motion stops every animation and makes transitions instant, the world filter included. Their duration is `0s`, not `0.01ms`, because a zero-length transition is no transition at all: visibility flips at once, so the focus moves on a mode change land.

## Don't

- No eyebrow or kicker, no gradient text, no glass card, no neon, no purple or blue.
- No claims, numbers or awards.
- No colour outside the tokens above.
- No Elsie for anything you must read to act.
- Do not let the walnut or lamp pools reach over the frozen stand (khaki).
