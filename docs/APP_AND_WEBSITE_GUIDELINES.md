# Wound Up — How the App and Website Should Be

**Sources:** the owner's direction of 2026-11-05, plus the Devpost overview page and the Official Rules of the Meta VR Start Developer Competition 2026 as supplied by the owner that day (the rules paste ends partway through section 14, general legal terms).

**Authority:** gameplay details stay in `PRODUCT_SPEC.md` and `INTERACTION_SPEC.md`. This file decides how the entry screen looks and what every feature is tested against. For submission rules, the official Devpost pages win over everything here.

## 1. The tests every screen and feature must pass

The first and last are hard requirements on the Devpost page; the middle three are its design guidelines.

| Test | The question | What it means for us |
|---|---|---|
| **Hands test** | Can someone complete the entire experience without ever pairing a controller? | Hands do everything, end to end, including menus and pause. Controllers may work but are never needed. |
| **Airplane seat test** | Does every interaction work in a two-foot radius? | Seated and stationary, no roomscale, no large movement. Our limit: about 60 cm from the chest, within about 35° of head-forward. |
| **One bus stop test** | Can someone have a complete moment in a short ride? | Fast cold start, clean pause and resume, something satisfying in 10 minutes or less. Our own target is stricter: first Music Box loop within 5 minutes. |
| **Take it away test** | If you remove any third-party service, is there still a project? | The core experience is ours. No wrappers, no external service needed to play. |
| **Policy test** | Does it follow Meta's rules? | Meta VR/Start Program Terms, Community Standards, Code of Conduct in VR, Developer App Policies and Content Guidelines all apply. |

## 2. The website (entry screen)

### Layout (owner's direction)

- **Full window and centred.** The screen is one composition that fills the whole window. No left-aligned plate, no narrow card or sheet.
- **The world is the background.** The live 3D scene fills the window behind the title, blurred and dimmed, so you feel the world waiting before you enter it.
- **Entering clears the blur.** Pressing the action sharpens the world into focus: one authored moment, not scattered effects. With reduced motion it is instant.
- **Never scrolls.** No vertical or horizontal scrolling at any window size. Everything fits at 1920x1080, 1440x900, 1366x657, 565x787, 390x844 and 320x568.
- **Reference:** the entry screen of the owner's portfolio (`D:\Development\Web Dev\Vishav-Portfolio`, `.entry*` in `src/app/globals.css`, screenshot `.playwright-mcp/env/entry-landing-1440.png`): live world behind a scrim, a soft pool of light behind the name, one glass button. Match that feeling in Wound Up's own visual world; do not copy its look.

### Content

Only these, in this order of importance:

1. **Wound Up** as a large display title.
2. The tagline, word for word: **Build the machines. Wake the town. Raise the curtain.**
3. One sentence of premise.
4. One obvious action: **Enter mixed reality** when the device supports it.
5. A secondary way in: the browser preview.
6. A short line of what is needed: Meta Quest 3 or 3S in Meta Quest Browser, hands only, seated at a table.

No accounts, forms, setup steps, statistics, awards, reviews or other claims we cannot back up. Unsupported devices get an honest explanation and the preview, never a fake XR button.

### Look

- **Palette stays, used more richly:** a deep teal and walnut night-workshop ground, warm lamp glow `#FFC66D` as the light source, aged brass `#C9A227` for the primary action, cream `#F2E6CF` for type.
- **Type:** Elsie Swash Caps for the title, Elsie for the tagline, Cabin for everything you read or press.
- **Avoid:** neon, purple or blue gradients, gradient text, glowing cards, generic SaaS layouts, and decoration that competes with the world behind it.

### Behaviour

- Loads fast, with a quiet loader. Actions stay disabled until the world is ready.
- No third-party requests at runtime, no analytics.
- AA contrast measured against the real blurred scene, not a flat colour. Full keyboard use, visible focus rings, announced status messages, reduced motion respected.

## 3. The app (inside the headset)

