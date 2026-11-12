# Wound Up — GLB Asset Manifest

**Project:** Wound Up
**Label:** Tooling for all labels (G0 and later); the manifest holds entries of every label
**Status:** Active. The manifest, its schema and the status tool exist. The GLB validator (ADR-037) and the runtime asset registry do not.
**Date:** 2026-11-06
**Files:** [`assets/manifest/glb-manifest.json`](../assets/manifest/glb-manifest.json), [`assets/manifest/glb-manifest.schema.json`](../assets/manifest/glb-manifest.schema.json), [`tools/asset-status.mjs`](../tools/asset-status.mjs)
**Related:** [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md), [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md), [DECISIONS.md](DECISIONS.md) ADR-028, ADR-030, ADR-033, ADR-034, ADR-037, [directive Part 5.1 and 8](directives/2026-11-05_PRODUCTION_DIRECTIVE.md), [audit F](audits/F_QA_PERFORMANCE.md) §2.3 and §6.2

## 1. What the manifest is

The manifest is one JSON file that lists every GLB the game needs, one entry per distinct deliverable. It is the single answer to "how many assets, who owns them, what do they depend on, and how far along are they". It is machine-readable so a tool can count progress from the file system instead of from memory (directive Part 8: "never manually guessed").

- The JSON is the source of truth. [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md) is a readable snapshot of it. If they differ, the JSON wins.
- The schema is the contract for the JSON (JSON Schema draft-07).
- `tools/asset-status.mjs` reads the JSON and the files on disk and prints the progress summary.
- It does not replace the GLB validator. The validator (ADR-037, owned by the Asset framework agent, not built yet) inspects the GLB itself. Only the validator and a named reviewer may set VALIDATED.

What it counts: 68 entries today (43 G0-required, 20 G0-optional, 5 future). The owner approved the inventory as the current audited count, not as a target; it was 71 before three entries were removed by owner decision on 2026-11-06 (ADR-039). Those three are kept in `meta.removedByOwnerDecision` and are not counted. One entry is one distinct mesh set with its own purpose. A finish is a runtime material, a repeated piece is an instance, and no assembled-machine file repeats part geometry (ADR-030). Third-party GLBs (the hand models) are listed in `thirdParty` and not counted.

## 2. Layout of the JSON

| Key | Content |
|---|---|
| `schemaVersion` | 1. Bump it only with a schema change and a migration note here. |
| `meta` | Project, review date, the eight classification labels, the counting rules, budget basis, size convention, `globalReferences`, the shared `materialLibrary` (three existing names, the rest proposed), `futureWorlds` (ids only), `scopeClasses` (the four asset classes with one rule each, section 4), `potentialAdditions` (open decisions that would add files), and `removedByOwnerDecision` (entries the owner deleted: id, display name, former classification and status, reason, ADR and date; never counted). |
| `thirdParty` | Shipped GLBs we did not make. Not counted. The tool checks they exist. |
| `machineSlotPlans` | For the Music Box, Carousel, Windmill and Clock Tower: the spec-fixed slot count against the files that fill it, with conflicts and unmapped slots recorded instead of invented parts. |
| `assets` | The entries. |

## 3. Entry fields

Every field is required except `placeholder`, `blockedBy`, `ownerDecisionPending`, `futureGroup`, `validationEvidence`, `verified`, `legacy` and `glbSha256`. The schema lists the exact set; unknown fields are rejected.

