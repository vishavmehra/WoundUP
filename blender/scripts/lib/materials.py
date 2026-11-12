"""materials.py - constants-only Mat_* proxy materials for the shared library (ADR-032, GUIDELINES section 7).

A GLB exported with images NONE keeps the material NAME only if the material has no image-linked socket: a texture-linked
socket loses its metallic / roughness factors and three.js then reads metalness 1, roughness 1 (audit E 2.4). So a proxy
is a Principled BSDF with constants and nothing linked. At first load the runtime replaces each proxy by name with one
shared textured material.

Source of the constants, in order: public/assets/materials/library.json (written by make_library_textures.py, key
materials[name].proxy, the same numbers the textured material was built around), then the built-in table below. The
built-in table mirrors that script's constants for the materials that have no textures (glass, emissive) and gives
the textured ones a fallback of the same look.
"""
from __future__ import annotations

import json

import bpy

import wu_common as wu

LIBRARY_JSON = wu.REPO_ROOT / "public" / "assets" / "materials" / "library.json"

# baseColor sRGB hex, metallic, roughness; optional alpha opacity, emissive (hex, strength), sheen (hex, roughness)
BUILTIN = {
    "Mat_AgedBrass": dict(baseColor=wu.BRASS["base"], metallic=0.85, roughness=0.45),          # measured clay values (audit E 2.4)
    "Mat_PolishedBrass": dict(baseColor="#DDBB5E", metallic=0.97, roughness=0.18),
    "Mat_Walnut": dict(baseColor=wu.WALNUT["base"], metallic=0.0, roughness=wu.WALNUT["rough"]),
    "Mat_VelvetTeal": dict(baseColor=wu.VELVET["base"], metallic=0.0, roughness=wu.VELVET["rough"],
                           sheen=dict(color="#3A8A8A", roughness=0.4)),
    "Mat_PaintedWood": dict(baseColor="#D6C49A", metallic=0.0, roughness=0.55),
    "Mat_CreamPaper": dict(baseColor="#EFE3C8", metallic=0.0, roughness=0.88),
    "Mat_CreamEnamel": dict(baseColor="#EADFC8", metallic=0.0, roughness=0.30),
    "Mat_TealPaint": dict(baseColor=wu.PALETTE_HEX["teal"], metallic=0.0, roughness=0.46),
    "Mat_WarmGlass": dict(baseColor="#FFD9A3", metallic=0.0, roughness=0.04, alpha=dict(opacity=0.28)),
    "Mat_Fabric": dict(baseColor="#D8C7A0", metallic=0.0, roughness=0.86),
    "Mat_Stone": dict(baseColor="#B0A48C", metallic=0.0, roughness=0.86),
    "Mat_WarmEmissive": dict(baseColor=wu.PALETTE_HEX["cream"], metallic=0.0, roughness=0.5,
                             emissive=dict(color=wu.PALETTE_HEX["lamp"], strength=1.5)),
    "Mat_Ceramic": dict(baseColor="#EADFC8", metallic=0.0, roughness=0.30),
}


def constants(name: str) -> dict:
    """Proxy constants for a library name, and where they came from."""
    c = dict(BUILTIN[name]) if name in BUILTIN else None
    src = "built-in"
    if LIBRARY_JSON.exists():
        try:
            m = json.loads(LIBRARY_JSON.read_text(encoding="utf-8"))["materials"].get(name)
        except (ValueError, KeyError):
            m = None
        if m and "proxy" in m:
            c = {**(c or {}), **m["proxy"]}
            if "sheen" in m:
                c["sheen"] = m["sheen"]
            src = "library.json"
    if c is None:
        raise KeyError(f"no proxy constants for '{name}': add it to lib/materials.py BUILTIN or to library.json")
    c["_source"] = src
    return c


def missing_constants(library_names: list[str]) -> list[str]:
    """Manifest library names that have no constants anywhere (the lead added a name; this table must follow)."""
    out = []
    for n in library_names:
        try:
            constants(n)
        except KeyError:
            out.append(n)
    return out


def make_proxy(name: str):
    """Create (or return) the constants-only Principled material `name`. Single-sided, opaque unless it carries alpha."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    c = constants(name)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*wu.hex_to_linear(c["baseColor"]), 1.0)
    b.inputs["Metallic"].default_value = float(c["metallic"])
    b.inputs["Roughness"].default_value = float(c["roughness"])
    if "alpha" in c:
        b.inputs["Alpha"].default_value = float(c["alpha"]["opacity"])
        for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(mat, attr, val)
            except (AttributeError, TypeError):
                pass
    if "emissive" in c:
        b.inputs["Emission Color"].default_value = (*wu.hex_to_linear(c["emissive"]["color"]), 1.0)
        b.inputs["Emission Strength"].default_value = float(c["emissive"]["strength"])
    if "sheen" in c:                                              # velvet only (GUIDELINES 7.6)
        b.inputs["Sheen Weight"].default_value = 1.0
        b.inputs["Sheen Roughness"].default_value = float(c["sheen"]["roughness"])
        b.inputs["Sheen Tint"].default_value = (*wu.hex_to_linear(c["sheen"]["color"]), 1.0)
    mat.use_backface_culling = True                               # closed solids are single-sided (GUIDELINES 6.4)
    return mat


def assign(obj, name: str):
    """Make `name` the only material of a mesh object (all faces use slot 0)."""
    mat = make_proxy(name)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat
