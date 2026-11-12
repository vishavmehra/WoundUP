# Wound Up — Machine Slot Mappings: Windmill, Carousel and Clock Tower

**Status:** Proposed by the lead (drafted by Opus), awaiting owner approval. Nothing in this document is a requirement until the owner approves it (DECISIONS.md §2).
**Date:** 2026-11-12
**Label:** G0, the competition build. Tockton only (ADR-028). The Clock Tower is G0-optional and the first feature cut (PRODUCT_SPEC §6.4, §19; ADR-027); it is mapped so that the decision is ready, not because it is scheduled.
**Owner's order this answers (2026-11-06):** "5. Resolve the board-to-spec mappings for the Windmill, Clock Tower and Carousel. Written specifications remain authoritative." The same order says: "Keep all seven blocked assets blocked until I approve the relevant specifications" and "Do not change an asset from Blocked to Ready without an approved specification."

**What this document decides once approved**

1. What a slot is for these three machines, and the finding that the specified counts (Carousel 20, Windmill 24, Clock Tower 32) can be reached only if the boards' structural and decorative rows are parts the player installs (§2).
2. The slot list of each machine, row by row against its board: kept, merged into another slot's piece, dropped with the reason, or added because a specification requires it (§3.4, §4.4, §5.4). Each slot names its part id(s), function and dependencies. Socket positions are not defined here; only the Music Box needs them now (ADR-039 item 6).
3. The Carousel and Windmill gear trains that meet the specified targets, the Windmill repair fault, and what every single wrong gear does (§3.5, §4.5).
4. A recommendation, not a decision, for gap G-01: what powers the Windmill (§4.3).
5. Fit corrections that `TOCKTON_DIMENSIONS.md` needs for these trains: a Windmill base with a front porch, a taller Carousel base, two shaft lengths, and the sails-over-canopy limit that document handed to this one (§3.6, §4.6, §6).

**What stays blocked until the owner approves**

- The six live blocked entries stay BLOCKED and are not touched here: `music_box_slot_11`, `music_box_slot_12`, `run_lever`, `town_houses`, `town_props_set`, `gift_engraving_plate` (ADR-039 item 5).
- No asset changes status because of this document. The manifest keeps its current `machineSlotPlans` and entries; §9 lists the changes for the lead to apply after approval.
- No GLB for these machines is made on the strength of this document. Their machine files also wait for Asset Gate M, the Music Box end-to-end milestone (ADR-039 item 6).
- The Clock Tower's gear train tooth counts stay blocked on gap G-13 (no targets defined; MECHANICAL_SOLVER_SPEC §15.4: "Do not invent solver targets for this optional feature").

**Sibling documents.** `TOCKTON_DIMENSIONS.md` (owner item 4) gives the envelopes used here. The Music Box blueprint (owner item 3) is drafted separately; three choices here must match it and are marked "decide with item 3" (the winding key as a slot, the spring speed, the spring's arbor).

**Basis codes** (as in `TOCKTON_DIMENSIONS.md`). Every number carries one.

| Code | Meaning |
|---|---|
| S | Written specification, section given (PS = PRODUCT_SPEC, SOL = MECHANICAL_SOLVER_SPEC, SIM = SIMULATION_SPEC, DATA = DATA_AND_BLUEPRINT_SPEC, GS = GAMEPLAY_SYSTEMS, IS = INTERACTION_SPEC) |
| A | Accepted ADR in DECISIONS.md |
| M | Read from the manifest `assets/manifest/glb-manifest.json` or another repository file |
| D | Derived by the scripts of Appendix A from S, A, M or P values |
| B | Reference board: appearance and construction only (ADR-029) |
| P | Lead proposal, with its reason, awaiting approval |

---

## 1. Summary

| | Carousel | Windmill | Clock Tower |
|---|---|---|---|
| Specified slots (S PS §6) | 20 | 24 | 32 |
| Board used for rows (B) | 20-part board, 20 rows, 40 pieces | 24-part board, 24 rows, 45 pieces | 32-part board, 32 rows, 65 pieces |
| Rows kept / merged / dropped (D) | 18 / 2 / 0 | 23 / 0 / 1 | 30 / 2 / 0 |
| Slots added from the specifications (D) | 2: mainspring, winding key | 1: millstone | 2: clock hands, winding key |
| Slots in this mapping (D) | **20** | **24** | **32** |
| Slots if the housings stayed pre-built (D) | 14 | 9 | 16 |
| Pieces the player places (D) | 38 | 46 | 64 |
| Power (S, P) | Mainspring, wound | Ambient wind (recommended, §4.3) | Mainspring, wound |
| Target and result (S, D) | Platform 0.5 rad/s ±10 %: 0.500 | Millstone 0.6 rad/s ±15 %: 0.600; 12T fault 1.200 (2.00 ×) | None defined (G-13) |
| New GLB files if each installable piece has its own file (D) | +6 | +15 | +16 (G0-optional) |

All three counts are met exactly without inventing a component: every slot is either a row of the machine's own 20-, 24- or 32-part board or a part a written specification requires.

---

## 2. What a slot is, and why the counts need the boards' structural rows

**Definition (A ADR-030 item 3; S DATA §6).** "Parts: N" counts unique part slots in the blueprint. A slot is one kind of part the player installs, into one or more sockets. A piece that repeats (four base feet) is one slot and one GLB, placed several times as instances.

**Finding (D `slots.mjs`).** If each machine's housing stayed a pre-built piece that the player installs in one go (as the manifest's housing entries assume today), the three machines would have 14, 9 and 16 slots. The manifest's current `machineSlotPlans` reaches 20, 24 and 32 only by listing housing rows as slots while mapping them into one housing file, so 8, 15 and 18 of its rows have no installable piece of their own (D `plancheck.mjs`), which conflicts with ADR-030 item 4 ("Each interactive part ... has its own GLB").

