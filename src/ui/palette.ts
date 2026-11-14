/** Palette and type for the in-headset flow UI. Hex values are the bible colours (CLAUDE.md §8) and DESIGN.md tokens; nothing else is used. */
export const PALETTE = {
  brass: '#C9A227',
  brassLit: '#F2DA86',
  brassDark: '#7A5F12',
  walnut: '#5B3A24',
  ink: '#2A1A0F',
  cream: '#F2E6CF',
  lamp: '#FFC66D',
  teal: '#1F5C5C',
  night: '#07191A',
  frost: '#BED6D3',
} as const;

/** Elsie for the title and the story voice only; Cabin for everything the player must read to act (DESIGN.md "Don't"). */
export const FONT_BODY = 'Cabin, "Gill Sans", "Trebuchet MS", system-ui, sans-serif';
export const FONT_DISPLAY = 'Elsie, Georgia, "Times New Roman", serif';

const base = (): string => (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

/** Self-hosted faces under public/fonts (OFL licences beside them). */
export const FONT_FACES: readonly { family: string; file: string; weight: string }[] = [
  { family: 'Elsie', file: 'elsie-400.woff2', weight: '400' },
  { family: 'Cabin', file: 'cabin-400.woff2', weight: '400' },
  { family: 'Cabin', file: 'cabin-700.woff2', weight: '700' },
];

let fontsReady: Promise<void> | undefined;

/**
 * Loads the brand fonts for canvas text (a canvas never waits for a font on its own). Safe to call repeatedly and
 * outside a browser; resolves even when a face fails, because readable fallback text beats no text.
 */
export function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return Promise.resolve();
  fontsReady ??= Promise.all(
    FONT_FACES.map(async (f) => {
      try {
        const face = new FontFace(f.family, `url(${base()}fonts/${f.file}) format("woff2")`, { weight: f.weight });
        document.fonts.add(await face.load());
      } catch {
        /* fall back to the system stack in FONT_BODY / FONT_DISPLAY */
      }
    }),
  ).then(() => undefined);
  return fontsReady;
}