| Field | Meaning and rule |
|---|---|
| `id` | Unique, stable asset id: lowercase snake_case, no finish, no version word (ADR-033). Equals the file name without `.glb`, the `src/assets.ts` key and `PartDefinition.visual.assetId`. Never changes once a blueprint, save or gift uses it (DATA_AND_BLUEPRINT_SPEC §4.1). |
| `filename` | Always `<id>.glb`. |
| `displayName` | Human name. |
| `category` | Budget key from ADR-034: `tiny_fastener`, `gear`, `mechanical_part`, `machine_housing`, `building`, `hero_tower`, `character`, `prop`, `environment_set`. |
| `family` | Directive Part 5.2 family A to J. |
| `productionClass` | Effort class of audit E §5.4: A1, A2, B, C, D, E. |
| `production` | `parametric_family` (generator script, ADR-031) or `hand_modelled` (a `.blend`, ADR-007). |
| `description` | What the object is. |
| `gameplayPurpose` | Why the game needs it. |
| `contains` | What the GLB actually holds (ADR-030 item 6): the mesh set, named nodes and whether it is one piece or a group. |
| `distinctBecause` | Why it is not a duplicate or finish variant of another entry (audit F X02, X05). |
| `classification` | One label from ADR-028: `G0-required`, `G0-optional`, `G1 Living Tockton`, `G2 Advanced engineering`, `G3 Creative sandbox`, `G4 Community`, `G5 Clockwork universe`, `Research`. Exactly one. |
| `worldId` | `shared`, `tockton`, or a future world id in kebab-case. Only `shared` and `tockton` are allowed for G0. |
| `sharedOrWorldSpecific` | `shared` when `worldId` is `shared`, otherwise `world-specific`. |
| `reuseEligible` | True if another world could use the file unchanged. Independent of the folder: a file with a Tockton identity can be reuse eligible (for example `workbench`), so it does not decide `shared` or `tockton` (ASSET_NAMING_AND_FOLDER_STANDARDS section 4). |
| `scopeClass` | Which of the directive's four asset classes the entry is (world-by-world strategy, "Production discipline": shared assets, world-specific assets, reused assets and future planned assets). One of `shared`, `world-specific`, `reused`, `future-planned`. It is derived, never judged: not G0-required or G0-optional is `future-planned`; otherwise `worldId` `shared` is `shared`, and an entry with a world's identity is `reused` when `reuseEligible` is true and `world-specific` when it is false. The rules are in `meta.scopeClasses`; the schema and `tools/asset-status.mjs` both reject a value that disagrees with `classification`, `worldId` and `reuseEligible`, so a change to any of those three changes `scopeClass` in the same edit. Section 4 explains the four classes and what is counted. |
| `worldVisualRequirements` | Optional. World-specific visual requirements (directive, multiple-worlds requirement section 7). Absent for shared and Tockton entries: their look is the global Art Direction board in `meta.globalReferences` and PROJECT_BIBLE.md sections 4 and 5. A future world's entry would state its palette, materials and silhouette rules here. |
| `relatedMachineOrEnvironment` | The machine, building or scene it belongs to. |
| `specExists` | A written specification names the item or fixes its function. If true, `specifications` is not empty. |
| `boardExists` | At least one reference board shows it. Must equal `references.length > 0`. |
| `references` | Board file names in `References/`. Appearance only; the written spec wins (ADR-029). The tool checks the names when the folder is present. |
| `specifications` | Governing documents and sections (strings such as `PRODUCT_SPEC.md section 6.1`, `DECISIONS.md ADR-030`). |
| `blenderSource` | Parametric family: the generator script (`blender/scripts/gen_<family>.py`). Hand-modelled: `blender/source/<family>/<id>.blend` (ADR-033). |
| `glbPath` | Target path. G0 files under `public/assets/models/shared/<family>/` or `public/assets/models/tockton/<family>/`; everything else under `assets/future/<world>/<family>/` so Vite never ships it (ADR-033). |
| `meshes` | Required named nodes, `PascalCase_Underscore`. Proposals until Stage 1 fixes them. Empty only while the entry is unresolved. |
| `materials` | Names from `meta.materialLibrary` (`Mat_...`), at most `budgets.materials`. Constant-value proxies only (ADR-032). |
| `animations` | One-shot glTF clip names. Continuous rotation is never a clip: it comes from the solver (ADR-030 item 4). |
| `runtimeMotion` | How the node moves at run time, or null. |
| `colliders` | `COL_` empties the GLB must contain (ADR-033), with shape and minimum radius (INTERACTION_SPEC §7.2: at least 0.012 m). |
| `originAndPivot` | Where the origin sits and which axis a rotating part turns about (ADR-020). |
| `approxDimensionsM` | `[x width, y height, z depth]` in glTF axes, metres. `null` or a `null` axis when unspecified. |
| `dimensionsBasis` | Where the size comes from: `spec`, `measured`, `derived`, `board`, `unspecified`. Board sizes are appearance only (ADR-029). |
| `scaleConvention` | Units and authoring scale (ADR-020). |
| `budgets` | ADR-034 category ceilings: `triangles`, `primitives`, `materials`, `textureMiB`, `glbKB`. Ceilings, not allowances; Stage 1 sets the allowance. |
| `dependencies` | Asset ids that must reach VALIDATED first or that this file is fitted to. No cycles; the tool checks. |
| `usedBy` | Machine slots or scenes that consume the file. |
| `owner` | Exactly one production owner (directive Part 7.4): `Mechanical library`, `Machines`, `World`, `Asset framework`, `Manifest checker` or `Lead` (PRODUCTION_AUDIT §12). |
| `priority` | Rank 1 to 11. 1 to 10 are the ART_ASSET_PIPELINE §18 order (1 trunk, 2 workbench, 3 Music Box, 4 essential mechanical parts, 5 town base and plots, 6 Bakery and Windmill, 7 Carousel, 8 gift box, 9 supporting props, 10 Clock Tower and optional); 11 is after the competition. |
| `status` | One of the nine statuses in section 5. |
| `validationStatus` | `NOT_RUN`, `FAIL`, `WARN` or `PASS`: the result of the official validator (ADR-037). |
| `integrationStatus` | `NOT_INTEGRATED` or `INTEGRATED` (loaded by the real runtime from a registry or scene). For the two M0 entries it describes the legacy file until the regenerated file is at `glbPath`; the tool reports them as "legacy M0 file loaded", and its Integrated line counts status INTEGRATED only (`meta.countingRules`). |
| `placeholder` | True when the entry records a spec-fixed need whose identity is undecided. Counted in the total and in Blocked; never an identified deliverable. |
| `blockedBy` | Required when `status` is BLOCKED: the gap, conflict or decision that holds it. |
| `ownerDecisionPending` | Pending owner decisions that affect the entry, with a link target in PRODUCTION_AUDIT. |
| `futureGroup` | Directive Part 5.2 J group, for future entries. |
| `validationEvidence` | Where a FAIL or PASS came from. |
| `verified` | `desktop`, `iwer`, `questBrowser`, `quest3`, `quest3s`, each true or false. Kept separate (directive Part 12). Nothing is true for Quest today. |
| `legacy` | For the two M0 files: the old paths, hash, byte size, runtime key and scene node. The tool checks they still exist and still match the hash. |
| `glbSha256` | SHA-256 of the GLB at `glbPath`. Required for VALIDATED and INTEGRATED; validation is bound to the hash (ADR-037). |
| `licence` | Original, or the third-party licence and a row in CREDITS.md. |
| `notes` | Decisions, caveats and what is unverified. |