- **First five minutes decide everything.** Trunk, town, letter, parcel, first machine wound and running, town waking. Teach by doing, with ghost hands rather than text.
- **The room matters.** Tockton stands on the player's real table, anchored for the session. The floating stand is only the fallback.
- **Easy in, easy out.** Pause and resume are clean, exiting returns to a valid state, progress survives a reload.
- **A reason to come back.** Letters, repairs, the gift link, and the daily repair.
- **Accessibility is a real path.** Gaze-and-pinch and Easy Snap must finish the main loop, not just appear in a menu.
- **Smooth.** 72 FPS target, never below 60, measured on Quest when hardware is available.

## 4. What we submit (from the Devpost page)

**Entry:** Gaming track, New Experience division (conceived and built within the window that began 2026-09-24).

**Deadline:** 18 November 2026, 12:00 PT, which is 19 November 01:30 IST. Our internal target stays 18 November before midnight IST, with code freeze on 16 November. The entry cannot change after the deadline and judging uses its state at that moment. **The project must stay reachable and free of charge until the winner announcement, around 11 December 2026.**

1. **The build.** A link to the hosted WebXR build. Vercel is named in the rules as acceptable. Before submitting, turn off Vercel's deployment protection (it currently requires a login) or use a custom domain, then check the URL in a private window. A public source repository is **not** required.
2. **A video under 3 minutes.** Public on YouTube or Vimeo. Footage may come from a Quest, the XR Simulator or an equivalent emulator. Show real gameplay that honestly represents the experience, lead with the story and what makes it distinct, and do not lean on AI-generated video. Judges need not watch past 3 minutes.
3. **The submission form:** name; tagline (140 characters); track; division; description of inspiration, how it was built and future plans (about 500 words); how hand interactions are implemented and what excites you about VR (optional); target launch date if unpublished; name, email and role of each team member. **The owner submits this personally:** entries made by a bot or other automated means are void, so agents only draft the text.

## 5. How judges score (Official Rules §6)

First a pass/fail check that the entry fits the theme and uses the required tools. Then four criteria, 25% each.

| Criterion | What judges look for | What it demands of Wound Up |
|---|---|---|
| **Innovation & Creativity** | Originality, ambition, fit to the track. Uniquely uses device capabilities (spatial depth, hands-first, gaze, passthrough, scene understanding, persistent anchors) to drive repeat usage. | A clockwork town on the player's own table, with mechanics that really work. A reason to return. |
| **Experience Design** | Seated, hands-first journey, intuitive navigation, clear onboarding, habit-forming purpose. **Passthrough must be purposeful: the real room changes the experience.** FoV-aware: essential UI and interactions stay in a comfortable, narrower field of view. | The real table is the ground the town stands on. Nothing essential at the edge of view. |
| **Technical Implementation** | Reliability and platform use: hand tracking, gaze, passthrough, spatial anchoring, FoV-aware design. **Minimum 60 fps on Quest hardware**, bug-free. For passthrough: scene understanding, anchoring to detected planes and surfaces, **holding up in rooms the developer never tested.** | Table detection and anchors are scored directly. Test every emulator room, then real hardware. |
| **Polish & Presentation** | UI/UX, art direction, **sound design**, cohesive visuals, strong text, images and video. | Audio is not optional polish. The video is real footage. |

The checks that prove each criterion before submission are in `ACCEPTANCE_TESTS.md` §18.

## 6. What this changes for us

The owner approved items 1 to 3 on 2026-11-05. The rest are recommendations; the owner decides anything that changes scope or order.

