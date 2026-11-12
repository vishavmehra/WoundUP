# Wound Up — Art and 3D Asset Pipeline

**Project:** Wound Up  
**World:** Tockton  
**Primary art tool:** Blender  
**Runtime format:** GLB / glTF  
**Status:** Planned  
**Internal completion deadline:** November 18, 2026 (IST)

## 1. Purpose

This document defines the asset creation, optimisation, export, and integration pipeline for Wound Up.

Visual quality is a core part of the product.

Tockton must feel like a handcrafted miniature world with a consistent visual identity.

The project must not rely on generic primitive shapes or unrefined model dumps for its major assets.

Blender is the primary tool for creating high-quality hero models. The mechanical parts are also built in Blender, as parametric GLB families (ADR-031); the game does not generate part geometry in TypeScript.

This document keeps the art direction, palette, material families, quality gates and priority order. The production rules are in separate documents, and where this document differs from an accepted ADR (ADR-030 to ADR-037 in [DECISIONS.md](DECISIONS.md)), the ADR wins:

| Topic | Document |
|---|---|
| What one GLB is, the list of GLBs, status and counts | [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md), [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md) |
| Asset ids, folders, names inside a GLB | [ASSET_NAMING_AND_FOLDER_STANDARDS.md](ASSET_NAMING_AND_FOLDER_STANDARDS.md) |
| Headless Blender, units and pivots, materials, vertex ambient occlusion, empties, review renders | [BLENDER_PRODUCTION_GUIDELINES.md](BLENDER_PRODUCTION_GUIDELINES.md) |
| Export profile and the GLB validator | [GLB_EXPORT_AND_VALIDATION.md](GLB_EXPORT_AND_VALIDATION.md) |
| Triangle, draw-call, texture and download budgets | [ASSET_OPTIMISATION_BUDGET.md](ASSET_OPTIMISATION_BUDGET.md) |
| Reference boards against assets, and where boards lose to specifications | [ASSET_REFERENCE_MAPPING.md](ASSET_REFERENCE_MAPPING.md) |
| Order of work and dates | [ASSET_PRODUCTION_ROADMAP.md](ASSET_PRODUCTION_ROADMAP.md) |
| Who owns which file | [ASSET_AGENT_ASSIGNMENTS.md](ASSET_AGENT_ASSIGNMENTS.md) |
| Stage gates and evidence | [ASSET_QA_CHECKLIST.md](ASSET_QA_CHECKLIST.md) |

## 2. Art direction

The visual identity is:

**Mature vintage storybook illustration meets antique horology catalogue.**

The world should feel:

- Handcrafted.
- Warm.
- Detailed.
- Delicate.
- Mechanical.
- Nostalgic.
- Slightly magical.
- Elegant rather than childish.

Visual references should guide the overall art direction, but the final assets must form a coherent original world.

Avoid mixing unrelated realistic, low-poly, cartoon, and generic AI-generated styles.

## 3. Colour palette

Primary palette:

| Colour | Hex | Use |
|---|---|---|
| Brass | `#C9A227` | Mechanical details |
| Walnut | `#5B3A24` | Wood and furniture |
| Cream | `#F2E6CF` | Paper, fabric, light surfaces |
| Deep teal | `#1F5C5C` | Accents and selected structures |
| Warm lamp | `#FFC66D` | Warm light and awakened details |

Use colours consistently across assets.

Frozen areas should be cool and desaturated.

Awakened areas should regain the full warm palette.

## 4. Blender-first hero assets

Blender is the primary creation tool for major assets.

Hero assets include:

- Trunk.
- Town buildings.
- Bakery.
- Windmill.
- Music Box casing.
- Carousel.
- Clock Tower.
- Theatre facade.
- Gift box.
- Figures.
- Major decorative props.

These assets must receive proper modelling, materials, proportions, and finishing.

Do not construct major buildings from unmodified boxes and cylinders and treat them as final art.

## 5. Mechanical part geometry

Repeated mechanical components are built in Blender as parametric GLB families (ADR-031), not as TypeScript geometry:

- Spur gears.
- Bevel gears.
- Shafts.
- Springs.
- Pins.
- Repeated fasteners.
- Small mechanical connectors.

One generator script per family reads that family's manifest entries and exports one GLB per entry with one fixed export profile. At runtime each part GLB is loaded once and cached, and repeated placements are clones or instances that share geometry and material.

These parts must meet the same visual quality bar as the hero assets.

They should have:

- Correct proportions.
- Clean geometry.
- Appropriate bevels.
- Consistent materials.
- Correct pivots.
- Efficient geometry reuse.

A generator is not permission to produce crude-looking assets.

## 6. Blender project organisation

