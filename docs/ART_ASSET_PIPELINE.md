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

Blender is the primary tool for creating high-quality hero models.

Procedural TypeScript geometry is appropriate for repeated mechanical components where it produces a better runtime result.

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

## 5. Procedural geometry

Procedural TypeScript geometry is appropriate for repeated components such as:

- Spur gears.
- Bevel gears.
- Shafts.
- Springs.
- Pins.
- Repeated fasteners.
- Small mechanical connectors.

Procedural assets must still meet the visual quality bar.

They should have:

- Correct proportions.
- Clean geometry.
- Appropriate bevels.
- Consistent materials.
- Correct pivots.
- Efficient geometry reuse.

Procedural generation is not permission to produce crude-looking assets.

## 6. Blender project organisation

Keep Blender source files separate from runtime exports.

Suggested structure:

```text
blender/
├── source/
├── exports/
├── materials/
└── references/
```

Suggested filenames:

```text
trunk_main.blend
town_bakery.blend
town_windmill.blend
town_theatre.blend
machine_music_box.blend
machine_carousel.blend
machine_clock_tower.blend
gift_box.blend
character_town_residents.blend
```

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

Use shared materials where possible.

## 9. Geometry and export

Runtime assets should use GLB/glTF.

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

## 11. Repeated part variants

The part library targets 120+ variants.

The planned categories include:

- Spur gears: 10 tooth counts × 2 modules × 3 finishes = 60 variants.
- Bevel gears: 3 tooth counts × 3 finishes = 9 variants.
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

This is a target library, not a requirement to create every possible variant before the first playable loop.

Prioritise the exact parts needed by the in-scope machines.

## 12. Runtime asset optimisation

Quest performance must influence asset decisions.

Requirements:

- Cache geometry by variant.
- Reuse shared materials.
- Instance repeated parts.
- Merge static geometry where beneficial.
- Keep animated components separate.
- Avoid excessive transparent surfaces.
- Avoid unnecessarily large textures.
- Avoid unnecessary mesh complexity.
- Use appropriate detail for viewing distance.
- Dispose of unused resources.

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

Use stable asset identifiers.

Suggested runtime structure:

```text
public/assets/models/
├── environment/
├── buildings/
├── machines/
├── characters/
└── props/
```

Example:

```text
public/assets/models/environment/trunk_main.glb
public/assets/models/buildings/town_bakery.glb
public/assets/models/buildings/town_windmill.glb
public/assets/models/machines/music_box.glb
public/assets/models/machines/carousel.glb
public/assets/models/machines/clock_tower.glb
```

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

## 18. Scope protection

Do not create decorative assets that do not contribute to the planned experience before the required gameplay assets are complete.

Priority:

1. Trunk.
2. Workbench.
3. Music Box.
4. Essential mechanical parts.
5. Town base and plots.
6. Bakery and Windmill.
7. Carousel.
8. Gift box.
9. Supporting props.
10. Clock Tower and optional assets.

## 19. Final principle

The world should look handcrafted, not procedurally assembled from generic primitives.

Blender creates the visual identity of the major assets. Procedural geometry supports the mechanical library. Both must meet the same quality standard.
