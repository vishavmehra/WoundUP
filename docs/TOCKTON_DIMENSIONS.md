# Wound Up — Tockton Dimensions and Layout

**Status:** Proposed by the lead (drafted by Opus), awaiting owner approval. Nothing in this document is a requirement until the owner approves it (DECISIONS.md §2: "A proposed decision is not an approved implementation requirement").
**Date:** 2026-11-06
**Label:** G0, the competition build. Tockton only (ADR-028).
**Owner's order this answers (2026-11-06):** "4. Establish the canonical dimensions table for the town plots, machines, buildings and environment. Dimensions must fit together in the actual Tockton layout." It also gives the Music Box milestone criterion 2 ("Correct dimensions, pivots and socket positions", ADR-039 item 6) the envelope its blueprint must fit, and gives the owner a recommendation, not a decision, for decision 5 (gear module and tooth set).

**What this document decides once approved**

1. Tockton's ground: 60 × 30 cm at full size, inside the 60 × 40 cm maximum, with the four plots in a reachable front band, the theatre facade and the Bakery behind them, and a central aisle that keeps the theatre doors and Otto in view (§2, §3).
2. The stage: the trunk at the town centre for the introduction, the workbench standing against the town's front edge, and a stage footprint (town plus workbench) for the table fit test (§3.1, §4, §5).
3. Every machine's 1:1 envelope, its plot pad and its size at 75 % scale, replacing the board sizes (§6).
4. The miniature scale for figures, doors and buildings (1:48) and where Mira and Otto stand (§7).
5. The chest point and the plot reach point used by the reach tests, and which positions pass (§8).
6. Gap G-06: the stand and the town ground stay two assets, and the stand is resized (§9).
7. Proposed `approxDimensionsM` for every manifest entry that is not blocked or future (§11).

**What stays blocked until the owner approves**

- The six live blocked entries stay BLOCKED and get no size here: `music_box_slot_11`, `music_box_slot_12`, `run_lever`, `town_houses`, `town_props_set`, `gift_engraving_plate`. The owner said "Keep all seven blocked assets blocked until I approve the relevant specifications"; the seventh, `flower_shop`, was deleted by ADR-039. The layout reserves ground for town dressing and sizes nothing in it.
- No asset changes status because of this document. The manifest keeps its current `approxDimensionsM` until approval; §13 lists the changes for the lead to apply afterwards.
- Gear sizes follow owner decision 5, which stays pending. §10 recommends; the gear family is not regenerated on the strength of this document.
- Blender work on `town_ground`, `workbench`, the stand and the machine housings, and the lead's code changes that these numbers imply (`src/placement.ts`, `src/stage.ts`, `public/scenes/main.iwsdk.scene.json`), wait for approval.

**Sibling documents.** The Music Box 12-slot blueprint (owner item 3) and the board-to-spec mappings for the Windmill, Clock Tower and Carousel (owner item 5) are drafted in parallel. This document gives them envelopes, interior limits and gear-size limits. Sockets and slot lists are theirs.

**Basis codes.** Every number carries one.

| Code | Meaning |
|---|---|
| S | Written specification, section given |
| A | Accepted ADR in DECISIONS.md |
| M | Measured from an existing file in the repository |
| D | Derived by the computation scripts of Appendix A from S, A, M or P values |
| B | Reference board: appearance or proportion only (ADR-029) |
| P | Lead proposal, with its reason, awaiting approval |

---

## 1. Conventions

| Item | Rule | Basis |
|---|---|---|
| Units and axes | Metres; right-handed; +Y up | A ADR-020 |
| Town space | Origin at the town centre on the surface the town stands on (the stage root). +X is the player's right, +Z points towards the player, +Y is up. `standPose` already turns the stage's local +Z towards the player | A ADR-020; M `src/placement.ts` |
| Asset axes (§11) | `[x, y, z]` in the asset's own glTF axes. A rotating part has its rotation axis on local Z, so a vertical-axis rotor (Carousel platform, millstone) lists its height under z | M manifest `meta.dimensionsConvention`; A ADR-020 |
| Asset origins | Furniture, buildings, stands and machine bases: centre of the floor-contact face. Rotating parts: on the rotation centre | A ADR-020 |
| Town scale s | 0.75 ≤ s ≤ 1. Trunk, buildings, plots and placed machines scale about the town origin. The workbench, its parts and the machine being built stay 1:1. Colliders, snap radii and plot distances stay in real centimetres. A machine takes the town's scale as it settles on its plot, so at s = 1 a placed machine is exactly its workbench size | S INTERACTION_SPEC (IS) §3; S PRODUCT_SPEC (PS) §3.2 |
| Coordinates | Town-space coordinates are given at s = 1; multiply them by s. Workbench sizes are never scaled | D |
| D and H | D: horizontal distance from the eyes to the town centre. H: height of the surface below the eyes | S PS §3.2 |
| Chest point | 30 cm below and 5 cm behind the eyes. No document defines "the chest"; this is the middle of the assumption in AUDIT_DOCS X10 ("chest ~30 cm below the eye and 0-10 cm behind it"). Proposed as named constants `CHEST_BELOW_EYE_M = 0.30` and `CHEST_BEHIND_EYE_M = 0.05` for TBL-10, STAND-03 and JUD-07. Sensitivity in §8.3 | P |
| Reach point of a plot | The machine's base handle: front centre of the base, 1 cm above the pad. The player holds the handle while releasing the machine over its plot. Pad centres are reported too | S PS §3.8, §11; S IS §12; P |
| Angles | Placement angle and target angle as IS §3 defines them: essential targets within about 35° of the line from the eyes to the town centre and within about 60 cm of the chest | S IS §3 |

## 2. Why the 60 × 40 cm maximum cannot be laid out as written

Stand pose (H 0.38 m, D 0.55 m, S PS §3.2), chest point of §1 (D `dims.mjs`):

| Point, with a 60 × 40 cm town centred 55 cm ahead | Reach from the chest | Target angle |
|---|---|---|
| Town centre | 60.5 cm | 0° |
| Far edge, centre | 80.4 cm | 7.8° |
| Far corner | 85.8 cm | 21.1° |
| Near corner | 50.6 cm | 32.5° |
| Near edge of a 45 × 25 cm workbench (3 cm high) in front of that town | 15.8 cm (10.0 cm ahead of the eyes) | 39.4° |

Consequences:

1. Only the front of the town lies within 60 cm. Plots therefore go at the front; buildings, which are only looked at, go at the back.
2. The workbench cannot sit behind the town (out of reach) or beside it: town and bench side by side are 105 cm wide, against 77.0 cm inside ±35° at 55 cm (D). It goes in front. In front of a 40 cm deep town centred at 55 cm its near edge would be 10 cm ahead of the eyes, inside the player's body. Keeping the near edge 15 cm ahead of the eyes (P: room for the forearms) needs D ≥ 0.40 m + half the town depth (D).
3. The board footprints (Music Box 24 × 14, Carousel 36 × 32, Windmill 34 × 34, Clock Tower 38 × 38 cm, all B) add up to 0.409 m², against 0.240 m² for the whole 60 × 40 town and 0.135 m² at 75 %, before the Bakery, the theatre and any street (D; gap G-08). §6 replaces them.

**Options for the owner (question Q1)**

| Option | Town at full size | Town centre D | Bench near edge | What changes |
|---|---|---|---|---|
| **A (recommended)** | 60 × 30 cm | 0.55 m: aim point and stand unchanged | 15.0 cm ahead of the eyes | Nothing in PS §3.2's 55 cm or ADR-019's stand. Uses three quarters of the 40 cm maximum depth, which PROJECT_BIBLE §2 calls a maximum |
| B | 60 × 40 cm | 0.60 m | 15.0 cm | Aim point and `STAND_AHEAD_M` move from 0.55 to 0.60 m (PS §3.2, ADR-019, STAND-01, STAND-02). Stage 60 × 65 cm instead of 60 × 55. Workbench target angles about 1.5° worse (D `optionB.mjs`) |
| C | 60 × 40 cm | 0.55 m | 10.0 cm | Rejected: the bench presses into the body |

In option B every eye-relative position of the plots and the bench equals option A; the extra 10 cm only add room behind the plots for buildings. The rest of this document uses option A.

---

## 3. The stage layout (option A)

### 3.1 Bands and stage footprint

