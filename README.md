# Wound Up

**Build the machines. Wake the town. Raise the curtain.**

Wound Up is a seated, hands-only mixed-reality clockwork building game for Meta Quest 3 and 3S. A tiny clockwork town called Tockton sits frozen on your table; you assemble its machines with pinch-and-snap hands, wind them up, and watch the town wake. It runs in the browser (WebXR, [Immersive Web SDK](https://iwsdk.dev), Three.js, TypeScript).

> Status: milestone M0 (working WebXR foundation). The playable loop is not built yet.

## Play

- Headset: Meta Quest 3 or 3S, opened in Meta Quest Browser. Hand tracking on, no controllers needed.
- Anything else (desktop or phone) shows the landing page and a mouse preview of the scene.
- Everything is static: no account, no backend, no analytics. Progress will live in the browser's `localStorage`.

## Develop

Requires Node.js 24 (or 22.12+).

```bash
npm install
npm run dev          # IWSDK dev runtime + managed browser with the Quest 3 emulator (https://localhost:8081)
npm run typecheck    # strict TypeScript
npm run lint
npm test             # Vitest unit tests
npm run test:e2e     # Playwright against the production build served under /wound-up/
npm run build        # static output in dist/
```

Driving the emulated headset from the command line (headless, no window):

```bash
npx @iwsdk/cli dev up --headless
npx @iwsdk/cli xr enter                       # starts an emulated immersive-ar session
npx @iwsdk/cli xr set-input-mode --input-json '{"mode":"hand"}'
npx @iwsdk/cli browser screenshot --output-file shot.png
```

Desktop and emulator runs are not Quest evidence; see `docs/ACCEPTANCE_TESTS.md` for what each result proves.

## Layout

| Path | What lives there |
|---|---|
| `iwsdk.config.json` | IWSDK project authority: scene, XR features, emulator |
| `src/index.ts` | Entry point: creates the world, wires the landing page and systems |
| `src/landing/` | DOM landing page and preview chrome |
| `src/xr-entry.ts`, `src/placement.ts` | XR support detection, session entry, fallback stand placement (unit-tested) |
| `src/grab-*.ts`, `src/stage.ts`, `src/hands.ts` | Grab mode, grab feedback, stand placement, self-hosted hand models |
| `public/scenes/` | Scene composition (JSON) |
| `public/assets/` | Runtime models (GLB) and XR hand models |
| `blender/` | Blender sources and the Python generators that rebuild every hero model (`blender/README.md`) |
| `docs/` | Specifications, decisions (`DECISIONS.md`), audits, credits |
| `References/` | Visual reference boards (working folder, not shipped) |

## Documentation

Start with `CLAUDE.md` (project instructions), then `docs/PROJECT_BIBLE.md`, `docs/PRODUCT_SPEC.md` and `docs/DECISIONS.md`. The audit of the documentation set is `docs/AUDIT_DOCS.md`; the original documentation-pack notes are `docs/DOC_PACK_README.md`.

## Deployment

Static hosting on Vercel (ADR-022). The build output is `dist/`; `vercel.json` and `.vercelignore` are in the repository root.

## Credits and licences

See `docs/CREDITS.md`.