So the specified counts can be met only if the boards' structural and decorative rows (panels, rings, railings, roof pieces, feet) are parts the player installs. That is what the 20-, 24- and 32-part boards themselves show: socket maps that include support and panel sockets, and a staged player build from the base up (B). Using these rows invents nothing: each one is on the machine's own board, and ADR-029 lets boards guide construction. **Recommendation (P): the boards' rows are slots, as listed in §3.4, §4.4 and §5.4.** If the owner prefers pre-built housings, PRODUCT_SPEC §6 must change to 14, 9 and 16.

**Consequences of the recommendation**

1. **Pieces to place (D).** Carousel 38, Windmill 46, Clock Tower 64; 84 without the Clock Tower. With the two decoys that Letters 3, 4 and 6 add (S DATA §9.1), the trays hold 40, 48 and 66 pieces. The 40-pinch limit applies to the Music Box only (S PS §9); no specification limits the other machines.
2. **Files (A ADR-030 item 4).** Two ways to package the installable pieces:
   - **K1, recommended (P):** every installable piece kind has its own GLB, as ADR-030 item 4 says. Net new manifest entries (D): Carousel +6 and Windmill +15 (G0-required, +21), Clock Tower +16 (G0-optional). The ids are in §9. Nothing in the contracts changes: one asset id is one GLB is one part (A ADR-033; S DATA §4).
   - **K2:** the housing GLBs stay and each installable row becomes a named node inside them (+0 files). It needs an amendment to ADR-030 item 4, a node field beside `visual.assetId` in DATA §4, and per-node validator rules (A ADR-037). Modelling work is the same either way.
3. **Axles (P).** An axle that only one part uses is a node of that part's GLB: the Windmill rotor hub's axle and the millstone's spindle. A shaft that carries the parts of several slots is its own slot, as the boards list it (main shaft, central shaft, drive shaft). The Carousel spring's arbor is the one exception, see §3.6.
4. **Repeated pieces.** By default the player places each instance (DATA §6: one socket per installed part). No specification says otherwise. The alternative is in question Q3.

---

## 3. Carousel (20 slots)

### 3.1 Specification requirements

| Requirement | Source |
|---|---|
| Parts: 20 | S PS §6.2 |
| Platform rotates; target 0.5 rad/s ±10 % | S PS §6.2; SOL §15.2; DATA §8; SIM §10.2; GS §11.2 |
| Horses rise and fall (count not given) | S PS §6.2; SIM §10.2; DATA §10 |
| Canopy lights twinkle (count not given) | S PS §6.2; SIM §10.2 |
| Music Box melody plays (audio; no cylinder or comb is named) | S PS §6.2; SIM §10.2 |
| Energy decreases over time, so the Carousel stores spring energy | S SIM §10.2 |
| The player winds the machine with the key, 90° per unit, at most 8 units | S GS §10; PS §10; IS §10 |
| Power source is a mainspring (the solver knows only mainspring and ambient wind; the Carousel is not wind-driven) | S SOL §5 |
| Follower motion comes from predefined profile data, not collision | S SOL §8.4 |
| Letter 3, two decoys | S PS §7; DATA §9.1 |

### 3.2 Boards

| Board | Use |
|---|---|
| Carousel Blueprint_ 20-Part Exploded Assembly (Ref 16) | **Row source.** 20 rows, 40 pieces; matches S on the count and on 0.5 rad/s ±10 % (B; audit B row 17). Its drive "from Music Box (gears)" is not used: the Carousel has its own spring (S SIM §10.2) |
| Carousel Blueprint_ Hero Design & Assembly (Ref 15) | Appearance only. Its 9 rows group the rows above (canopy, frieze, frame, column, horse with pole, platform, gear train, shaft support, base); its "9-part structure" and "≈0.4 rad/s" conflict with S and are not used (audit B C2, C3) |
| Mechanical Connections boards (Ref 07) | Their 12:1 and 6:1 ratios are unsourced and not used (audit B C4; A ADR-029) |

Board appearance notes not taken as spec: red canopy stripes are outside the palette (S PROJECT_BIBLE §4; CLAUDE.md §8), so the stripes are cream and deep teal (P).

### 3.3 Spring and key

No Carousel board has a spring or a key row, while the specifications require stored energy and winding (§3.1). Both are **added** (S), as library parts `spring_standard` and `winding_key` (M). The key is a slot here because it is one in the Music Box plan (M `machineSlotPlans`); if item 3 rules that the key is not a slot (gap G-02), the flag row comes back as its own slot and the count stays 20 (D, variant in `slots.mjs`).

### 3.4 Slot list

Assembly order, base up. "Row" is the 20-part board's row number. Part ids are manifest ids (M); ids in *italics* are the K1 files proposed in §9. Library gears are at module token `m1` (owner decision 5).