| Band (s = 1) | z range (cm) | Holds | Basis |
|---|---|---|---|
| Back band | −15.0 to −4.5 | Theatre facade, Bakery, two reserved dressing zones | P: look-only items behind the reachable plots |
| Street | −4.5 to −1.5 | Paving across the full width | P |
| Plot band | −1.5 to +13.5 | Four plot pads and the central aisle | P: every reach point inside 60 cm (§8) |
| Front kerb | +13.5 to +15.0 | Paving; the workbench's back edge stands against z = +15.0 | P |
| Workbench | +15.0 to +40.0 at s = 1; +11.25 to +36.25 at s = 0.75 | Workbench 45 × 25 cm, always 1:1 | S IS §3 (size); P (position) |

The ground is paving and pads 0.6 cm high, with no continuous slab (P: "kept low, so the town reads as standing on the real table", ART_ASSET_PIPELINE §18). Buildings stand on the surface (y = 0); machines stand on their pads (y = 0.6 cm × s).

**Stage footprint** (town at s plus the 1:1 workbench, D `dims.mjs`): 60.0 × 55.0 cm at s = 1 and 45.0 × 47.5 cm at s = 0.75, centred at z = +12.5 cm in both.

**Table fit (P; needs approval because PS §3.2 tests the town footprint only, gap G-05).** The "large enough" test uses the stage footprint, and the town centre must satisfy D ≥ 0.40 m + 0.15 m × s so that the bench's near edge stays at least 15 cm ahead of the eyes (`BENCH_NEAR_MIN_M = 0.15`). That is D ≥ 0.55 m at s = 1 and D ≥ 0.5125 m at s = 0.75 (D). The 40 to 60 cm range and the 55 cm aim point stay as written (S PS §3.2). The polygon fit and the scale scan of SPATIAL_WORLD_SYSTEM §5.3 are unchanged; they test the two rectangles instead of one.

**Stand path (P).** The stage root is the surface the town stands on, on the stand as on a table. The stand's top face is then 38 cm below the eyes and 55 cm ahead: the specified placement angle of 34.6° (D). Today the stage root is the stand's bottom face and its velvet top is 4.1 cm higher (M `blender/README.md`), 33.9 cm below the eyes, 31.6° (D). The lead's change: the stand node sits at (0, −4.5, +12.5) cm under the stage root (§9).

### 3.2 Plan view

One column is 1 cm of x; one row is 2.5 cm of z, starting at the value shown. The player sits below the drawing (+Z). Generated by `plan.mjs`; the coordinates in §3.3 are authoritative.

```text
  z cm |x = -30 .......................... 0 .......................... +30|
 -15.0 |...............................BBBBBBBBBBBBB.................|
 -12.5 |...............................BBBBBBBBBBBBB.................|
 -10.0 |..........TTTTTTTTTTTTTTTTTTTTTBBBBBBBBBBBBB.................|
  -7.5 |..........TTTTTTTTTTTTTTTTTTTTTBBBBBBBBBBBBB.................|
  -5.0 |=============================================================|
  -2.5 |..........................:::::::::..........................|
  +0.0 |..........................::::::::KKKKKKKKKKKKKKK............|
  +2.5 |.CCCCCCCCCCCMMMMMMMMMMMMMMM:::::::KKKKKKKKKKKKKKKWWWWWWWWWWW.|
  +5.0 |.CCCCCCCCCCCMMMMMMMMMMMMMMM:::::::KKKKKKKKKKKKKKKWWWWWWWWWWW.|
  +7.5 |.CCCCCCCCCCCMMMMMMMMMMMMMMM:::::::KKKKKKKKKKKKKKKWWWWWWWWWWW.|
 +10.0 |.CCCCCCCCCCCMMMMMMMMMMMMMMM:::::::KKKKKKKKKKKKKKKWWWWWWWWWWW.|
 +12.5 |..........................:::::::::..........................|
 +15.0 |        #############################################        |
 +17.5 |        #tttttttttttt#bbbbbbbbbbbbbbbbbbpppppppppppp#        |
  ...  |        #   tray     #     build zone       blueprint #        |
 +35.0 |        #tttttttttttt#bbbbbbbbbbbbbbbbbbpppppppppppp#        |
 +37.5 |        #############################################        |
                                   player
```

`T` theatre facade, `B` Bakery, `=` street, `:` central aisle, `C` Clock Tower plot, `M` Music Box plot, `K` Carousel plot (round pad, drawn as its square), `W` Windmill plot, `.` paving or reserved dressing ground, `#` workbench with its tray (`t`), build (`b`) and blueprint (`p`) zones.

### 3.3 Coordinates (town space, s = 1, centimetres)

| Element | x range | z range | Centre (x, z) | Size W × D | Height | Basis |
|---|---|---|---|---|---|---|
| Clock Tower plot pad | −29.5 to −19.0 | +3.0 to +13.5 | (−24.25, +8.25) | 10.5 × 10.5 | 0.6 | P |
| Music Box plot pad | −18.0 to −4.0 | +2.5 to +13.5 | (−11.0, +8.0) | 14.0 × 11.0 | 0.6 | P |
| Central aisle | −4.0 to +4.0 | −1.5 to +15.0 | (0, +6.75) | 8.0 wide | 0.6 | P |
| Carousel plot pad, round | +4.0 to +18.0 | −0.5 to +13.5 | (+11.0, +6.5) | Ø 14.0 | 0.6 | P |
| Windmill plot pad | +19.0 to +29.5 | +3.0 to +13.5 | (+24.25, +8.25) | 10.5 × 10.5 | 0.6 | P |
| Theatre facade | −20.0 to 0.0 | −10.0 to −4.5 | (−10.0, −7.25) | 20.0 × 5.5 | 18.0 | P |
| Theatre double doors | −5.0 to −0.5, on the front face | z −4.5 | (−2.75, −4.5) | 4.5 wide | 6.0 tall | P |
| Bakery | +0.5 to +13.5 | −14.0 to −4.5 | (+7.0, −9.25) | 13.0 × 9.5 | eave 13.5; chimney top 19.0 | P |
| Otto's window, Bakery front | +1.0 to +4.0 | z −4.5 | (+2.5, −4.5) | 3.0 wide | sill 1.2, head 5.0 | P |
| Bakery door | +6.0 to +8.1 | z −4.5 | (+7.05, −4.5) | 2.1 wide | 4.4 tall | P |
| Chimney (smoke anchor) | | | (+11.0, −12.0) | | top 19.0 | P |
| Dressing zone, left (reserved only) | −30.0 to −20.5 | −15.0 to −4.5 | (−25.25, −9.75) | 9.5 × 10.5 | none | P |
| Dressing zone, right (reserved only) | +14.0 to +30.0 | −15.0 to −4.5 | (+22.0, −9.75) | 16.0 × 10.5 | none | P |
| Mira, feet | | | (+1.2, +11.0), facing +Z | 1.2 × 0.8 | 3.5 | P |
| Otto, feet (`SOCKET_Baker`) | | | (+2.5, −6.5), facing +Z | 1.6 × 1.2 | 3.6 | P |
| Trunk, introduction only | −17.5 to +17.5 | −12.5 to +12.5 | (0, 0) | 35.0 × 25.0 | 20.0 | S PS §3.2 (size); P (position) |
| Trunk latch | on the front face | z +12.5 | (0, +12.5), 14.0 high | | | P |
| Letter spot | | | (0, +27.5): on the surface before the bench arrives, on its build zone afterwards | | | P |
| Workbench (never scaled) | −22.5 to +22.5 | +15.0 to +40.0 | (0, +27.5) | 45.0 × 25.0 | 3.0 | S IS §3 (size); P (height, position) |

Layout checks (D `dims.mjs`): every element lies inside the 60 × 30 footprint and none overlaps another. Gaps between pads along x: 1.0, 8.0 (the aisle) and 1.0 cm. The four pads cover 0.0528 m², 29 % of the town.

The Windmill's sails (Ø 16.0 cm, hub 19.0 cm high) reach 1.5 cm past the Carousel's rim along x; at that x the lowest sail point is 14.3 cm high. The canopy's solid band is 12.0 to 16.0 cm, so the Carousel's canopy rim must stay under 14.3 cm on its Windmill side, or the sails' hub rises 2 cm. The Music Box key and the sails overhang only into the air: the key 2.5 cm into the aisle at 3.5 to 6.5 cm height, the sail tips 2.3 cm past the town's right edge, the lowest sail point 11.0 cm above the ground (D). Item 5's Windmill and Carousel mapping should keep one of the two limits.

### 3.4 Plots: what each holds, ids and capture

| Plot | Holds | Wakes | Basis |
|---|---|---|---|
| `plot_music_box` | Music Box | Its own plot | S PS §3.3, §6.1, §11 |
| `plot_carousel` | Carousel | Its own plot | S PS §6.2, §11 |
| `plot_windmill` | Windmill | Its own plot and the Bakery | S PS §6.3, §11 |
| `plot_clock_tower` | Clock Tower | Its own plot and the theatre doors (30 s on the hour) | S PS §6.4, F9 |

