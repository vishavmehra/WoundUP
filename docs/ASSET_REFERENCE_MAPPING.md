# Wound Up — Asset Reference Mapping

**Project:** Wound Up
**Label:** G0 (competition build). Boards for later generations are not mapped; none exist.
**Status:** Complete for the 27 boards in `References/` as of 2026-11-06. The mapping from board to asset id is derived from the `references` field of every manifest entry; if the manifest changes, the manifest wins.
**Date:** 2026-11-06
**Authority:** Directive Part 1 ("Written specifications are authoritative for dimensions, mechanical functionality, component counts, gear ratios, interactions and gameplay"); [DECISIONS.md](DECISIONS.md) ADR-029 and its rulings I-5 to I-8; ADR-030 (what "Parts: N" counts). Built from [audit B](audits/B_REFERENCES.md) (all 27 boards opened one by one) and [`assets/manifest/glb-manifest.json`](../assets/manifest/glb-manifest.json).
**Related:** [REFERENCE_INDEX.md](REFERENCE_INDEX.md), [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md) §13, [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md), [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §7 and §8, [BLENDER_PRODUCTION_GUIDELINES.md](BLENDER_PRODUCTION_GUIDELINES.md)

## 1. The rule

The 27 boards are AI-generated appearance guides. They show appearance, construction, proportion and presentation. They never decide a dimension, a part count, a gear ratio, a speed, an interaction or a gameplay rule; the written specification does (ADR-029). When a board and a specification disagree, follow the specification and note the conflict (section 4). Where the specification is silent, a board value is a **proposal** that the lead must approve in Stage 1, and the manifest records its `dimensionsBasis` as `board` or `unspecified`, never `spec`.

Colours and micro-labels in audit B are visual estimates, not sampled values, and some text on the boards is unreadable at sheet resolution (audit B §6).

## 2. Board to assets to specification

Short names are those of MASTER_ASSET_INVENTORY §13. Asset ids come from the manifest. "Take" is what the board may guide; "Do not take" is what the specification or an ADR overrides. Conflict numbers C1 to C27 are in section 4.

| # | Board (`References/`) | Asset ids | Governing specification | Take | Do not take |
|---|---|---|---|---|---|
| 1 | `Wound Up_ Art Direction & Visual Language.png` | All (global reference) | ART_ASSET_PIPELINE §2, §3, §8; PROJECT_BIBLE §4 | Material families (aged wood, painted wood, brass, copper, iron, fabric, ceramic, paper), mood, frozen and awakened pair | Navy, red, lilac and mint accents (C26); printed triangle budgets (C24); scale strip |
| 2 | `Mechanical Parts Master Catalogue.png` | `gear_spur_10_m1`, `gear_spur_12_m1`, `gear_spur_16_m1`, `gear_spur_20_m1`, `gear_spur_24_m1`, `gear_spur_36_m1`, `gear_bevel_12`, `shaft_short`, `shaft_long`, `spring_standard`, `spring_worn`, `governor_standard`, `winding_key`, `pulley_standard`, `ratchet_wheel`, `pawl_standard`, `flywheel_standard`, `worm_gear` | DATA_AND_BLUEPRINT_SPEC §4.1; ART §5, §11 | Shapes of the part families; winding key about 0.06 x 0.045 m (board) | Module 0.02 m and tooth set (C19, C20). The catalogue is wider than any machine needs; ART §11 calls the library a target, not a requirement |
| 3 | `Spur Gear Technical Design Board.png` | `gear_spur_12_m1`, `gear_spur_16_m1`, `gear_spur_24_m1` | DATA §4.1; ART §11 | Gear anatomy: rim, four spokes, hub, bore, hub options | Module 0.002 m is inconsistent with its own diameters (16 teeth at 2 mm is 32 mm, not 64 mm) (C19); LOD triangle counts (C24) |
| 4 | `Wound Up_ Gear Assembly Reference Sheet.png` | `gear_spur_12_m1`, `gear_spur_16_m1`, `gear_spur_24_m1`, `shaft_short`, `shaft_long`, `bearing_pillow_block`, `coupling_rigid` | DATA §6 (sockets); MECHANICAL_SOLVER_SPEC | How gear, shaft, bearing, collar and key relate | The 24T to 16T pair as a ratio; shaft diameter 0.012 m (board only) |
| 5 | `Wound Up_ Springs & Winding Mechanism.png` | `spring_standard`, `spring_worn`, `winding_key`, `spring_barrel`, `ratchet_wheel`, `pawl_standard` | INTERACTION_SPEC §10 (winding) | Barrel, mainspring, ratchet and key shapes; wind states 0, 50 and 100 % | "5 to 10 turns clockwise" (C14) |
| 6 | `Steampunk Mechanisms Reference Sheet.png` | `cam_eccentric`, `follower_roller`, `crank_standard` | PRODUCT_SPEC §6.1, §6.2 | Cam, follower and crank shapes | The displacement graph (not a valid cam profile); the windmill rocker (optional on the board, absent from PRODUCT §6.3) |
| 7 | `Mechanical Connections & Gear Train Guide.png` | `gear_spur_20_m1`, `gear_bevel_12`, `governor_standard`, `pulley_standard`, `coupling_rigid`, `worm_gear` | MECHANICAL_SOLVER_SPEC; DATA §7 | Connection types; governor at the output | Every ratio and speed (12:1, 4 x 3, 60:1) (C4) |
| 8 | `Mechanical Connections & Gear Trains Infographic.png` | `gear_spur_16_m1` | MECHANICAL_SOLVER_SPEC | Joint types | Carousel 6:1 (C4) |
| 9 | `Wound Up Trunk Blueprint Infographic.png` | `trunk_main`, `workbench`, `parts_tray`, `blueprint_sheet`, `lantern_workbench` | PRODUCT_SPEC §3.2, §3.5 | Anatomy: handle, lid, corner guards, straps, hinges, lock, feet; materials (painted wood, brass, leather, steel) | Size 0.60 x 0.34 x 0.32 m (C1); variants basic, workshop, collector's red; capacity "40 to 60 parts" (C23) |
| 10 | `Trunk Blueprint and Workshop Assembly Board.png` | `trunk_main`, `lantern_workbench` | PRODUCT §3.2; ART §4 | Joinery and hardware detail; interior layout | Size (C1); wall thickness, strap width, handle height, lock diameter (board only); joinery detail may cost Quest budget |
| 11 | `WoundUp Steampunk Workbench Blueprint.png` | `workbench`, `parts_tray`, `blueprint_sheet`, `lantern_workbench` | PRODUCT §3.5; UI_UX_SPEC §9, §10 | Workbench with open trunk, categorised tray, blueprint board, lantern | Build surface 0.52 x 0.28 m (workbench is about 45 x 25 cm by spec); HUD bar; undo, redo, step; sandbox infinity and duplicate (excluded, CLAUDE.md §14) |
| 12 | `Steampunk Music Box Design Blueprint.png` | `music_box_case`, `cylinder_music_box`, `comb_music_box` | PRODUCT §6.1 | Lid, case, pinned cylinder, comb | Size 0.24 x 0.14 x 0.16 m, tine count and ratio 6:1 to 12:1 (board only); skins; the missing governor (C12) |
| 13 | `Steampunk Music Box Exploded Assembly Guide.png` | `music_box_case`, `bracket_support` | PRODUCT §6.1; DATA §5 | Case anatomy: lid, hinges, body, side panels, feet; assembly groups | "12 parts" as 18 pieces (C11); no governor (C12) |
| 14 | `Music Box Assembly Blueprint Infographic.png` | `music_box_case`, `cylinder_music_box`, `comb_music_box`, `shaft_short`, `bracket_support` | PRODUCT §6.1; DATA §5, §6; INTERACTION_SPEC §6 to §8 | Socket map: shaft, bracket x2, cylinder mount x2, comb mount, mainspring, gear train. Source for the proposed `SOCKET_` positions until blueprint data exists (gap G-12) | Same piece count and governor omission (C11, C12) |
| 15 | `Music Box Mechanism Infographic.png` | `music_box_case`, `cylinder_music_box`, `comb_music_box`, `spring_standard`, `spring_worn` | PRODUCT §6.1 | Cutaway of train, spring, cylinder, comb, key | No governor on the cutaway (C12); ratio 6:1 to 12:1 (C4). The cylinder speed 0.4 rad/s +-10 % is the specification |
| 16 | `Carousel Blueprint_ Hero Design & Assembly.png` | `carousel_base`, `carousel_column`, `carousel_platform`, `carousel_canopy`, `carousel_horse`, `carousel_lamp` | PRODUCT §6.2 | Look: canopy, frieze, column, three horses at 120 degrees, platform, base | 9-part structure (C2); 0.4 rad/s (C3); ratio 3:1 to 6:1 (C4); size 0.36 x 0.32 m; red canopy (C26) |
| 17 | `Carousel Blueprint_ 20-Part Exploded Assembly.png` | `gear_bevel_12`, `shaft_long`, `bearing_pillow_block`, `bracket_support`, `carousel_base`, `carousel_column`, `carousel_platform`, `carousel_canopy`, `carousel_horse`, `carousel_lamp` | PRODUCT §6.2 (Parts 20, 0.5 rad/s +-10 %); DATA §5, §6 | The best list of what fills the 20 slots; groups G1 to G5 | 20 rows are 40 pieces (C11); red canopy (C26) |
| 18 | `Steampunk Windmill Assembly Blueprint.png` | `windmill_base`, `windmill_tower`, `windmill_sails` | PRODUCT §6.3 | Tower body, roof, four-blade rotor, cap | 18 parts (C5); blade speed label (C6); drive from the Music Box (C7); size and blade diameter (board only) |
| 19 | `Windmill Assembly Blueprint Infographic.png` | `windmill_base`, `windmill_tower`, `windmill_sails`, `gear_bevel_12`, `bearing_pillow_block` | PRODUCT §6.3; DATA §5, §6 | The 24-row list and socket map | 24 rows are 45 pieces (C11); ratio 1:12 (C4); window shutters and door are decoration, not spec |
| 20 | `Windmill-Powered Bakery Awakening.png` | `bakery_building`, `windmill_millstone` | PRODUCT §6.3 (bakery behaviour) | Bakery exterior, chimney, oven look | Mixer, conveyor and bread output (board only; spec names smoke, kneading and oven glow); "16 parts" (C22); the windmill drive (C7) |
| 21 | `Clock Tower Blueprint and Mechanism Guide.png` | `clock_tower_shell`, `clock_tower_base`, `clock_face`, `clock_hands`, `clock_bell`, `pendulum_clock`, `escapement_wheel`, `escapement_anchor`, `cam_hourly_chime` | PRODUCT §6.4 (G0-optional, cut first) | Tower silhouette, face, bell, escapement | 28 parts (C8); game-time hands (C9); size 0.38 x 0.38 x 0.72 m |
| 22 | `Clock Tower Blueprint_ 32-Part Assembly.png` | `clock_tower_shell`, `clock_tower_base`, `clock_face`, `clock_bell`, `pendulum_clock`, `escapement_wheel`, `escapement_anchor`, `cam_hourly_chime`, `spring_barrel`, `bracket_support` | PRODUCT §6.4 | The 32-row list | 32 rows are 65 pieces (C11); doors every game hour (C10) |
| 23 | `Clockwork Town Awakening Infographic.png` | `town_ground`, `town_houses` | PRODUCT §3.5, §3.8; UI_UX_SPEC §15, §16; INTERACTION_SPEC §12 | Town layout, plot and foundation look, valid and invalid placement states, building states, awakening order | Day and night panels (cut first); the footprints (C27) |
| 24 | `Tockton Town Awakening Reference Guide-1.png` | `town_ground`, `bakery_building`, `town_houses`, `town_props_set` | UI_UX_SPEC §15, §16; INTERACTION_SPEC §12 | Placement feedback states; environment dressing (lanterns, bunting, banners, leaves, smoke) as candidates for the BLOCKED props set. It has **no** building-state panel | NPC speech bubbles, quest indicator, music overlay, windmill status card (not in any specification) |
| 25 | `Wound Up Town Awakening Reference Sheet-2.png` | `town_ground`, `bakery_building`, `town_houses`, `town_props_set` | PRODUCT §3.8; UI_UX_SPEC §16, §21 | Building states, awakening sequence, resident before and after | Resident activity and day and night beyond the index |
| 26 | `WoundUp Tockton Character Design Board.png` | `figure_otto`, `figure_mira` | PRODUCT_SPEC §7; GAMEPLAY_SYSTEMS §5; [TOCKTON_CHARACTERS.md](TOCKTON_CHARACTERS.md) | Figure style, proportions, costume, silhouette | Names and heights Oswald (the board's baker; the baker is Otto, ADR-039), Elias, Luna, Pip, Clack, Tinkerer (C21) |
| 27 | `WoundUp VR Hand Interaction Guide.png` | none (interaction and interface; ghost hands reuse the third-party hand models) | INTERACTION_SPEC §5 to §8, §10, §11, §16; UI_UX_SPEC §11, §14 | Part states: idle, hover, held, valid, invalid | Toggle X-ray (C15), hologram look (C16), 72 to 90 fps (C17), two-hand rotate and snap gestures (C25) |

## 3. Required items with no board

Audit B §2. The manifest entry still exists; the specification and ADRs guide it. At Stage 1 the owner proposes a reference (a clay blockout render and a written description), and the lead approves it before Stage 2 (SOURCE_READY needs "reference approved", audit F §6.2). Do not use generative image or 3D tools for references or models: licence and redistribution risk, and CLAUDE.md rejects generic model dumps (audit E §7).

| Item | Asset ids | Guiding source |
|---|---|---|
| Theatre facade | `theatre_facade` | PRODUCT_SPEC F2; ART §4 and §6. Only door mentions exist on Clock Tower and town boards |
| Gift box, gift tag | `gift_box`, `gift_engraving_plate` (BLOCKED, gap G-09) | PRODUCT §13; ART §4 |
| Parcel | `parcel` | PRODUCT §3.5: "visually distinct and physically openable"; the open motion is a one-shot clip |
| Letter | `letter_envelope` | PRODUCT §3, §7 |
| Town base, four plots, foundations | `town_ground` | PRODUCT §3.3; footprint at most about 60 x 40 cm, may scale to 75 % (PROJECT_BIBLE §2; PRODUCT §3.2). Town boards show foundations only in renders |
| Houses, street props | `town_houses`, `town_props_set` (both BLOCKED: gap G-07). The flower shop was removed by the owner on 2026-11-06 (ADR-039) | ART §18 defers decoration until the gameplay assets are done |
| Velvet stand | `tockton_base_round` | PRODUCT §3.2; shipped in M0; whether stand and town base are one asset is open (gap G-06) |
| Governor | `governor_standard` | PRODUCT §6.1 requires it. Boards: Catalogue row R and the Gear Train Guide only. Ruling I-6: it is one of the 12 |
| Winding key, machine base handle | `winding_key`, `machine_base_handle` | INTERACTION_SPEC §10; PRODUCT §3.7 and §3.8. The key has a board; the handle has none |
| Run lever | `run_lever` (BLOCKED, gap A-11) | PRODUCT §10 says "A Run lever"; other documents say "accessible Run control". If it is interface, the entry is deleted |
| Otto (the baker), schoolteacher, theatre keeper | `figure_otto` (ADR-039). The schoolteacher and the theatre keeper are roles with no figure and no entry | PRODUCT §7; [TOCKTON_CHARACTERS.md](TOCKTON_CHARACTERS.md). The board names its baker Oswald; that name is not used |
| Ghost hands, Easy Snap and gaze interface, pause menu, landing, gift viewer, wake ripple, daily repair states | None: these are runtime effects and interface, not GLBs | MASTER_ASSET_INVENTORY §8 |

## 4. Conflicts and rulings

The default rulings of PRODUCTION_AUDIT §7 are applied. "Applied" means ADR-029 or ADR-030 settles it. "Pending" means an owner decision is open and the stated default is used meanwhile ([decision list](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)). The numbers C1 to C25 are audit B's; C26 (palette, from audit B §3) and C27 (footprints, from audit A gap G-08) are added here.

| # | Item | Board says | Specification says | Ruling | State |
|---|---|---|---|---|---|
| C1 | Trunk size | 0.60 x 0.34 x 0.32 m (boards 9, 10, 11) | 35 cm wide, 25 deep, 20 high (PRODUCT §3.2) | 35 x 25 x 20 cm (I-5) | Applied |
| C2 | Carousel parts | 9 rows (board 16) | 20 (PRODUCT §6.2) | 20 unique part slots | Applied |
| C3 | Carousel speed | 0.4 rad/s +-10 % | 0.5 rad/s +-10 % | 0.5 (0.4 is the Music Box cylinder) | Applied |
| C4 | Gear ratios and trains | Music Box 6:1 to 12:1, carousel 12:1 or 6:1 or 3:1 to 6:1, windmill 1:12, clock tower 60:1 | None: no document gives a train (gap G-11) | Not used. Agent 1 and the lead define trains and constants | Applied |
| C5 | Windmill parts | 18 (board 18) | 24 (PRODUCT §6.3) | 24 unique part slots | Applied |
| C6 | Windmill speed | Blade 0.6 rad/s +-10 % | Millstone 0.6 rad/s +-15 % | Millstone, +-15 % | Applied |
| C7 | Windmill drive | From Music Box gears (boards 18, 19, 20) | "Wind powers the sails" (PRODUCT §6.3) | Ambient wind drives the sails (I-7). Whether the player also winds the Windmill is a separate open gap (G-01) | Applied for the drive; G-01 pending (owner) |
| C8 | Clock Tower parts | 28 (board 21) | 32 (PRODUCT §6.4) | 32 | Applied |
| C9 | Clock Tower time | Pendulum, game time | Hands show real local time (PRODUCT §6.4) | Real local time | Applied |
| C10 | Theatre doors | Open every game hour | Open for 30 s, on the hour (PRODUCT §6.4, F9) | 30 s on the hour | Applied |
| C11 | What "Parts: N" counts | Rows and pieces differ (table below) | Music Box 12, Carousel 20, Windmill 24, Clock Tower 32 | Unique part slots; a repeated piece is one GLB placed several times (I-2, ADR-030 item 3) | Applied |
| C12 | Music Box governor | Absent from boards 12 to 15 | Required, "governor spins" (PRODUCT §6.1) | The governor is one of the 12 (I-6) | Applied |
| C13 | Music Box cylinder speed | Not stated | 0.4 rad/s +-10 % | No conflict | n/a |
| C14 | Winding | "5 to 10 turns clockwise" (board 5) | 90 degrees per wind unit, maximum 8 (INTERACTION_SPEC §10) | Specification | Applied |
| C15 | X-ray activation | Toggle (board 27) | Hold about 0.4 s | Specification (runtime) | Applied |
| C16 | X-ray look | Full blue hologram | Casing about 15 % opacity, moving parts opaque, warm highlights | Specification (runtime). Casings need no extra mesh | Applied |
| C17 | Frame rate | 72 to 90 fps | 72 target, never below 60 | Specification | Applied |
| C18 | Snap radii | 4 cm and 7 cm Easy Snap | 4 cm and 7 cm (INTERACTION_SPEC) | Consistent | n/a |
| C19 | Gear module | 0.02 m (board 2), 2 mm (board 3), 4 mm implied by the diameters | DATA §4.1 ids use `_m1`; no module value in prose; the generator uses 3.6158 mm | Default token `m1` = 3.6158 mm | **Pending** ([decision 5](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner), gap G-16) |
| C20 | Tooth set | 8, 12, 16, 20, 24, 32 (boards 2, 3) | DATA §4.1 examples 12, 24, 36; ART §11 says 10 tooth counts | The manifest holds 10, 12, 16, 20, 24, 36 and bevel 12 | **Pending** (decision 5) |
| C21 | Residents | Oswald, Elias, Luna, Pip, Clack, Tinkerer; no Otto | Mira, Otto, the schoolteacher, the theatre keeper (PRODUCT §7) | Specification names (I-8). The baker is Otto (owner decision of 2026-11-06, ADR-039); the board's Oswald is not used | Applied; G-10 closed |
| C22 | Bakery parts | 16 (board 20) | None | Not used; no bakery part count exists | Unverified |
| C23 | Trunk parts capacity | 40 to 60 | None | Not used | Unverified |
| C24 | Triangle budgets and LODs | Hero 10 to 20k, gameplay 5 to 10k, distant 2 to 5k; gear LODs 3,200 / 1,200 / 400 | Deferred to profiling | Not targets. ADR-034 governs | Applied |
| C25 | Gesture set | Two-hand rotate, snap | Pinch, grab, wind (INTERACTION_SPEC §5 to §7, §10) | No asset effect; interaction owner decides | Unverified |
| C26 | Palette | Navy, red, lilac, mint accents; red canopies, roofs and a red trunk variant (boards 1, 8, 16, 17, 21) | Brass #C9A227, walnut #5B3A24, cream #F2E6CF, deep teal #1F5C5C, warm lamp #FFC66D (ART §3; CLAUDE.md §8) | The written palette governs. Red is not used unless the owner approves it | Applied (palette is written) |
| C27 | Footprints | Machines 0.24 to 0.38 m wide, Clock Tower 0.72 m tall | Town footprint at most about 60 x 40 cm; machines scale to the plot (gaps G-07, G-08) | Board sizes are appearance only. The lead publishes a footprint table before the Carousel, Windmill and Clock Tower reach Stage 1 | Pending (lead) |

Rows against pieces for C11 (audit B; board counts, not specification):

| Machine | Specification slots | Board rows | Board pieces |
|---|---|---|---|
| Music Box | 12 | 12 | 18 |
| Carousel | 20 | 20 | 40 |
| Windmill | 24 | 24 | 45 |
| Clock Tower | 32 | 32 | 65 |

## 5. How agents use the boards

1. Read only the boards named in the entry's `references` (plus the Art Direction board once per session), each at most once per Stage 1, and write what you took into the handoff. The boards total about 67 MB; reading all of them per asset is a token cost the project cannot afford (CLAUDE.md §15).
2. A number from a board enters the manifest only with `dimensionsBasis` of `board` or `unspecified`, and only after the lead approves it.
3. `References/` is a working folder: it is not in git, never copied into `public/` or the build (ADR-017). A fresh clone cannot check board names; the status tool says so.
4. A board that contradicts a specification is recorded here, not argued in a handoff.

## 6. Corrections to REFERENCE_INDEX.md

Audit B §5 lists twelve corrections. The three description errors are fixed in `REFERENCE_INDEX.md` in this pass: the panels of the Guide-1 board; the attribution of the NPC bubbles, quest indicator and music overlay to Guide-1 and not Sheet-2; and the sentence that only Mira appears in the specification (it names Mira and Otto). The remaining nine are missing notes or confirmations, not errors, and are carried here instead: trunk size (C1), governor omission (C12), piece counts (C11), Clock Tower real local time (C9), the Windmill wording (C7), the gear tooth set (C20) and the Bakery mixer and conveyor (board 20).

## 7. Dependencies

- Owner decision 5 (C19, C20), gap G-01 (C7). Gap G-10 (C21) was closed on 2026-11-06: Otto is the baker (ADR-039).
- The lead's footprint table (C27) before the machine housings reach Stage 1.
- Agent 1 and the lead for gear trains and constants (C4, gap G-11) before gear tooth counts for the slots without one can be fixed.

## 8. Acceptance criteria

1. Every manifest `references` entry appears in section 2 against the same asset ids, and every board in `References/` has a row.
2. No manifest entry carries `dimensionsBasis: spec` for a number that appears only on a board.
3. Every conflict row names its ruling and its state, and no pending point is written as settled.
4. Each of the three description errors named in section 6 is absent from `REFERENCE_INDEX.md`.
