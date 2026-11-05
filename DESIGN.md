---
name: Wound Up
description: Build the machines. Wake the town. Raise the curtain.
colors:
  brass: "#c9a227"
  brass-lit: "#ddb93a"
  brass-deep: "#8a6d12"
  walnut: "#5b3a24"
  ink: "#2a1a0f"
  cream: "#f2e6cf"
  paper-deep: "#dccba6"
  teal: "#1f5c5c"
  lamp: "#ffc66d"
  night-0: "#1b5051"
  night-1: "#0f2f30"
  night-2: "#07191a"
typography:
  wordmark:
    fontFamily: "Elsie Swash Caps, Bodoni 72, Didot, Bodoni MT, Georgia, serif"
    fontSize: "min(16.2cqi, 6rem)"
    fontWeight: 900
    lineHeight: 0.98
    letterSpacing: "-0.005em"
  tagline:
    fontFamily: "Elsie, Georgia, Times New Roman, serif"
    fontSize: "1.42rem"
    fontWeight: 400
    lineHeight: 1.26
  heading:
    fontFamily: "Elsie, Georgia, Times New Roman, serif"
    fontSize: "1.3rem"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "Cabin, Gill Sans, Trebuchet MS, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  body-small:
    fontFamily: "Cabin, Gill Sans, Trebuchet MS, system-ui, sans-serif"
    fontSize: "0.96rem"
    fontWeight: 400
    lineHeight: 1.45
  button:
    fontFamily: "Cabin, Gill Sans, Trebuchet MS, system-ui, sans-serif"
    fontSize: "1.18rem"
    fontWeight: 700
    lineHeight: 1.15
  button-secondary:
    fontFamily: "Cabin, Gill Sans, Trebuchet MS, system-ui, sans-serif"
    fontSize: "1.02rem"
    fontWeight: 700
    lineHeight: 1.15
  list-label:
    fontFamily: "Cabin, Gill Sans, Trebuchet MS, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.11em"
  fine-print:
    fontFamily: "Cabin, Gill Sans, Trebuchet MS, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  plate: "3px"
  button: "4px"
spacing:
  xs: "0.6rem"
  sm: "0.95rem"
  md: "1.25rem"
  lg: "1.75rem"
  column-gap: "2.25rem"
components:
  plate:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "0 1.75rem 1.25rem"
    width: "min(100%, 31rem)"
  measuring-scale:
    backgroundColor: "{colors.ink}"
    height: "1.05rem"
  status-window:
    backgroundColor: "{colors.walnut}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "0.7rem 0.95rem"
  button-brass:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0.6rem 1.2rem"
    height: "3.6rem"
  button-brass-hover:
    backgroundColor: "{colors.brass-lit}"
  button-ghost:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.walnut}"
    typography: "{typography.button-secondary}"
    rounded: "{rounded.button}"
    padding: "0.4rem 1rem"
    height: "2.9rem"
  button-disabled:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.walnut}"
  problem-slip:
    backgroundColor: "{colors.lamp}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "0.75rem 0.6rem 0.75rem 0.95rem"
  preview-tag:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "0.8rem 1.25rem"
---

# Design System: Wound Up

Scope: the landing and desktop-preview chrome in `src/landing/landing.css`. The 3D diorama behind it belongs to another owner and is not part of this system. The values above are the build's own; the five project palette colours are brass, walnut, cream, teal and lamp, and every other colour is a tint or shade of them.

## Overview

**Creative North Star: "The Catalogue Plate on the Bench"**

One paper object lies on a clockmaker's bench at night. The frozen town is a deep teal ground lit from the middle. Everything a visitor reads or presses is cream paper or brass, and no text is ever printed straight onto the 3D canvas, so contrast never depends on what the camera shows. The page behaves like an antique horology catalogue plate: a printed double rule, aged paper edges, fine grain, a swash-cap wordmark with a working gear for a full stop. Its own instruments do the talking. A ruler is the loader, a dial is the device-support readout, and two meshing gears end the wordmark.

The system is calm and seated. It has one authored entrance, no ambient motion, and no ornament that is not a drawn object. The lamp colour is held back for problems, so a lit slip means something is wrong.

**Key Characteristics:**
- Cream paper plate with a printed double rule, grain and inner age shading, on a teal radial ground.
- Elsie Swash Caps Black and Elsie for lettering. Cabin for everything read or pressed.
- Brass for action and progress, lamp for problems only, teal for focus and small labels.
- Drawn instruments (measuring scale, support dial, meshing gears) replace spinners and status badges.
- Flat surfaces with printed insets. Depth comes from the plate resting on the bench, not from layering.

## Colors

A five-colour palette used as paper, ink and metal. Cream paper and walnut-black ink carry the content, brass carries action, teal carries the night and the focus ring, and lamp is rationed.

### Primary
- **Aged Brass** (`{colors.brass}`): action plate fill, loader fill ticks, dial warning arc, scrollbar thumb.
- **Lit Brass** (`{colors.brass-lit}`): the hover tint of the brass action only.
- **Shadowed Brass** (`{colors.brass-deep}`): gear strokes in the wordmark full stop, the only brass dark enough to read on paper.

### Secondary
- **Deep Teal** (`{colors.teal}`): tagline, parts-list labels, focus outline on paper.
- **Night Teal ramp** (`{colors.night-0}`, `{colors.night-1}`, `{colors.night-2}`): the page ground, as one radial ellipse from centre to edge (`radial-gradient(ellipse 85% 75% at 50% 46%, night-0, night-1 55%, night-2)`). `night-2` is also the `html` background.

### Tertiary
- **Warm Lamp Glow** (`{colors.lamp}`): problem-slip fill, the loader's leading edge, text selection, focus ring on the dark preview scene.

### Neutral
- **Cream** (`{colors.cream}`): plate and preview-tag paper, the gap inside the double rule.
- **Paper Deep** (`{colors.paper-deep}`): disabled button fill.
- **Walnut** (`{colors.walnut}`): lede, parts-list text, ghost action, fine print. Also the drawn rules at 24 to 55 percent alpha, the dial strokes, and the status-window tint (7.5 percent alpha).
- **Ink** (`{colors.ink}`): primary text on paper, measuring-scale ground, dial needle, button text, slip border.

### Named Rules
**The Lamp Is a Problem Rule.** Lamp fills a surface only for a problem slip. The only other lamp uses are the loader's leading edge, selection, and the focus ring on the dark preview scene.

**The Paper Carries Text Rule.** Text sits on cream, brass or lamp, never on the canvas or the teal ground.

**The Derived Colour Rule.** A new value must be a tint or shade of the five palette colours. The build's one off-ramp, `#fff3d8` (back-tag hover), is not canonised; use `cream` and the lift.

## Typography

**Wordmark Font:** Elsie Swash Caps 900 (Bodoni 72, Didot, Georgia fallbacks)
**Heading Font:** Elsie 400 (Georgia fallback)
**Body and Label Font:** Cabin 400 and 700 (Gill Sans, Trebuchet MS, system-ui fallbacks)

All fonts are self-hosted woff2 with `font-display: swap`, OFL licensed. Ligatures are switched off everywhere (`font-variant-ligatures: none`, deliberately last in the file) because Elsie's `st` ligature makes "Quest" unreadable at label size.

**Character:** Decorative lettering is for titles only. Everything the visitor must read or press is Cabin, a plain humanist sans.

### Hierarchy
- **Wordmark** (900, `min(16.2cqi, 6rem)`, 0.98, one line): "Wound Up" plus the gear full stop. Sized from its own column by container query units so it cannot overflow.
- **Tagline** (400, 1.42rem, 1.26, teal): three beats, each a block line. On short laptop screens the beats run inline and stay whole.
- **Heading** (400, 1.3rem, 1.2, ink): the parts-list heading.
- **Body** (400, 1.0625rem, 1.55): lede in walnut, `max-width: 38ch`, `text-wrap: pretty`.
- **Body small** (400, 0.96rem, 1.45): status message and slip text, tabular lining numerals. Parts-list entries are 0.95rem.
- **Button** (700, 1.18rem brass, 1.02rem ghost, 1.1rem preview tag).
- **List label** (700, 0.78rem, 0.11em tracking, uppercase, teal): the term column of the parts list only.
- **Fine print** (400, 0.85rem, 1.4, walnut).

### Named Rules
**The Cabin For Doing Rule.** Anything pressed, read as status, or needed to act is Cabin. Elsie and Elsie Swash Caps are for the name, the tagline and one heading.

## Layout

Everything lives in one fixed, full-viewport layer (`.wu`, z-index 10) that ignores pointer events except on the plate and preview tags. Edge padding is 0.75rem with the bottom respecting the safe-area inset. The plate has one internal rhythm: 1.75rem side padding, section gaps of 0.9 to 1.4rem (tighter under 50rem tall), 0.6rem between actions.

