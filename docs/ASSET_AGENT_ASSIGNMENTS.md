# Wound Up — Asset Agent Assignments

**Project:** Wound Up
**Label:** G0 (competition build). Agents for later generations and worlds do not exist and are not planned here.
**Status:** Active proposal for the lead's approval. The agents named here are roles, started by the lead per [ASSET_PRODUCTION_ROADMAP.md](ASSET_PRODUCTION_ROADMAP.md); none is running yet.
**Date:** 2026-11-06
**Authority:** Directive Parts 7.2 to 7.4; [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §12; CLAUDE.md §10 ("Asset production agents" and the parallel execution rules); [DECISIONS.md](DECISIONS.md) ADR-031, ADR-033, ADR-037.
**Related:** [ASSET_NAMING_AND_FOLDER_STANDARDS.md](ASSET_NAMING_AND_FOLDER_STANDARDS.md), [BLENDER_PRODUCTION_GUIDELINES.md](BLENDER_PRODUCTION_GUIDELINES.md), [GLB_EXPORT_AND_VALIDATION.md](GLB_EXPORT_AND_VALIDATION.md), [ASSET_QA_CHECKLIST.md](ASSET_QA_CHECKLIST.md), [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md), [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md), [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md)

## 1. Principles

1. **One owner per file.** Every `.blend`, every GLB and every script has exactly one production owner at a time. Agents do not edit the same `.blend` at the same time (directive Part 7.4). The manifest `owner` field names the owner of each entry; the status tool prints the totals per owner.
2. **One agent per asset family**, not one per asset. The directive forbids 200 agents (Part 7.2). Five roles do the asset work; the number of Blender builders is three.
3. **The cheapest capable model.** Sonnet builds. Haiku checks. Opus reviews, and only at the points of section 6 (directive Part 7).
4. **The lead integrates.** Agents write only inside their own folders. The lead owns the manifest, the application entrypoints, `src/assets.ts`, package and CI changes, and every merge (CLAUDE.md §10 rules 4 and 9).
5. **Nothing is complete because a file exists.** An export is EXPORTED. Only the validator and a named reviewer make it VALIDATED; only the real runtime makes it INTEGRATED (ADR-037; directive Part 7.3).
6. **Agents get only what they need.** The lead gives each agent its manifest entries, the specifications and boards those entries name, and this document set, not the conversation history (CLAUDE.md §15).

## 2. The agents

| Agent | Model | Role | Starts |
|---|---|---|---|
| Lead (Agent 0) | Opus | Integration, ADRs, the manifest, the runtime asset registry, the named reviewer, final reviews. Never builds assets with Opus | Now |
| Asset framework | Sonnet | The shared pipeline: Blender library and runner, shared material library, GLB validator, manifest tooling | Now (ADR-032 accepted on 2026-11-06) |
| Mechanical library | Sonnet | Family A (gears, shafts, springs, governor, winding key, bearing, bracket, pulley, cam, follower, crank) and the family J entries when approved | Pilot entries at Stage P; the rest after Gate P |
| Machines | Sonnet | Families C, D, E and F: Music Box, Carousel, Windmill and Bakery, Clock Tower and Theatre | Pilot entry at Stage P; the rest after Gate P. The Carousel, Windmill and Clock Tower files also wait for Gate M, the Music Box end-to-end milestone (ASSET_PRODUCTION_ROADMAP §5) |
| World | Sonnet | Families B, G, H and I: trunk and workshop, Tockton environment, residents, gift and presentation | Pilot entries at Stage P; the rest after Gate P |
| Manifest checker | Haiku | Read-only naming, manifest and cross-document checks, each batch | Each batch |
| Game code agents 1 to 4 | Sonnet | `src/sim`, `src/parts`, `src/interaction`, `src/town`, `src/audio` (CLAUDE.md §10). They consume assets; they do not produce them | After shared contracts |

Production starts per family only after the pilot batch passes (CLAUDE.md §10). The pilot entries are the exception: the owners named in the manifest build them, so the pilot also tests the real hand-offs.

## 3. Who owns which entries

By the manifest `owner` field, which follows the directive's family letter:

| Family letters | Owner | Folders under `public/assets/models/` |
|---|---|---|
| A, J | Mechanical library | `shared/` mechanical families; `assets/future/shared/` for J |
| C, D, E, F | Machines | `tockton/` for music_box, carousel, windmill, bakery, theatre, clock_tower; `shared/` for cylinder, comb, pendulum, escapement |
| B, G, H, I | World | `tockton/` for trunk, workshop, environment, characters, gifts; `shared/interaction/` |

Counts per owner come from `node tools/asset-status.mjs` ("By owner"). Ownership is per file, not per folder: `shared/spring/` and `shared/cam/` each hold files of two owners (`spring_barrel` and `cam_hourly_chime` belong to Machines).

**Shared generator scripts.** `gen_spring.py` builds entries of two owners, and so does `gen_cam.py`. A script has one owner. The Mechanical library owns both; Machines runs them with its own parameters to make `spring_barrel` and `cam_hourly_chime`, and asks the Mechanical library in its handoff for any change to the script. The output files stay with the entry owner. The lead may instead move those two entries to the Mechanical library by changing their `owner` field.

## 4. File and folder ownership

| Path | Owner | Rule |
|---|---|---|
| `assets/manifest/glb-manifest.json` and its schema | Lead | Agents never edit in parallel. They report entry changes in the handoff (id, field, old value, new value, evidence) and the lead merges them (GLB_ASSET_MANIFEST §6) |
| `docs/MASTER_ASSET_INVENTORY.md`, `docs/GLB_ASSET_MANIFEST.md`, `docs/CREDITS.md`, the asset documents | Lead | Updated with the manifest |
| `tools/**` (validator, status tool, wrappers) | Asset framework | The lead adds `package.json` scripts and the CI step |
| `package.json`, CI workflows, `vercel.json`, `iwsdk.config.json` | Lead | Shared configuration (CLAUDE.md §10) |
| `blender/scripts/lib/**`, `forge.py`, `wu_common.py` | Asset framework | Shared Blender code |
| `blender/exports/**`, the M0 composition script `compose_m0_stage.py` | Asset framework | Helper output; nothing here is a deliverable |
| `blender/scripts/gen_<name>.py` | The owner of the script's entries; `gen_spring.py` and `gen_cam.py`: Mechanical library | `gen_tockton_base.py` is World's |
| `blender/source/<family>/**`, `blender/previews/<family>/**` | The owner of the entries in that family folder | Build outputs may be overwritten by their owner |
| `public/assets/models/shared/<family>/**`, `public/assets/models/tockton/<family>/**` | The owner of each entry, file by file | Section 3 |
| `public/assets/materials/**` | Asset framework | A new material name needs the lead |
| `assets/future/**` | Mechanical library, family J only | Not before delivery, and only with the owner's approval (ADR-028) |
| `src/assets.ts`, `public/scenes/*.iwsdk.scene.json` | Lead | The key is the asset id (ADR-033) |
| `src/parts/**`, `src/content/parts/**`, `src/content/blueprints/**` | Agent 2 | Part catalogue; finishes mapped to library materials; sockets in blueprint data |
| `src/town/**` | Agent 4 | Integrates the town's GLBs |
| `src/interaction/**` | Agent 3 | Uses the colliders and sockets |
| Runtime pieces F6 of the roadmap: material registry, `userData.wu` reader, angle-driven rotation, clip mixer | The lead assigns each to Agent 2, Agent 4 or himself | Not an asset production task |
| `References/**` | Read-only for everyone | Never copied into `public/` |

## 5. The roles in detail

### Lead (Agent 0, Opus)

- **Inputs:** the handoffs, validator output, the status tool, owner decisions.
- **Outputs:** manifest merges; statuses; ADRs; approval of every size whose basis is not `spec`, `measured` or `derived`; the footprint table (gaps G-07, G-08); the Music Box socket list with Agent 2 (gap G-12); the runtime pieces; the CI `dist/` check; the M0 migration (ADR-033); the Clock Tower go or no go.
- **Gates:** Gate F, Gate P and Gate C of the roadmap; the asset freeze.

### Asset framework (Sonnet)

- **Inputs:** ADR-031 to ADR-037; audits E and F; the manifest and schema; `wu_common.py`, the gear and base scripts; the validator prototype.
- **Outputs:** `blender/scripts/lib/**`, `forge.py`, the report format; the shared material library and its textures (at most 48 MiB); `tools/validate-glb.mjs` and its Vitest wrapper; maintenance of `tools/asset-status.mjs`; proposals for the manifest schema change and the npm and CI entries.
- **Gates:** Gate F. Afterwards, every change to a tool is run against the pilot GLBs and the seeded defect copy before it is handed over.

### Mechanical library (Sonnet)

- **Inputs:** its manifest entries, the specifications and boards they name, the framework.
- **Outputs:** family generators (`gen_gear_spur.py`, `gen_shaft.py`, `gen_spring.py`, `gen_structural.py`, `gen_bevel_gear.py` and the rest), sources, GLBs, reports and sheets for its entries.
- **Gates:** the stage gates of the QA checklist for each entry. First: `gear_spur_16_m1` and `governor_standard` at the pilot.
- **Order:** the library files that machines use reach VALIDATED before those machines (inventory §7).

### Machines (Sonnet)

- **Inputs:** its entries, the footprint table, the blueprint socket lists, the library files its machines use.
- **Outputs:** housings and machine parts, their sources, GLBs, reports and sheets.
- **Gates:** as above. First: `bakery_building` at the pilot. Hosts carry `SOCKET_` empties placed from the socket list; positions the lead has not confirmed are marked as proposals in the handoff.

### World (Sonnet)

- **Inputs:** its entries, the footprint table, the kits.
- **Outputs:** trunk, workshop kit, town, figures, gift box, with sources, GLBs, reports and sheets.
- **Gates:** as above. First: `figure_otto` and `tockton_base_round` at the pilot. `figure_mira` follows with the same figure kit.

### Manifest checker (Haiku, read-only)

- **Inputs:** the manifest, the file system, the documents.
- **Does:** the id pattern and the no-finish and no-version rules; filename equals `<id>.glb`; path matches label and folder table; `node tools/asset-status.mjs` shows no error or disagreement; node and material names against the manifest (until the validator covers them); every count quoted in a document equals the tool output; board names exist when `References/` is present.
- **Never:** edits a file, sets a status, or signs a visual review.
- **Output:** a short list of exceptions per batch for the lead.

### Game code agents (Sonnet)

Consume assets by id. Agent 2 coordinates with the asset agents on asset ids, sockets and collider sizes (CLAUDE.md §10). They never change a GLB; they report a defect to the lead, who sends it to the owner as REWORK_REQUIRED with a reason code.

## 6. Models and reviews

| Use | Model | Examples |
|---|---|---|
| Building | Sonnet | Every generator, every Blender source, the framework, the validator |
| Checks and repetitive metadata | Haiku | Naming checks, manifest validation, documentation cross-checks, inventory extraction, reference indexing, file audits (directive Part 7) |
| Reviews only | Opus | (1) The framework design at Gate F. (2) The pilot results and measured cost at Gate P. (3) A mechanical design review once per machine before its housing leaves Stage 1: module, tooth counts, centre distances, shaft and socket geometry. (4) A complex integration failure. (5) The final asset review on 15 November |

Opus is not used for individual Blender assets. A review of visual quality at gameplay distance (AST-08) is signed by a named reviewer who did not build the asset: the lead, or a different asset agent. The builder never reviews its own asset.

## 7. Who decides each status

The statuses are those of GLB_ASSET_MANIFEST §5. "Decides" means the role that has the evidence; the lead writes it into the manifest.

| Status | Decided by |
|---|---|
| NOT_STARTED, BLOCKED | Lead |
| IN_PROGRESS, SOURCE_READY, EXPORTED | The owner agent, by handoff |
| VALIDATING | The validator run or the named reviewer |
| VALIDATED | The validator (zero FAIL) and a named reviewer, bound to the GLB's SHA-256 |
| INTEGRATED | The integration test or the lead |
| REWORK_REQUIRED | Anyone who finds the fault; the lead records it with a reason code |

## 8. Handoff

Short, one per run, written by the owner agent for the lead:

```text
Handoff: <agent> <date> <batch>
Entries: <id>: <status before> -> <status after>
Files: source path, GLB path, SHA-256, bytes (from <family>.report.json)
Sheets: draft and final contact sheet paths
Validator: command, commit, FAIL count, answer to every WARN
Manifest changes: <id>, <field>, <old>, <new>, <evidence>
Measured: agent minutes, tokens, fix passes, machine time (required for the pilot)
Open questions: only those that need the lead or the owner
```

## 9. Conflicts and escalation

- Two agents need the same file: the owner of the file changes it; the other asks in the handoff.
- An entry is BLOCKED or a pending owner decision blocks a size: stop, report, and take the default stated in the manifest only if the entry says so.
- A board and a specification disagree: follow the specification ([ASSET_REFERENCE_MAPPING.md](ASSET_REFERENCE_MAPPING.md)).
- An asset exceeds its category budget: the lead writes an exception in the entry, or the asset is revised.
- More than two fix passes on one asset: accept with recorded WARN lines, or escalate to the lead (BLENDER_PRODUCTION_GUIDELINES §11).

## 10. Dependencies

- The manifest `owner` values (exist); the framework outputs before the family agents; Gate P before the batches; Gate M before the Carousel, Windmill and Clock Tower files.
- The lead's footprint table, socket list and runtime pieces.
- Branches or worktrees per agent (CLAUDE.md §10 rule 3); the lead merges.

## 11. Acceptance criteria

1. Every manifest entry has exactly one `owner`, and every file in the folders of section 4 is written only by its owner.
2. No script has two owners (section 3 resolves `gen_spring.py` and `gen_cam.py`).
3. No manifest edit is made by a production agent; every change arrived through a handoff.
4. No asset is VALIDATED without a builder-independent reviewer and a matching hash.
5. Opus is used only at the points of section 6.
