"""export_profile.py - the fixed GLB export profiles (docs/GLB_EXPORT_AND_VALIDATION.md section 2).

Profile L is the default for library parts and housings (ADR-032): images NONE, vertex colour ACTIVE, extras on, no
compression, no clips. H adds the images of a named hero, A one-shot clips, C a skeleton. Every property is an argument of
bpy.ops.export_scene.gltf; a name this Blender does not know is reported in the result (never silently dropped).
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import bpy

import wu_common as wu

PROFILE_L = dict(
    export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
    export_normals=True, export_tangents=False, export_texcoords=True,
    export_materials="EXPORT", export_image_format="NONE",
    export_vertex_color="ACTIVE", export_all_vertex_colors=False,
    export_extras=True, export_attributes=False,
    export_animations=False, export_skins=False, export_morph=False,
    export_cameras=False, export_lights=False,
    export_draco_mesh_compression_enable=False, export_meshopt_compression_enable=False, export_use_gltfpack=False,
    export_gpu_instances=False, export_gn_mesh=False,
    export_unused_images=False, export_unused_textures=False, export_keep_originals=False,
)
PROFILE_H = {**PROFILE_L, "export_image_format": "AUTO", "export_jpeg_quality": 92, "export_image_quality": 92}
PROFILE_A = {**PROFILE_L, "export_animations": True, "export_force_sampling": True, "export_animation_mode": "ACTIONS"}
PROFILE_C = {**PROFILE_A, "export_skins": True}
PROFILES = {"L": PROFILE_L, "H": PROFILE_H, "A": PROFILE_A, "C": PROFILE_C}


def sha256(path: Path | str) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def export(objs, path: Path | str, profile: str = "L") -> dict:
    """Export exactly `objs` (the root first, then its helper empties) to `path` with the named profile."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.view_layer.update()
    for o in list(bpy.context.view_layer.objects):
        if o is not None:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    known = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    kw = {k: v for k, v in PROFILES[profile].items() if k in known}
    skipped = sorted(set(PROFILES[profile]) - known)
    bpy.ops.export_scene.gltf(filepath=str(path), **kw)
    return dict(path=str(path), profile=profile, bytes=path.stat().st_size, sha256=sha256(path), skippedProperties=skipped)