| Slot | Row(s) | Decision | Part id (pieces) | Function | Depends on |
|---|---|---|---|---|---|
| C01 | 18 base ring (inner) | Kept | *carousel_base_ring* (1) | Floor ring of the base; carries the floor bearing and the supports | none |
| C02 | 20 foot | Kept | *carousel_foot* (4) | Stands the base on the plot | C01 |
| C03 | 19 base panel | Kept | *carousel_base_panel* (4) | Encloses the gear train; one panel carries the key opening | C01 |
| C04 | 16 shaft bearing | Kept | `bearing_pillow_block` (2) | Hold the central shaft upright, floor and deck | C01 |
| C05 | 17 column support | Kept | `bracket_support` (2) | Hold the spring arbor beside the central shaft | C01 |
| C06 | none | **Added** (S SIM §10.2, GS §10) | `spring_standard` (1), on its arbor (§3.6) | Stores the wound energy; its arbor turns at the spring speed while running | C05 |
| C07 | 12 bevel gear (input) | Kept; the row's 90° transfer needs a pair | `gear_bevel_12` (2) | Turns the horizontal key's motion onto the vertical spring arbor, 1:1 | C06 |
| C08 | 14 intermediate gear | Kept | `gear_spur_10_m1` (1) | Driver, on the spring arbor | C06 |
| C09 | 15 central shaft | Kept | `shaft_short` (1) | Carries the drive gear and the platform | C04 |
| C10 | 13 spur gear (drive) | Kept | `gear_spur_16_m1` (1) | Driven by C08; turns the central shaft. The 16-tooth position decides the platform speed | C08, C09 |
| C11 | 11 platform | Kept | `carousel_platform` (1), without its poles under K1 | Rotates; carries the target 0.5 rad/s | C09, C03 |
| C12 | 9 pole | Kept | *carousel_pole* (3) | Carry the horses, 120° apart (B) | C11 |
| C13 | 10 horse | Kept | `carousel_horse` (3) | Rise and fall as followers of the platform (S SOL §8.4) | C12 |
| C14 | 8 central column | Kept | `carousel_column` (1), the column only under K1 | Centre column above the platform | C11 |
| C15 | 7 upper frame ring | Kept | *carousel_upper_ring* (1) | Ties the poles and the column under the canopy | C12, C14 |
| C16 | 5 frieze ring | Kept | *carousel_frieze_ring* (1) | Decorated ring that holds the lamps | C15 |
| C17 | 6 lamp | Kept | `carousel_lamp` (6) | The canopy lights that twinkle (S PS §6.2) | C16 |
| C18 | 3 canopy roof, with 4 canopy rib merged | Kept; row 4 **merged** | `carousel_canopy` (1), roof with its four ribs as nodes | The canopy (S PS §6.2). The ribs support the roof like an umbrella's, so they come with it; this saves four placements | C16 |
| C19 | 1 finial, with 2 flag merged | Kept; row 2 **merged** | *carousel_finial* (1), the flag a node of it | Top ornament; the flag flies from the finial, so it comes with it | C18 |
| C20 | none | **Added** (S GS §10, PS §10) | `winding_key` (1) | Pinched and turned to wind; decide with item 3 | C07 |