Directive Part 5.1 lists 27 fields; every one is present: unique id, filename, display name, category, description, gameplay purpose, classification, related machine or environment, reference, specification, Blender source path, GLB path, meshes, materials, animations, colliders, origin and pivot, dimensions, scale convention, polygon, texture and material budget, dependencies, owner, status, validation status and integration status. The multiple-worlds requirement (section 7) adds `worldId`, `sharedOrWorldSpecific`, `family`, `reuseEligible` and the optional `worldVisualRequirements`. The extra fields (`contains`, `distinctBecause`, `specExists`, `boardExists`, `productionClass`, `dimensionsBasis`, `blockedBy`, `legacy` and the rest) carry the audit's rules: audit F §2.3 (`distinctBecause`, `verified`, `legacy` evidence) and ADR-030 item 6 (`contains`).

## 4. Rules that make an entry valid

1. **Distinct.** The entry has a `distinctBecause` sentence. No finish variants, no duplicate exports, no splitting for its own sake (directive Part 5).
2. **Traceable.** Each entry cites at least one specification section, ADR or board, and states `specExists` and `boardExists` truthfully.
3. **Path by label.** G0-required and G0-optional files live under `public/assets/models/shared/` or `public/assets/models/tockton/`. Every other file lives under `assets/future/`. The tool fails a mismatch, because Vite copies all of `public/` into the build (ADR-033).
4. **One owner.** One production owner per entry; agents write only in their own family folders.
5. **No invented numbers.** A size not in a spec is `board`, `derived` or `unspecified`, never `spec`. A part list not in a spec is marked provisional.
6. **Blocked says why.** `BLOCKED` needs `blockedBy`. A placeholder has no meshes and no size.
7. **Materials from the library.** Names come from `meta.materialLibrary`; the entry may use no more than `budgets.materials`.
8. **Dependencies resolve and do not loop.**
9. **Validated is bound to a hash.** VALIDATED and INTEGRATED need `glbSha256`; a changed GLB drops back to EXPORTED.
10. **One scope class.** Every entry has exactly one `scopeClass`, derived as the table below shows. The directive requires the manifest to "distinguish shared assets, world-specific assets, reused assets and future planned assets", with counts "based on unique deliverables, never inflated through material or colour variants" (world-by-world strategy, "Production discipline"). `classification` and `worldId` alone could not say "reused", so `scopeClass` was added on 2026-11-06 as the smallest field that does.

