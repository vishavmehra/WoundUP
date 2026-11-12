# Wound Up — Music Box Blueprint (12 slots)

**Status:** Proposed by the lead (drafted by Opus), awaiting owner approval. Nothing in this document is a requirement until the owner approves it (DECISIONS.md §2: "A proposed decision is not an approved implementation requirement").
**Date:** 2026-11-12
**Label:** G0-required, the competition build. Tockton only (ADR-028).
**Owner's order this answers (2026-11-06):** "3. Resolve the Music Box 12-slot blueprint. Preserve the governor requirement and do not invent undocumented components." It also supplies the Music Box milestone criteria "1. All 12 approved component slots defined. 2. Correct dimensions, pivots and socket positions."

**What this document decides once approved**

1. What one "part" of PRODUCT_SPEC §6.1's "Parts: 12" is, and the 12 slots, with the governor as one of them (§2).
2. Gap G-02: the winding key counts inside the 12, the case is the frame the slots are defined in, the base handle does not count (§2.2).
3. What fills the manifest placeholders `music_box_slot_11` and `music_box_slot_12`: the two gears that drive the governor, both existing library entries (§2.3).
4. The mechanism: power path, solver graph, tooth counts and the angular velocity of every moving part (§3).
5. Spring speed, energy per wind unit and drain constants for the standard and the worn spring (gap G-11 for the Music Box) (§4).
6. What the wind gesture turns and what moves (§5).
7. Every socket: id, accepted parts, position and rotation in the Music Box frame, mating axis, pivot and rotation axis, dependencies, snap and collider sizes (§6, §7).
8. Assembly order, pinch budget, Letter 1 and Letter 2 tray contents and decoys (gaps G-03 and G-14 for the Music Box) (§8, §9).
9. Proposed sizes for the Music Box assets and the library parts it uses, and which entries become fully specified (§11, §12).

**What stays blocked until the owner approves**

- `music_box_slot_11` and `music_box_slot_12` stay BLOCKED. This document proposes their identity; nothing moves until the owner approves it ("Do not change an asset from Blocked to Ready without an approved specification").
- No asset changes status because of this document. The manifest, the existing documents and the code are not edited; §14 lists the changes for the lead to apply afterwards.
- The gear sizes and the whole interior layout assume owner decision 5 at the 2.5 mm module that TOCKTON_DIMENSIONS §10 recommends. Decision 5 stays pending; at 3.0 mm or 3.6158 mm this layout does not fit (§10).
- `run_lever` (gap A-11) is not part of this blueprint and stays BLOCKED.

**Basis codes** (as in TOCKTON_DIMENSIONS.md). Every number carries one.

| Code | Meaning |
|---|---|
| S | Written specification, section given |
| A | Accepted ADR in DECISIONS.md |
| M | Measured from an existing file in the repository |
| D | Derived by the scripts of Appendix A from S, A, M or P values |
| B | Reference board: appearance or construction only (ADR-029) |
| P | Lead proposal, with its reason, awaiting approval |

---

## 1. Conventions

| Item | Rule | Basis |
|---|---|---|
| Units and axes | Metres in data and in this document's socket tables, centimetres in prose; right-handed, +Y up | A ADR-020 |
| Music Box frame | Origin at the centre of the case's floor-contact face; +X to the player's right, +Y up, +Z towards the player (the case front). Every socket position is in this frame | A ADR-020; P (front towards +Z, as the task and TOCKTON §1 set it) |
| Envelope | Case 13.0 × 10.0 × 9.0 cm with the lid closed (body 7.0, lid 3.0), walls and floor 0.6 cm, so the interior is x −5.9 to +5.9, y 0.6 to 7.0, z −3.9 to +3.9 cm | P TOCKTON_DIMENSIONS §6, §11 |
| Rotating parts | Spin about their local +Z with the origin on the rotation centre | A ADR-020; M manifest `originAndPivot` |
| Socket rotation | Euler XYZ in degrees, then the quaternion `[x, y, z, w]`. `R_X` = (0, 90, 0) = `[0, 0.7071, 0, 0.7071]` turns a part's local +Z onto the Music Box +X; `I` = identity | D |
| Sign of angular velocity | Right-hand rule about the Music Box +X axis (all moving parts here turn about axes parallel to X) | P (SOLVER §8.1: "Use the defined direction convention consistently") |
| Gear module | 2.5 mm under the token `m1`. Tip diameter m(N + 1.7), pitch diameter mN, face 12 mm plus a 1.6 mm boss each side (1.52 cm), bore 8 mm | P TOCKTON_DIMENSIONS §10 (owner decision 5 pending); M `blender/scripts/gen_gear_spur.py` |
| Clearance | At least 0.1 cm between parts that do not touch, and between parts and the case | P |

---

## 2. The 12 slots

### 2.1 What one slot is

ADR-030 item 3 says "Parts: N" "counts unique part slots in the blueprint", and ruling I-2 adds "repeated pieces are instances". That still leaves two readings: one slot per socket the player fills, or one slot per distinct part (a manifest row, with a repeated part counted once).

**Proposal (P):** one slot is one socket the player fills with one part (DATA_AND_BLUEPRINT_SPEC §6 `SocketDefinition`). The Music Box blueprint has exactly 12 sockets, all required. The case is the frame the sockets are defined in, not a socket. This is the count the code will test (`sockets.length === 12`).

The blueprint below gives 12 under both readings, so the owner does not have to settle I-2 for the Music Box:

| Reading | Count | How |
|---|---|---|
| One slot per socket (proposed) | 12 | The 12 sockets of §6 |
| One slot per distinct part (the manifest's `machineSlotPlans` convention) | 12 | The case plus 11 distinct parts; the support bracket is used twice |

### 2.2 Gap G-02: key, case and base handle

| Item | In the 12? | Reason |
|---|---|---|
| Winding key | Yes, slot 12 | The player installs it (board row 9; assembly step 7, "Winding Key (attach to shaft)", B), and it is the object the wind gesture turns (S PRODUCT_SPEC §10; S INTERACTION_SPEC §10) |
| Case | It is the frame; it counts as a row under the manifest convention | It is Mira's grandmother's box that the player repairs (S PRODUCT_SPEC §7, Letter 1). At 13 × 10 × 9 cm it cannot lie in the 12.5 cm tray (P TOCKTON §5.1), so it starts standing in the build zone (§9.2) |
| Base handle | No | A fixed fitting of every machine base, never placed by the player (S PRODUCT_SPEC §3.8, §11; P TOCKTON §5.2 `SOCKET_BaseHandle`) |

### 2.3 The slot list

| # | Slot (socket id) | Part | Manifest entry | Source of the part |
|---|---|---|---|---|
| 1 | `bracket_left` | Support bracket | `bracket_support` | B board row 10 "support bracket ×2"; socket map "bracket socket (×2)" |
| 2 | `bracket_right` | Support bracket (second instance) | `bracket_support` | Same |
| 3 | `arbor` | Cylinder arbor (shaft) | `shaft_short` | B socket map "Shaft Socket"; S DATA §4.1 `shaft_short_*` |
| 4 | `cylinder` | Melody cylinder | `cylinder_music_box` | S PRODUCT_SPEC §6.1 |
| 5 | `comb` | Comb | `comb_music_box` | S PRODUCT_SPEC §6.1 |
| 6 | `cylinder_wheel` | Spur gear, 20 teeth (the board's "large gear") | `gear_spur_20_m1` | B board row 7; S MECHANICAL_SOLVER_SPEC §17 test 2 (10T to 20T) |
| 7 | `governor_wheel` | Spur gear, 16 teeth | `gear_spur_16_m1` | B Gear Train Guide panel F (two-stage Music Box train, governor at the output); B Mechanism board panel D ("multi-stage gear train") |
| 8 | `main_spring` | Main spring | `spring_standard` (Letter 1), `spring_worn` (Letter 2 fault) | S PRODUCT_SPEC §6.1, §8; S DATA §4.1 |
| 9 | `spring_pinion` | Spur gear, 10 teeth (the board's "small gear") | `gear_spur_10_m1` | B board row 8; S SOLVER §17 test 2 |
| 10 | `governor` | Governor | `governor_standard` | S PRODUCT_SPEC §6.1; A ruling I-6 |
| 11 | `governor_pinion` | Spur gear, 12 teeth | `gear_spur_12_m1` | As slot 7; S PRODUCT_SPEC §8 and DATA §4.1 name the 12-tooth gear |
| 12 | `winding_key` | Winding key | `winding_key` | S PRODUCT_SPEC §3.7, §10; B board row 9 |

The four required components of PRODUCT_SPEC §6.1 are slots 8 (main spring), 4 (cylinder), 5 (comb) and 10 (governor). Every other slot is a part the boards draw and the library already holds. No new part and no new GLB is introduced.

### 2.4 What happened to the boards' 12 rows

The Exploded Assembly Guide and the Assembly Blueprint Infographic list 12 rows (18 pieces) and no governor (B; audit B C11, C12).

| Board row | Here | Reason |
|---|---|---|
| 1 Lid, 2 Hinge (L/R), 11 Side panel (L/R), 12 Foot ×4 | Merged into the case housing as nodes | Decorative and structural rows are nodes of one housing file unless a blueprint makes them player-placed slots (A ADR-030 item 4). They have no mechanical role; dropping them makes room for the governor |
| 3 Box body | The case (frame) | §2.2 |
| 4 Mainspring, 5 Comb, 6 Melody cylinder, 9 Winding key | Slots 8, 5, 4, 12 | Kept |
| 7 Large gear, 8 Small gear | Slots 6 and 9 | Kept; the large gear sits on the cylinder arbor and the small gear on the spring arbor (§3) |
| 10 Support bracket ×2 | Slots 1 and 2 | Kept |
| Not on these boards | Governor (slot 10), arbor shaft (slot 3), governor wheel and pinion (slots 7, 11) | The governor is required (S PRODUCT_SPEC §6.1; A I-6). The shaft is on the same board's socket map. The governor needs a drive from the train: the manifest describes it as "fitted at the end of the Music Box gear train", the Gear Train Guide puts it "at the output" of a two-stage train, and the System Diagram runs winding, spring, gear train, governor, machine action (B Ref 07) |

### 2.5 The placeholders `music_box_slot_11` and `music_box_slot_12`

They map to slot 7 (`gear_spur_16_m1`) and slot 11 (`gear_spur_12_m1`), both existing G0-required entries. After approval the two placeholder entries are deleted; no new file is made.

**Fallback if the owner rejects the governor stage:** the governor sits directly on the cylinder arbor (one shaft edge) and turns with the cylinder at 0.4 rad/s. The blueprint then has 10 sockets, and slots 11 and 12 cannot be filled without inventing a part: they stay BLOCKED (P).

---

## 3. Mechanism

### 3.1 Power path

```text
winding key ─(winds)─> main spring ══ spring pinion 10T ──mesh──> cylinder wheel 20T ══ arbor ══ cylinder (pins pluck the fixed comb)
                                                                                         ║
                                                                                         ╚══ governor wheel 16T ──mesh──> governor pinion 12T ══ governor
```

`══` is a shaft edge (same angular velocity), `──mesh──>` an external gear mesh (S SOLVER §8.1, §8.2). The key, comb, brackets and case are not solver nodes: they do not turn while the machine runs.

| Edge id | Type | From socket | To socket | Note |
|---|---|---|---|---|
| `c_spring_pinion` | shaft | `main_spring` | `spring_pinion` | The pinion sits on the spring's arbor |
| `c_stage1` | mesh | `spring_pinion` | `cylinder_wheel` | Teeth and module are read from the installed parts, not fixed in the edge, so a wrong gear runs wrong (S PRODUCT_SPEC §9) |
| `c_wheel_arbor` | shaft | `cylinder_wheel` | `arbor` | |
| `c_arbor_cylinder` | shaft | `arbor` | `cylinder` | |
| `c_arbor_govwheel` | shaft | `arbor` | `governor_wheel` | |
| `c_stage2` | mesh | `governor_wheel` | `governor_pinion` | As `c_stage1` |
| `c_govpinion_governor` | shaft | `governor_pinion` | `governor` | |

The graph is a tree with one source, so no loop can disagree (S SOLVER §10).

### 3.2 Spring speed and tooth counts

The specifications give the cylinder target and no other speed (S PRODUCT_SPEC §6.1; DATA §8). The source speed is the main spring's `angularVelocity` (S DATA §4 `PartDefinition.mechanical`).

- **Spring arbor 0.8 rad/s (P).** The same `spring_standard` part drives the Carousel, and the item 5 draft computes its train at 0.8 rad/s; one value keeps the shared part consistent. At 0.8 rad/s the only stage-1 pair that fits the gear end is 10T driving 20T, which gives exactly 0.400 rad/s (D).
- **Stage 1: 10T on the spring arbor drives 20T on the cylinder arbor**, a 2:1 reduction. The Mechanism board's "gear train reduces speed" matches (B).
- **Stage 2: 16T on the cylinder arbor drives 12T on the governor**, a 4:3 increase, so the governor turns faster than the cylinder. Four different tooth counts make the two counting readings of §2.1 agree and give each gear socket its own gear; 16/12 is the only such increasing pair that fits (D; P).

If the lead or the owner picks another spring speed, stage 1 changes as follows (D `mb_blueprint.mjs` §3, pairs that fit the gear end at 2.5 mm):

| Spring rad/s | 0.200 | 0.250 | 0.333 | 0.480 | 0.640 | 0.800 |
|---|---|---|---|---|---|---|
| Stage-1 pair giving exactly 0.400 | 20T to 10T | 16T to 10T | 12T to 10T | 10T to 12T | 10T to 16T | 10T to 20T (chosen) |

At 0.400 rad/s no pair fits (a 1:1 pair would be needed). A change of spring speed also changes the Carousel's train.

### 3.3 Solver result for the correct assembly (D `mb_blueprint.mjs` §2)

| Node | rad/s | rpm | Rotation axis |
|---|---|---|---|
| Main spring and spring pinion | +0.8000 | 7.64 | +X through (y 5.32, z 2.23) cm |
| Cylinder wheel, arbor, cylinder, governor wheel | −0.4000 | 3.82 | +X through (y 3.50, z −1.05) cm |
| Governor pinion and governor | +0.5333 | 5.09 | +X through (y 5.14, z 2.04) cm |

- Cylinder 0.400 rad/s, inside the 0.360 to 0.440 window of 0.4 ± 10 %: `runs` (S PRODUCT_SPEC §6.1; S SOLVER §15.1). One cylinder turn takes 15.71 s (D).
- Direction: the cylinder turns at −0.4 rad/s about +X, so its front surface, where the comb is, moves up and the pins lift the tines (D).
- The governor turns at 1.333 times the cylinder, one turn every 11.78 s (D).

**The governor's role.** The written behaviour is "Governor spins" and "Governor rotates" (S PRODUCT_SPEC §6.1; S SIMULATION_SPEC §10.1). The solver has no torque or speed-variation model (S SIMULATION §16), so the steady 0.4 rad/s is itself the regulated speed; the governor is a driven rotating node whose spinning shows that regulation. A speed-limiting governor with a setpoint is G2 design (MECHANICAL_ENGINE_V2 "Governor"), not G0. Because its socket is required, a Music Box without a governor, or without either governor gear, is `incomplete` (S SOLVER §11). No other governor behaviour is invented.

### 3.4 Wrong gears (PRODUCT_SPEC §9: size mismatches are allowed)

One socket changed at a time, every G0 tooth count (D `mb_blueprint.mjs` §3):

| Socket | 10T | 12T | 16T | 20T | 24T |
|---|---|---|---|---|---|
| `spring_pinion` | runs, 0.400 | runs_wrong, 0.480 | runs_wrong, 0.640 | runs_wrong, 0.800 | runs_wrong, 0.960 |
| `cylinder_wheel` | runs_wrong, 0.800 | runs_wrong, 0.667 | runs_wrong, 0.500 | runs, 0.400 | runs_wrong, 0.333 |
| `governor_wheel`, `governor_pinion` | runs, 0.400 | runs, 0.400 | runs, 0.400 | runs, 0.400 | runs, 0.400 |

Of the 24 ways to put the four tray gears into the four gear sockets, two run: the intended one and the one with the governor gears swapped (governor 0.300 rad/s). The governor has no target in any specification, so stage-2 mistakes change only how fast it spins; no target is invented for it. A gear of another module jams (S SOLVER §8.2; asserted in D).

---

## 4. Energy and runtime

### 4.1 What the specifications fix

- E = W × E_u and T = E / D, at most 8 wind units (S SOLVER §12).
- The worn spring gives about 15 % of normal energy per unit and runs about 1.5 s at 8 units (S SOLVER §12.1; S PRODUCT_SPEC §8; S GAMEPLAY §10.3, §12.1); "Worn spring consumes energy faster" (S SIMULATION §15 test 4).
- **Gap:** no specification gives energy units, E_u, D, or the intended runtime of the correct spring ("Correct spring produces intended runtime", S SOLVER §15.1). The two specifications also place the drain differently: "the machine's drain rate" (S SOLVER §12) against `drainRate` on the part (S DATA §4; `MachineBlueprint` in DATA §5 has no drain field).

### 4.2 Recommended constants: option B, drain on the spring part (P)

| Part definition | `angularVelocity` | `energyPerUnit` | `drainRate` |
|---|---|---|---|
| `spring_standard_brass` | 0.8 rad/s | 0.100 J | 0.050930 W (= E_u × 0.8 / (π/2)) |
| `spring_worn_brass` | 0.8 rad/s | 0.015 J (0.15 of normal) | 0.080000 W (1.5708 × standard) |

Runtime T by wind units W (D `mb_blueprint.mjs` §4):

| W | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Standard spring (s) | 1.96 | 3.93 | 5.89 | 7.85 | 9.82 | 11.78 | 13.74 | 15.71 |
| Worn spring (s) | 0.19 | 0.38 | 0.56 | 0.75 | 0.94 | 1.13 | 1.31 | 1.50 |

Why option B:

1. **Eight wind units play exactly one cylinder turn** (15.708 s at 0.4 rad/s), so a fully wound box plays the whole melody once. Each wind unit releases its energy over a quarter turn of the spring arbor, so the spring unwinds 12.566 rad while running, exactly the 720° it was wound (D).
2. The worn spring meets all three written figures: 15 % of the energy per unit, 1.500 s at 8 units, and a faster drain (D).
3. It uses only fields DATA §4 already has; option A needs a new blueprint field.
4. The absolute scale (0.1 J) is arbitrary; only the ratios matter to the solver.

Under option B the worn spring turns the cylinder 34.4° in its 1.5 s before stopping (D).

### 4.3 Alternative: option A, one drain rate per machine

E_u 0.100 J (standard) and 0.015 J (worn), one machine drain of 0.080 W: the standard spring runs 10.00 s at 8 units and the worn one 1.50 s (D). This reads SOLVER §12 literally, but a full wind then plays 229° of the cylinder, never the whole turn, and DATA §5 needs a drain field on the blueprint. With a single drain rate, one full turn at 8 units would need the worn spring at 0.0955 of normal energy, against the specified 0.15 (D).

### 4.4 Runtime target (P, contract addition)

So that the worn spring returns `runs_wrong` (the machine "runs for an unexpectedly short duration", S SIMULATION §7, with the result label "The machine stops too soon", S UI_UX_SPEC §13), the Music Box gets a second target: **the run at the gameplay maximum of 8 wind units must last at least 7.854 s**, half the intended 15.708 s. It is evaluated from the installed spring's constants (8 × E_u / D), not from the player's actual wind, so a short wind with the correct spring still `runs`. Standard: 15.708 s, `runs`; worn: 1.500 s, `runs_wrong` with `wrongTargets: ["runtime"]` (D). DATA §8 `MachineTargets` has no runtime field, so this is a contract change for the lead and Agent 1 (AGENT_WORKFLOW §14). The smaller alternative is that progression checks which spring is installed, and the solver reports `runs` for both.

---

## 5. Winding

| Item | Value | Basis |
|---|---|---|
| What the gesture turns | The winding key, about the spring arbor's axis (+X through y 5.32, z 2.23 cm), which turns the main spring | S IS §10; D layout |
| Units | Every 90° of wrist turn adds one wind unit; at most 8 (720° of key) | S PRODUCT_SPEC §10; S IS §10 |
| Direction | Clockwise as seen looking at the key's bow (the negative sense about +X, opposite to the spring's running direction). Turning back adds nothing and removes nothing (a click holds the spring) | P: S IS §10 asks to "avoid counting the same rotation repeatedly"; B the Springs board says "clockwise" |
| What moves while winding | The key and the main spring turn together with the wrist; the wind counter shows units against the maximum of 8. Nothing else moves and the solver is not run | S UI_UX §12; S GAMEPLAY §10.3; P |
| Start | Releasing the key runs the machine ("Release to run", S PRODUCT_SPEC §10). Gaze mode: each pinch adds one unit and the Run control starts it (S IS §10, §14) | S |
| What moves while running | Spring and pinion at +0.8, cylinder train at −0.4, governor at +0.533 rad/s for T seconds (§3.3, §4.2); the comb's tines are plucked as a runtime effect timed to the cylinder; the key stays still, held by the click | S SIMULATION §9.1, §10.1; M manifest `comb_music_box`; P |
| Stop | When the stored energy is used up (S PRODUCT_SPEC §6.1). No separate timer (S SOLVER §12.1) | S |

---

## 6. Interior layout

### 6.1 Along X (D `mb_blueprint.mjs` §5, asserted to close on the 11.8 cm interior)

| x from (cm) | x to (cm) | Holds |
|---|---|---|
| −5.80 | −4.28 | Gear plane 2: governor wheel 16T (on the arbor) and governor pinion 12T (on the governor spindle) |
| −4.18 | −3.58 | Left support bracket |
| −4.18 | −2.98 | Governor weights, at the front-top, clear of the bracket |
| −2.88 | −2.38 | Governor frame arm, from the spindle to the front wall |
| −3.48 | +2.38 | Melody cylinder and comb, 5.86 cm long |
| +2.48 | +3.08 | Right support bracket |
| +3.18 | +4.70 | Gear plane 1: cylinder wheel 20T (on the arbor) and spring pinion 10T (on the spring arbor) |
| +4.80 | +5.80 | Main spring coil, next to the right wall |
| −5.80 | +4.70 | Cylinder arbor, 10.50 cm |
| +3.18 | +6.50 | Spring arbor, through the right wall's bush to its outer face |
| +5.50 | +9.50 | Winding key: drive square in the bush, bow 3.0 cm proud of the wall |

### 6.2 Across (Z, Y) (D `mb_blueprint.mjs` §5)

| Axis | z (cm) | y (cm) | What is on it |
|---|---|---|---|
| Cylinder arbor | −1.05 | 3.50 | Brackets' seats, cylinder (Ø 3.2), 20T and 16T wheels |
| Spring arbor | 2.23 | 5.32 | Main spring (Ø 3.0), 10T pinion, key |
| Governor spindle | 2.04 | 5.14 | Governor weights (Ø 2.4), 12T pinion |

Centre distances after rounding to 0.1 mm: 3.751 cm for the 10T and 20T (pitch value 3.750) and 3.498 cm for the 16T and 12T (3.500), within 0.2 mm (D).

The comb lies in front of the cylinder: tine tips at z 0.60, base front at z 3.20, top face at y 3.50 (the arbor height), 1.0 cm thick; a seat block of the case, 1.90 cm tall, carries it. The brackets stand on the floor, 3.90 cm tall, with their seat 2.90 cm above the foot (D).

Checks (D, asserted): every part at least 0.44 cm from every other part it does not touch, and at least 0.137 cm from the case walls; the highest internal point is the 12T pinion's tip at y 6.852 cm, so the lid closes over the mechanism with 0.148 cm to spare.

**The fit is tight.** 177 arbor positions pass on a 0.1 mm grid, with the arbor between y 3.42 and 3.65 cm and the spring arbor between 5.25 and 5.38 cm. The largest spring that fits beside the chosen arbor is Ø 3.14 cm; with the Ø 4.5 cm spring TOCKTON §11 proposed, no layout exists, because a spring that size cannot sit 3.75 cm from the cylinder arbor inside a 7.8 × 6.4 cm section (D). The chosen point maximises the smallest clearance.

### 6.3 Changes to TOCKTON_DIMENSIONS proposals

TOCKTON §6 and §11 sized these parts before a train existed. This blueprint stays inside its envelope (13.0 × 10.0 × 9.0 cm) and its module (2.5 mm), but changes the parts inside:

| Part | TOCKTON proposal | This blueprint | Reason |
|---|---|---|---|
| `spring_standard`, `spring_worn` | Ø 4.5 × 1.0 cm | Ø 3.0 cm coil, 3.32 cm with its arbor | §6.2: a Ø 4.5 spring does not fit beside a 10T/20T pair |
| `cylinder_music_box` | Ø 3.2 × 6.5 cm | Ø 3.2 × 5.86 cm | The arbor carries two gears, not one |
| `comb_music_box` | 6.5 cm wide | 5.86 cm wide | As wide as the cylinder |
| `shaft_short` | 9.0 cm | 10.5 cm | Arbor from gear plane 2 to gear plane 1. Still hidden in the Carousel column (top at 11.10 cm against 12.0 cm, D) |
| `bracket_support` | 4.5 cm tall, arbor 3.5 cm above the floor | 3.9 cm tall, seat 2.9 cm above its foot | Arbor height of §6.2 |
| `governor_standard` | Axis vertical, Ø 2.4 × 3.0 cm | Axis along X; weights Ø 2.4 cm with a frame arm to the front wall; overall `[0.0306, 0.024, 0.0342]` | The 12T pinion must mesh with a wheel on the horizontal arbor |
| Width split | Gear end 2.8 + cylinder 6.5 + governor end 2.5 cm | Right end 3.52 + cylinder 5.86 + left end 2.42 cm (D) | Two gear planes and the spring |
| Key height in the town | 3.5 to 6.5 cm | 4.4 to 7.4 cm (§10.2) | The spring arbor is at y 5.32 cm |

---

## 7. Sockets

### 7.1 Socket table

Positions in metres in the Music Box frame (D `mb_blueprint.mjs` §6). Rotation `R_X` = (0, 90, 0), quaternion `[0, 0.7071, 0, 0.7071]`; `I` = identity. "Seats along" is the direction of the last few millimetres of the 120 ms snap tween (S PRODUCT_SPEC §9); the tween path is not collision-checked.

| # | Socket id | GLB empty | Family | Accepts | Position (x, y, z) | Rotation | Seats along | Part's pivot and rotation | Depends on |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `bracket_left` | `SOCKET_BracketL` | `structural` | `bracket_support` | (−0.0388, 0.0350, −0.0105) | `R_X` | −Y onto its floor seat | Origin at the shaft-seat centre; static | — |
| 2 | `bracket_right` | `SOCKET_BracketR` | `structural` | `bracket_support` | (0.0278, 0.0350, −0.0105) | `R_X` | −Y | As above | — |
| 3 | `arbor` | `SOCKET_Arbor` | `shaft` | `shaft_short` | (−0.0055, 0.0350, −0.0105) | `R_X` | −Y into both open seats | Origin at mid-length; turns about local +Z (Music Box +X) | 1, 2 |
| 4 | `cylinder` | `SOCKET_Cylinder` | `cylinder` | `cylinder_music_box` | (−0.0055, 0.0350, −0.0105) | `R_X` | −Y, clipping onto the arbor | Origin on the axis at mid-length; turns about local +Z | 3 |
| 5 | `comb` | `SOCKET_Comb` | `comb` | `comb_music_box` | (−0.0055, 0.0350, 0.0060) | `I` | −Z, sliding back until the tine tips meet the cylinder | Origin at the centre of the tine-tip edge on the top face, tines along local −Z; fixed | — |
| 6 | `cylinder_wheel` | `SOCKET_GearB` | `spur_gear` | any spur gear (20T intended) | (0.0394, 0.0350, −0.0105) | `R_X` | −X onto the arbor's right end | Bore centre, mid-thickness; turns about local +Z | 3 |
| 7 | `governor_wheel` | `SOCKET_GearC` | `spur_gear` | any spur gear (16T intended) | (−0.0504, 0.0350, −0.0105) | `R_X` | +X onto the arbor's left end | As above | 3 |
| 8 | `main_spring` | `SOCKET_Spring` | `spring` | `spring_standard`, `spring_worn` | (0.0530, 0.0532, 0.0223) | `R_X` | +X, arbor into the right-wall bush | Origin at the coil centre; local +Z towards the key; turns about local +Z | — |
| 9 | `spring_pinion` | `SOCKET_GearA` | `spur_gear` | any spur gear (10T intended) | (0.0394, 0.0532, 0.0223) | `R_X` | +X onto the spring arbor's inner end | Bore centre; turns about local +Z | 8 |
| 10 | `governor` | `SOCKET_Governor` | proposed `governor` (gap A-01) | `governor_standard` | (−0.0358, 0.0514, 0.0204) | `R_X` | −Y, frame arm onto the front-wall seat | Origin on the spindle axis at the weights' centre; `Governor_Weights` turns about local +Z, `Governor_Frame` static | — |
| 11 | `governor_pinion` | `SOCKET_GearD` | `spur_gear` | any spur gear (12T intended) | (−0.0504, 0.0514, 0.0204) | `R_X` | +X onto the spindle's outer end | Bore centre; turns about local +Z | 10 |
| 12 | `winding_key` | `SOCKET_Key` | proposed `winding_key` (gap A-01) | `winding_key` | (0.0600, 0.0532, 0.0223) | `R_X` | −X, drive square into the spring arbor | Origin at the centre of the drive square, local +Z outwards to the bow; turns with the wrist while winding, still while running | 8 |

- **Accepts.** Gear sockets accept any spur gear because size mismatches must be allowed and then run wrong (S PRODUCT_SPEC §9; S GAMEPLAY §8.2); a different module jams (S SOLVER §8.2). Other sockets accept only the listed ids, and a part of the wrong family gets the red outline and returns to the tray (S PRODUCT_SPEC §9).
- **Removal (P).** A part cannot be removed while a part that depends on it is installed. In Letter 2 the key and the spring pinion therefore come off before the worn spring (§8.2).
- **Mesh phase (P).** Each gear's tooth 0 is on its local +X (M manifest); at start the runtime turns each driven gear by half a tooth relative to the line of centres so the teeth interleave.

### 7.2 Snap and collider sizes

| Item | Value | Basis |
|---|---|---|
| Snap radius | 4 cm, 7 cm with Easy Snap, from the part's origin to the socket position, in real centimetres | S PRODUCT_SPEC §9; S IS §3, §8; P (measured origin to socket) |
| Preview and snap | 50 % ghost with a warm outline; 120 ms tween, click and spark | S PRODUCT_SPEC §9 |
| Removal | Pull more than about 3 cm away from the socket | S IS §9 |
| Grab colliders | Invisible, radius at least 1.2 cm, visible mesh not enlarged: sphere for each gear, the spring, the governor, the brackets and the cylinder; a capsule of radius 1.2 cm along the 10.5 cm shaft; a box 5.86 × 2.4 × 2.6 cm for the comb; a sphere of radius 1.5 cm at the key's bow | S IS §7.2; P shapes |
| Case collider | `COL_Case` box 13.0 × 10.0 × 9.0 cm for placement and X-ray | M manifest |

Neighbouring sockets (D): the arbor and the cylinder share a point (different families, so no conflict); the key is 0.70 cm from the spring, the left bracket 1.16 cm from the governor wheel, the right bracket 1.16 cm from the cylinder wheel. The gear sockets in mesh are 3.75 and 3.50 cm apart, inside the 4 cm radius, so the closest free valid socket wins and the ghost shows which one (S IS §7.3, §8).

### 7.3 Nodes the case GLB needs

`music_box_case` (origin at the centre of the floor-contact face) carries, besides its body, lid, side panels, hinges and feet:

- The 12 `SOCKET_` empties of §7.1, each with its rotation.
- `PIV_Lid` at (0, 0.070, −0.045), the back top edge of the body; the lid opens to 100° (P TOCKTON §6).
- `Bush_SpringArbor` in the right wall at (0.062, 0.0532, 0.0223); `Post_SpringOuter`, the anchor of the coil's outer end, beside the coil.
- `Seat_Comb`, a block 1.90 cm tall under the comb from z 0.020 to 0.032; `Seat_Governor`, a pad on the front wall's inner face at x −0.0263, y 0.0514.
- Floor marks for the two brackets.
- `SOCKET_BaseHandle` at (0, 0.010, 0.045): front centre, 1 cm up (P TOCKTON §1, §5.2).
- `COL_Case`.

---

## 8. Assembly order, dependencies and pinches

### 8.1 Recommended order (Letter 1)

Only the dependencies in §7.1 are enforced; the blueprint sheet, the ghost-hand demonstration and the idle pulse (S GAMEPLAY §8.3) teach this order (P), which follows the boards' sequence (brackets, gear train large then small, cylinder, comb, key; B) with the governor added:

1. Left bracket, 2. right bracket, 3. arbor, 4. cylinder, 5. comb, 6. cylinder wheel 20T, 7. governor wheel 16T, 8. main spring, 9. spring pinion 10T, 10. governor, 11. governor pinion 12T, 12. winding key. Then wind and release.

The cylinder wheel goes on before the main spring because the wheel's disc and the coil overlap when seen along X (D: centres 3.75 cm apart against radii 2.71 + 1.50 cm).

### 8.2 Pinch budget (S PRODUCT_SPEC §9: 40 pinches or fewer)

| Activity | Pinches | Basis |
|---|---|---|
| Letter 1: 12 placements, 4 to 8 winding pinches (90° to 180° of wrist per pinch, P), the last release runs it, 1 carry to the plot | 17 to 21 | D |
| Letter 2: key off, pinion off, worn spring out, new spring in, pinion on, key on, 4 to 8 winding, 1 carry | 11 to 15 | D |

---

## 9. Letters, tray and decoys

### 9.1 Which spring when (gap G-03) and decoys (gap G-14)

| Letter | Start state | Tray | Decoys | Basis |
|---|---|---|---|---|
| 1, Mira: "make it sing again" | Case standing in the build zone, empty | The 12 parts, with `spring_standard` | None | S DATA §9.1 (Letter 1 has no decoys); P (standard spring) |
| 2, Mira: "only for a moment" | The Music Box back in the build zone with `spring_worn` in `main_spring` | One `spring_standard` | None | S PRODUCT_SPEC §8 ("The Music Box uses a worn spring"); S DATA §12 (Letter 2 after the first Music Box is placed); P (no decoys: specs silent, G-14) |

Why the standard spring in Letter 1 (P): a worn spring there would make the first build play 1.5 s, which is no satisfying first five minutes, and under the runtime target of §4.4 it would return `runs_wrong` and could not be placed (S PRODUCT_SPEC §11), while Letter 2 unlocks only after the Music Box is placed (S DATA §12). How the placed Music Box returns to the workbench for Letter 2 is not specified; the smallest option is that accepting Letter 2 brings it back to the build zone (question Q7).

### 9.2 Starting layout on the workbench (TOCKTON question Q14)

- **Case:** standing in the build zone with its origin at bench-local x −0.25 cm, 0.5 cm left of `SOCKET_Build`, so the case with its key spans −6.75 to +9.25 cm, inside the build zone's −8.75 to +9.25 cm (D `mb_tray.mjs`).
- **Tray (8 pieces):** the four gears, the two brackets and the governor. Shelf-packed with 0.5 cm margins they need 14.05 cm of tray depth, inside the 15.0 cm essential region (TOCKTON §5.1). All 8 with the key would need 15.32 cm (D `mb_tray.mjs`).
- **Build zone, beside the case (5 pieces):** behind the case, the cylinder, the comb and the key (17.72 × 5.00 cm in a strip 18.0 × 5.5 cm); in front of it, the arbor shaft and the spring (15.50 × 4.32 cm). All 12 loose pieces in the tray would need 263.3 cm², the whole tray (D).

The key on the bench is 31.2 cm from the chest point and 18.6° from the line to the town centre on the stand; on tables it is 32.0 to 38.0 cm and 15.5 to 18.9° (D; reach model of TOCKTON §1, within 60 cm and 35°).

---

## 10. The Music Box in the town and other modules

### 10.1 Lid on the plot (TOCKTON question Q13)

Proposal: the lid stays open, on the bench and on the plot, so the cylinder, comb and governor are seen working. TOCKTON's sight-line script already modelled the Music Box as a 16.5 cm box, the open-lid height (M `dims.mjs`).

### 10.2 Key overhang (s = 1)

The key, at any angle of its bow, occupies x −4.50 to −1.50, y 4.42 to 7.42 and z 8.73 to 11.73 cm in town space: 2.5 cm into the aisle, 2.10 cm clear of Mira (D). Checked as an occluder against TOCKTON §3.6's sight lines, it hides nothing on the stand, on the typical table or on the low table; **on the high table (20 cm below the eyes) it hides the theatre doors' bottom-left corner**, while their bottom-right corner and top stay visible (D). TOCKTON's check did not include the key (question Q11).

### 10.3 If owner decision 5 picks another module

| Module | Effect on this blueprint (D) |
|---|---|
| 2.5 mm (used here) | Fits as described |
| 3.0 mm | The 20T wheel's tip is 6.510 cm, more than the 6.4 cm interior height, so stage 1 at 0.8 rad/s is impossible. The nearest train (spring 0.64 rad/s, 10T to 16T, governor 12T to 10T) found no layout in the same search. Needs a taller or deeper case, a smaller face width, or a new train, and changes the shared spring speed for the Carousel |
| 3.6158 mm | No gear pair fits the Music Box at all (TOCKTON §10) |

---

## 11. Manifest entries per slot and their proposed sizes

Sizes in the asset's own glTF axes, metres, rotation axis on z (M manifest `meta.dimensionsConvention`).

| Slot | Entry | Proposed `approxDimensionsM` | Notes |
|---|---|---|---|
| Frame | `music_box_case` | [0.13, 0.10, 0.09] | TOCKTON §11; nodes of §7.3 |
| 1, 2 | `bracket_support` | [0.022, 0.039, 0.006] | Seat 0.029 m above its foot; shared with the Carousel and Clock Tower rows (item 5 confirms its use there) |
| 3 | `shaft_short` | [0.008, 0.008, 0.105] | Ø 8 mm (M generator bore) |
| 4 | `cylinder_music_box` | [0.032, 0.032, 0.0586] | Pins visual until the melody is authored (gap G-17) |
| 5 | `comb_music_box` | [0.0586, 0.010, 0.026] | Tine count: Stage 1 proposal (board 15 to 24, B); origin redefined in §7.1 |
| 6 | `gear_spur_20_m1` | [0.0543, 0.0543, 0.0152] | TOCKTON §11 at 2.5 mm |
| 7 | `gear_spur_16_m1` | [0.0443, 0.0443, 0.0152] | Same |
| 8 | `spring_standard`, `spring_worn` | [0.030, 0.030, 0.0332] | Coil Ø 3.0 cm, 1.0 cm wide, on an arbor from the pinion plane to the wall's outer face; worn shows a slack coil (gap A-05) |
| 9 | `gear_spur_10_m1` | [0.0293, 0.0293, 0.0152] | Same |
| 10 | `governor_standard` | [0.0306, 0.024, 0.0342] | Two weights on arms turning with the spindle (B Gear Train Guide, flyball) inside a static frame whose arm seats on the front wall; spindle 1.62 cm beyond the weights for the pinion |
| 11 | `gear_spur_12_m1` | [0.0343, 0.0343, 0.0152] | Same |
| 12 | `winding_key` | [0.03, 0.006, 0.04] | TOCKTON §11; origin at the drive square's centre, 3.0 cm proud of the wall |
| Fitting | `machine_base_handle` | TOCKTON §11 | At `SOCKET_BaseHandle`; not a slot |

---

## 12. Which assets this blueprint fully specifies

**Become fully specified once the owner approves this document** (and, for the gears, decision 5 at 2.5 mm). Each can then go to Stage 1; none changes status now.

| Entry | Status today | What is then fixed | What Stage 1 still proposes |
|---|---|---|---|
| `music_box_case` | NOT_STARTED | Size, origin, 12 sockets, pivots, seats, base handle socket | Ornament and finishes |
| `cylinder_music_box` | NOT_STARTED | Size, origin, axis, speed | Pin pattern (visual until G-17) |
| `comb_music_box` | NOT_STARTED | Size, origin, position | Tine count |
| `shaft_short` | NOT_STARTED | Length, diameter, origin | — |
| `bracket_support` | NOT_STARTED | Size, seat height, origin | Shape |
| `spring_standard`, `spring_worn` | NOT_STARTED | Size, origin, axis, constants | How the worn coil looks (A-05) |
| `governor_standard` | NOT_STARTED | Type, size, origin, axis, frame mount, speed | Shape of the weights and frame |
| `winding_key` | NOT_STARTED | Size, origin, axis, turn direction | Bow shape |
| `gear_spur_10_m1`, `gear_spur_12_m1`, `gear_spur_16_m1`, `gear_spur_20_m1` | NOT_STARTED, EXPORTED, REWORK_REQUIRED, NOT_STARTED | Tooth counts and use; size after decision 5 | — |

**Stay blocked:** `music_box_slot_11` and `music_box_slot_12` until the owner approves §2.5, then they are deleted, not built. `run_lever` (A-11) is outside this blueprint. The seven blocked assets of the owner's order are not otherwise touched.

---

## 13. Open questions for the owner

| # | Question | Recommendation |
|---|---|---|
| Q1 | One slot = one socket the player fills; the case is the frame (§2.1). Both readings give 12 here | Yes |
| Q2 | G-02: key inside the 12, case as the frame, base handle outside (§2.2) | Yes |
| Q3 | Drive the governor through a 16T/12T stage from the cylinder arbor, so slots 11 and 12 are `gear_spur_16_m1` and `gear_spur_12_m1` (governor 0.533 rad/s, 5.1 rpm)? The fallback puts it on the arbor at 0.4 rad/s and leaves two slots blocked (§2.5) | Yes |
| Q4 | Spring arbor 0.8 rad/s for `spring_standard`, shared with the Carousel (§3.2) | Yes |
| Q5 | Energy: option B (drain on the spring, 8 units = one cylinder turn = 15.71 s, worn 1.50 s) or option A (one machine drain, 10.0 s, worn 1.50 s) (§4) | B |
| Q6 | Add the runtime target "at 8 units at least 7.854 s" so the worn spring returns `runs_wrong` (§4.4) | Yes |
| Q7 | G-03: Letter 1 ships the standard spring; Letter 2 brings the Music Box back to the build zone with the worn spring fitted and one standard spring in the tray (§9.1) | Yes |
| Q8 | G-14: no decoys in Letter 2 (§9.1) | Yes |
| Q9 | G-17: the melody lasts one cylinder turn, 15.71 s, under option B | Yes |
| Q10 | Accept the size changes to TOCKTON §11 of §6.3 (spring Ø 3.0, cylinder 5.86, shaft 10.5 cm, governor axis along X) | Yes |
| Q11 | Accept that the key hides the theatre doors' bottom-left corner from a table 20 cm below the eyes (§10.2) | Accept |
| Q12 | Lid open on the plot (TOCKTON Q13) (§10.1) | Open |
| Q13 | Wind clockwise as seen at the key's bow; turning back changes nothing (§5) | Yes |
| Q14 | Workbench start: case standing in the build zone, 5 pieces beside it, 8 in the tray (TOCKTON Q14) (§9.2) | Yes |
| Q15 | Gap A-01, for the lead: add `governor` and `winding_key` to `PartFamily`, or map both to `structural` | Add both |

---

## 14. Proposed manifest changes (listed, not applied)

The lead applies these after approval, in one change, while no other process edits the manifest.

1. `machineSlotPlans` `music_box`: replace the rows with the 12 slots of §2.3 (kinds: `bracket_support` ×2, `shaft_short`, `spring_standard`/`spring_worn`, the four gears and `governor_standard` as library; `cylinder_music_box` and `comb_music_box` as own; `music_box_case` as housing and frame). Notes: the slot definition of §2.1, G-02 resolved as in §2.2, I-6 satisfied by slot 10, `namedInWriting` stays 4. Remove the note that two slots lack support.
2. After approval: delete `music_box_slot_11` and `music_box_slot_12` and record them in `meta.removedByOwnerDecision` (former classification G0-required, former status BLOCKED, reason: mapped to `gear_spur_16_m1` and `gear_spur_12_m1` by this blueprint).
3. `gear_spur_10_m1` and `gear_spur_20_m1`: classification G0-optional to G0-required; `usedBy` adds "music_box: spring pinion" and "music_box: cylinder wheel"; `scopeClass` stays shared.
4. `gear_spur_16_m1`: `usedBy` adds "music_box: governor wheel"; the note that it may drop to G0-optional is removed. `gear_spur_12_m1`: `usedBy` adds "music_box: governor pinion".
5. `music_box_case`: `approxDimensionsM` [0.13, 0.10, 0.09]; `contains` lists the nodes of §7.3 with their positions; the open-lid policy of §10.1 in `notes`.
6. `cylinder_music_box` [0.032, 0.032, 0.0586]; `comb_music_box` [0.0586, 0.010, 0.026] with the origin of §7.1; `shaft_short` [0.008, 0.008, 0.105]; `bracket_support` [0.022, 0.039, 0.006]; `spring_standard` and `spring_worn` [0.030, 0.030, 0.0332]; `governor_standard` [0.0306, 0.024, 0.0342] with its type, frame mount and the origin of §7.1; `winding_key` [0.03, 0.006, 0.04] with its origin and turn direction.
7. On those entries `dimensionsBasis` becomes `"spec"` and `specifications` adds `docs/blueprints/MUSIC_BOX_BLUEPRINT.md`; gear sizes stay `"derived"` and keep `ownerDecisionPending` until decision 5.
8. `spring_standard` and `spring_worn` `notes`: the constants of §4.2 (or §4.3), recorded for Agent 2's part definitions.
9. No `status` field changes.

Outside the manifest, for the lead after approval: the blueprint data in `src/content/blueprints/` (Agent 2), the runtime target and the drain field choice in the solver contract (Agent 1, AGENT_WORKFLOW §14), and the `PartFamily` values of Q15.

---

## 15. Acceptance criteria

1. The Music Box blueprint data has exactly 12 required sockets with the ids, families, positions (within 0.1 mm), rotations and dependencies of §7.1, and passes blueprint validation (S DATA §13).
2. Solver unit tests: the correct assembly returns `runs` with the cylinder at −0.400 rad/s and the governor at +0.533 rad/s; removing any one socket's part returns `incomplete`; a gear of another module returns `jams`; the swap results of §3.4 reproduce; repeated runs are identical (S SOLVER §17 tests 2, 8, 9, 11, 15).
3. Energy tests: with the standard spring, 8 units run 15.708 s (±1 ms) and the result is `runs`; with the worn spring 1.500 s (±1 ms), below 2 s (S SOLVER §17 test 10), and `runs_wrong` with the runtime target. Under option A the figures are 10.000 s and 1.500 s.
4. Geometry: each exported GLB's bounds are within 3 mm or 5 % of the §11 size (A ADR-020; TOCKTON criterion 8); in an assembly render of the 12 parts in the case no two parts intersect and nothing rises above y 0.070 m with the lid closed.
5. Letter 1 is completed in the IWSDK emulator with 21 pinches or fewer; the 8 tray pieces sit in the tray's essential region and the 5 others beside the case.
6. The wind gesture adds one unit per 90° up to 8 and turning back adds nothing (WIND-02); on a headset this stays unverified until a Quest test.
7. No BLOCKED entry changes status, and nothing in the manifest, the existing documents or the code changes, until the owner approves.
8. `mb_blueprint.mjs` and `mb_tray.mjs` (Appendix A) run without an assertion failure.

---

## Appendix A. Computation record

All arithmetic was done with Node scripts in the session scratch folder `C:/Users/ASUS/AppData/Local/Temp/claude/11151372498ff63e/3e881673-e213-49c9-8bcf-435cb9f9d086/scratchpad/blueprints/`. The folder is temporary; the lead copies the scripts to `tools/` if they should be kept.

| Script | Computes |
|---|---|
| `mb_blueprint.mjs` | §1 gear sizes; §2 the solver graph by the rules of SOLVER §8.1, §8.2 and §10 (asserted: `runs`, exactly −0.4 rad/s, direction); §3 wrong-gear table, the 24 permutations, `incomplete` and `jams` cases (asserted), stage-1 pairs per spring speed; §4 energy options A and B and the runtime target (asserted 15.708 s, 1.500 s, 10.000 s); §5 the x budget (asserted to close), the layout search and clearances (asserted), largest spring, lid clearance; §6 socket positions; §7 key in the town, Mira clearance, sight lines; §8 tray area and pinches; §9 shaft length against the Carousel column. Output saved as `out_2p5.txt`. Environment `RS`, `MOD`, `WS` and `TEETH` re-run it for another spring radius, module, spring speed or tooth set (the 3.0 mm case of §10.3: `MOD=0.3 WS=0.64 TEETH=10,16,12,10`) |
| `mb_tray.mjs` | Shelf packing of the 8 small pieces in the 12.5 cm tray (every order and orientation), the build-zone strips, the case offset (all asserted) |
| Inline `node -e` runs | Key reach and target angle on the bench (TOCKTON §1 reach model); the 3.0 mm 20T tip; governor and spring envelopes |
