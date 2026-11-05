# Product

<!-- impeccable:product-schema 1 -->

> Provenance: written without a live interview (no question channel in this session). Every fact below comes from `docs/PROJECT_BIBLE.md`, `docs/PRODUCT_SPEC.md`, `docs/UI_UX_SPEC.md`, `docs/COMPETITION_REQUIREMENTS.md`, `docs/TECHNICAL_ARCHITECTURE.md`, root `CLAUDE.md`, or the build brief; anything that is a judgement call is marked "(inferred)". Confirm the inferred lines with the owner.

## Platform

web

## Users

- **Players:** Meta Quest 3 / 3S owners who open the public HTTPS URL in Meta Quest Browser, seated at a real table, using hand tracking only. Controllers are never required. (docs)
- **Judges and curious visitors:** people evaluating the Meta VR Start Developer Competition 2026 entry (Gaming track, New Experience division) who open the same URL on a desktop or phone, usually without a headset. They must be able to understand and preview the game without owning one. (build brief; the developer also has no Quest, so desktop preview is a first-class path)
- **Gift recipients** arrive through a `#g=` link in an ordinary browser. That is a separate gift-viewer surface, not the landing. (docs)

Job on this surface: decide within seconds what this is, whether their device can enter it, and press one clear action (enter mixed reality, enter VR, or preview on desktop).

## Product Purpose

Wound Up is a seated, hands-only mixed-reality clockwork building game. A miniature frozen town called Tockton sits on the player's real table. Letters from townsfolk ask the player to build or repair clockwork machines. The player opens a trunk, assembles each machine with pinch-and-snap hands, winds it, places it in the town, and watches colour, light, movement and sound return.

Central fantasy: "LEGO where every piece is a real, working mechanical part."

Tagline (verbatim): **Build the machines. Wake the town. Raise the curtain.**

Success: a polished, memorable first loop (the Music Box) inside five minutes, on a Quest, without controllers. For this surface: the visitor knows what the game is, is told honestly whether their device can run it, and gets into the experience (or the preview) with one action and no setup. The landing explicitly must not feel like a conventional website.

## Positioning

Hands-first construction where every part is a real working mechanism and its connections decide whether the machine runs; a tiny handcrafted town that sits on the player's own table; finishing a machine visibly wakes the town; one finished machine can be gifted through a link, with no account.

Not a generic VR sandbox and not a collection of mechanical minigames (competition positioning doc).

## Operating Context

- Static client-side WebXR app (IWSDK, Three.js) served over HTTPS from GitHub Pages. No backend, accounts, login, analytics, telemetry, or external service is needed to play.
- Entry order: immersive-ar (mixed reality) when supported, else immersive-vr, else desktop 3D preview. Entry must be a user gesture.
- The landing is the DOM layer shown before any XR session. It sits over a live, transparent-background 3D canvas that renders the Tockton diorama (a Blender-modelled brass gear on a round walnut base, warm lights, slow idle camera). The DOM layer is hidden while an immersive session is active. (build brief)
- Desktop preview: the mouse stands in for the hand. It exists so the game can be verified and judged without hardware; it is not hardware validation.
- The real Quest requirements to state plainly: Meta Quest 3 or 3S; open the page in Meta Quest Browser; hands only (hand tracking enabled in Quest settings); sit at a table.

## Capabilities and Constraints

- Terminology to keep: Tockton, the trunk, letters, parcel, blueprint, parts tray, wind (max 8 wind units), Music Box, Carousel, Windmill, Bakery, "mixed reality" (passthrough) vs "VR" (no passthrough), "desktop preview".
- Landing support states: checking, ar, vr, none. Never offer an XR action that cannot work. Desktop preview is available in every state.
- No analytics, no cookies, no runtime network requests from the landing; fonts and icons are self-hosted or inline.
- Out of scope for the whole product (do not hint at them): accounts, login, cloud save, leaderboards, shops, currency, XP, ranks, multiplayer, voice or microphone, AI or LLM features, free-build sandbox.
- Undecided facts (do not invent): the public URL, the repository URL, whether competition branding appears on the landing, release date, any Quest hardware performance figure.

## Brand Commitments

- Name **Wound Up**; world **Tockton**; tagline verbatim (above).
- Binding visual direction from the docs, recorded not expanded: "mature vintage storybook illustration meets an antique horology catalogue", palette aged brass `#C9A227`, walnut `#5B3A24`, cream `#F2E6CF`, deep teal `#1F5C5C`, warm lamp glow `#FFC66D`, used restrainedly. The UI should read as cream paper panels with teal accents and brass details, never a generic dashboard, HUD, neon or glass.
- Voice: warm, concise, storybook-tinged but clear. Functional text stays plain and readable; decorative lettering is for titles only. Controls name their action; errors name the problem and the recovery. (UI_UX_SPEC; build brief)
- Letters from townsfolk are physical correspondence in the game (Mira, Otto, the schoolteacher, the theatre keeper). The landing does not need to quote them. (inferred: the in-game letters should stay a discovery inside the experience)

## Evidence on Hand

- Real: the tagline, premise, and part/machine facts in the docs; the art-direction and blueprint boards in `References/` (flavour only, AI-generated, not to be copied); the live 3D diorama.
- Absent and must not be fabricated: reviews, awards, ratings, download or player counts, press, testimonials, a public URL, measured Quest frame-rate figures, "tested on Quest" claims. The competition's own doc notes Quest hardware validation has not happened yet.

## Product Principles

1. The world is the interface: the landing is a doorway into the diorama, not a destination of its own, and says only what a first-time visitor needs.
2. Be honest about hardware. Say plainly that the game is made for Meta Quest in mixed reality; never fake an entry that cannot work; give everyone else a real preview.
3. Show craft, not claims. Quality is shown through the made things (lettering, ornament, material), never through superlatives or invented proof.
4. Fast and unconditional: no sign-up, no settings, no configuration before the first action.
5. Calm, comfortable, seated, hands-first. Nothing on the landing should demand effort, precision or speed.

## Accessibility & Inclusion

- Target WCAG AA for the landing (build brief), including contrast over the live canvas, full keyboard operation with visible focus, semantic landmarks, screen-reader announcements for status, loading and errors, and `prefers-reduced-motion`.
- In-game accessibility (gaze-and-pinch, Easy Snap, ray mode, seated layout) is a product commitment; the landing should not contradict it and may mention that play is seated. (docs)
- Judges and players may open the page on a phone: say clearly, without apology or dead ends, that the game itself runs on Quest. (build brief)