Keep Blender source files separate from runtime exports.

Structure (ADR-033):

```text
blender/
├── source/<family>/     .blend sources, one per hand-modelled asset: <asset_id>.blend
├── scripts/             generators, the runner and shared modules (lib/)
├── previews/<family>/   contact sheets and reports (build output)
└── exports/             helper output; nothing here ships
```

Shared material textures live in `public/assets/materials/` and reference boards in `References/`, not under `blender/`. Each hero is its own `.blend` named after its asset id (`trunk_main.blend`, `bakery_building.blend`); there is no combined file for all residents, because each figure is a separate deliverable with one owner. The folder names, the asset ids and the names inside a GLB are fixed in [ASSET_NAMING_AND_FOLDER_STANDARDS.md](ASSET_NAMING_AND_FOLDER_STANDARDS.md).

Use descriptive names.

Avoid filenames such as `final2.blend`, `newfinal.blend`, or `test_latest.blend`.

## 7. Modelling standards

Every hero asset should have:

- Intentional silhouette.
- Clean proportions.
- Appropriate edge treatment.
- Consistent material design.
- Suitable topology.
- Correct origin and pivot.
- Correct scale.
- Appropriate detail density.
- No unnecessary hidden geometry.
- No accidental duplicate meshes.

The model must look good at the actual in-game viewing distance.

Do not spend excessive geometry on details that cannot be seen.

Do not remove important silhouette or material details merely to reduce polygon count.

## 8. Material standards

Materials should support the art direction.

Expected material families include:

- Aged brass.
- Polished brass accents.
- Dark walnut.
- Painted wood.
- Cream paper.
- Velvet.
- Enamel.
- Glass.
- Fabric.
- Stone.
- Warm emissive elements.

Avoid excessive metallic shine.

Brass should look like crafted metal, not a bright yellow plastic material.

Wood should have restrained variation and believable surface treatment.

Use shared materials where possible. Library parts carry named proxy materials with constant values and baked per-vertex ambient occlusion, and the runtime swaps in one shared textured material by name (ADR-032, accepted by the owner on 2026-11-06 and still reversible; [decision 4](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)). Only hero objects named in the manifest keep their own textures. See [BLENDER_PRODUCTION_GUIDELINES.md](BLENDER_PRODUCTION_GUIDELINES.md) section 7.

## 9. Geometry and export

Runtime assets should use GLB/glTF, plain and uncompressed: no Draco, no meshopt, no KTX2 (ADR-023, ADR-035). The export profile and the validator are in [GLB_EXPORT_AND_VALIDATION.md](GLB_EXPORT_AND_VALIDATION.md).

Export only required objects.

Before export:

1. Check object names.
2. Check scale.
3. Check origins and pivots.
4. Check transforms.
5. Check materials.
6. Check UVs.
7. Check texture references.
8. Remove unused objects.
9. Check animation setup.
10. Test the exported file in the actual application.

Do not assume the Blender viewport is an accurate representation of the runtime result.

## 10. Pivot and animation requirements

Animated parts require correct pivots.

Examples:

- Music Box cylinder: rotation around its mechanical axis.
- Music Box governor: rotation around its shaft.
- Carousel platform: rotation around its central axis.
- Carousel horses: controlled vertical movement.
- Windmill sails: rotation around the hub.
- Windmill millstone: rotation around the mill axis.
- Clock Tower pendulum: rotation around the suspension point.

Separate animated components from static housing.

Avoid moving large parent objects when only a small component should rotate.

Continuous rotation (gears, cylinder, governor, platform, sails, millstone) comes from the solver at runtime, not from baked clips. Only short one-shot motions such as the trunk lid, the parcel flap, doors and character motion may be glTF clips (ADR-030).

## 11. Repeated part variants

The part library is counted in GLB files, not in finishes (ADR-030). A finish (brass, walnut, painted) is a runtime material chosen by `visual.finish`; it is never a separate file or part of an asset id. The earlier count of 60 spur and 9 bevel "variants" multiplied every shape by three finishes.

The planned categories include:

- Spur gears: 10 tooth counts × 2 modules = 20 files.
- Bevel gears: 3 tooth counts = 3 files.
- Springs.
- Shafts.
- Cranks.
- Cams.
- Escapements.
- Pendulums.
- Combs.
- Cylinders.
- Structural parts.
- Figures.

This is a target library, not a requirement to create every possible variant before the first playable loop. The tooth set and the second module are owner decision pending ([decision 5](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)); the manifest lists only the gears the documents let us name.

Prioritise the exact parts needed by the in-scope machines.

## 12. Runtime asset optimisation

Quest performance must influence asset decisions.