| `scopeClass` | Rule (first match wins, in this order) | Examples today | Counted |
|---|---|---|---|
| `future-planned` | `classification` is not `G0-required` or `G0-optional` | `ratchet_wheel`, `worm_gear` | Once, outside the competition scope. Not made before delivery (ADR-028) |
| `shared` | G0 and `worldId` is `shared` | `gear_spur_16_m1`, `shaft_short` | Once. Every world uses the one file |
| `reused` | G0, `worldId` is a world, and `reuseEligible` is true | `workbench`, `gift_box` | Once, under its own world. Another world uses the same file as a dependency and never gets a copy. If a second world really needs it, the lead may reclassify it as `shared` (CROSS_WORLD_GAMEPLAY section 5) |
| `world-specific` | G0, `worldId` is a world, and `reuseEligible` is false | `trunk_main`, `bakery_building` | Once. It carries one world's identity |

The four counts add up to the total, because each entry has one class. Material finishes and colour variants are runtime materials and are never entries (ADR-030), so no class is inflated by them. A future world's entries would carry its `worldId` and class `future-planned` until the world is scheduled, and shared library files are referenced by id, never copied into that world's folder (world-by-world strategy, "Asset reuse").

## 5. Statuses

The nine statuses are the directive's (Part 5.1). The evidence needed to enter each follows audit F §6.2.

| Status | Meaning | Evidence to enter | Who sets it |
|---|---|---|---|
| NOT_STARTED | Planned, no source. | Entry complete. | Lead |
| BLOCKED | Cannot start: an open decision decides whether it exists or what it is. | `blockedBy` states the decision. | Lead |
| IN_PROGRESS | Stage 1 or 2 open (specification, modelling). | Owner named; sizes proposed and approved by the lead. | Owner agent |
| SOURCE_READY | Source exists and rebuilds; row complete. | `.blend` or generator committed; category, size, origin, pivots, materials, label set; reference approved; clay shape-review render for hero assets; licence noted. | Owner agent |
| EXPORTED | GLB produced by the generator. | Generator exits 0; path matches; SHA-256 and byte size recorded; no hand edits. | Owner agent |
| VALIDATING | A check or review is open. Time-boxed to 48 hours; no result sends it back to EXPORTED. | Validator run started; reviewer named. | Validator or reviewer |
| VALIDATED | All automated checks pass and reviews are signed. Bound to the file hash. | AST-01 to AST-05 pass; WARN lines read; previews rendered from the re-imported GLB; AST-07 for moving parts; AST-08 sign-off. | Validator and a named reviewer only |
| INTEGRATED | Loaded by the real runtime. | AST-06 and AST-09 to AST-12 pass; no console errors; scene budgets hold with it in place; id referenced from `src/assets.ts` or content data. | Integration test or the lead only |
| REWORK_REQUIRED | A gate failed or a later regression was found, or the file predates the pipeline. | Reason code and owner: VAL_FAIL, REVIEW_FAIL, BUDGET_BREACH, INT_FAIL, REGRESSION, SPEC_CHANGE. Returns to SOURCE_READY if the source changes, EXPORTED if only the export changes. | Anyone who finds it; the lead records it |

Counting for the dashboard: "delivered" is EXPORTED or later, "accepted" is VALIDATED or later, "in the game" is INTEGRATED. The tool's Part 8 summary keeps REWORK_REQUIRED as its own line, because a file can exist and be integrated in a build and still fail the rules.

The two M0 files are REWORK_REQUIRED with `validationStatus: FAIL` and `integrationStatus: INTEGRATED`: they run in the M0 scene at their old paths, and fail ADR-032 and ADR-034.

**Verification levels are separate from status** (directive Part 12): Desktop, IWER, Quest Browser, Quest 3, Quest 3S. An entry can be INTEGRATED with Desktop and IWER evidence only. Nothing is Quest-verified, and nothing may be recorded as Quest-verified without test evidence from a named tester.

## 6. How to update the manifest

