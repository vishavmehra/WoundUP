# Wound Up — Production Audit (2026-11-06)

**Purpose:** the consolidated audit the owner's production directive asks for before any documentation expansion or mass GLB production. It condenses six independent audits and a completeness critic. Detail and evidence live in the source reports:

| Report | Scope | Model |
|---|---|---|
| [audits/A_DOCUMENTATION.md](audits/A_DOCUMENTATION.md) | Requirements map, asset requirements in the specs, doc conflicts, coverage of the 30 requested documents | Sonnet |
| [audits/B_REFERENCES.md](audits/B_REFERENCES.md) | All 27 boards in `References/`, opened one by one | Haiku |
| [audits/C_EXISTING_ASSETS.md](audits/C_EXISTING_ASSETS.md) | Every GLB, .blend and texture in the repo | Haiku |
| [audits/D_WEBXR_ARCHITECTURE.md](audits/D_WEBXR_ARCHITECTURE.md) | Modules, IWSDK asset loading, spatial APIs, world loading, performance | Sonnet |
| [audits/E_BLENDER_PIPELINE.md](audits/E_BLENDER_PIPELINE.md) | Headless Blender, exporter, measured costs, capacity | Sonnet |
| [audits/F_QA_PERFORMANCE.md](audits/F_QA_PERFORMANCE.md) | GLB validator, budgets, verification levels, asset gates, page speed | Sonnet |

Rule used throughout: written specifications win over reference boards for numbers, mechanics and gameplay (owner directive, Part 1).

## 1. Existing project status

Milestone M0 (WebXR foundation) is nearly done. The repository is `vishavmehra/wound-up` (private), `main` at four commits, with a large uncommitted working set from 2026-11-05/06 (stand changes, render budget, docs). Vercel project `wound-up` deploys static builds; the public URL still sits behind Vercel Authentication and shows an older build.

## 2. Implemented functionality

| Area | State | Evidence level |
|---|---|---|
| Entry screen, WebXR detection, AR/VR entry, exit back to the page | Implemented | Desktop and IWER verified |
| Floating stand, 38 cm below the eyes, kept through the system menu, re-placed on recentre | Implemented | Unit and IWER verified |
| One grabbable gear (hands in XR, mouse in the 2D preview) that settles back | Implemented | Desktop and IWER verified |
| Self-hosted hand models, no runtime third-party requests | Implemented | IWER verified |
| Render budget: no drawing behind the landing, 60 fps cap and adaptive resolution in the preview | Implemented | Desktop verified on Intel UHD |
| Checks | 16 unit tests, 3 landing and 3 emulator Playwright tests, typecheck, lint, build | Pass on 2026-11-06 |

Nothing is verified in Quest Browser or on a physical Quest 3 or 3S: no headset, no tester.

## 3. Missing functionality

Every gameplay module has a spec and no code: mechanical solver (`src/sim`), part catalogue and blueprints, socket snapping and wind gesture, town and wake effect, letters and parcel, save/load, gifting, X-ray, daily repair, audio, pause, accessibility modes, table detection and anchoring (scheduled as Phase 2A, Nov 7–8). No specification exists yet for resident behaviour or autonomous world simulation; those are post-competition (A §1, D §1).

## 4. Existing assets

| Asset | State |
|---|---|
| `public/assets/models/props/gear_spur_16_brass.glb` | Shipped. 3,872 triangles, 2.38 MB, 16 MiB of GPU texture (3 × 1024 px). Usable for M0 only. |
| `public/assets/models/environment/tockton_base_round.glb` | Shipped. 5,792 triangles, 2.12 MB, 20 MiB of GPU texture. Usable for M0 only. |
| `blender/exports/variants/gear_spur_{12,24}_brass.glb` | Helper renders, not shipped, sources deleted. |
| `public/assets/xr/generic-hand/{left,right}.glb` | Third party (MIT), 94 KB each. |
| `blender/source/*.blend` | 2 sources. |
| `blender/scripts/` | `wu_common.py`, `gen_gear_spur.py`, `gen_tockton_base.py`, `compose_m0_stage.py` |

Unique source GLBs: 6, of which 2 are game assets in use. About 85–92 % of each game GLB is embedded texture (C §2).

## 5. Missing assets