Requirements:

- Cache geometry by asset id: load each part GLB once and place clones or instances that share it (ADR-031).
- Reuse shared materials.
- Instance repeated parts.
- Merge static geometry where beneficial.
- Keep animated components separate.
- Avoid excessive transparent surfaces.
- Avoid unnecessarily large textures.
- Avoid unnecessary mesh complexity.
- Use appropriate detail for viewing distance.
- Dispose of unused resources.
- Keep parts inside an opaque casing as separate nodes that are hidden unless X-ray is on.

Budgets per category and per scene are in [ASSET_OPTIMISATION_BUDGET.md](ASSET_OPTIMISATION_BUDGET.md) (ADR-034).

Do not optimise by destroying the visual quality of hero assets.

## 13. Texture and lighting approach

Use a restrained lighting setup.

Preferred approach:

- Hemisphere lighting.
- Directional lighting.
- Limited emissive materials.
- No unnecessary real-time moving shadows.
- Blob decals for contact shadows where appropriate.

For night mode, if retained:

- Use emissive windows.
- Limit additional point lights to four.
- Avoid turning every window into an expensive dynamic light source.

## 14. Frozen and awakened states

The town has two visual states.

### Frozen

- Desaturated colours.
- Cool tint.
- Restrained lighting.
- Minimal movement.
- Quiet atmosphere.

### Awakened

- Full colour palette.
- Warm highlights.
- Mechanical movement.
- Appropriate local animation.
- Increased visual warmth.
- Associated audio.

The transition should feel magical but restrained.

Use a wake ripple lasting approximately 1.5 seconds.

## 15. Asset naming and runtime paths

Use stable asset identifiers: lowercase snake_case, no finish, no version word, never changed once a blueprint, save or gift uses them (ADR-033).

Runtime structure (ADR-033, which replaces the earlier `environment`, `buildings`, `machines`, `characters` and `props` folders):

```text
public/assets/models/
├── shared/<family>/     G0 files any world could reuse (mechanical library)
└── tockton/<family>/    G0 files specific to Tockton
public/assets/materials/   shared material library textures
assets/future/<world_id>/<family>/   every GLB that is not G0, outside public/ so it never ships
assets/manifest/glb-manifest.json    the machine-readable list of every GLB
```

Examples:

```text
public/assets/models/shared/spur_gear/gear_spur_12_m1.glb
public/assets/models/tockton/trunk/trunk_main.glb
public/assets/models/tockton/music_box/music_box_case.glb
public/assets/models/tockton/windmill/windmill_tower.glb
```

A finished machine is shown by placing its part files and its housing files. No assembled-machine GLB that repeats part geometry is made (ADR-030). The full scheme, including names inside a GLB, is in [ASSET_NAMING_AND_FOLDER_STANDARDS.md](ASSET_NAMING_AND_FOLDER_STANDARDS.md).

Keep asset identifiers consistent between:

- Blueprint data.
- Runtime loaders.
- Blender source files.
- Exported GLB files.

Do not rename assets without updating references.

## 16. Asset integration workflow

For each asset:

1. Create or update the Blender source.
2. Review silhouette and proportions.
3. Apply the intended materials.
4. Check pivots and origins.
5. Optimise geometry.
6. Export GLB.
7. Load it into the application.
8. Check scale and orientation.
9. Test materials under runtime lighting.
10. Test performance.
11. Approve the asset for integration.

Do not integrate unreviewed exports into the main branch.

## 17. Quality gate

A hero asset is not complete merely because it exports successfully.

Review:

- Does it match the art direction?
- Is its silhouette recognisable?
- Does it look intentional at gameplay distance?
- Are materials consistent?
- Are pivots correct?
- Is the geometry appropriate for Quest?
- Does it load correctly?
- Does it work with the required animations?
- Does it fit the miniature world?

If the answer is no, revise the asset.

The stage gates and the evidence each one needs are in [ASSET_QA_CHECKLIST.md](ASSET_QA_CHECKLIST.md). Only the validator and a named reviewer make an asset VALIDATED (ADR-037).

## 18. Scope protection

Do not create decorative assets that do not contribute to the planned experience before the required gameplay assets are complete.

Priority:

1. Trunk.
2. Workbench.
3. Music Box.
4. Essential mechanical parts.
5. Town base and plots (kept low, so the town reads as standing on the real table).
6. Bakery and Windmill.
7. Carousel.
8. Gift box.
9. Supporting props.
10. Clock Tower and optional assets.

## 19. Final principle

The world should look handcrafted, not procedurally assembled from generic primitives.

Blender creates the visual identity of the major assets and, as parametric families, the mechanical library. Both must meet the same quality standard.