1. **Table placement is a core feature (approved, ADR-026).** Plane detection and anchors are scored directly, so table detection and anchoring are built straight after the solver, as optional WebXR features, with the floating stand only as the fallback. Test logic and fallback across all of the emulator's built-in rooms; real-world detection needs a physical Quest.
2. **Daily repair protected (approved, ADR-027).** Repeat usage is named in two criteria and one award, so the Clock Tower and day/night are cut first. The daily repair stays as lightweight, deterministic repeat play, built after the core machines and gifting, and is simplified rather than removed if time is critical.
3. **Fallback stand raised (approved, ADR-019).** The stand now sits about 38 cm below the eyes and 55 cm ahead, about 35° down and inside `INTERACTION_SPEC.md` §3's 35° (it was 45 cm, about 39°). It is measured from the eyes when it is placed and placed again when the player recentres, so it suits any height or seat (`PRODUCT_SPEC.md` §3.2). Angle and reach are checked in the emulator, comfort on a Quest.
4. **Gaze counts twice.** The gaze-and-pinch path is already required for accessibility and is also scored as a platform feature. IWSDK has a `gazeTracking` feature for it.
5. **Audio needs a slot.** Sound design is scored, but the audit found no roadmap time for it (`AUDIT_DOCS.md` §5.3).
6. **A real Quest test is essential.** 60 fps on Quest and behaviour in real rooms cannot be proven in the emulator. Find a tester early (`BUILD_ROADMAP.md` TP-7).
7. **Content rules.** No third-party logos, brand names or slogans as advertising, no identifiable real people, English only, suitable for a 10+ to 18+ rating. Naming the headset as a plain-text requirement is the only brand mention on the entry screen.
8. **Keep licence proof ready.** The sponsor may ask for written proof of ownership or licence for any material; `CREDITS.md` is that record.

## 7. Eligibility: the owner must confirm

- **Join the contest** at https://start-developer-competition-26.devpost.com/ (the overview page supplied on 2026-11-05 still showed "Join hackathon").
- **Be a Meta VR Start Program member by submission**, with a Meta account that has developer access. Applying is listed as a first step on the overview page.
- Be 18 or over and not a resident of an excluded region. One entry per person.
- New Experience division means no pre-existing code. The repository's history starts on 2026-11-05 and supports this.

## 8. Awards to design for

Best New Gaming Experience ($100,000; runner-up $50,000) is the main target. These special awards ($25,000 each; Judge's Choice $20,000, two winners) fit what we are already building:

- **Best First Five Minutes:** explains itself fast, teaches controller-free interaction without a wall of text, delivers a payoff before the headset comes off.
- **Best Reason to Come Back:** something to work toward, visible growth between sessions, a loop that pulls the player back tomorrow.
- **Best Accessibility Forward Experience:** for example eyes-only navigation and high-contrast modes. Voice stays out of scope (`CLAUDE.md` §14).
- **Boldest Original Concept:** an idea that would fall apart on any other platform because it depends on presence and real-world scale.
- **Judge's Choice.**

Best Social & Multiplayer and Best Agentic Interaction are out of scope. Awards guide emphasis; they do not add scope.

## 9. Differences found against our existing docs

| Topic | Competition sources | Our docs | Action |
|---|---|---|---|
| Public source repository | Not required by the Official Rules | `COMPETITION_REQUIREMENTS.md` §9 and ADR-022 said it was | Corrected. Making it public is the owner's choice. |
| How long the build stays up | Until the winner announcement, around 11 December | Not stated | Noted in §4 and the competition doc. |
| Emulator footage in the video | Allowed | §8 did not say | Noted in §8. Important because we have no headset. |
| Video hosting | YouTube or Vimeo, public | §8 did not say | Noted in §8. |
| Hosting | Vercel named as acceptable | Matches ADR-022 | None. |
| Time to first satisfaction | 10 minutes or less | 5 minutes (internal target) | Keep the stricter target. |
| Table detection and anchors | Scored directly | Said best effort, anchors unmentioned | Corrected: core feature, stand as fallback (ADR-026). |
| Daily repair | Repeat usage is scored | Third in the cut order | Corrected: protected and simplified rather than cut; Clock Tower and day/night cut first (ADR-027). |
| Fallback stand angle | FoV-aware design is scored | Said 45 cm below the eyes, about 39°, against 35° (`INTERACTION_SPEC.md`) | Corrected: about 38 cm, about 35° (ADR-019). |
| Meta VR CLI | Offered as optional AI tooling | `@meta-quest/metavr` excluded because it collects usage data (ADR-018) | Owner may opt in; not required. |