**Who.** Production agents do not edit the manifest in parallel. They report entry changes in their handoff (id, field, old value, new value, evidence) and the lead merges them (CLAUDE.md, asset production agents). The Manifest checker is read-only.

**Every change.**

1. Edit `assets/manifest/glb-manifest.json`: two-space indent, field order as in the file, LF line endings, trailing newline.
2. Run `node tools/asset-status.mjs`. It must print no manifest errors and no disagreements.
3. Update the affected row and the counts in [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md). It is a snapshot; no script in the repository regenerates it.
4. Record any decision in [DECISIONS.md](DECISIONS.md).

**Common changes.**

- **Add an entry.** Only if the file is genuinely distinct (ADR-030). Fill every required field, write `distinctBecause`, cite a spec, ADR or board, pick the single owner and label, set the path by label, add dependencies. Never reuse an id.
- **Start work.** NOT_STARTED to IN_PROGRESS when the owner begins Stage 1; the lead approves the size and pivots first.
- **Record an export.** Set EXPORTED, record the new `glbSha256`; the tool then checks the file and the source exist.
- **Validate.** Set VALIDATED only after the validator passes with zero FAIL and the reviewer signs; set `validationStatus` PASS and keep the hash. If the GLB changes, the hash no longer matches and the tool reports it.
- **Integrate.** Set INTEGRATED after the real runtime loads it under the integration tests; set `integrationStatus` INTEGRATED.
- **Resolve a BLOCKED entry.** Record the decision in DECISIONS.md, remove `blockedBy` and `placeholder`, set NOT_STARTED, fill the meshes and size. If the need disappears, delete the entry, add it to `meta.removedByOwnerDecision` with the owner's decision, and say so in the commit message.
- **Split or merge housing files.** A blueprint that makes board rows separate player-placed slots splits a housing file; update `machineSlotPlans` and the counts.
- **Change a label.** Moving an item into G0-required needs an owner decision in DECISIONS.md (ADR-028, directive Part 3). Moving between G0 and later labels also moves `glbPath` between `public/` and `assets/future/`.
- **Rename.** Not after a blueprint, save or gift uses the id (DATA_AND_BLUEPRINT_SPEC §4.1). Before that, change the id, filename, path, `src/assets.ts` key and every reference together.
- **Move the M0 files.** One lead change updates `src/assets.ts`, the scene JSON, `blender/README.md` and the manifest, and deletes the old file, so no GLB exists at two paths (ADR-033).
- **Add a world.** Not before the owner approves it (ADR-028 rule 4). See [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md).

**Optional full schema check.** The tool checks required fields, enums, unknown fields and the rules in section 4. For a complete draft-07 check, any validator works; `ajv` version 6 is installed by ESLint (not a project dependency) and passes the current file:

```bash
node -e "const A=require('ajv');const v=new A({allErrors:true,schemaId:'auto'}).compile(require('./assets/manifest/glb-manifest.schema.json'));console.log(v(require('./assets/manifest/glb-manifest.json'))?'valid':v.errors)"
```

## 7. The status tool

```bash
node tools/asset-status.mjs               # summary, counts, disagreements
node tools/asset-status.mjs --list        # also one line per entry
node tools/asset-status.mjs --json        # machine-readable
node tools/asset-status.mjs --report-only # always exit 0
node tools/asset-status.mjs --manifest <path>
```

No dependencies; Node 20 or newer. It never writes a file and never sets a status.

**It checks**

- Required fields, enum values and unknown fields (read from the schema).
- Unique ids and paths; `filename` is `<id>.glb`; G0 paths under `public/assets/models`, all others under `assets/future`; G0 worlds only `shared` or `tockton`.
- `boardExists` against `references`; `specExists` against `specifications`; BLOCKED has `blockedBy`; materials in the library and within the budget; board names exist in `References/` when that folder is present.
- Dependencies resolve and have no cycle; slot-plan rows equal the declared slot count and point at real entries.
- File state against status: a NOT_STARTED, BLOCKED or IN_PROGRESS entry must have no GLB; SOURCE_READY needs the source; EXPORTED and later need the GLB and the source; VALIDATED and INTEGRATED need a matching `glbSha256`; REWORK_REQUIRED with `legacy` needs the old files unchanged.
- Orphans: any `.glb` under `public/assets` or `assets/future` that no entry or `thirdParty` row owns.
- Removed entries: each `meta.removedByOwnerDecision` row has all its fields, and its id is not also an entry.
- Scope class: each entry's `scopeClass` equals the value derived from `classification`, `worldId` and `reuseEligible` (section 4, rule 10), `sharedOrWorldSpecific` agrees with `worldId`, and the four class counts add up to the total. The summary prints "By scope class (unique deliverables)", and `--json` carries the same figures as `counts.byScopeClass`.