- Plot ids are stable snake_case (S DATA_AND_BLUEPRINT_SPEC §2; P names). In the `town_ground` GLB each plot is an empty `PLOT_MusicBox`, `PLOT_Carousel`, `PLOT_Windmill`, `PLOT_ClockTower` at the pad centre, on the pad top (M manifest names `PLOT_` empties; ASSET_NAMING_AND_FOLDER_STANDARDS has no `PLOT_` prefix yet, see §13).
- A machine's base origin goes to its plot centre when placed (A ADR-020 origins; P).
- Capture (P): a released machine settles when its base origin is within 4 cm, or 7 cm with Easy Snap, of its own plot centre, measured horizontally in real centimetres (IS §3: "plot distances stay in real centimetres"; values taken from the socket snap radii, S PS §9). Only a machine's own plot accepts it (S IS §12), so overlapping 7 cm circles are harmless. Neighbouring plot centres are 13.3 cm apart at s = 1 and 9.9 cm at s = 0.75; the Music Box and Carousel plots are 22.1 cm apart (D `xray_plots.mjs`).
- Mechanical link between the Windmill and the Bakery: none is drawn. The specification says the Windmill "activates" the Bakery (S PS §6.3, §11); the boards' transmission shaft is board only (B) and is not added.

### 3.5 The Clock Tower plot is reserved

F2 (Must) requires four machine plots (S PS §3.3, §5), while the Clock Tower itself is Should and cut first (S PS §6.4, §19; A ADR-027). The plot is therefore reserved at the front left. If the Clock Tower is cut, the smallest option is that the plot stays an empty, frozen pad: no extra asset, because the pad is part of `town_ground` (P; question Q11).

### 3.6 Sight lines

Checked from the eyes to each feature with machines placed (D `dims.mjs`). Occluders: machine bodies as solid boxes; the Carousel as a solid platform up to 3.5 cm and a solid canopy from 12.0 to 16.0 cm, open between; the Windmill sails as a solid disc; the Music Box with its lid closed. Scenarios: the stand (H 38 cm), a high table (H 20 cm), a typical table (H 45 cm), a low table (H 60 cm), all at D 55 cm and s = 1, and a small table (H 45 cm, s = 0.75).

| Feature | Result in all five scenarios |
|---|---|
| Theatre doors: bottom left, bottom right, top | Visible down the aisle |
| Otto: head at both sides of his window, and his kneading hands | Visible down the aisle |
| Bakery chimney top (smoke) | Visible |
| Clock face | Visible |
| Mira | Visible; she blocks neither line (they pass 1.9 to 14.3 cm above her head) and her head shows over the bench edge (D `mira.mjs`) |

The aisle is the only clear view to the back band at ground level. In the first draft the Bakery stood behind the Carousel and the Windmill, and Otto was hidden in four of the five scenarios, seen only through the Carousel's open band on the high table (D `refine.mjs`). That is why the theatre's doors sit at its right end and Otto's window at the Bakery's left end, both facing the aisle (P; question Q8).

The workbench hides the ground just behind it. With its top 3.0 cm high it hides 3.4 cm on the stand, 7.1 cm on a 20 cm table, 2.9 cm at H 45 cm and 2.1 cm at H 60 cm; the pads start 1.5 cm behind the bench, so on the stand the front 1.9 cm of each pad is hidden and the rest of the plot glow shows. A 4.5 cm top would hide 5.4 cm on the stand and 11.6 cm on a 20 cm table (D). Hence the 3.0 cm bench (P).

---

## 4. Trunk and the unfolding

| Item | Value | Basis |
|---|---|---|
| Size | 35 W × 20 H × 25 D cm, glTF `[0.35, 0.20, 0.25]` | S PS §3.2; A ADR-029 ruling I-5 |
| Body and lid | Body 14 cm, lid 6 cm; the lid is about 30 % of the closed height on the trunk boards | P; B trunk boards (proportion only) |
| Latch | On the front face at the seam, centre (0, 14.0, +12.5) cm; collider radius at least 1.2 cm | P; S IS §7.2 |
| Lid hinge `PIV_Lid` | Back seam, (0, 14.0, −12.5) cm | P |
| Lid opening | At most 95°: the open lid rises to 38.9 cm and reaches 5.7 cm behind the town's back edge (90°: 3.5 cm; 100°: 7.8 cm; 110°: 11.7 cm). The game does not see walls (mesh detection is not requested, A ADR-019), so a smaller opening is safer against a table pushed against a wall | P; D `refine.mjs` |
| Introduction position | Centred on the town origin, front face to the player: the town unfolds from it (S PS §3.3). The latch is 42.5 cm ahead of the eyes and 47.9 cm from the chest on the stand | P; D |
| At s = 0.75 | 26.25 × 15.0 × 18.75 cm; latch 10.5 cm high, 45.6 cm ahead of the eyes | D |

**After the unfolding (question Q3).** The specifications say only that "Tockton unfolds from the trunk" (S PS §3.3); they do not say what then happens to the trunk. Left where it stood, its footprint would overlap the Music Box pad by 13.5 × 10.0 cm and cover the aisle, the Carousel pad and the front of the back band (D). The options:

| Option | Effect | Verdict |
|---|---|---|
| T1 (recommended) | The trunk withdraws as the town unfolds and leaves nothing above the ground. How it withdraws is a presentation choice for Agent 4 (one-shot clip or effect, A ADR-030) | Fits the footprint; also suits a returning session where the town is already out |
| T2 | Stays at the centre | Covers plots and the aisle; rejected |
| T3 | Stays behind the town as a backdrop | Adds 25 cm × s of depth: stage 60 × 80 cm, deeper than most desks |
| T4 | Its walls fold flat into the ground | Impossible: 20 cm walls folded out reach ±32.5 cm in z and ±37.5 cm in x, against the town's ±15 and ±30 cm (D) |

---

## 5. Workbench and workshop props

### 5.1 Workbench