Everything else the specs require: trunk, workbench, tray, letter, parcel, Music Box, Carousel, Windmill, Bakery, theatre facade, town base and plots, residents, gift box, the part library, and the Clock Tower if time allows. Ten required items have neither a reference board nor a spec dimension: theatre facade, gift box, parcel, letter, velvet stand dressing, plots, tray, residents' size, Music Box casing, Bakery (A §2, B §2). The inventory joins "spec exists / board exists" per item.

## 6. Technical dependencies

- IWSDK 1.1.0-rc.2 (release candidate, pinned), super-three 0.185, Vite 7, Vitest, Playwright, Blender 5.2.1 LTS headless (verified working, E §1).
- IWSDK loads GLBs serially from the scene, never frees asset GPU memory on level change, has no animation mixer, and its Draco and KTX2 decoders default to unpkg.com; it has no meshopt decoder (D §3, F §2). Plain GLB with no compression stays the rule (ADR-023) unless self-hosted decoders are approved.
- Table placement needs raw WebXR (`frame.detectedPlanes`, `frame.createAnchor`); IWSDK's scene understanding anchors only the reference-space origin and updates every plane every frame (D §4).
- Gaze in IWSDK is eye-tracking input; Quest 3 and 3S have no eye tracking, so the gaze-and-pinch accessibility mode needs a head-directed pointer of our own (D §4.4, unverified on a device).

## 7. Documentation inconsistencies

The ones that block asset work (A §3, B §4, critic):

| # | Conflict | Default ruling (directive: written spec wins) |
|---|---|---|
| I-1 | No document defines one GLB deliverable; 69 gear "variants" are 23 meshes × 3 finishes | A finish is a runtime material, not a GLB (proposed ADR) |
| I-2 | "Parts: 12/20/24/32" could mean rows or pieces (boards: 18/40/45/65 pieces) | Unique part slots; repeated pieces are instances |
| I-3 | Gears procedural TypeScript (CLAUDE.md §10, ART §5) vs Blender GLB (shipped) | Blender-built GLB families, cached and instanced at runtime (proposed ADR) |
| I-4 | Module: `m1` in IDs, 2 modules in ART §11, 3.6158 mm in the generator, 2 or 20 mm on boards | Owner ruling needed; defaults proposed in the manifest |
| I-5 | Trunk 35 × 25 × 20 cm (spec) vs 60 × 34 × 32 cm (boards) | Spec |
| I-6 | Music Box governor required (spec 6.1) but missing from the 12-part boards | Spec: governor is one of the 12 |
| I-7 | Windmill: boards drive it from Music Box gears; spec says ambient wind | Spec |
| I-8 | Residents: boards name Oswald, Elias, Luna, Pip, Clack, Tinkerer; spec names Mira, Otto, schoolteacher, theatre keeper | Spec names for the competition; board names only if the owner approves |
| I-9 | CLAUDE.md §3 names three files that do not exist (including the original Technical Design Doc) and §9 names `docs/ASSET_PIPELINE.md` | Fix the references |
| I-10 | CLAUDE.md §14 reads as permanent; the directive needs G1–G5 docs | §14 applies to the competition build; record as an ADR |
| I-11 | SaveV1 shape differs between TECHNICAL_ARCHITECTURE §16 and SAVE_PERSISTENCE §3 | Lead ADR before save/load is built |
| I-12 | `DEPLOYMENT_RELEASE_PLAN.md` is a byte copy of `SIMULATION_SPEC.md`; `PRODUCT.md` still says GitHub Pages; `DESIGN.md` describes the old plate | Rewrite or correct |
| I-13 | Three budget sets across the audits (D, F, E) | One budget table in `ASSET_OPTIMISATION_BUDGET.md` |

## 8. Reference coverage

All 27 boards were opened and mapped (B §1). They cover the four machines, the part catalogue, gear trains, trunk, town awakening, characters and hand interaction. They contain AI-generated numbers that conflict with the specs (part counts on three boards, speeds, module, trunk size, X-ray behaviour). `REFERENCE_INDEX.md` has three description errors (B §5). No board exists for the theatre facade, gift box, parcel, letter, ghost hands, pause menu, Easy Snap UI or the landing.

## 9. Production risks

