# Wound Up — Asset Naming and Folder Standards

**Project:** Wound Up
**Label:** Tooling for all labels. The folder scheme keeps G0 files (shipped) apart from every other label (never shipped).
**Status:** Active. This document restates ADR-033 for working agents and adds the rules inside a GLB. The status tool enforces the id, file name and path rules today; the node and material rules wait for the validator (section 8).
**Date:** 2026-11-06
**Authority:** [DECISIONS.md](DECISIONS.md) ADR-033 (names and folders), ADR-030 (what a GLB is), ADR-020 (units and axes), ADR-028 (labels). Where this document differs from an ADR, the ADR wins until it is amended.
**Related:** [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md), [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md), [BLENDER_PRODUCTION_GUIDELINES.md](BLENDER_PRODUCTION_GUIDELINES.md), [GLB_EXPORT_AND_VALIDATION.md](GLB_EXPORT_AND_VALIDATION.md), [DATA_AND_BLUEPRINT_SPEC.md](DATA_AND_BLUEPRINT_SPEC.md) §4.1, [ART_ASSET_PIPELINE.md](ART_ASSET_PIPELINE.md), [blender/README.md](../blender/README.md)

## 1. What this document fixes

Asset ids, GLB file names, folders, and the names of nodes, materials and helper empties inside a GLB. Agents building assets in parallel must produce files that load, count and validate the same way (CLAUDE.md §9: "Do not let separate agents create assets with incompatible scale, coordinate systems, material naming or pivot conventions"). The manifest ([`assets/manifest/glb-manifest.json`](../assets/manifest/glb-manifest.json)) is the source of truth for which ids exist; if this document and the manifest disagree about a path, the manifest wins and the disagreement is a defect to report.

## 2. Terms

| Term | Meaning |
|---|---|
| Asset id | The lowercase snake_case name of one GLB deliverable. It carries no finish. It is the manifest `id`, the file name without `.glb`, the `src/assets.ts` key and `PartDefinition.visual.assetId`. |
| Part id | The id of a `PartDefinition` (DATA_AND_BLUEPRINT_SPEC §4.1). It may end with a finish: `gear_spur_12_m1_brass`. Its `visual.assetId` is the asset id without the finish (`gear_spur_12_m1`) and its `visual.finish` names the library material (ADR-033). |
| Finish | A runtime material (brass, walnut and so on). It is never a file and never part of an asset id (ADR-030 item 2). |
| Family letter | A to J, the asset families of directive Part 5.2. It is the manifest `family` field. |
| Family folder | The lowercase folder name under `shared/` or `tockton/`. For mechanical parts it is a `PartFamily` value from DATA_AND_BLUEPRINT_SPEC §4 where one exists (`spur_gear`, `bevel_gear`, `shaft`, `spring`, `cam`, `follower`, `crank`, `pulley`, `escapement`, `pendulum`, `comb`, `cylinder`, `structural`). |
| Generator family | A set of parametric parts built by one script (ADR-031). A family folder and a generator family are often the same set, but not always: `gen_gear_spur.py` builds the files in `spur_gear/`. |
| World id | `shared` or `tockton` for G0. Future worlds use kebab-case ids and have no entries until the owner approves a world (ADR-028 rule 4). |
| Label | One of the eight classification labels of ADR-028. |

## 3. Asset ids

1. An id uses only `a` to `z`, `0` to `9` and `_`, starts with a letter, and has no double or trailing underscore (`^[a-z][a-z0-9]*(_[a-z0-9]+)*$`).
2. Order the words from general to specific: kind, then subtype, then size or count, then module. Examples taken from the manifest: `gear_spur_12_m1`, `gear_bevel_12`, `shaft_short`, `spring_worn`, `carousel_platform`, `windmill_sails`, `figure_otto`, `tockton_base_round`.
3. No finish or material word (`brass`, `walnut`, `velvet`, `painted`, `polished`). The finish is `visual.finish` (ADR-030).
4. No version, status or scratch word: `final`, `new`, `old`, `v2`, `latest`, `test`, `temp`, `copy`, `wip` (ART_ASSET_PIPELINE §6 forbids `final2`, `newfinal`, `test_latest`).
5. Two ids that name the same geometry are a duplicate, and the second is not made (ADR-030 item 1; validator check X01).
6. An id never changes once a blueprint, save or gift uses it (DATA_AND_BLUEPRINT_SPEC §4.1). Before that, a rename is one change that updates the id, the file name, the path, the `src/assets.ts` key, the scene JSON and the manifest together (GLB_ASSET_MANIFEST §6).
7. The module token in gear ids (`m1`) is the manifest's default. **Owner decision pending** ([decision 5](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner), gap G-16): the module value and the tooth set are open. The generator's reference module is 3.6158 mm (blender/README.md); the boards give 2 mm and 20 mm (audit B C19). Do not create gear ids beyond the manifest until the owner answers.
8. The M0 runtime keys (`gear-spur-16-brass`, `tockton-base-round`) are kebab-case and carry a finish. They retire in the migration of section 7; no new key uses that form.

