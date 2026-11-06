# Wound Up - Blender asset pipeline (hero assets)

Reproducible, script-generated hero assets. Everything is built headless with Blender's bundled `bpy` + `numpy`
(no add-ons, no network). Nothing here is hand-placed in the GUI, so every asset can be regenerated from a clean Blender.

| asset | GLB (runtime) | source | generator |
|---|---|---|---|
| Spur gear, 16 teeth, aged brass | `public/assets/models/props/gear_spur_16_brass.glb` | `blender/source/gear_spur_16_brass.blend` | `scripts/gen_gear_spur.py` |
| Round walnut / velvet stand ("Tockton base") | `public/assets/models/environment/tockton_base_round.glb` | `blender/source/tockton_base_round.blend` | `scripts/gen_tockton_base.py` |
| M0 stage composition (check render only) | - | - | `scripts/compose_m0_stage.py` |

Shared code: `scripts/wu_common.py` (palette, sRGB/linear, numpy texture synthesis, plain-PNG writer, glTF-friendly PBR
material builder, Cycles AO/cavity/edge bake, GLB export + inspector, mesh/UV QA, Cycles studio renderer).
Review renders live in `blender/previews/` (they are rendered from the **re-imported GLB**, i.e. a round-trip check).

## Regenerate

Blender 5.2 (tested with 5.2.1 LTS). From the repo root, in Git Bash:

```bash
B="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$B" --background --factory-startup --python blender/scripts/gen_gear_spur.py       # gear GLB + .blend + 5 previews
"$B" --background --factory-startup --python blender/scripts/gen_tockton_base.py    # base GLB + .blend + 5 previews
# optional composition (needs the 12T/24T helper gears, which are NOT shipped):
"$B" --background --factory-startup --python blender/scripts/gen_gear_spur.py -- --teeth 12 --res 512 --no-previews
"$B" --background --factory-startup --python blender/scripts/gen_gear_spur.py -- --teeth 24 --res 512 --no-previews
"$B" --background --factory-startup --python blender/scripts/compose_m0_stage.py
```

Useful options (everything after `--`): gear `--teeth N --tip-diameter D --thickness T --bore B --res R --clay
--views a,b --no-previews --out PATH`; base `--diameter D --height H --inset-diameter D --segments N --res R --clay
--views a,b --no-previews --out PATH`. `--clay` skips baking/textures for fast shape review. Default tip diameter of
other tooth counts keeps ONE module (3.6158 mm), so any two generated gears mesh visually. The base takes diameter and
height as parameters (the final stand size is expected to change); the inset diameter defaults to `diameter - 0.06`.
Cycles uses the OPTIX GPU when present (falls back to CPU). First OPTIX use compiles kernels once (~100 s).

## Conventions

* Units metres, scale 1, **all transforms applied** (object loc 0 / rot 0 / scale 1, no parent, no modifiers).
* Export: plain `.glb` only - no Draco, no `EXT_meshopt_compression`, no KTX2, no external files. Images are embedded
  (baseColor = JPEG q92, ORM and normal = PNG, written by our own zlib-9 PNG encoder). Optional extension used:
  `KHR_materials_sheen` (velvet only; loads as `MeshPhysicalMaterial` in three.js, verified with three r185 GLTFLoader).
  Materials are single-sided (closed solids).
* glTF is Y-up. Blender is Z-up; the exporter converts `(x, y, z)_blender -> (x, z, -y)_gltf`.
  * **Gear** (glTF space = what the runtime sees): rotation axis = local **+Z**, front face towards +Z, origin = centre of
    the bore at mid-thickness, tooth 0 along +X; bbox x,y = +-0.032, z = +-0.0076 (hub boss 1.6 mm proud of each face).
    Blender-side the mesh is built with the axis along the **Y** axis (front face towards -Y) - a rotation of the
    model-space mesh by +90 deg about X - so that the exporter lands exactly on the glTF axes above.
  * **Base**: origin at the centre of the **bottom face**, `y = 0` is table contact, up = +Y (Blender Z, no rotation
    needed). Velvet top surface is flat at y = 0.041 (recess 4 mm below the 0.045 lip).
* Names: glTF nodes `GearSpur16_Brass`, `TocktonBaseRound` (mesh names identical). Materials (shared names across assets):
  `Mat_AgedBrass`, `Mat_Walnut`, `Mat_VelvetTeal`. One UV map called `UVMap`.