1. **No hardware.** Every Quest-level check, including 60 fps and real-table behaviour, stays Blocked until a tester is named.
2. **Texture weight.** The current per-GLB baked-texture pattern does not scale. Twelve parts in that style need about 192 MiB of GPU memory, against a proposed 160 MiB ceiling. The two M0 GLBs alone are 4.5 MB before Enter, against a 1.5 MB budget (F §3, §7).
3. **Underspecified blueprints.** Only 4 of the Music Box's 12 parts are named, and no machine has sockets, ratios or energy constants (A §2). Assets for unnamed parts would be guesses.
4. **Capacity.** About 56 agent-hours for about 180 assets, against about 120 available with three Blender agents after an 8–12 hour framework build (E §5). It is feasible for the competition set, but only with parametric families and one review render per family.
5. **Draw calls.** The awakened town is estimated at 150–190 draw calls against a 200 ceiling, so merging, instancing and hiding interior parts are required (F §3).
6. **Release candidate SDK.** IWSDK 1.1.0-rc.2 APIs may change; everything is pinned.

## 10. Competition-critical priorities

In order: table detection and anchoring with the stand fallback; mechanical solver; part library for the Music Box; Music Box loop; trunk, town, letters, parcel and workbench; placement and wake; Carousel; Windmill and Bakery; gifting; save/load; daily repair (protected, ADR-027); accessibility; audio; X-ray; then the Clock Tower and day/night, which are cut first. Hardware validation and a 60 fps check on a Quest are release gates.

## 11. Long-term features

G1 Living Tockton, G2 advanced engineering, G3 creative sandbox, G4 community, G5 clockwork universe (future worlds), and research. All stay outside the competition path. Five of the requested documents describe features that CLAUDE.md §14 excludes from the competition build (sandbox, sharing with accounts, metrics, extra worlds, resident systems). They are written as labelled future documents behind an explicit scope firewall ADR, never as competition requirements.

## 12. Recommended agent structure

| Agent | Model | Owns | Starts |
|---|---|---|---|
| Lead (Agent 0) | Opus | Integration, ADRs, table placement, runtime asset registry, final reviews | Now |
| Asset framework | Sonnet | Shared material library, family generators, GLB validator, manifest tooling (`tools/`, `blender/scripts/lib/`) | After the material ADR |
| Mechanical library | Sonnet | Family A: gears, springs, shafts and the other parts | After the pilot |
| Machines | Sonnet | Families C–F: Music Box, Carousel, Windmill and Bakery, Clock Tower and Theatre | After the pilot |
| World | Sonnet | Families B, G, H, I: trunk, workshop, town, residents, gift | After the pilot |
| Manifest checker | Haiku | Naming, manifest validation, cross-checks; read-only | Each batch |
| Game code agents 1–4 | Sonnet | `src/sim`, `src/parts`, `src/interaction`, `src/town` and `src/audio` (CLAUDE.md §10) | After shared contracts |

Each .blend and each GLB has exactly one owner at a time; agents work in separate family folders.

## Decisions needed from the owner

1. Is there an original Technical Design Doc? If not, CLAUDE.md §3 stops naming it.
2. Who tests on a Quest 3 or 3S, and when (ideally by 12 November)?
3. May `gltf-validator` (Khronos, Apache-2.0) be added as a dev dependency for release checks? Our own validator needs no new dependency.
4. Decided on 2026-11-06: the shared material library with vertex ambient occlusion for parts, keeping baked textures only for hero objects, is accepted (ADR-032), on the owner's words "Build the shared asset framework: materials, generators, GLB validator and manifest tooling." Some per-asset texture detail is lost, and the owner can still reverse it.
5. Gear module and tooth set (I-4).
6. Who the first-time testers are, and how many (new; from [PRODUCT_METRICS_AND_RETENTION.md](PRODUCT_METRICS_AND_RETENTION.md) §9). No specification requires any, and the owner arranges them.

Also decided on 2026-11-06 (ADR-039), so not open: there is no flower shop (conflict I-16 is closed); Otto is the baker (gap G-10 is closed); character figures exist only for people named in the written specifications, which today means Mira and Otto ([TOCKTON_CHARACTERS.md](TOCKTON_CHARACTERS.md)).

Until answered, the defaults in §7 apply, and work that does not depend on these answers continues.