## 4. Folders

```text
assets/
  manifest/glb-manifest.json, glb-manifest.schema.json   machine-readable manifest
  future/<world_id>/<family>/                            every GLB that is not G0 (never shipped)
blender/
  scripts/                gen_<name>.py generators, the runner and lib/ (section 6)
  source/<family>/        .blend sources
  previews/<family>/      contact sheets and the family report (build output, not deliverables)
  exports/                helper output; nothing here ships or is in the manifest
  README.md
public/assets/
  models/shared/<family>/    G0 GLBs reusable by any world
  models/tockton/<family>/   G0 GLBs specific to Tockton
  materials/                 shared material library textures (ADR-032)
  xr/generic-hand/           third-party hand models (not deliverables)
References/                  reference boards; working folder, not in git, never shipped (ADR-017)
```

Rules:

1. **Path follows the label.** A G0-required or G0-optional GLB lives under `public/assets/models/shared/` or `public/assets/models/tockton/`. Every other GLB lives under `assets/future/<world_id>/<family>/`, because Vite copies all of `public/` into the build (ADR-033; audit D §5). `tools/asset-status.mjs` fails a mismatch.
2. **`shared` or `tockton`.** `shared` is for a file another world could use unchanged and that carries no Tockton identity; everything with a Tockton identity goes under `tockton/`. The manifest flag `reuseEligible` is separate: it can be true for a file under `tockton/` (for example `workbench`), so it does not decide the folder.
3. **One path per GLB.** A file never exists at two paths (validator check X01). Moves happen in one change (section 7).
4. **Sources.** A hand-modelled asset is `blender/source/<family>/<asset_id>.blend`. A parametric family's generator script and its manifest entries are the source; a `.blend` the runner saves is for inspection and is not hand-edited (ADR-033).
5. **No dead folders.** A new family folder is created only by the first manifest entry that needs it.

Family folders in the manifest on 2026-11-06 (derived from every `glbPath`; the manifest wins if it changes):

| Under | Family folders |
|---|---|
| `public/assets/models/shared/` | `spur_gear`, `bevel_gear`, `shaft`, `spring`, `governor`, `winding_key`, `structural`, `pulley`, `cam`, `follower`, `crank`, `cylinder`, `comb`, `pendulum`, `escapement`, `interaction` |
| `public/assets/models/tockton/` | `music_box`, `carousel`, `windmill`, `bakery`, `theatre`, `clock_tower`, `trunk`, `workshop`, `environment`, `characters`, `gifts` |
| `assets/future/shared/` | `ratchet`, `pawl`, `flywheel`, `coupling`, `worm_gear` |

`governor`, `winding_key`, `interaction` and the five future folders are not `PartFamily` values. The inventory records this as gap A-01; the lead either adds them to `PartFamily` or maps them to `structural`. Until then the folder names above stand.

## 5. Names inside a GLB

| Element | Rule | Examples | Basis |
|---|---|---|---|
| Root node | The exported selection has one top-level node. For a single-mesh part the root is the mesh node and its helper empties are its children. For a multi-node asset the root is an Empty and everything else is its child. The root carries the custom property `wu` with at least `id` (the asset id) and `family` (the family folder). | `GearSpur16_M1`; `WindmillSails` (Empty) with `WindmillSails_Blade`, `WindmillSails_Hub`, `WindmillSails_Cap` | Audit E §3; validator checks V27 and V23 |
| Mesh and node names | `PascalCase_Underscore`: an asset word group, then optionally an underscore and a detail word group. Unique in the file. Node name equals mesh name. Listed in the manifest `meshes`. No Blender suffixes (`.001`). No finish. | `Governor_Frame`, `Governor_Weights`, `Bakery_Shell`, `Parcel_Flap`, `Otto_Body` | Validator V25 and V26; manifest `meshes` |
| Materials | `Mat_<Name>`, taken from `meta.materialLibrary` in the manifest (three exist, the rest are proposed). A new name needs the lead, a library entry and a texture set. No `.001`, no `_Final`. | `Mat_AgedBrass`, `Mat_Walnut`, `Mat_VelvetTeal` | ADR-032; validator V30 |
| Collider empties | `COL_<Purpose>`; `wu.type = "collider"`; shape and purpose in `wu`; size is the empty's scale in metres. | `COL_Grab`, `COL_Case`, `COL_Open` | Audit E §3; ADR-033 |
| Secondary pivots | `PIV_<Name>`; `wu.type = "pivot"`, `kind`, `axis`. The mesh origin is the main pivot. | `PIV_Flap` | Audit E §3 |
| Sockets | `SOCKET_<Name>`; `wu.type = "socket"`, `accepts` (asset ids or families). Position is the node translation; the mating axis is the node's +Z. | `SOCKET_Baker` | Audit E §3; validator V62 |
| Clips | `<Asset>_<Action>`. One-shot motion only. Continuous rotation is never a clip. | `Otto_Knead`, `Parcel_Open` | ADR-030 item 4 |
| UV map | `UVMap`, one per mesh. | | blender/README.md |
| Vertex colour | One colour attribute, exported as `COLOR_0`, holding ambient occlusion. | | ADR-032; audit E §2.2 |
| Custom attributes | Only names starting with `_` are exported; use none unless a spec needs one. | | Audit E §2 |