| Item | Value | Basis |
|---|---|---|
| Size | 45 W × 3.0 H × 25 D cm, glTF `[0.45, 0.03, 0.25]` | S IS §3 (45 × 25); P (3.0 cm height, §3.6) |
| Position | Centred on x = 0; back edge against the town's front edge at z = +15 cm × s; front edge at z = +15 cm × s + 25 cm. Never scaled. The slide-in path is a presentation choice; this fixes its end pose | P; S PS §3.5 ("slides into view") |
| Zones, bench-local x (origin at the bench's floor-contact centre) | Tray −21.75 to −9.25 (12.5 wide); build zone −8.75 to +9.25 (18.0); blueprint +9.75 to +21.75 (12.0). Margins 0.75 cm at the ends, 0.5 cm between zones | P: three side-by-side zones keep the tray from covering the blueprint (S UI_UX_SPEC §10) and nothing tall stands between the player and the plots except the machine being built |
| Zones, bench-local z | −10.5 to +10.5 (21 cm), with 2.0 cm front and back margins | P |
| Seat empties | `SOCKET_Tray` (−15.5, 3.0, 0), `SOCKET_Build` (+0.25, 3.0, 0), `SOCKET_Blueprint` (+15.75, 3.0, 0) cm | P |

**The 35° region of the bench.** The bench's front outer corners lie outside 35° of the line to the town centre: 40.5° on the stand, 47.8° on a 20 cm table, 37.7° at H 45 cm, inside only on low tables (32.3° at H 60 cm) (D `dims.mjs`). On the stand the front row of the bench passes for |x| ≤ 14.0 cm and the outer columns pass for z_local ≤ +4.8 cm; on a 20 cm table, |x| ≤ 11.3 cm and z_local ≤ −0.7 cm (D `refine.mjs`). Proposal (P): essential content in the tray and blueprint zones (compartments, part positions, the parcel) stays at z_local ≤ +4.5 cm; the front 6 cm of those zones holds only non-essential detail (tray lip, title block, the optional lantern). The worst essential angle is then:

| H (surface below the eyes) | 20 cm | 25 cm | 30 cm | 34 cm | 38 cm (stand) | 45 cm | 60 cm |
|---|---|---|---|---|---|---|---|
| Outer zone, z_local +4.5 cm | 40.2° | 38.8° | 37.2° | 36.0° | 34.7° | 32.4° | 28.0° |
| Build zone front corner | 32.2° | 33.0° | 33.0° | 32.7° | 32.1° | 30.7° | 27.3° |

So the essential bench content passes on the stand and on tables 38 cm or more below the eyes, and exceeds 35° by up to 5.2° on higher tables (question Q5). Moving the town further away does not solve it: D 0.60 m instead of 0.55 m cuts the corner angle by 3.5 to 5.8° but adds 4.4 cm to the outer plots' reach (D `refine.mjs`).

**Room in the build zone** (18.0 × 21.0 cm; D `scale.mjs`): Music Box with its key 16.0 × 9.0 (spare 2.0 × 12.0); Music Box with the lid open 13.0 × 13.5 (5.0 × 7.5); Carousel 13.5 × 13.5 (4.5 × 7.5); Windmill with sails 16.0 × 11.5 (2.0 × 9.5); Clock Tower 9.5 × 9.5 (8.5 × 11.5).

### 5.2 Workshop props

| Asset | Size, glTF `[x, y, z]` m | Where | Basis |
|---|---|---|---|
| `parts_tray` | `[0.125, 0.025, 0.21]` | Tray zone | P: fills the zone |
| `blueprint_sheet` | `[0.12, 0.012, 0.20]`, flat with a rolled edge | Blueprint zone | P |
| `parcel` | `[0.12, 0.06, 0.09]` | Blueprint zone; opens to reveal the blueprint there | S UI_UX §9 (openable); P size |
| `letter_envelope` | Closed `[0.12, 0.004, 0.085]`; the sheet slides out to 11 × 15.5 cm | Letter spot (0, +27.5) cm: reach 33.5 cm, angle 19.5° on the stand | P; D |
| `machine_base_handle` | `[0.03, 0.012, 0.012]` | Front centre of every machine base (`SOCKET_BaseHandle`): the reach point of §1 | P |
| `lantern_workbench` (G0-optional) | `[0.03, 0.06, 0.03]` | Blueprint zone's front outer corner, in the non-essential strip | P |
| `run_lever` | BLOCKED: no size, no space reserved | | Owner's order |

- **Tray capacity** (D `tray.mjs`, at the module recommended in §10): the Music Box's ten loose parts, with its case standing in the build zone, cover 139.8 cm², or 226.9 cm² with a 0.5 cm margin round each part. The tray's essential region is 187.5 cm² (121 % used) and the whole tray 262.5 cm² (86 %). Either the largest parts (cylinder, comb, spring) start in the build zone beside the case, or the tray's front strip is used despite §5.1. That is for the Music Box blueprint (item 3; question Q14). Carousel, Windmill and Clock Tower housings (canopy Ø 13.5, sails Ø 16.0, shell 22 cm tall) cannot sit in a 12.5 cm tray and start in the build zone (gap B-05; item 5).
- **Letter legibility** (D `smalls.mjs`): a 4 mm cap height subtends 0.65° at 35 cm and 0.51° at 45 cm, about 16 and 13 pixels at the roughly 25 pixels per degree Meta publishes for Quest 3 (an external figure, not verified in this repository). To be confirmed on a headset.
- **Gift box** (P; D `smalls.mjs`): one GLB authored as a 20 cm cube with 18 cm clear inside. The gift viewer scales it uniformly by k = (L + 1 cm) / 18 cm, where L is the gifted machine's largest envelope side: Music Box k 0.944 (box 18.9 cm), Carousel 1.056 (21.1 cm), Windmill 1.556 (31.1 cm), Clock Tower 1.611 (32.2 cm). Uniform scale keeps the ribbon's proportions. The viewer has no town, so the town scale does not apply there (S PS §13).

---

## 6. Machines: envelopes at 1:1 and on their plots

Machines are built at full size on the workbench and take the town's scale on their plot, so at s = 1 the plot must hold the 1:1 machine (S IS §3; S BLENDER_PRODUCTION_GUIDELINES "authored at real miniature size, 1:1 at the workbench"). All values P unless marked; D `scale.mjs`.

| Machine | 1:1 envelope W × H × D (cm) | Base footprint | Plot pad, margin each side | At s = 0.75 | Board size (B) and ratio |
|---|---|---|---|---|---|
| Music Box | Case 13.0 × 10.0 × 9.0 with the lid closed (body 7.0, lid 3.0). Lid open 100°: 15.9 tall, reaching 4.5 cm behind the case. Winding key protrudes 3.0 cm on +x | 13.0 × 9.0 | 14.0 × 11.0; 0.5 (x), 1.0 (z) | 9.75 × 7.5 × 6.75 | 24 × 16 × 14: ratios 0.54, 0.63, 0.64 |
| Carousel | Ø 13.5 × 18.0: base Ø 13.0 × 3.0; platform Ø 12.5 × 0.6; open band 3.6 to 12.0; canopy 12.0 to 16.0; finial and flag to 18.0 | Ø 13.0 | Ø 14.0; 0.5 | 10.13 × 13.5 × 10.13 | 36 × 32, platform 28: ratios 0.38 (width), 0.45 (platform) |
| Windmill | 16.0 × 27.0 × 11.5: base 9.5 × 3.5 × 9.5; tower and roof to 23.0; hub 19.0 high; sails Ø 16.0 in a plane 1.5 cm in front of the tower | 9.5 × 9.5 | 10.5 × 10.5; 0.5 | 12.0 × 20.25 × 8.63 | 34 × 46 × 34, sails 32: ratios 0.47, 0.59, 0.34; sails 0.50 |
| Clock Tower | 9.5 × 28.0 × 9.5: base 9.5 × 6.0 × 9.5; shell and spire to 28.0; clock face Ø 6.0 centred 19.0 high on the front | 9.5 × 9.5 | 10.5 × 10.5; 0.5 | 7.13 × 21.0 × 7.13 | 38 × 72 × 38, face 16: ratios 0.25, 0.39, 0.25; face 0.38 |
| Bakery (building) | 13.0 × 19.0 × 9.5 (eave 13.5, chimney 19.0) | 13.0 × 9.5 | none (back band) | 9.75 × 14.25 × 7.13 | No board size |
| Theatre facade (building) | 20.0 × 18.0 × 5.5; doors 4.5 × 6.0 | 20.0 × 5.5 | none (back band) | 15.0 × 13.5 × 4.13 | No board |

**The board sizes do not fit.** The Clock Tower board alone is 63 % of the town's width; the four board footprints are 0.409 m², 2.3 times the 0.180 m² of a 60 × 30 town, against 0.060 m² for the four proposed footprints (D `dims.mjs`). Board heights of 46 cm (Windmill) and 72 cm (Clock Tower) become 27 and 28 cm. Boards keep their role for appearance and construction (A ADR-029).

**Interior limits for items 3 and 5** (walls 0.6 cm; D `gears.mjs`, `smalls.mjs`, `shafts.mjs`):

| Machine | Interior | Largest single gear (teeth) at 2.5 / 3.0 / 3.6158 mm | Notes |
|---|---|---|---|
| Music Box | 11.8 × 6.4 × 7.8 cm (x, y, z). Width budget: gear end 2.8 + cylinder 6.5 + governor end 2.5 + walls 1.2 = 13.0 cm. Depth: comb 2.6 + cylinder Ø 3.2 = 5.8 of 7.8 cm, 2.0 cm left behind the cylinder | 23 / 19 / 16 | Drive and pinion pairs that fit the 7.8 × 6.4 cm gear end: at 2.5 mm 20/10, 16/10, 12/10, 16/12 (not 24/12, 20/12, 24/10); at 3.0 mm 16/10 and 12/10; at 3.6158 mm none, not even 12/10. The arbor (cylinder, two brackets, one gear) is 9.2 of 11.8 cm |
| Carousel | Base interior Ø 11.8 cm | 45 / 37 / 30 | Gear train under the platform |
| Windmill | Base interior 8.3 × 8.3 cm | 31 / 25 / 21 | The specified 24-tooth position with its neighbour (S PS §8; S MECHANICAL_SOLVER_SPEC §15.3): the 24T + 12T pair needs a square of 8.1 cm (base 9.3 cm) at 2.5 mm, 9.7 cm (base 10.9) at 3.0 mm, 11.7 cm (base 12.9) at 3.6158 mm |
| Clock Tower | Interior 8.3 × 8.3 cm | 31 / 25 / 21 | No train is assumed: its targets are undefined (gap G-13) |

Shaft lengths implied by the envelopes (D `shafts.mjs`): Windmill main shaft about 16 cm, Carousel central shaft about 11 cm, Clock Tower drive shaft about 13 cm. One `shaft_long` length cannot serve all three; item 5 says whether a third shaft length is needed (question Q16).

---

## 7. Miniature scale and figures

**Scale 1:48 for figures, doors and buildings (P).** The specifications give no scale (TOCKTON_CHARACTERS §8 leaves it to this document). At 1:48 (D `dims.mjs`):

| Real size | Tockton size |
|---|---|
| Mira, 1.70 m (Character Board height, B) | 3.5 cm |
| Otto, 1.75 m (P; the board baker is not used, A ADR-029 I-8) | 3.6 cm |
| Bakery door, 2.10 m | 4.4 cm |
| Theatre doors, 2.90 m | 6.0 cm |
| Carousel horse, 1.45 m long | 3.0 cm |
| Bakery eave, 6.5 m | 13.5 cm |

Read the other way, the machines are believable town features at 1:48: Carousel platform 6.0 m across, Windmill 11.0 m to its roof, sails 7.7 m, Clock Tower 13.4 m (D `dims.mjs`, `verify.mjs`). The Music Box reads as a 6.2 m pavilion; a giant music box in the square is the storybook conceit the town boards show (B).

Angular size on the stand (D `dims.mjs`): Mira 3.29° tall with a 0.72° head at s = 1 and 2.41° (0.53°) at s = 0.75; Otto 2.77° (0.61°) and 2.12° (0.47°). At about 25 pixels per degree (Meta's published Quest 3 figure, not verified here) Mira's head is about 18 pixels at full size: pose and silhouette read, faces stay simple (P). Comfort and legibility need the headset check of STAND-05 and TBL-17.

| Figure | Position and facing | Basis |
|---|---|---|
| Otto | Feet at (+2.5, 0.4, −6.5) cm in town space: `SOCKET_Baker` at (−4.5, 0.4, +2.75) cm in the Bakery's own frame, 2 cm behind the front face, facing +Z. His kneading (`Otto_Knead`) shows through the 3 cm window in all five sight-line scenarios | S PS §6.3; A ADR-039; P position |
| Mira | Feet at (+1.2, 0, +11.0) cm, facing +Z, in the aisle beside the Music Box plot: her letters are about her grandmother's music box (S PS §7). 2.1 cm clear of the Music Box key (D) | P; TOCKTON_CHARACTERS §3 leaves her position open |

Both figures fit the character ceiling of 1,500 triangles easily at this size (A ADR-034).

---

## 8. Reach and comfort

### 8.1 Results (option A, chest point of §1; D `dims.mjs`)

Reach is from the chest point; the angle is the target angle. "Bench essential" is the outer zone at z_local +4.5 cm (§5.1).

| Scenario | Worst plot handle | Worst pad centre | Latch | Letter spot | Bench build centre | Bench essential | Bench front-outer corner |
|---|---|---|---|---|---|---|---|
| Stand: H 38, D 55, s 1 (placement 34.6°) | 53.3 cm, 24.3° | 57.6 cm | 47.9 cm, 5.2° | 33.5 cm, 19.5° | 32.9 cm, 17.2° | 34.7° | 40.5° |
| High table: H 20, D 55, s 1 (20.0°) | 54.1 cm, 28.1° | 58.1 cm | 53.2 cm, 11.9° | 34.0 cm, 16.0° | 35.0 cm, 11.7° | 40.2° | 47.8° |
| Typical table: H 45, D 55, s 1 (39.3°) | 54.6 cm, 22.8° | 58.9 cm | 47.5 cm, 3.2° | 35.8 cm, 19.3° | 34.6 cm, 17.5° | 32.4° | 37.7° |
| Low table: H 60, D 55, s 1 (47.5°) | 60.0 cm, 19.8° | 64.3 cm | 50.1 cm, 0.2° | 44.2 cm, 17.9° | 42.3 cm, 16.8° | 28.0° | 32.3° |
| Small table: H 45, D 55, s 0.75 (39.3°) | 55.2 cm, 16.8° | 58.6 cm | 50.8 cm, 2.2° | 39.2 cm, 15.9° | 38.2 cm, 14.1° | under 34.3° | 34.3° |
| Far placement: H 45, D 60, s 1 (36.9°) | 58.9 cm, 21.5° | 63.4 cm | 52.5 cm, 3.7° | 40.4 cm, 17.3° | 39.4 cm, 15.4° | under 34.9° | 34.9° |

The worst plot handle is always an outer plot (Clock Tower or Windmill). The Music Box's winding key, on the bench, is 33.8 cm from the chest on the stand. Placement angles above 35° on tables are allowed (S IS §3).

### 8.2 What passes and what needs the owner

| Check | Result |
|---|---|
| 60 cm reach to the latch, the letter, every workbench target and every plot handle | Passes on the stand, on small tables and on tables 20 to 52 cm below the eyes. On the lowest tables (60 cm below the eyes) the two outer handles are at 60.0 cm, at the limit |
| 60 cm reach to the plot pad centres | Passes on the stand and on tables up to 45 cm below the eyes; fails on the lowest tables (60.7 to 64.3 cm) and with D 0.60 m (61.2 to 63.4 cm). Pad centres are not hand targets under §1 |
| 35° target angle: latch, letter, plots, build zone | Passes everywhere (largest 33.0°) |
| 35° target angle: bench essential content | Passes on the stand and on tables 38 cm or more below the eyes; 36.0 to 40.2° on tables 20 to 34 cm below the eyes (question Q5) |
| 35° target angle: bench front-outer corners | Fails on the stand (40.5°) and on most tables; no essential target is placed there (§5.1) |

The earlier open risk (AUDIT_DOCS X10) is resolved for the plots by option A's layout; what remains needs the owner: Q4 (the reach model), Q5 (high tables) and Q6 (the lowest tables).

### 8.3 Sensitivity to the chest point (D `sens.mjs`)

Worst reach among the plot handles, the latch and the bench's back corner, for the chest 25, 30 or 35 cm below and 0, 5 or 10 cm behind the eyes:

| Scenario | Range over the nine chest points | At the proposed point (30 below, 5 behind) |
|---|---|---|
| Stand | 48.5 to 58.5 cm: every case passes | 53.3 cm |
| Lowest table (H 60) | 53.8 to 66.4 cm: passes with the chest 0 cm behind the eyes at any of the three depths, and 5 cm behind when it is at least 30 cm below the eyes; fails at 10 cm behind | 60.0 cm, at the limit |

### 8.4 X-ray height (question Q12)

The X-ray palm is held 5 to 20 cm above the machine (S PS §12; S IS §11). Measured from the machine's top, on the bench on the stand, the palm sits between 3.0 cm below and 12.0 cm above the eyes over the Windmill and between 2.0 cm below and 13.0 cm above them over the Clock Tower; measured from mid-height it stays between 1.0 and 25.0 cm below the eyes for every machine (D `xray_plots.mjs`). The specifications do not say which.

### 8.5 Carry distances

From the bench's build centre to each plot centre at s = 1 (D `dims.mjs`): Music Box 22.7 cm, Carousel 23.8 cm, Windmill 30.9 cm, Clock Tower 31.3 cm.

---

## 9. Stand versus town base (gap G-06)

**Recommendation: two assets (P).** On a table the velvet stand is not shown and the table is the ground (S PS §3.2), while the town ground with its paving and plots is always shown. One merged asset would either show velvet on a table or lose the paving on the stand. This confirms the manifest's default.

| Item | Value | Basis |
|---|---|---|
| M0 stand today | Round, Ø 46.0 cm, 4.5 cm high, velvet top 4.1 cm above its base | M manifest, `blender/README.md` |
| Can it carry the stage? | No. The 60 × 30 town alone needs a 67.1 cm circle (60 × 40: 72.1 cm); the stage needs more | D |
| Proposed stand | Rounded rectangle 64.0 × 4.5 × 59.0 cm (stage footprint plus 2 cm margins), glTF `[0.64, 0.045, 0.59]`. Its top face is the stage root; its centre sits at (0, −4.5, +12.5) cm in town space. A round stand would need Ø 87.0 cm. Option B would need 64 × 69 cm | P; D `dims.mjs`, `refine.mjs` |
| Trunk lid over the stand | At 95° the open lid passes the stand's back edge by 3.7 cm, in the air | D |
| Name | The id `tockton_base_round` would no longer describe a round stand. It may still change, because no blueprint, save or gift uses it (A ADR-033); renaming is optional (question Q15) | P |
| Budget category | Environment set (A ADR-034) | A |

---

## 10. Gear module: recommendation for owner decision 5 (not a decision)

**Facts.** The generator uses an addendum of 0.85 module and `MODULE_REF = 0.064 / (16 + 2 × 0.85) = 3.6158 mm`, so tip diameter = module × (teeth + 1.7) (M `blender/scripts/gen_gear_spur.py`). The rule "tip = module × (teeth + 2)" gives 65.1 mm for 16 teeth, not the 64 mm the file measures; the generator's help text says "(teeth + 2)" but its code uses 2 × 0.85, and the manifest's derived sizes follow the code to within 0.06 mm (D `gears.mjs`).

**Tip diameters (mm; D `gears.mjs`)**

| Module | 10T | 12T | 16T | 20T | 24T | 36T |
|---|---|---|---|---|---|---|
| 2.0 mm | 23.4 | 27.4 | 35.4 | 43.4 | 51.4 | 75.4 |
| **2.5 mm** | **29.3** | **34.2** | **44.3** | **54.3** | **64.3** | **94.3** |
| 3.0 mm | 35.1 | 41.1 | 53.1 | 65.1 | 77.1 | 113.1 |
| 3.6158 mm (current default) | 42.3 | 49.5 | 64.0 | 78.5 | 92.9 | 136.3 |

**Fit and interaction (D `gears.mjs`, `refine.mjs`)**

| Check | 2.5 mm | 3.0 mm | 3.6158 mm |
|---|---|---|---|
| Music Box drive and pinion pairs in the 7.8 × 6.4 cm gear end | 20/10, 16/10, 12/10, 16/12 | 16/10, 12/10 | None |
| Windmill 24T + 12T pair in a 9.5 cm base | Fits (needs 9.3 cm) | No (needs 10.9 cm) | No (needs 12.9 cm) |
| 10T visual radius against the 1.2 cm collider minimum (S IS §7.2) | 14.6 mm, no enlargement | 17.6 mm | 21.2 mm |
| Tooth pitch π × m, and at s = 0.75 | 7.9 mm, 5.9 mm | 9.4, 7.1 mm | 11.4, 8.5 mm |
| Meshing-socket spacing 10/12 and 12/24, against snap radii 4 and 7 cm (S PS §9) | 27.5 and 45.0 mm | 33.0 and 54.0 mm | 39.8 and 65.1 mm |
| 12T in the 24T socket (Windmill repair): pitch-circle gap to its neighbour | 15.0 mm | 18.0 mm | 21.7 mm |

At every module the meshing sockets are closer together than the 7 cm Easy Snap radius, so capture zones of neighbouring gear sockets overlap anyway. That is handled by the existing rules: the closest valid socket wins and the 50 % ghost shows the target before release (S IS §7.3, §8). The snap radii do not decide the module; the envelopes do.

**Recommendation.**

1. Main module 2.5 mm. It is the largest of the values checked at which the specified 24-tooth Windmill position, with its neighbour, fits a 9.5 cm base and the Music Box keeps a choice of four drive and pinion pairs, while the smallest gear (10T, 29.3 mm) still needs no enlarged collider. At 3.6158 mm the Music Box cannot hold any pair and the Windmill base would grow from 9.5 to 12.9 cm, which the 60 cm row cannot absorb.
2. Keep the id token `m1` as an index meaning "main module", with its value changed from 3.6158 to 2.5 mm. No blueprint, save or gift uses a gear id yet, so ids may still be fixed now (A ADR-033); the token keeps DATA_AND_BLUEPRINT_SPEC §4.1's examples valid.
3. Second module `m2` = 3.6158 mm, the generator's existing reference. Define it in data for the solver's module-mismatch test (S MECHANICAL_SOLVER_SPEC §17 test 9; ART_ASSET_PIPELINE §11 asks for two modules). Make an `m2` GLB only if a decoy design needs one (gaps G-14, G-19; decoys are cut third, S PS §19).
4. G0 tooth set at `m1`: 10, 12, 16, 20, 24 (10/20 the solver test pair, 12/24 the Windmill repair, 16 the M0 gear), plus 36 kept G0-optional as a decoy candidate: at 94.3 mm it is wider than every machine interior, so it can only be a decoy. Bevel 12T at `m1`: outer Ø 33.0 mm. The rest of ART §11's 20 spur and 3 bevel files stays G0-optional until a blueprint needs it.
5. Fallback if the owner prefers chunkier gears: 3.0 mm. Then the Windmill base grows to about 10.9 cm and the Music Box is limited to 16/10 or 12/10; the aisle would shrink from 8.0 to about 6.6 cm to make room.

The M0 gear (`gear_spur_16_m1`, REWORK_REQUIRED and regenerated anyway) becomes 44.3 mm under the recommendation, or keeps 64.0 mm as `gear_spur_16_m2` if the owner wants the test object unchanged.

---

## 11. Canonical dimensions table

Proposed `approxDimensionsM` for all 68 manifest entries as read on 2026-11-06, in the asset's own glTF axes, metres. Rotating parts list their rotation axis as z. Gear sizes are given at the recommended 2.5 mm module, with today's 3.6158 mm value in brackets; they follow decision 5. "Current" is the manifest value today.

### A. Mechanical component library (19)

| Id | Current | Proposed `[x, y, z]` | Basis and reason |
|---|---|---|---|
| `gear_spur_16_m1` | [0.064, 0.064, 0.0152] M | [0.0443, 0.0443, 0.0152] ([0.064, ...]) | D tip = m(N + 1.7); thickness 12 mm face + 2 × 1.6 mm bosses (M generator defaults) |
| `gear_spur_12_m1` | [0.0495, 0.0495, 0.0152] D | [0.0343, 0.0343, 0.0152] ([0.0495]) | D |
| `gear_spur_24_m1` | [0.0929, 0.0929, 0.0152] D | [0.0643, 0.0643, 0.0152] ([0.0929]) | D |
| `gear_spur_10_m1` | [0.0423, 0.0423, 0.0152] D | [0.0293, 0.0293, 0.0152] ([0.0423]) | D |
| `gear_spur_20_m1` | [0.0785, 0.0785, 0.0152] D | [0.0543, 0.0543, 0.0152] ([0.0785]) | D |
| `gear_spur_36_m1` | [0.1363, 0.1363, 0.0152] D | [0.0943, 0.0943, 0.0152] ([0.1363]) | D |
| `gear_bevel_12` | null | [0.033, 0.033, 0.012] ([0.048, 0.048, 0.012]) | D outer Ø = m(12 + 2 × 0.85 × cos 45°); P height and 45° cone |
| `shaft_short` | null | [0.008, 0.008, 0.09] | M Ø = generator bore 8 mm; P length: the Music Box arbor needs 9.2 cm of its 11.8 cm interior |
| `shaft_long` | null | [0.008, 0.008, 0.15] | P: between the Carousel's 11 cm and the Windmill's 16 cm (Q16) |
| `spring_standard` | null | [0.045, 0.045, 0.01] | P: fits the Music Box gear end (height 6.4 cm, beside the drive gear) |
| `spring_worn` | null | [0.045, 0.045, 0.01] | P: same envelope; the wear shows in the coil geometry |
| `governor_standard` | null | [0.024, 0.024, 0.03] | P: fits the 2.5 cm governor end with its axis vertical; radius equals the 1.2 cm collider minimum |
| `winding_key` | [0.06, null, 0.045] B | [0.03, 0.006, 0.04] | P: bow 3.0 × 2.4 cm, 4.0 cm along the turn axis; the board's 6 cm key is half the case width |
| `bearing_pillow_block` | null | [0.03, 0.022, 0.012] | P: seat for the 8 mm shaft |
| `bracket_support` | null | [0.022, 0.045, 0.006] | P: holds the cylinder arbor 3.5 cm above the case floor |
| `pulley_standard` (G0-optional) | null | [0.03, 0.03, 0.01] | P; B smallest catalogue pulley |
| `cam_eccentric` (G0-optional) | null | [0.03, 0.03, 0.008] | P |
| `follower_roller` (G0-optional) | null | [0.012, 0.03, 0.008] | P: 1.2 cm roller on a 3 cm arm |
| `crank_standard` (G0-optional) | null | [0.04, 0.012, 0.008] | P |

### C. Music Box (5)

| Id | Current | Proposed | Basis and reason |
|---|---|---|---|
| `music_box_case` | [0.24, 0.16, 0.14] B | [0.13, 0.10, 0.09] | P: lid closed; fits the 14 × 11 cm pad; board proportions kept roughly (ratios 0.54 to 0.64) |
| `cylinder_music_box` | [0.05, 0.05, 0.14] B | [0.032, 0.032, 0.065] | P: width budget of §6 |
| `comb_music_box` | null | [0.065, 0.01, 0.026] | P: as wide as the cylinder; base plus tines towards it |
| `music_box_slot_11` | null | BLOCKED, no size | Owner's order |
| `music_box_slot_12` | null | BLOCKED, no size | Owner's order |

### D. Carousel (6)

| Id | Current | Proposed | Basis and reason |
|---|---|---|---|
| `carousel_platform` | [0.28, null, 0.28] B | [0.125, 0.125, 0.091] | P; rotates about local z (vertical), so the disc and its three 8.5 cm poles list their height under z. The current value treats y as the axis, against the manifest's own convention |
| `carousel_horse` | null | [0.008, 0.024, 0.03] | P: 1.45 m horse at 1:48; rises and falls ±0.6 cm, staying within 5.7 to 9.3 cm, inside the open band (D) |
| `carousel_canopy` | null | [0.135, 0.06, 0.135] | P: static housing, 12.0 to 18.0 cm, +Y up |
| `carousel_lamp` | null | [0.008, 0.01, 0.008] | P: six lamps 7.1 cm apart on the rim, more than the 2.4 cm collider diameter (D) |
| `carousel_column` | null | [0.125, 0.09, 0.125] | P: column Ø 1.6 cm and upper frame ring, 3.0 to 12.0 cm |
| `carousel_base` | null | [0.13, 0.03, 0.13] | P: houses the train; base handle at its front |

### E. Windmill and Bakery (5)

| Id | Current | Proposed | Basis and reason |
|---|---|---|---|
| `windmill_sails` | [0.32, 0.32, null] B | [0.16, 0.16, 0.015] | P: hub axis along local z, towards the player |
| `windmill_millstone` | null | [0.05, 0.05, 0.012] | P: vertical axis along local z; inside the base, seen through its front arch |
| `windmill_tower` | null | [0.085, 0.195, 0.085] | P: 3.5 to 23.0 cm, tapering |
| `windmill_base` | null | [0.095, 0.035, 0.095] | P: interior 8.3 cm holds the 24T + 12T pair at 2.5 mm |
| `bakery_building` | null | [0.13, 0.19, 0.095] | P: 1:48; `SOCKET_Baker` at (−0.045, 0.004, 0.0275) local; window local x −0.060 to −0.030; door local x −0.010 to +0.011; chimney at (0.04, top, −0.0275) local |

### F. Clock Tower and theatre (11)

| Id | Current | Proposed | Basis and reason |
|---|---|---|---|
| `theatre_facade` | null | [0.20, 0.18, 0.055] | P: doors local x +0.050 to +0.095 on the front face (z +0.0275); `PIV_DoorL` at x +0.050, `PIV_DoorR` at x +0.095; leaves 2.25 cm wide swing inwards within the 5.5 cm depth |
| `clock_tower_shell` (G0-optional) | null | [0.08, 0.22, 0.08] | P: 6.0 to 28.0 cm |
| `clock_tower_base` (G0-optional) | null | [0.095, 0.06, 0.095] | P: entrance arch shows the pendulum |
| `clock_face` (G0-optional) | [0.16, 0.16, null] B | [0.06, 0.06, 0.004] | P: 6.59° wide from the eyes on the stand (D) |
| `clock_hands` (G0-optional) | null | [0.006, 0.032, 0.003] | P: rest pose at twelve; minute hand 2.7 cm |
| `clock_bell` (G0-optional) | null | [0.03, 0.028, 0.03] | P |
| `pendulum_clock` (G0-optional) | null | [0.018, 0.07, 0.006] | P: origin at the suspension point |
| `escapement_wheel` (G0-optional) | null | [0.035, 0.035, 0.004] | P |
| `escapement_anchor` (G0-optional) | null | [0.03, 0.02, 0.004] | P |
| `cam_hourly_chime` (G0-optional) | null | [0.025, 0.025, 0.006] | P |
| `spring_barrel` (G0-optional) | null | [0.03, 0.03, 0.012] | P |

### B. Trunk and workshop (9)

| Id | Current | Proposed | Basis |
|---|---|---|---|
| `trunk_main` | [0.35, 0.20, 0.25] S | Unchanged; seam 0.14, `PIV_Lid` (0, 0.14, −0.125), latch (0, 0.14, +0.125) | S PS §3.2; P seam, pivot and latch |
| `workbench` | [0.45, null, 0.25] S | [0.45, 0.03, 0.25] | S; P height |
| `parts_tray` | null | [0.125, 0.025, 0.21] | P |
| `parcel` | null | [0.12, 0.06, 0.09] | P |
| `letter_envelope` | null | [0.12, 0.004, 0.085] | P |
| `blueprint_sheet` | null | [0.12, 0.012, 0.20] | P |
| `machine_base_handle` | null | [0.03, 0.012, 0.012] | P |
| `lantern_workbench` (G0-optional) | null | [0.03, 0.06, 0.03] | P |
| `run_lever` | null | BLOCKED, no size | Owner's order |

### G. Tockton environment (4)

| Id | Current | Proposed | Basis |
|---|---|---|---|
| `tockton_base_round` | [0.46, 0.045, 0.46] M | [0.64, 0.045, 0.59] | P size; M height |
| `town_ground` | [0.6, null, 0.4] S | [0.60, 0.006, 0.30] | S width (maximum); P depth (option A) and height |
| `town_houses` | null | BLOCKED, no size; ground reserved in §3.3 | Owner's order |
| `town_props_set` | null | BLOCKED, no size; ground reserved in §3.3 | Owner's order |

### H. Characters (2)

| Id | Current | Proposed | Basis |
|---|---|---|---|
| `figure_otto` | null | [0.016, 0.036, 0.012] | P 1:48 |
| `figure_mira` | null | [0.012, 0.035, 0.008] | P 1:48; B height 1.7 m |

### I. Gift (2)

| Id | Current | Proposed | Basis |
|---|---|---|---|
| `gift_box` | null | [0.20, 0.20, 0.20], scaled uniformly by the viewer (§5.2) | P |
| `gift_engraving_plate` | null | BLOCKED, no size | Owner's order |

### J. Future (5)

`ratchet_wheel`, `pawl_standard`, `flywheel_standard`, `coupling_rigid`, `worm_gear`: G2, not sized. Later generations are documented, not built, until the competition build is delivered (A ADR-028 rule 3).

---

## 12. Open questions for the owner

| # | Question | Recommendation |
|---|---|---|
| Q1 | Town depth: option A (60 × 30 cm, aim and stand at 55 cm) or B (60 × 40 cm, aim and stand at 60 cm)? | A |
| Q2 | Should the table fit test count the workbench (stage 60 × 55 cm at full size, 45 × 47.5 cm at 75 %) and keep the bench's near edge at least 15 cm ahead of the eyes? This amends PS §3.2's "Large enough" | Yes |
| Q3 | The trunk after the unfolding: T1 withdraws, or T3 stays behind the town (stage 80 cm deep)? | T1 |
| Q4 | Reach model for TBL-10, STAND-03 and JUD-07: chest 30 cm below and 5 cm behind the eyes; a plot's reach point is the machine's base handle? | Yes |
| Q5 | On tables 20 to 34 cm below the eyes the essential bench content reaches 36 to 40°. Accept "about 35°" as up to about 40° there, or narrow the table band of PS §3.2 to about 38 to 60 cm below the eyes (higher surfaces then use the stand)? | Accept, and record the angle in TBL-10 |
| Q6 | On the lowest tables (about 60 cm below the eyes) the outer plot handles are at 60.0 cm. Accept as "about 60 cm"? | Accept |
| Q7 | Miniature scale 1:48 (Mira 3.5 cm, Otto 3.6 cm, Bakery door 4.4 cm, theatre doors 6.0 cm)? | Yes |
| Q8 | The theatre doors at the facade's right end and Otto's window at the Bakery's left end, both facing the central aisle, the only clear sight line? | Yes |
| Q9 | Decision 5: main module 2.5 mm under token `m1`; second module 3.6158 mm as `m2`, in data only until a decoy needs a GLB; G0 tooth set 10, 12, 16, 20, 24, with 36 an optional decoy? | Yes (§10) |
| Q10 | Music Box winding key on the case's right side, as on the board, overhanging the aisle by up to 3 cm? The item 3 blueprint may move it; a key on the back would be hidden from the player while winding | Right side |
| Q11 | Keep the Clock Tower plot even if the Clock Tower is cut, as an empty frozen pad? | Yes (F2 requires four plots) |
| Q12 | Is the X-ray height of 5 to 20 cm measured from the machine's top or from its mid-height? From the top, the palm rises 12 to 13 cm above eye level over the Windmill and Clock Tower | Mid-height |
| Q13 | In the town, does a placed Music Box show its lid open or closed? Open adds 5.9 cm of height and 4.5 cm behind the case; the sight lines of §3.6 assumed closed (related to gap G-04) | Item 3 decides; the layout tolerates both because the aisle keeps the key views clear |
| Q14 | The Music Box's ten loose parts need about 227 cm² of tray against 187.5 cm² of essential tray area. May the largest parts start in the build zone beside the case? | Yes; item 3 decides the split |
| Q15 | Resize the stand to a 64 × 59 cm velvet plinth with its top at the stage root, and rename `tockton_base_round` (for example to `velvet_stand`)? | Resize yes; rename optional |
| Q16 | One `shaft_long` (15 cm) cannot fit the Windmill (about 16 cm), Carousel (about 11 cm) and Clock Tower (about 13 cm). Add a third shaft length if item 5's blueprints need it? | Decide with item 5 |

---

## 13. Proposed manifest changes (listed, not applied)

The lead applies these after approval, in one change, while no other process edits the manifest. When approved, the proposed values take `dimensionsBasis: "spec"` with `TOCKTON_DIMENSIONS.md §n` added to `specifications`; gear sizes stay `"derived"`. The schema's enum needs no change.

1. `town_ground`: `approxDimensionsM` [0.60, 0.006, 0.30]; `contains` names the four plot empties at the §3.3 centres (`PLOT_MusicBox` (−0.110, 0.006, 0.080), `PLOT_Carousel` (0.110, 0.006, 0.065), `PLOT_Windmill` (0.2425, 0.006, 0.0825), `PLOT_ClockTower` (−0.2425, 0.006, 0.0825)) and the aisle, street and kerb; `COL_Plot` boxes match the pads; notes record that G-07 is closed for plots and that the dressing zones stay reserved for the BLOCKED `town_houses` and `town_props_set`.
2. `tockton_base_round`: [0.64, 0.045, 0.59], rounded rectangle; placed at (0, −0.045, +0.125) under the stage root with its top at the root; notes record G-06 resolved as two assets. Optional rename per Q15.
3. `trunk_main`: `contains` and `originAndPivot` gain the 0.14 m seam, `PIV_Lid` at (0, 0.14, −0.125), the latch collider at (0, 0.14, +0.125) and the 95° opening limit; notes record the post-unfold choice (Q3).
4. `workbench`: [0.45, 0.03, 0.25]; `contains` gains `SOCKET_Tray`, `SOCKET_Build` and `SOCKET_Blueprint` at §5.1's positions; notes record the essential region and that G-05 is closed by Q2.
5. Workshop props: `parts_tray`, `parcel`, `letter_envelope`, `blueprint_sheet`, `machine_base_handle`, `lantern_workbench` take the §11 sizes; `machine_base_handle` notes its mount at the front centre of each base.
6. Music Box: `music_box_case` [0.13, 0.10, 0.09], `cylinder_music_box` [0.032, 0.032, 0.065], `comb_music_box` [0.065, 0.01, 0.026]; the board values move into the notes.
7. Library parts other than gears: §11 values for `shaft_short`, `shaft_long`, `spring_standard`, `spring_worn`, `governor_standard`, `winding_key`, `bearing_pillow_block`, `bracket_support`, `pulley_standard`, `cam_eccentric`, `follower_roller`, `crank_standard`.
8. Carousel: §11 values; `carousel_platform` changes to [0.125, 0.125, 0.091] so that its rotation axis is z, as `meta.dimensionsConvention` requires.
9. Windmill and Bakery: §11 values; `bakery_building` records `SOCKET_Baker` at (−0.045, 0.004, 0.0275) and the window, door and chimney positions.
10. Theatre facade and the G0-optional Clock Tower set: §11 values; `theatre_facade` records the door pivots.
11. Figures: `figure_otto` [0.016, 0.036, 0.012], `figure_mira` [0.012, 0.035, 0.008]; notes record the 1:48 scale and the §7 positions.
12. `gift_box`: [0.20, 0.20, 0.20] and the uniform-scale rule of §5.2.
13. Gears, only if decision 5 follows §10: the six `gear_spur_*_m1` entries take the 2.5 mm sizes; `gear_bevel_12` [0.033, 0.033, 0.012]; `ownerDecisionPending` is cleared; `meta` records that `m1` and `m2` are module indices with values 2.5 mm and 3.6158 mm. No `m2` entry is added unless a decoy needs one.
14. `meta.dimensionsConvention` adds: "Town-space positions are in TOCKTON_DIMENSIONS.md §1 and §3.3."
15. Not changed by this document: the six BLOCKED entries (owner's order), the five G2 entries, and `machineSlotPlans` (owned by the item 3 and item 5 documents).

Outside the manifest, for the lead after approval: add a `PLOT_` prefix to ASSET_NAMING_AND_FOLDER_STANDARDS (or name plots as `SOCKET_` empties with +Z up); add `BENCH_NEAR_MIN_M`, `CHEST_BELOW_EYE_M` and `CHEST_BEHIND_EYE_M` to `src/placement.ts` with the stage-footprint fit; place the stand node under the stage root as in §9; and update PS §3.2 ("Large enough"), IS §3 and PROJECT_BIBLE §2 to name the 60 × 30 cm footprint, or the 60 cm aim if option B is chosen.

---

## 14. Acceptance criteria

1. Every number in §2 to §11 carries a basis code, and every P states its reason.
2. `dims.mjs` passes: every element inside the 60 × 30 cm footprint, no overlaps, machine footprints inside their pads with at least 0.5 cm margin, and machines inside the 18 × 21 cm build zone.
3. With option A, every plot handle, the latch, the letter spot and every workbench target lies within 60 cm of the chest point on the stand and on tables 20 to 52 cm below the eyes, at s = 1 and s = 0.75; the only exceptions are those listed in §8.2.
4. The latch, the letter spot, every plot and the build zone lie within 35° in every scenario of §8.1; the essential bench content does on the stand and on tables 38 cm or more below the eyes.
5. The theatre doors, Otto, the chimney top and the clock face are visible in all five sight-line scenarios of §3.6.
6. At the recommended module the specified 24-tooth Windmill position with a 12-tooth neighbour fits the Windmill base, and at least one drive and pinion pair fits the Music Box gear end.
7. No BLOCKED or G2 entry receives a size; no asset changes status because of this document.
8. After approval and export: each GLB's exported POSITION bounds are within 3 mm or 5 %, whichever is larger, of its `approxDimensionsM` (A ADR-020: verification reads the exported bounds); the `PLOT_` empties are within 1 mm of §3.3; IWER runs of TBL-10 and STAND-03 use the chest constants of §1 and record their reach and angle readings next to §8.1's. Comfort stays unverified until a Quest 3 or 3S test (A ADR-039 item 7; STAND-05, TBL-17).

---

## Appendix A. Computation record

All arithmetic was done with Node scripts in the session scratch folder `C:/Users/ASUS/AppData/Local/Temp/claude/11151372498ff63e/3e881673-e213-49c9-8bcf-435cb9f9d086/scratchpad/blueprints/`. The folder is temporary; the lead copies the scripts to `tools/` if they should be kept.

| Script | Computes |
|---|---|
| `gears.mjs` | Generator module, tip and root diameters, pair spans, pair fits in the Music Box gear end and the Windmill base, largest gear per interior, interaction checks; asserts that the manifest's gear sizes reproduce |
| `dims.mjs` | Layout containment and overlap (asserted), stage footprint, bench clearance, reach and angle tables for six scenarios, chest sensitivity, the 60 × 40 comparison, sight lines, ground hidden behind the bench, trunk, stand, board comparison, figure scale, carry distances, bench essential region |
| `refine.mjs` | The bench's 35° region, the distance sweep, the first-draft Bakery visibility, trunk lid angles, stand sizes per option, smallest Windmill base per module |
| `smalls.mjs` | Music Box internal budget (asserted), bevel size, gift box scale, letter legibility, Mira's clearance from the key, lamp spacing, horse band, clock face, stand angles |
| `tray.mjs` | Music Box tray area |
| `xray_plots.mjs` | X-ray palm heights; plot spacing against capture radii |
| `optionB.mjs` | Target angles for options A and B |
| `sens.mjs` | Chest-point sensitivity for handles, latch and bench |
| `shafts.mjs` | Shaft lengths and stack heights; Music Box lid swing |
| `scale.mjs` | Sizes at 75 %, board ratios, pad margins, build-zone room |
| `mira.mjs` | Sight lines over Mira and her visibility over the bench |
| `plan.mjs` | The plan view of §3.2 |
| `verify.mjs` | Spot checks of figures typed into this document: 1:48 readings, platform ratio, lid overhang past the stand, sail clearance with a raised hub, the 3.0 mm fallback aisle |