Not added, because no specification or board row names them: a cylinder and comb for the melody (the melody is audio, S PS §6.2), a crank or linkage for the horses (the solver's pin edge with profile data moves them, S SOL §8.4), a ratchet (G2 future, M).

### 3.5 Gear train and target

Solver edges (S SOL §7, §8; magnitudes only, signs follow the solver's convention):

```text
spring arbor (power: mainspring, wind units 0 to 8)
  -shaft-> 10T (C08) -mesh 10:16-> 16T (C10) -shaft-> central shaft (C09) -shaft-> platform (C11)   target 0.5 rad/s ±10 %
  platform -pin (profile data)-> horses x3 (C13)                                                    follower pose
  key (C20) -bevel 12:12 (C07)-> spring arbor                                                       winding path
```

| Item | Value | Basis |
|---|---|---|
| Spring output speed while running | 0.8 rad/s | P: a blueprint constant of the power node (S SOL §7 "Power sources provide initial operating values"); decide with item 3 (Q8) |
| Platform | 0.800 × 10/16 = **0.500 rad/s**, one turn every 12.57 s | D `trains.mjs` |
| Tolerance band | 0.450 to 0.550 rad/s | S; D |
| Any other G0 gear in the 16T position (10, 12, 20, 24, 36T) | 0.800, 0.667, 0.400, 0.333, 0.222: all `runs_wrong` | D |
| Any other G0 gear in the 10T position (12, 16, 20, 24, 36T) | 0.600 (+20 %), 0.800, 1.000, 1.200, 1.800: all `runs_wrong` | D |
| Horses | One rise and fall per platform turn, phases 120° apart, ±0.6 cm (P; TOCKTON §11 travel) | P: SOL §8.4 leaves the profile to the blueprint |
| Runtime | T = W × Eu / D; Eu and D are not specified (gap G-11) | S SOL §12 |
| Optional link (P) | If the key stays geared to the arbor while running, it turns back at 0.8 rad/s. With D = 2 × 0.8 × Eu / π = 0.509 × Eu, the key reaches zero exactly when the spring is spent: 8 units run 15.7 s | D `trains.mjs` |

If the spring speed is set elsewhere (for example by item 3 as one value for `spring_standard`), the single stages that fit the base and land within ±10 % are (D `trains.mjs`, `fits.mjs`): 0.375 rad/s 16T→12T (0.500); 0.417 rad/s 12T→10T (0.500); 0.6 rad/s 10T→12T (0.500); 0.667 rad/s 12T→16T (0.500); 0.8 rad/s 10T→16T (0.500). At 0.8 rad/s the Music Box's 10T→20T pair gives its cylinder exactly 0.400 rad/s (D), which item 3 may use or ignore.

### 3.6 Fit (module 2.5 mm, TOCKTON_DIMENSIONS §10 recommendation)

| Check | Result | Basis |
|---|---|---|
| Spring arbor 10T to central 16T in the base's 59.0 mm interior radius | Centre distance 32.5 mm; outermost reach 55.0 mm (the spring's edge): fits | D `fits.mjs` |
| Other fitting pairs | 10/12, 12/10, 16/10, 12/16, 16/12 fit; 10/20, 12/20, 12/24 do not | D |
| Base height: key bevel, spring and gear stacked on the arbor | At least 47.2 mm, against TOCKTON's 30 mm base. Proposed base 4.8 cm: platform 4.8 to 5.4 cm, open band 5.4 to 12.0 cm (6.6 cm, was 8.4); the horses need 3.6 cm (2.4 cm horse, ±0.6 cm). Overall height stays 18.0 cm | D `fits.mjs`; P |
| Poles | 6.6 cm, from the platform to the upper frame ring | D; P |
| Central shaft | `shaft_short` (9 cm, TOCKTON §11): its top at 9.6 cm stays hidden in the column | D `fits.mjs` |
| Lamps and feet against the 1.2 cm minimum collider radius (S IS §7.2) | Lamps 70.7 mm apart, feet 102.1 mm apart: no overlap | D |
| At 3.6158 mm | No pair fits the base | D |

**The spring's arbor (P, decide with item 3).** The spring, the key's bevel and the 10T driver share one vertical arbor, and no board row names it. The smallest option is that `spring_standard`'s GLB includes its arbor, as the springs board draws the spring with its axle (B Ref 05). The Music Box uses the same part, so item 3 must agree. If it does not, a separate arbor part is needed and one more Carousel row must merge (candidate: the frieze ring into the canopy roof).

**What turns (P; spec silent).** Everything above the platform (poles, horses, column, rings, canopy, lamps) turns with the platform, as on a real carousel and as the board's row 8 says ("Main rotating column", B). The base stays still. This adds no part; the presentation follows the platform's speed (S SIM §9.3).

---

## 4. Windmill (24 slots)

### 4.1 Specification requirements

| Requirement | Source |
|---|---|
| Parts: 24 | S PS §6.3 |
| Wind powers the sails; the solver's power source is ambient wind, "deterministic blueprint-defined input" | S PS §6.3; SOL §5, §12.2 |
| Sails rotate; millstone rotates; flour puffs appear | S PS §6.3; SIM §10.3; GS §11.3 |
| Target: millstone 0.6 rad/s ±15 % | S PS §6.3; SOL §15.3; DATA §8 |
| Repair (Letter 5): a 12-tooth spur gear sits where a 24-tooth gear is required; the millstone runs about twice as fast; the solver returns `runs_wrong` | S PS §8; GS §12.2; SOL §4.3, §15.3 |
| Activates the Bakery: chimney smoke, Otto kneads, oven glows | S PS §6.3, §11; SIM §10.3; A ADR-039 |
| Letter 4, two decoys | S PS §7; DATA §9.1 |

### 4.2 Boards

| Board | Use |
|---|---|
| Windmill Assembly Blueprint Infographic (Ref 18) | **Row source.** 24 rows, 45 pieces; matches S on the count and on millstone ±15 % (B; audit B row 19). **It has no millstone row**: its power flow sends the "millstone drive gear" to a millstone inside the Bakery. Its drive "from Music Box (gears)" is not used (A ADR-029, ruling I-7). Its "1:3:4, overall 1:12" is unsourced and not used |
| Steampunk Windmill Assembly Blueprint (Ref 17) | Appearance only. Its 8 list rows group the rows above; "Total Parts 18", "blade speed 0.6 rad/s ±10 %" and "Use the approved Windmill blueprint (18 parts)" conflict with S and are not used (audit B C5, C6) |
| Windmill-Powered Bakery Awakening (Ref 19) | The Bakery's mixer, conveyor and millstone are board-only (audit B §3); the Bakery is a building with no slots and no mechanical link (TOCKTON §3.4) |

### 4.3 What powers the Windmill (gap G-01): options and recommendation

The specifications disagree in wording: SOL §12.2 says "The Windmill uses ambient wind as its power source" and PS §6.3 says "Wind powers the sails"; GS §10 and PS §10 say generally "The player winds the machine". Ruling I-7 (A ADR-029) already decided that ambient wind drives the sails and left open whether the player also winds the Windmill.

| Option | What the player does | Consequences |
|---|---|---|
| **W-a, recommended (P):** ambient wind only | Builds the Windmill. When the last required part snaps in, the solver evaluates it and the sails turn | Matches SOL §5 and §12.2, PS §6.3, ruling I-7 and Letter 4 ("No wind, no windmill"). No spring and no key slot. Wind mode is skipped for this machine, so GS §10 and PS §10 need one sentence ("except the Windmill, which the wind drives"). The Windmill runs without draining, so the Bakery stays awake once the Windmill is placed (S PS §11). The solver's `runSeconds` has no finite value here, and JSON cannot hold Infinity (S SOL §6, "serialisable"), so Agent 1 needs a serialisable marker for a continuous run. The repair works unchanged |
| W-b: the player winds it | Winds a key on the base; the spring turns the sails | Adds a mainspring and a key slot, so two decorative rows must merge (door into the door frame, shutters into the window frames); the key on the base needs a second bevel pair (row 11 holds 4 bevel gears). Pieces 47 (D `slots.mjs`). The spring would drive the sails like a fan, against SOL §12.2 and ruling I-7. The Windmill stops when the spring is spent, and with it the Bakery, unless gap G-04 says placed machines keep running. At a shared 0.8 rad/s spring speed the pinion becomes 16T (0.533, −11.1 %) or 20T (0.667, +11.1 %), and the 12T fault still gives 2.00 × (D `trains.mjs`) |
| W-c: the player starts the sails by hand and the wind keeps them turning | A push on the rotor | Not recommended: no specification describes it, so it would be a new mechanic |

### 4.4 Slot list (option W-a)

Assembly order, base up. "Row" is the 24-part board's row number.

| Slot | Row(s) | Decision | Part id (pieces) | Function | Depends on |
|---|---|---|---|---|---|
| W01 | 19 base ring (bottom) | Kept | *windmill_base_ring_bottom* (1) | Floor of the base and its front porch (§4.6) | none |
| W02 | 20 base foot | Kept | *windmill_base_foot* (4) | Stands the base on the plot | W01 |
| W03 | 18 base panel | Kept | *windmill_base_panel* (4) | Encloses the spur stage | W01 |
| W04 | 17 base ring (top) | Kept | *windmill_base_ring_top* (1) | Deck over the stage; the tower stands at its back, the millstone in front | W03 |
| W05 | 16 shaft bearing support | Kept | `bearing_pillow_block` (2) | Hold the main shaft upright, at the base floor and at the deck | W04 |
| W06 | 15 main shaft | Kept | `shaft_long` (1) | Vertical shaft on the tower's axis, from the bevel under the hub to the pinion in the base | W05 |
| W07 | 13 intermediate gear (S) | Kept as the pinion | `gear_spur_12_m1` (1) | Pinion at the foot of the main shaft | W06 |
| W08 | none | **Added** (S PS §6.3, SOL §15.3) | `windmill_millstone` (1), its spindle a node | Turns on the porch deck where the player sees it; carries the target 0.6 rad/s; flour puffs come from it | W04 |
| W09 | 14 millstone drive gear | Kept; it is **the designated 24-tooth position** (S PS §8) | `gear_spur_24_m1` (1) | On the millstone's spindle under the deck, driven by W07. The Letter 5 fault puts `gear_spur_12_m1` here | W07, W08 |
| W10 | 10 upper platform | Kept | *windmill_upper_platform* (1) | Floor of the tower with the shaft hole | W04, W06 |
| W11 | 7 tower support slat | Kept | *windmill_support_slat* (4) | Corner posts of the tower | W10 |
| W12 | 8 tower wall panel | Kept | *windmill_wall_panel* (4) | Tower walls with window and door openings | W11 |
| W13 | 21 window frame | Kept | *windmill_window_frame* (2) | Frames the two windows | W12 |
| W14 | 22 window shutter | Kept | *windmill_window_shutter* (2) | Shutters on the frames | W13 |
| W15 | 23 door frame | Kept | *windmill_door_frame* (1) | Frames the door | W12 |
| W16 | 24 door | Kept | *windmill_door* (1) | Door in its frame (board: openable, decorative) | W15 |
| W17 | 9 balcony railing | Kept | *windmill_railing* (4) | Railing round the deck | W04 |
| W18 | 6 roof frame | Kept | *windmill_roof_frame* (1) | Truss on top of the walls; holds the hub's axle and the bevels | W12 |
| W19 | 5 roof tiles ring | Kept | *windmill_roof_tiles* (1) | Roof cover | W18 |
| W20 | 4 roof cap | Kept | *windmill_roof_cap* (1) | Roof finial | W19 |
| W21 | 2 rotor hub | Kept | *windmill_rotor_hub* (1), its axle a node | Carries the sails; its axle runs into the roof | W18 |
| W22 | 11 input bevel gear | Kept; the row's 90° turn needs a pair | `gear_bevel_12` (2) | One on the hub's axle, one on top of the main shaft: turns the sails' motion down the tower, 1:1 | W06, W21 |
| W23 | 1 blade panel | Kept | *windmill_blade* (4) | The sails (S PS §6.3) | W21 |
| W24 | 3 rotor cap | Kept | *windmill_rotor_cap* (1) | Locks the blades on the hub | W23 |
| none | 12 intermediate gear (L) | **Dropped** | none | The specified train needs one spur pair (§4.5). Kept as an idler it would change no speed, add no requirement and widen the base beyond its plot (§4.6). It is the one row the added millstone displaces; the decorative rows are kept because they are the boards' construction | none |

### 4.5 Gear train, target and repair

```text
rotor hub (power: ambient wind, blueprint input) -shaft-> bevel A -mesh 12:12-> bevel B -shaft-> main shaft
  -shaft-> pinion 12T (W07) -mesh 12:24-> designated 24T (W09) -shaft-> millstone (W08)   target 0.6 rad/s ±15 %
millstone status runs, machine placed  ->  town layer wakes the Bakery (S PS §11; SIM §10.3; not a solver edge)
```

| Item | Value | Basis |
|---|---|---|
| Ambient wind input (sails) | 1.2 rad/s, one turn every 5.24 s | P: the "deterministic blueprint-defined input" of S SOL §12.2; D |
| Millstone | 1.2 × 12/12 × 12/24 = **0.600 rad/s**, one turn every 10.47 s; band 0.510 to 0.690 | D `trains.mjs` |
| **Repair fault:** 12T in the 24T position | **1.200 rad/s = 2.00 × the intended speed: `runs_wrong`** (S PS §8: "approximately twice") | D |
| Any other G0 gear in the 24T position (10, 16, 20, 36T) | 1.440, 0.900, 0.720 (+20 %), 0.400: all `runs_wrong` | D |
| Any other G0 gear in the pinion position (10, 16, 20, 24, 36T) | 0.500 (−16.7 %), 0.800, 1.000, 1.200, 1.800: all `runs_wrong` | D |
| Only the intended pair runs | Asserted for every single swap above | D |

### 4.6 Fit (module 2.5 mm)

`TOCKTON_DIMENSIONS.md` §6 found that the 24T and 12T pair fits a 9.5 cm base (an 8.1 cm square, D there). That square is the diagonal layout, each gear in a corner (81.07 mm, D). The hub sits on the tower's centre line, so the main shaft and its pinion stand on the windshaft's vertical plane, and the largest centre distance the 8.3 cm interior then allows is 35.0 mm, against the 45.0 mm the pair needs (D `fits.mjs`).

| Option | Result (D `fits.mjs`, `sails.mjs`) |
|---|---|
| Deeper base, shaft behind the tower axis | Base 9.5 × 10.53 cm with the main shaft 2.95 cm behind the base centre. The bevel then sits 2.95 cm behind the axis at hub height, where the tapered cap may be too shallow (not computed). Not recommended |
| **Porch, recommended (P)** | The tower stands at the back of a 9.5 × 13.06 cm base on the shaft's axis; the 24T and the millstone sit in front of it, so the player sees the millstone turn and the flour puff (S PS §6.3). Plot pad 10.5 × 14.06 cm, z −0.56 to +13.5 cm (inside the plot band, −1.5 to +13.5), centre (24.25, 6.47); the tower's axis moves from z 8.25 to 4.69 cm. The spur stage needs 2.32 cm of the 3.5 cm base height. The front of the base, where the base handle is, stays where it was |
| At 3.6158 mm | Porch base 10.49 × 16.5 cm and pad 17.5 cm deep: does not fit the 15 cm plot band |

**Sails over the Carousel (the limit TOCKTON §3.3 handed to this document).** With the porch, the sails' plane moves back to z 9.19 cm (tower 3.0 cm half-deep at the hub) or 10.44 cm (4.25 cm, untapered) and passes over the Carousel's outer 0.85 or 0.19 cm. The lowest sail point there is 15.24 or 17.10 cm. Against a canopy profiled as a 13.0 cm rim rising to 16.0 cm at the axis, the clearance is 2.24 or 4.10 cm (D `sails.mjs`; P profile). **Kept limit (P): the hub stays at 19.0 cm, and the Carousel's canopy stays below 15.2 cm within 0.85 cm of its rim on the Windmill side.** In TOCKTON's own layout the sails' plane (z 12.75 or 14.00 cm) does not cross the Carousel at all (D), so its 14.3 cm figure, which checked x only and reproduces here, was conservative.

---

## 5. Clock Tower (32 slots, G0-optional, cut first)

### 5.1 Specification requirements

| Requirement | Source |
|---|---|
| Parts: 32; Should; cut first; build only after the core machines, town and gifting are stable | S PS §6.4, §19; A ADR-027 |
| Pendulum swings, as a controlled animation, no rigid-body simulation | S PS §6.4; SIM §9.6, §10.4 |
| Clock hands show real local time | S PS §6.4; SIM §10.4; GS §11.4 |
| Hourly bell strikes; theatre doors open for 30 s on the hour | S PS §6.4, F9 |
| Targets must be defined before implementation and must not be invented | S SOL §15.4; DATA §8 (gap G-13) |
| The player winds the machine (general rule; power source mainspring) | S GS §10; SOL §5 |
| Letter 6, two decoys | S PS §7; DATA §9.1 |

### 5.2 Boards

| Board | Use |
|---|---|
| Clock Tower Blueprint_ 32-Part Assembly (Ref 21) | **Row source.** 32 rows, 65 pieces (B; audit B row 22). **It has no hands row**, although its own notes and build stage 7 mention "hands (hour + minute)". Its "game time" and "every game hour" are not used: real local time (S PS §6.4; audit B C9) |
| Clock Tower Blueprint and Mechanism Guide (Ref 20) | Appearance only. Its 8 rows group the rows above; "Total parts 28" conflicts with S (audit B C8). Its "60:1" (Ref 07) is unsourced and not used |

### 5.3 What drives what

The board's mainspring drum and coil are the power (B rows 17 and 18), wound with the key like the other wound machines (S GS §10). The hands follow the device's local time (S PS §6.4); they are not a solver output. The hourly cam and the bell strike on the real hour, as a trigger edge (S SOL §8.5). The pendulum is a controlled animation (S SIM §9.6). Because no target exists (G-13), the tooth counts of the large gear and the three intermediate gears, the escape wheel's teeth and the gears' arbors stay undefined here; they are blocked with G-13. The smallest option for the owner (P): no angular-velocity target; the Clock Tower `runs` when every required socket is filled and the solver finds no jam (loop consistency, module). A wrong gear then has no visible consequence; if the owner wants one, a target is needed (Q11).

### 5.4 Slot list

Assembly order, base up. "Row" is the 32-part board's row number. All parts are G0-optional.

| Slot | Row(s) | Decision | Part id (pieces) | Function | Depends on |
|---|---|---|---|---|---|
| T01 | 15 base platform | Kept | *clock_tower_base_platform* (1) | Foundation | none |
| T02 | 16 base step | Kept | *clock_tower_step* (4) | Entry steps | T01 |
| T03 | 31 base corner block | Kept | *clock_tower_corner_block* (4) | Corners of the base | T01 |
| T04 | 30 base wall panel | Kept | *clock_tower_wall_panel* (4) | Walls of the base | T01 |
| T05 | 28 entrance arch | Kept | *clock_tower_entrance_arch* (1) | Front arch; shows the pendulum (TOCKTON §11) | T04 |
| T06 | 29 side arch panel | Kept | *clock_tower_side_arch* (2) | Side arches | T04 |
| T07 | 32 base capstone | Kept | *clock_tower_capstone* (1) | Top stone of the base | T03, T04 |
| T08 | 27 lower tower ring | Kept | *clock_tower_lower_ring* (1) | Lower structural ring | T07 |
| T09 | 13 column pillar | Kept | *clock_tower_pillar* (4) | Tower columns | T08 |
| T10 | 9 balcony frame | Kept | *clock_tower_balcony_frame* (4) | Balcony wall segments | T09 |
| T11 | 14 balcony railing | Kept | *clock_tower_railing* (8) | Railing posts | T10 |
| T12 | 20 gear bracket | Kept | `bracket_support` (2) | Plates that hold the train | T08 |
| T13 | 17 mainspring drum | Kept | `spring_barrel` (1) | Houses the spring; drives the train | T12 |
| T14 | 18 mainspring coil | Kept | `spring_standard` (1) | Stores the wound energy | T13 |
| T15 | 19 drive shaft | Kept | `shaft_long` (1) | Carries the drive up to the clock module | T12 |
| T16 | 10 large gear | Kept | library spur gear, teeth blocked on G-13 (1) | First gear of the train | T13 |
| T17 | 11 intermediate gear | Kept | library spur gears, teeth blocked on G-13 (3) | Gear train | T16 |
| T18 | 12 escape wheel | Kept | `escapement_wheel` (1) | Released one tooth per swing | T17 |
| T19 | 21 escapement pallet | Kept as one piece | `escapement_anchor` (1), both pallets on it | Locks and releases the escape wheel | T18 |
| T20 | 22 pendulum rod | Kept | *pendulum_rod* (1) | Hangs from the anchor's arbor; swings (S PS §6.4) | T19 |
| T21 | 23 pendulum bob | Kept | *pendulum_bob* (1) | Weight on the rod | T20 |
| T22 | 26 hourly cam | Kept | `cam_hourly_chime` (1) | Trips the striker once on each real hour | T15 |
| T23 | 24 bell, with 25 bell striker merged | Kept; row 25 **merged** | `clock_bell` (1), the striker a node (as the manifest already has it) | Strikes the hour (S PS §6.4) | T22 |
| T24 | 8 middle tower ring | Kept | *clock_tower_middle_ring* (1) | Tower section | T09 |
| T25 | 7 tower window | Kept | *clock_tower_window* (4) | Arched windows | T24 |
| T26 | 6 clock face | Kept | `clock_face` (1) | Dial (cream enamel, PROJECT_BIBLE §5) | T24, T15 |
| T27 | none | **Added** (S PS §6.4) | `clock_hands` (1) | Show real local time | T26 |
| T28 | 5 upper ring | Kept | *clock_tower_upper_ring* (1) | Roof support ring | T24 |
| T29 | 4 roof arch (front) | Kept | *clock_tower_roof_arch* (1) | Front gable | T28 |
| T30 | 3 roof tile assembly, with 1 flag merged | Kept; row 1 **merged** | *clock_tower_roof* (1), the flag a node | Main roof; the flag stands on it | T28 |
| T31 | 2 roof spire | Kept | *clock_tower_spire* (4) | Corner spires | T30 |
| T32 | none | **Added** (S GS §10, decide with item 3) | `winding_key` (1) | Pinched and turned to wind | T14 |

If item 3 rules that the key is not a slot, the flag comes back as its own slot and the count stays 32 (D `slots.mjs`).

---

## 6. Shared library effects

| Part | Effect | Basis |
|---|---|---|
| `gear_spur_10_m1` | Used by the Carousel (C08): G0-optional becomes G0-required | D |
| `gear_spur_16_m1` | The Carousel's drive gear (C10); regenerated anyway (REWORK_REQUIRED) | M; D |
| `gear_spur_12_m1`, `gear_spur_24_m1` | The Windmill's pinion and designated position (W07, W09); the 12T is also the Letter 5 fault part | S PS §8; D |
| `gear_bevel_12` | Two per machine: Carousel key input (C07), Windmill wind input (W22) | D |
| `shaft_short` | 9 cm: Music Box and the Carousel's central shaft | P TOCKTON §11; D |
| `shaft_long` | 18 cm, not 15: the Windmill's main shaft needs 17.85 cm; the Clock Tower's drive shaft at that length ends at 23.85 cm, inside the 28.0 cm shell. Two lengths serve all three machines, so TOCKTON's question Q16 needs no third length | D `fits.mjs`; P |
| `spring_standard` | Carousel (C06) and Clock Tower (T14); its arbor as a node is proposed (§3.6, decide with item 3) | P |
| `winding_key` | Music Box, Carousel and Clock Tower; not the Windmill under W-a | M; P |
| `bearing_pillow_block` | Two in the Carousel (C04), two in the Windmill (W05) | D |
| `bracket_support` | Two in the Carousel (C05), two in the Clock Tower (T12), plus the Music Box's | M; D |

**Decoys (P; which parts is open, audit A A-12; decoys are cut third, S PS §19).** The smallest option uses library gears from the G0 tooth set, so no new file: Letter 3, the 12T and 20T gears (in the 16T position 0.667 and 0.400 rad/s, in the 10T position 0.600: all `runs_wrong`); Letter 4, the 16T and 20T gears (in the 24T position 0.900 and 0.720: `runs_wrong`) (D `trains.mjs`). Letter 6 waits for G-13. `gear_spur_20_m1` stays G0-optional as a decoy.

---

## 7. Open questions for the owner

| # | Question | Recommendation |
|---|---|---|
| Q1 | May the boards' structural and decorative rows be parts the player installs? Without them the counts are 14, 9 and 16, not 20, 24 and 32 (§2) | Yes |
| Q2 | Packaging: K1, own GLB per installable piece (+21 G0-required and +16 G0-optional entries), or K2, named nodes in the housing GLBs (+0, amends ADR-030 item 4 and DATA §4)? | K1 |
| Q3 | Repeated pieces: the player places every instance (38, 46 and 64 placements), or places one and the rest follow by symmetry (20, 24 and 32 placements; a new interaction rule no specification has)? | Every instance; revisit after the first playtest |
| Q4 | Gap G-01: is the Windmill driven by ambient wind only (W-a), wound by the player (W-b), or started by hand (W-c)? | W-a |
| Q5 | The Windmill's base becomes 9.5 × 13.06 cm with the millstone on a front porch; its pad 10.5 × 14.06 cm, centre (24.25, 6.47) (§4.6). This changes TOCKTON §3.3 and §6 | Yes |
| Q6 | The Carousel's base becomes 4.8 cm tall (open band 6.6 cm) to hold the key's bevel, the spring and the gear stage (§3.6) | Yes |
| Q7 | Does everything above the Carousel's platform turn with it (board row 8)? The specifications are silent | Yes |
| Q8 | Is the spring speed a constant of each blueprint, or one value on `spring_standard`? If one value, 0.8 rad/s serves the Carousel (10T→16T) and the Music Box (10T→20T). Decide with item 3 | Per blueprint; 0.8 rad/s for the Carousel |
| Q9 | Does `spring_standard`'s GLB include its arbor (§3.6)? Decide with item 3 | Yes |
| Q10 | Is the winding key a slot (gap G-02)? Follows item 3's ruling; the count holds either way | As item 3 rules |
| Q11 | Clock Tower targets (gap G-13): accept "no velocity target; runs when complete and without a jam", or define a target? And when its spring is spent, do the hands still show real time? | No target; the hands always show real time and the pendulum stops |
| Q12 | Decoys for Letters 3 and 4 from the library gear set (§6) | Yes |

---

## 8. Things this document does not settle

- Socket positions, rotations and capture order for these machines (DATA §6): after the Music Box milestone (ADR-039 item 6).
- The Bakery's behaviour, Otto's kneading and the wake: they follow S PS §6.3 and §11 and TOCKTON §3; no Bakery slot exists.
- Runtime constants Eu and D for any spring (gap G-11) and the ambient-wind marker for `runSeconds` (§4.3): Agent 1.
- Reach, sight lines and the X-ray height after the porch change: TOCKTON's `dims.mjs` must be re-run once Q5 is decided. The base handle does not move.

---

## 9. Proposed manifest changes (listed, not applied)

The lead applies these after approval, in one change, with `node tools/asset-status.mjs` re-run. No blocked entry changes status.

1. `machineSlotPlans.carousel`: replace the rows with the 20 slots of §3.4 (adds the mainspring and the key; merges the flag into the finial and the ribs into the canopy roof). The note that "the energy source is open" is resolved.
2. `machineSlotPlans.windmill`: replace the rows with the 24 slots of §4.4; record row 12 as dropped with its reason; empty `extraSpecItems` (the millstone is now a row); notes record option W-a and the porch.
3. `machineSlotPlans.clock_tower`: replace the rows with the 32 slots of §5.4 (adds the hands and the key; merges the flag and the striker); empty `extraSpecItems`; tooth counts stay pending on G-13.
4. Under K1 (Q2), new entries, all NOT_STARTED, owner and sizes from `ASSET_AGENT_ASSIGNMENTS.md` and `TOCKTON_DIMENSIONS.md` once approved:
   - Carousel, G0-required (net +6): add `carousel_finial`, `carousel_frieze_ring`, `carousel_upper_ring`, `carousel_pole`, `carousel_base_ring`, `carousel_base_panel`, `carousel_foot`; retire `carousel_base`. `carousel_platform` loses its poles; `carousel_column` holds only the column and is described as turning with the platform (Q7); `carousel_canopy` contains the roof and its four ribs.
   - Windmill, G0-required (net +15): add `windmill_blade`, `windmill_rotor_hub`, `windmill_rotor_cap`, `windmill_roof_cap`, `windmill_roof_tiles`, `windmill_roof_frame`, `windmill_support_slat`, `windmill_wall_panel`, `windmill_railing`, `windmill_upper_platform`, `windmill_window_frame`, `windmill_window_shutter`, `windmill_door_frame`, `windmill_door`, `windmill_base_ring_top`, `windmill_base_panel`, `windmill_base_ring_bottom`, `windmill_base_foot`; retire `windmill_sails`, `windmill_tower`, `windmill_base`.
   - Clock Tower, G0-optional (net +16): add `clock_tower_roof`, `clock_tower_spire`, `clock_tower_roof_arch`, `clock_tower_upper_ring`, `clock_tower_window`, `clock_tower_middle_ring`, `clock_tower_balcony_frame`, `clock_tower_pillar`, `clock_tower_railing`, `clock_tower_lower_ring`, `clock_tower_base_platform`, `clock_tower_step`, `clock_tower_entrance_arch`, `clock_tower_side_arch`, `clock_tower_wall_panel`, `clock_tower_corner_block`, `clock_tower_capstone`, `pendulum_rod`, `pendulum_bob`; retire `clock_tower_shell`, `clock_tower_base`, `pendulum_clock`.
5. `gear_spur_10_m1`: G0-optional to G0-required; related machine Carousel.
6. `gear_spur_16_m1`: related machine adds the Carousel (drive gear). `gear_bevel_12`: two per machine, Carousel and Windmill.
7. `shaft_long`: `approxDimensionsM` [0.008, 0.008, 0.18]; used by the Windmill main shaft and the Clock Tower drive shaft. `shaft_short`: used by the Music Box and the Carousel central shaft.
8. `spring_standard`: `contains` its arbor (Q9, decide with item 3); used by the Carousel and the Clock Tower.
9. `winding_key`: related machines Music Box, Carousel, Clock Tower; the note "Windmill: open, gap G-01" becomes "Windmill: none (W-a)" if Q4 is approved.
10. `windmill_millstone`: `contains` its spindle, which seats the 24T; sits on the porch deck.
11. `escapement_anchor` carries both pallets (row 21); `clock_bell` contains the striker (row 25).
12. Dimensions after Q5 and Q6, for the lead to carry into `TOCKTON_DIMENSIONS.md` and `town_ground`: Windmill base 0.095 × 0.035 × 0.1306 m; `PLOT_Windmill` at (0.2425, 0.006, 0.0647) with a 10.5 × 14.06 cm pad; Carousel base 4.8 cm tall, platform top at 5.4 cm, poles 6.6 cm.

---

## 10. Acceptance criteria

1. Each machine has exactly its specified number of slots: Carousel 20, Windmill 24, Clock Tower 32 (asserted in `slots.mjs`).
2. Every component a specification names is a slot: Carousel platform, horses, canopy lights and the spring the energy rule requires; Windmill sails, millstone and the designated 24-tooth position; Clock Tower pendulum, hands and bell.
3. Every slot is a row of the machine's own 20-, 24- or 32-part board or a part a specification requires. The only pieces beyond the board's quantity are the second bevel of each bevel pair, which the board's own 90° row needs.
4. The Carousel platform runs at 0.500 rad/s (inside 0.450 to 0.550) and the Windmill millstone at 0.600 rad/s (inside 0.510 to 0.690); a 12T gear in the designated 24T position gives 1.200 rad/s (2.00 ×) and `runs_wrong`; no other single swap from the G0 tooth set lands inside either tolerance (asserted in `trains.mjs`).
5. At the recommended 2.5 mm module every gear stage fits its machine, the Windmill's porch pad fits the plot band, and the sails clear the profiled Carousel canopy by more than 1 cm (asserted in `fits.mjs` and `sails.mjs`).
6. No blocked entry changes status and no GLB is made from this document before the owner approves it.
7. Every number carries a basis code, and every proposal is marked P.

---

## Appendix A. Computation record

Scripts in `C:/Users/ASUS/AppData/Local/Temp/claude/11151372498ff63e/3e881673-e213-49c9-8bcf-435cb9f9d086/scratchpad/blueprints/`, each run with `node <file>`; all assert their results and passed on 2026-11-12. `trains.mjs` and `fits.mjs` were written on 2026-11-08 by an earlier run of this task and were reviewed and re-run; `slots.mjs` was rewritten and `sails.mjs` is new.

| Script | What it computes |
|---|---|
| `slots.mjs` | Board rows and pieces against audit B; kept, merged, dropped and added rows; slot and piece counts; slots if housings stayed pre-built; K1 file lists; the key-not-a-slot and W-b variants |
| `trains.mjs` | Windmill and Carousel speeds with the solver's shaft and mesh rules (SOL §8); the repair fault; every single-gear swap; Carousel pairs per spring speed; the coupled-key runtime link; W-b pinions |
| `fits.mjs` | Gear fits at 2.5 and 3.6158 mm (tip = m(N + 1.7), the generator's rule, TOCKTON §10); Windmill options (a), (b) and the porch; Carousel base height and pairs; spacing of repeated pieces against the collider minimum; shaft lengths |
| `sails.mjs` | The porch's plot pad and tower axis; the sails' plane against the Carousel in both layouts; clearance to the profiled canopy; reproduces TOCKTON's 14.3 cm figure |
| `plancheck.mjs` | Reads today's `machineSlotPlans` and counts rows that have no installable piece of their own |