Runtime code finds helper nodes by name prefix and `userData.wu.type`, never by child index: the exporter orders children alphabetically (audit E §3).

Finishes, state words (`frozen`, `awake`) and version words never appear in a node name. Frozen and awakened looks are runtime material states, not separate files or nodes (manifest notes for `bakery_building`).

## 6. Names of Blender-side files

| What | Name | Notes |
|---|---|---|
| Hand-modelled source | `blender/source/<family>/<asset_id>.blend` | Source of record (ADR-033). |
| Authoring script | `blender/scripts/gen_<name>.py`, where `<name>` is the generator family (`gen_gear_spur.py`) or the hand-modelled asset (`gen_tockton_base.py`) | The manifest `blenderSource` is authoritative. A hand-modelled `.blend` is built by a committed script so it can be regenerated; if a person later edits the `.blend` in the GUI, the script is deleted in the same commit and the manifest `notes` say so. |
| Runner | `blender/scripts/forge.py` | To be built by the Asset framework agent (BLENDER_PRODUCTION_GUIDELINES §4). |
| Shared Blender code | `blender/scripts/lib/*.py` | To be built; `wu_common.py` stays until the framework agent splits it. |
| Contact sheets | `blender/previews/<family>/<family>_sheet_draft.png`, `..._sheet_final.png` | Proposal; the framework agent confirms the layout at Gate F ([ASSET_PRODUCTION_ROADMAP.md](ASSET_PRODUCTION_ROADMAP.md)). |
| Family report | `blender/previews/<family>/<family>.report.json` | Written by the runner: ids, paths, SHA-256, sizes, counts, QA results. |

## 7. The two M0 files

From ADR-033. Both fail the new rules today, so they are regenerated by their family generator and then moved. Until each replacement passes the validator, the M0 files stay where they are so the current build keeps working.

| Today | Becomes |
|---|---|
| `public/assets/models/props/gear_spur_16_brass.glb`, key `gear-spur-16-brass`, source `blender/source/gear_spur_16_brass.blend` | `public/assets/models/shared/spur_gear/gear_spur_16_m1.glb`, regenerated with the ADR-032 profile (it fails the part budget today: 16 MiB of textures and 2.38 MB) |
| `public/assets/models/environment/tockton_base_round.glb`, key `tockton-base-round`, source `blender/source/tockton_base_round.blend` | `public/assets/models/tockton/environment/tockton_base_round.glb`, source `blender/source/environment/tockton_base_round.blend`, regenerated to fit the before-Enter GLB budget |

The lead then moves each in a single change that updates `src/assets.ts` (the key becomes the asset id), `public/scenes/main.iwsdk.scene.json`, `blender/README.md` and the manifest together, and deletes the old file. The helper files `blender/exports/variants/gear_spur_{12,24}_brass.glb` are not deliverables and never go under `public/`.

## 8. Who checks what

| Rule | Checked by | State |
|---|---|---|
| File name is `<id>.glb`; path is under the folder for the label; G0 worlds are `shared` or `tockton`; ids and paths unique; no GLB on disk without an entry | `node tools/asset-status.mjs` | Exists |
| Id pattern, no finish word, no version word | Manifest checker (Haiku) each batch; later a validator or Vitest check | Manual until built |
| Node names, root node, required nodes, material names | Validator V25, V26, V27, V30 ([GLB_EXPORT_AND_VALIDATION.md](GLB_EXPORT_AND_VALIDATION.md)) | Prototype covers V25, V26, V30; V27 is new |
| `dist/` holds only G0 manifest entries and the world `tockton` | CI check owned by the lead (ADR-033) | Not built |
| Runtime key equals asset id | Integration test (AST-06) | Not built |

## 9. Dependencies

- The manifest and its schema (exists) and `tools/asset-status.mjs` (exists).
- ADR-033 for the folder scheme; DATA_AND_BLUEPRINT_SPEC §4.1 for part ids.
- The validator and the `dist/` CI check (lead) before sections 5 and 8 are fully enforced.
- Owner decision 5 for the module token and the tooth set.

## 10. Acceptance criteria

1. Every manifest id matches the pattern in section 3 and has no finish or version word. The Manifest checker reports zero exceptions.
2. `node tools/asset-status.mjs` prints "Manifest checks: no errors" and no disagreements.
3. Every `glbPath` lies in a folder of section 4, and no GLB under `public/` belongs to an entry that is not G0.
4. Every validated GLB passes V25, V26, V27 and V30 with no exception.
5. After the migration of section 7, no GLB exists at two paths and `src/assets.ts` uses asset ids only.