Three layouts, by media query:
- **Stage-left** (width at least 62.5rem and aspect at least 5:4): the plate is one column at the left, `clamp(21rem, 31vw, 28rem)` wide, anchored from the top at `max(2rem, (100dvh - 49rem) / 2)` so it does not re-centre when a slip appears. Left margin is `clamp(1.5rem, 4.4vw, 5rem)`. The centre and right stay clear for the diorama.
- **Tablet sheet** (40rem to 62.49rem, or at least 40rem and narrower than 5:4): a bottom-aligned two-column grid, `1fr 1fr`, column gap 2.25rem, max width 46rem. The scale spans both columns. Column A holds wordmark, tagline, lede and status. Column B holds slip, actions, parts list and fine print.
- **Phone sheet** (under 40rem): a single column bottom sheet, max height `min(100%, 76dvh)`, scrolling inside itself so the diorama shows above.

Short-screen compaction (height at most 50rem): smaller gaps. On stage-left laptops under 50rem tall the fine print is hidden. Under 44rem tall the lede and parts text step down a size. When the plate overflows, a paper-coloured fade at its foot (`.more`) cues more below.

## Elevation & Depth

Flat surfaces with printed insets, and one shadow vocabulary for resting on the bench. There is no blur-backdrop, no glass and no coloured glow. Shadows are black or ink, vertical and soft.

### Shadow Vocabulary
- **Printed double rule** (`inset 0 0 0 7px cream, inset 0 0 0 8px rgba(91,58,36,.5), inset 0 0 0 11px cream, inset 0 0 0 12px rgba(91,58,36,.24)`): a fine rule and a fainter one, set in from the plate edge.
- **Aged edge** (`inset 0 0 46px rgba(91,58,36,.16)`): paper darkening toward the edges.
- **Plate on the bench** (`0 2px 4px rgba(0,0,0,.35), 0 30px 60px -24px rgba(0,0,0,.7)`): a contact shadow plus a long soft one. The preview tags use a lighter version of the same pair.
- **Brass plate** (`inset 0 0 0 4px brass, inset 0 0 0 5px rgba(42,26,15,.5), 0 10px 18px -10px rgba(42,26,15,.75)`): the action's printed inset rule echoes the paper's double rule.
- **Instrument window** (`inset 0 0 0 1px rgba(91,58,36,.24), inset 0 1px 3px rgba(91,58,36,.2)`): a recessed well.
- **Slip** (`0 8px 16px -10px rgba(42,26,15,.7)`): a small lift under the lamp slip.

Paper grain is an inline SVG fractal-noise tile (140px, walnut-tinted, 22 percent alpha) on the plate.

### Named Rules
**The Rule Echo Rule.** Raised or printed objects carry an inset rule, never a hard offset or a coloured shadow. The brass action repeats the paper's double rule at smaller scale.

**The Shadow Falls Down Rule.** Resting shadows are vertical with negative spread. Nothing glows.

## Shapes

Small, nearly square radii: 3px for plate, status window, slip, tags and the dismiss target, 4px for buttons. Borders are 2px on buttons and 1.5px on the slip, plus 1px dotted walnut hairlines (55 percent alpha) between parts-list rows and above the fine print. Drawn forms are line art in round-capped, round-joined strokes: a 12-tooth gear meshing with an 8-tooth gear, a semicircular dial with ticks, a repeating ruler tile with one long graduation and four short ones (30 by 14px tile).

## Components

### Plate
Cream paper with grain, the printed double rule and the bench shadow. Width `min(100%, 31rem)`, scrolls inside itself with a thin brass scrollbar. Hidden (opacity 0, translated 10px, visibility hidden) in preview and XR modes, and held at opacity 0 until ready.

### Measuring Scale (loader)
An ink strip pinned at the top of the plate, full bleed, 1.05rem tall, top corners rounded. A cold ruler (pale teal ticks, 40 percent) sits under a brass ruler of the same graduation. The brass layer is revealed by `clip-path` from a registered `--p` (0 to 1) set from script. A lamp-coloured right edge marks the leading edge during loading. While waiting without a known fraction, `--p` sweeps 0 to 1 over 2.8s infinitely. Only `clip-path` and `transform` animate. It is `aria-hidden`.

### Support Dial
A 4.6rem walnut line-art half-dial with ticks, a brass arc on the right, an ink needle and hub. The needle's angle encodes device support: -72 degrees (rest, none), 0 degrees (VR), +72 degrees (mixed reality, on the brass arc), 0.9s ease. While checking, the needle drops to 40 percent opacity.

### Status Window
A recessed well (7.5 percent walnut tint, instrument-window inset) with the dial at left and one message line at right. Messages stack in a single grid cell and swap by visibility, so the box never changes height. A separate visually hidden `role="status"` with `aria-live="polite"` announces changes.