* Palette (sRGB): aged brass `#C9A227` (albedo pushed to `#AE8233`, tarnish `#3A2610`, worn `#DFC368`), walnut `#5B3A24`
  (albedo family `#4B2F1D`), cream `#F2E6CF`, deep teal `#1F5C5C` (velvet albedo `#194E4E`, lit top reads ~#1F5C5C), warm lamp `#FFC66D`.
  Albedo is **neutral** (no baked light): ambient occlusion lives only in the occlusion channel, so the game can
  desaturate / re-tint the materials for the frozen vs awakened look.
* Textures (glTF packing): baseColor sRGB; **ORM** = R occlusion, G roughness, B metallic in one image (exported as one
  texture shared by `occlusionTexture` and `metallicRoughnessTexture`); tangent-space normal map, OpenGL (+Y up).
* Topology: watertight, outward normals, quads where curved, every convex hard edge carries a 0.45 mm chamfer; flat faces
  stay flat (crisp chamfer boundaries) while curved walls are smooth; weighted normals.
* UVs: non-overlapping islands with uniform texel density per material (planar front/back discs + arc-length wall strips
  for the gear; arc-length walnut strips with the grain along u + planar velvet disc for the base). The brass on the base
  (band, inlay, studs) deliberately uses a **tiled** 512 px texture (integer repeats, UVs outside 0-1 by design).

## How the geometry is built (why it looks the way it does)

* **Gear**: a hand-authored plan view (trapezoid teeth with analytic line/circle fillets, four tapered spokes with
  filleted roots, flanged hub) is turned into a watertight "relief solid" (per-face half-heights, step walls generated from
  the planar subdivision - no booleans for the body), chamfered with `bmesh.ops.bevel`, and the 24 rivet / bolt heads are
  boolean-unioned (EXACT). Built at 100x (1 unit = 1 cm) so tiny bevels sit far above Blender's merge tolerances.
* **Base**: ONE closed revolved profile (foot -> cove -> brass fillet band -> upper moulding with bullnose -> top lip ->
  recessed velvet floor with a flush, slightly crowned brass inlay), so no hidden interior faces. 8 domed brass studs are
  boolean-unioned onto the moulding. Walnut grain is evaluated from the 3D position of every atlas texel, so it is
  continuous across UV slice seams and always runs around the circumference.
* **Bake**: Cycles EMIT bake of an Ambient Occlusion node (large distance -> occlusion channel, small distance -> crevice
  patina, inside-AO -> convex edge wear), 1024 px, 8 px EXTEND margin, atlas gutters filled from a coverage mask.

## Budgets / measured numbers (see the generator logs for the full QA dump)

| | tris | verts (GLB) | GLB size | textures |
|---|---|---|---|---|
| `gear_spur_16_brass` | 3,872 (budget 4,000) | 3,850 | 2.28 MB | 3 x 1024 px (JPEG 0.14 MB + ORM 0.81 MB + normal 1.23 MB) |
| `tockton_base_round` | 5,792 (budget 7,000) | 4,426 | 2.02 MB | walnut 1024 px (+512 normal), brass 512 px, velvet 512 px |

Other tooth counts of the same family: 12T 3,456 tris, 24T 5,024 tris (GLB only in `blender/exports/variants/`, not shipped; used by the composition render).

## Integrity checks run on the shipped GLBs (all pass)

* Parsed from the GLB JSON/BIN: bbox from the POSITION accessor, single node + mesh with the required names, no node
  transforms, no extensions except `KHR_materials_sheen` (base only), no Draco / meshopt / KTX2, no external URIs,
  materials single-sided.
* Every flat triangle on the gear's z planes (+-0.006, +-0.0045, +-0.0076) and on the base's y planes (0, 0.041, 0.045)
  is wound outward (0 inverted); 0 triangles whose winding disagrees with its vertex normals; 0 degenerate triangles.
* Mesh QA (bmesh): 0 non-manifold edges, 0 loose verts/edges, 0 duplicate verts, 0 zero-area faces, consistent winding,
  positive signed volume. UV QA: gear 0 overlapping texels / 0 out-of-range; base walnut and velvet 0 overlapping texels
  (the tiled brass is intentionally repeated).
* Loaded with the repo's own three.js r185 `GLTFLoader` (Node, image decoding stubbed): bboxes match, `Mat_VelvetTeal`
  becomes `MeshPhysicalMaterial` with sheen = 1, sheenRoughness 0.55, the others `MeshStandardMaterial`.
* The rim of the gear is triangulated with an orientation-aware zipper (never emits a folded triangle; asserted at
  build time: `rim triangulation check` in the log).

## Known limitations

* The 12-sided studs and 8-sided rivets are faceted in extreme macro; smooth shading hides this at play distance.
* Brass on the base carries no baked AO (tiled texture); the walnut and velvet do.
* Previews use a neutral Cycles studio (Khronos PBR Neutral view transform); in-game look depends on the IWSDK lighting.