**It does not** open a GLB, count triangles, check pivots or materials inside the file, render anything or run in an engine. That is the validator (ADR-037). Exit code 1 means a manifest error or a disagreement; 0 means none (or `--report-only`).

A `package.json` script (for example `assets:status`) is the lead's to add; this tool did not edit `package.json`.

## 8. Current output

Captured on 2026-11-06 from the manifest and the working tree (`node tools/asset-status.mjs`):

```text
Manifest: ./assets/manifest/glb-manifest.json  (schema 1, reviewed 2026-11-06)

Progress (directive Part 8)
  Total planned assets:                 68
  Removed by owner decision:             3
  Existing validated:                    0
  In production:                         0
  Exported, awaiting validation:         2
  Rework required (files exist):         2
  Blocked:                               6
  Not started:                          58
  Integrated (status INTEGRATED):        0
    legacy M0 file loaded:               2
  (4 of 68 entries have a GLB on disk; 4 are placeholders; 2 of 2 third-party GLBs present, not counted)

Competition scope
  G0-required:                          43
    of which blocked:                    4
    of which with a GLB on disk:         4
  G0-optional:                          20
    of which blocked:                    2
  Future (G1 to Research):               5

By label
  G0-required:                          43
  G0-optional:                          20
  G2 Advanced engineering:               5

By family
  A:                                    19
  B:                                     9
  C:                                     5
  D:                                     6
  E:                                     5
  F:                                    11
  G:                                     4
  H:                                     2
  I:                                     2
  J:                                     5

By scope class (unique deliverables)
  shared:                               28
  world-specific:                       29
  reused:                                6
  future-planned:                        5

By world
  shared:                               33
  tockton:                              35

By owner
  Machines:                             27
  Mechanical library:                   24
  World:                                17

By status
  NOT_STARTED:                          58
  BLOCKED:                               6
  EXPORTED:                              2
  REWORK_REQUIRED:                       2

Status against files: all entries agree with the files on disk
Manifest checks: no errors
```

How to read it. "By scope class" counts each entry once, in the one class of section 4; the four lines add up to the total, and the future-planned entries are the same entries as "Future (G1 to Research)" above. "Existing validated" is 0 because the validator does not exist yet. "Rework required (files exist)" is the two M0 files. "Blocked" counts 6 entries that wait for a decision, of which 4 are placeholders. "Removed by owner decision" counts the entries in `meta.removedByOwnerDecision`; they are outside the total. The "entries have a GLB on disk" figure is the real file count; it is derived from the file system, not typed in. "Integrated (status INTEGRATED)" is 0 because no regenerated file has been integrated; "legacy M0 file loaded" is the 2 entries whose `integrationStatus` is INTEGRATED because the M0 scene loads their old files.

## 9. Limits and unverified

- The tool was run against the manifest and against mutated copies (a missing GLB, a missing source, a changed legacy hash, a bad dependency, a wrong label, a wrong or missing `scopeClass`). It reported each one, and the schema (checked with ajv) rejected the wrong `scopeClass` values too. It has not been run in CI.
- `References/` is not in git, so a fresh clone cannot check board names; the tool says so.
- Hash checks cover the GLB at `glbPath` and the `legacy` GLB; they do not cover the `.blend` sources.
- Two real exports exist (`gear_spur_12_m1` and `gear_spur_24_m1`, status EXPORTED), so the EXPORTED path of the tool has run on real files. The VALIDATED and INTEGRATED paths are still tested only on constructed cases, not on real exports.
- Quest 3 and Quest 3S verification is not recorded anywhere because no headset or tester exists.

## 10. Acceptance criteria

1. `node tools/asset-status.mjs` exits 0 on the working tree.
2. The manifest passes the schema.
3. Every entry has one `scopeClass`, and the four class counts of section 8 add up to the total (directive, world-by-world strategy, "Production discipline").
4. The counts in section 8 equal the counts in [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md) section 1.
5. No entry is VALIDATED without a matching hash, and none is Quest-verified without evidence.
6. Every entry traces to a spec section, ADR or board.