### Brass Action
Full-width, 3.6rem tall minimum, Cabin 700 1.18rem in ink on flat brass with the printed inset rule. Hover swaps to lit brass and lifts 1px. Active drops 1px. Icon (optional) 1.45rem line SVG in currentColor. Disabled (`aria-disabled="true"`) becomes paper-deep with a 2px dashed walnut border, no inset, no lift, `not-allowed` cursor. It uses `aria-disabled`, not `disabled`, so it stays focusable.

### Ghost Action
Secondary: 2.9rem tall, transparent, 2px walnut (50 percent) border, walnut Cabin 700 1.02rem. Hover darkens the border and adds a 9 percent walnut wash. The same disabled treatment as the brass action.

### Parts List
A "what you will need" heading in Elsie, then a definition list. Each row is a 4.9rem label column (uppercase 0.78rem teal) and a walnut description, separated by dotted walnut hairlines. Fine print follows under one more dotted rule.

### Problem Slip
A lamp-yellow slip with a 1.5px ink border, ink text, and a dismiss button (2.5rem square target, 3px radius, 12 percent ink wash on hover). It has `role="alert"` and `hidden` when unused. It sits under the actions so the pressed button never moves. In the preview it is positioned top-left at up to 30rem.

### Preview Tags
In desktop preview the plate gives way to two cream paper tags and nothing else: a back-to-start action (3.1rem tall, cream, arrow icon, top-left, safe-area aware) and a bottom-centred hint (max 34rem, balanced text). The region is `inert` until preview mode.

### States and Accessibility
- **Modes:** `data-mode` (landing, preview, xr). `xr` hides the layer. `data-ready` gates the plate entrance. `data-load` (run, wait) lights the loader edge. `data-support` (checking, none, vr, ar) drives the dial.
- **Focus:** a 3px teal outline with 3px offset and a cream 3px halo on paper. Inside the dark preview scene the outline is lamp, on the back tag the halo is ink, and inside the lamp slip the outline is ink.
- **Targets:** actions at least 2.9rem tall, dismiss 2.5rem, back 3.1rem.
- **Screen readers:** decorative SVG is `aria-hidden`, the status line announces politely, errors use `role="alert"`, the dismiss has an `aria-label`, and busy state is `aria-busy`.
- **Forced colors:** buttons, slip and plate get a 2px `CanvasText` border.
- **Text:** `text-size-adjust` is fixed at 100 percent, `text-wrap: pretty` on body copy and `balance` on hints.

### Motion
One easing, an exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`).
- **Entrance (once, on ready):** plate rises 18px with a -0.5deg tilt over 1000ms. Children rise 10px over 900ms, staggered at 70ms per index plus 150ms.
- **Gear tick (once):** after 700ms, over 1200ms, the 12-tooth gear turns one tooth (30 degrees) and the 8-tooth gear turns 45 degrees the other way, keeping them meshed. Then they stop.
- **Loader sweep:** 2.8s infinite, only while waiting with an unknown fraction. Known progress eases the clip-path over 0.5s.
- **State transitions:** button transforms and colour 0.25s, plate hide and show 0.35 to 0.4s, needle 0.9s.
- **Reduced motion:** all animation off and transition durations near zero. The waiting loader holds at a static 35 percent fill.

## Do's and Don'ts

### Do:
- **Do** put every readable word on cream, brass or lamp, and keep the canvas free of text.
- **Do** use brass for the one action and for progress. Give any raised object an inset rule that echoes the plate's double rule.
- **Do** make status an instrument: dial angle, ruler fill, gear position.
- **Do** keep Cabin for anything functional, and keep Elsie for the name, tagline and one heading.
- **Do** keep radii at 3px and 4px, borders at 1.5 to 2px, and rules dotted or double.
- **Do** animate only `transform`, `opacity` and `clip-path`, and give every animation a reduced-motion answer.
- **Do** keep the disabled action focusable, with a dashed paper-deep treatment.

### Don't:
- **Don't** use lamp for decoration or as a brand accent. It marks problems.
- **Don't** put text directly on the canvas, or use glass, blur backdrops, or glowing cards over the 3D scene.
- **Don't** use a dark hero with floating panels. The plate is paper, not a card.
- **Don't** introduce a colour that is not a tint or shade of the five palette colours.
- **Don't** use Elsie or Elsie Swash Caps for anything the visitor must read to act.
- **Don't** use gradient text, a spinner, or an icon to replace the drawn instruments.

### Not canonised (defects or one-offs the build carries)
- The `#fff3d8` back-tag hover is a one-off cream outside the derived palette.
- The 0.5-degree entrance tilt is an incidental detail of the one entrance, not a pattern for other surfaces.
- The uppercase tracked list label exists only as a catalogue term column in a definition list. Do not copy it as a kicker or eyebrow over headings.
