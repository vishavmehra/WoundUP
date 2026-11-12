# Wound Up — Tockton Characters

**Project:** Wound Up
**Label:** G0 (the competition build). Resident behaviour beyond what is written here is G1 and is only design intent ([RESIDENT_BEHAVIOUR_SPEC.md](RESIDENT_BEHAVIOUR_SPEC.md), [DECISIONS.md](DECISIONS.md) ADR-028).
**Status:** Accepted. Canonical character specification for the current Tockton build, from the owner's decisions of 2026-11-06 at 17:09 and 17:20 ([ADR-039](DECISIONS.md)).
**Date:** 2026-11-06
**Source:** The owner's decisions above; [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §6.3 and §7; [GAMEPLAY_SYSTEMS.md](GAMEPLAY_SYSTEMS.md) §5 and §11.3; [SIMULATION_SPEC.md](SIMULATION_SPEC.md) §10.3; [audits/B_REFERENCES.md](audits/B_REFERENCES.md) conflict C21
**Related:** [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md), [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md) family H, [ASSET_REFERENCE_MAPPING.md](ASSET_REFERENCE_MAPPING.md), [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md)

## 1. The rule

The owner's rule (2026-11-06, 17:09): "Create character figures only for people explicitly named in the written specifications. Do not invent additional resident figures for letter senders."

In the current Tockton build only Mira and Otto have figures. Every other letter sender is text on a letter. If another document disagrees with this one about who has a figure, this document wins and the other one is corrected.

## 2. Who has a figure

| Person | What the specifications say | Figure | Manifest entry | Source |
|---|---|---|---|---|
| Mira | A named character. Sender of Letters 1 and 2 | Yes | `figure_mira`, G0-required | Owner 17:20; PRODUCT_SPEC §7 |
| Otto | A named character and the baker. Sender of Letters 4 and 5 | Yes. He appears in the Bakery and performs the kneading animation | `figure_otto`, G0-required | Owner 17:09 and 17:20; PRODUCT_SPEC §6.3 and §7 |
| Schoolteacher | A role only. Sender of Letter 3 | No separate figure | None. `figure_schoolteacher` was deleted | Owner 17:20; PRODUCT_SPEC §7 |
| Theatre keeper | A role only. Sender of Letter 6 | No separate figure | None. `figure_theatre_keeper` was deleted | Owner 17:20; PRODUCT_SPEC §7 |
| Any other letter sender | None exists in the specifications. The closing card has no sender | No, unless explicitly named and approved later | None | Owner 17:20 |

The manifest has exactly two family H entries, `figure_otto` and `figure_mira`, and the three deleted entries are recorded in its `meta.removedByOwnerDecision` list ([assets/manifest/glb-manifest.json](../assets/manifest/glb-manifest.json)).

## 3. Mira

- **Where the specifications say she matters.** Letter 1: "My grandmother's music box went quiet the night the clock stopped. Could you make it sing again?" It introduces the Music Box and starts the first build. Letter 2: "It plays! But only for a moment, then it sighs and stops. Is it tired?" It introduces the worn spring repair (PRODUCT_SPEC §7; GAMEPLAY_SYSTEMS §5.1 and §5.2). So she is tied to Letters 1 and 2 and to the Music Box.
- **Her figure.** A static figure. The manifest gives it no animation. Family H, owner World, effort class D, within the character ceiling of 1,500 triangles (ADR-034).
- **Appearance.** `WoundUp Tockton Character Design Board.png` shows a character called Mira, described there as an engineer. The board is appearance only (ADR-029). The role "engineer" is not in the written specifications and is not adopted.
- **What is not specified.** Where she stands, her pose, and whether she does anything when the Music Box plays. Nothing is invented here.

## 4. Otto

- **Who he is.** The sender of Letter 4 ("No wind, no windmill. No windmill, no flour. No flour, no bread. Please help.") and Letter 5 ("The windmill spins like it's late for something! Flour everywhere. Something's not right inside."). Letter 4 introduces the Windmill and Bakery; Letter 5 introduces the incorrect gear repair (PRODUCT_SPEC §7; GAMEPLAY_SYSTEMS §5.4 and §5.5).
- **Otto is the baker.** The specifications mention "Baker kneads" without naming the baker (PRODUCT_SPEC §6.3). The owner decided on 2026-11-06 that Otto is the baker. This closes gap G-10.
- **What he does.** When the Windmill operates, the chimney smokes, the baker kneads and the oven glows (PRODUCT_SPEC §6.3; SIMULATION_SPEC §10.3; GAMEPLAY_SYSTEMS §11.3). Otto's figure stands in the Bakery and performs the kneading animation at that moment. It is a reaction to the machine, not a behaviour system (RESIDENT_BEHAVIOUR_SPEC §1).
- **Manifest.** `figure_otto` (renamed from `figure_baker`), clip `Otto_Knead`, depends on `bakery_building`. The Bakery's socket keeps its name `SOCKET_Baker`, because it names the place, not the person. `figure_otto` is the character in the asset pilot (ASSET_PRODUCTION_ROADMAP §5).
- **Not used.** The board's baker "Oswald".

## 5. The schoolteacher and the theatre keeper

Both are roles, not names. The schoolteacher writes Letter 3 about the Carousel. The theatre keeper writes Letter 6 about the Clock Tower, which is competition optional and cut first (PRODUCT_SPEC §6.4; ADR-027). Each appears only as the sender line of a letter. No figure, placeholder file, socket or position is reserved for either.

## 6. Other letter senders

The specifications have no other senders. If a later specification adds one, that person gets a figure only if the specification names them and the owner approves the figure. That needs an owner decision recorded in DECISIONS.md and a new manifest entry with a label under ADR-028.

## 7. Names on the reference boards

The Character Design Board names Oswald (baker), Mira (engineer), Elias, Luna, Pip, Clack (an automaton) and a player called the Tinkerer. Of these only Mira is in the written specifications. Oswald, Elias, Luna, Pip, Clack and the Tinkerer are not used in Tockton (ADR-029, ruling I-8; audit B). The game is hands only and the player has no body model. Whether a later world may use the board names stays an owner question ([MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md) section 12).

## 8. Still open

| Item | Where it is decided |
|---|---|
| Figure scale and placement for Mira and Otto. The manifest records their size as unspecified, and the board heights are real-world sizes that do not apply to a 60 x 40 cm town | The canonical dimensions table, which is a separate task. Nothing is invented here |
| Mira's position, pose and whether she has any motion | Not specified in any document |
| Whether the Bakery socket should be renamed | Kept as `SOCKET_Baker` for now |

## 9. Acceptance criteria

1. The manifest has two family H entries, `figure_otto` and `figure_mira`, both G0-required, and `node tools/asset-status.mjs` shows family H as 2.
2. No live document names the baker as anyone but Otto, or gives the schoolteacher or the theatre keeper a figure.
3. Every figure named in a document exists as a manifest entry, and every family H entry is named here.
