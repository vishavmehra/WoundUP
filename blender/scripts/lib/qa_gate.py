"""qa_gate.py - the in-Blender QA gate (BLENDER_PRODUCTION_GUIDELINES 4.3 step 4) and the post-export GLB check.

check_scene(objs, entry, manifest, hints)   before export, on the objects about to be exported
check_glb(path, entry, manifest)            after export, on the finished file

Both return a Gate: .fails and .warns are lists of "Qnn message" strings, .info a dict of the measured numbers. A FAIL
stops the export (nothing reaches the output root). This is NOT the validator (tools/validate-glb.mjs): the validator owns
VALIDATED. This gate only stops obvious mistakes in seconds, with no agent tokens.

hints (optional, set by the generator): origin = (x, y, z) each 'centre'|'min'|'max' in glTF axes; thin_axis_z (bool);
closed (bool, default True: the mesh must be a watertight solid); checks = [fn(gate, objs)] extra family-specific checks.
"""
from __future__ import annotations

import math
import re

import numpy as np

import bpy

import wu_common as wu
from . import manifest as mf
from . import vertex_ao

NAME_RE = re.compile(r"^[A-Z][A-Za-z0-9]*(_[A-Z][A-Za-z0-9]*)*$")        # PascalCase_Underscore, no '.001'
HELPERS = {"COL_": "collider", "PIV_": "pivot", "SOCKET_": "socket"}
ALLOWED_EXT = {"KHR_materials_sheen", "KHR_materials_clearcoat", "KHR_materials_emissive_strength", "KHR_materials_ior",
               "KHR_texture_transform"}
MIN_GRAB_RADIUS_M = 0.012
DIM_TOL = 0.01                                                              # V21: 1 %
ORIGIN_TOL_M = 0.0005                                                       # V22: 0.5 mm


class Gate:
    def __init__(self):
        self.fails, self.warns, self.info = [], [], {}

    def fail(self, cid, msg):
        self.fails.append(f"{cid} {msg}")

    def warn(self, cid, msg):
        self.warns.append(f"{cid} {msg}")

    @property
    def ok(self):
        return not self.fails

    def as_dict(self):
        return dict(ok=self.ok, fails=self.fails, warns=self.warns, info=self.info)


def _py(v):
    return v.to_dict() if hasattr(v, "to_dict") else (v.to_list() if hasattr(v, "to_list") else v)


def _dims_g(bmin, bmax):
    """Blender-space box -> glTF-axis size [x, y, z] (x = bx, y = bz, z = -by)."""
    d = np.asarray(bmax) - np.asarray(bmin)
    return [float(d[0]), float(d[2]), float(d[1])]


def _compare_dims(g, dims, declared, label):
    for axis, (got, want) in zip("xyz", zip(dims, declared)):
        if want is not None and abs(got - want) > max(DIM_TOL * want, 1e-5):
            g.fail("Q04", f"{label} size {axis} = {got * 1000:.3f} mm, manifest says {want * 1000:.3f} mm (1 % tolerance)")


def _check_origin(g, centre_g, lo_g, hi_g, origin):
    for axis, how, c, lo, hi in zip("xyz", origin, centre_g, lo_g, hi_g):
        got = {"centre": c, "min": lo, "max": hi}[how]
        if abs(got) > ORIGIN_TOL_M:
            g.fail("Q05", f"origin {axis}: {how} of the box is {got * 1000:.3f} mm from 0 (limit 0.5 mm)")


def check_scene(objs, entry, manifest, hints=None) -> Gate:
    g, hints = Gate(), hints or {}
    meshes = [o for o in objs if o.type == "MESH"]
    empties = [o for o in objs if o.type == "EMPTY"]
    library = mf.material_library(manifest)
    bud = entry["budgets"]

    # Q01 one root; the root carries wu.id and wu.family (naming standards 5, V27)
    roots = [o for o in objs if o.parent is None]
    if len(roots) != 1 or objs[0] is not roots[0]:
        g.fail("Q01", f"expected exactly one top-level object and it first; got {[o.name for o in roots]}")
    root = objs[0]
    w = _py(root.get("wu", {}))
    if w.get("id") != entry["id"] or w.get("family") != mf.family_folder(entry):
        g.fail("Q01", f"root wu must be id '{entry['id']}' family '{mf.family_folder(entry)}', got {w}")

    # Q02 names
    names = [o.name for o in objs]
    if len(set(names)) != len(names):
        g.fail("Q02", "duplicate object names")
    for o in objs:
        if not NAME_RE.match(o.name):
            g.fail("Q02", f"'{o.name}' is not PascalCase_Underscore (or carries a '.001' suffix)")
        if o.type == "MESH" and o.data.name != o.name:
            g.fail("Q02", f"mesh data '{o.data.name}' differs from object '{o.name}'")
    want = list(entry.get("meshes", []))
    if sorted(o.name for o in meshes) != sorted(want):
        g.fail("Q02", f"mesh nodes {sorted(o.name for o in meshes)} differ from the manifest meshes {sorted(want)}")
    for o in empties:
        if not any(o.name.startswith(p) for p in HELPERS):
            g.fail("Q02", f"empty '{o.name}' must start with COL_, PIV_ or SOCKET_")

    # Q03 transforms applied, no modifiers
    for o in dict.fromkeys(meshes + [root]):
        ident =(np.allclose(o.location, 0, atol=1e-9) and np.allclose(o.rotation_euler, 0, atol=1e-9)
                 and np.allclose(o.scale, 1, atol=1e-9) and np.allclose(o.rotation_quaternion, (1, 0, 0, 0), atol=1e-9))
        if not ident and o not in hints.get("pivot_nodes", []):
            g.fail("Q03", f"'{o.name}' has a non-identity transform; apply it")
        if o.type == "MESH" and o.modifiers:
            g.fail("Q03", f"'{o.name}' still has modifiers {[m.name for m in o.modifiers]}")

    # Q04 / Q05 box and origin (Blender object space = world: transforms are applied)
    lo, hi = np.full(3, 1e30), np.full(3, -1e30)
    tris = verts = 0
    for o in meshes:
        c = np.empty(len(o.data.vertices) * 3)
        o.data.vertices.foreach_get("co", c)
        c = c.reshape(-1, 3)
        lo, hi = np.minimum(lo, c.min(0)), np.maximum(hi, c.max(0))
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
        verts += len(o.data.vertices)
    dims = _dims_g(lo, hi)
    g.info.update(tris=tris, vertsInBlender=verts, sizeMm=[round(d * 1000, 3) for d in dims])
    if entry.get("dimensionsBasis") in mf.TRUSTED_DIMENSION_BASIS and entry.get("approxDimensionsM"):
        _compare_dims(g, dims, entry["approxDimensionsM"], "mesh")
    elif entry.get("approxDimensionsM"):
        g.warn("Q04", f"dimensionsBasis is '{entry.get('dimensionsBasis')}': size {dims} reported, not enforced until the lead approves it")
    lo_g, hi_g = [lo[0], lo[2], -hi[1]], [hi[0], hi[2], -lo[1]]
    centre_g = [(a + b) / 2 for a, b in zip(lo_g, hi_g)]
    g.info["originOffsetMm"] = [round(x * 1000, 3) for x in centre_g]
    if hints.get("origin"):
        _check_origin(g, centre_g, lo_g, hi_g, hints["origin"])
    if hints.get("thin_axis_z") and not (dims[2] < dims[0] and dims[2] < dims[1]):
        g.fail("Q05", f"a rotating part's thin axis must be z; size is {dims}")

    # Q06 budgets (V50): triangles, primitives, materials, zero texture memory
    prims = sum(len({p.material_index for p in o.data.polygons}) for o in meshes)
    used = sorted({m.name for o in meshes for m in o.data.materials if m})
    g.info.update(primitives=prims, materials=used)
    if tris > bud["triangles"]:
        g.fail("Q06", f"{tris} triangles exceed the {bud['triangles']} budget")
    if prims > bud["primitives"]:
        g.fail("Q06", f"{prims} primitives exceed {bud['primitives']}")
    if len(used) > bud["materials"]:
        g.fail("Q06", f"{len(used)} materials exceed {bud['materials']}")

    # Q07 / Q08 zero images, library proxies, constants only, single-sided
    n_img = len([i for i in bpy.data.images if i.users and i.name not in ("Render Result", "Viewer Node")])
    if n_img:
        g.fail("Q07", f"{n_img} image datablock(s) in use; a library part ships no images")
    for name in used:
        mat = bpy.data.materials[name]
        if name not in library:
            g.fail("Q08", f"material '{name}' is not in meta.materialLibrary")
        bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None
        if bsdf is None or any(i.is_linked for i in bsdf.inputs) or any(n.type == "TEX_IMAGE" for n in mat.node_tree.nodes):
            g.fail("Q08", f"material '{name}' must be a Principled BSDF with constants only")
        if not mat.use_backface_culling:
            g.fail("Q08", f"material '{name}' is double-sided (use_backface_culling is off)")
        if bsdf is not None and bsdf.inputs["Alpha"].default_value < 1.0 and name not in entry.get("allowAlpha", []):
            g.fail("Q08", f"material '{name}' is alpha but the manifest entry has no allowAlpha for it")
    if set(entry.get("materials", [])) != set(used):
        g.warn("Q08", f"materials used {used} differ from the manifest list {entry.get('materials')}")

    # Q09 COLOR_0 (baked AO or neutral white) and Q12 one UV map named UVMap
    for o in meshes:
        ca = o.data.color_attributes
        if [c.name for c in ca] != [vertex_ao.AO_NAME] or ca[0].domain != "POINT" or ca[0].data_type != "FLOAT_COLOR" \
                or ca.active_color is None or ca.active_color.name != vertex_ao.AO_NAME:
            g.fail("Q09", f"'{o.name}' needs exactly one active POINT FLOAT_COLOR attribute named AO (exports as COLOR_0)")
        else:
            a = vertex_ao.read(o)
            if not np.isfinite(a).all() or a.min() < -1e-6 or a.max() > 1 + 1e-6:
                g.fail("Q09", f"'{o.name}' AO values outside 0..1 or not finite")
            g.info["ao"] = vertex_ao.stats(o)
        if [u.name for u in o.data.uv_layers] != ["UVMap"]:
            g.fail("Q12", f"'{o.name}' UV maps {[u.name for u in o.data.uv_layers]}; need exactly one named UVMap")

    # Q10 topology (mesh_qa): a closed solid has no open, loose, doubled or zero-area geometry
    for o in meshes:
        q = wu.mesh_qa(o)
        bad = {k: q[k] for k in ("non_manifold_edges", "loose_verts", "loose_edges", "inconsistent_winding_edges",
                                 "duplicate_verts", "zero_area_faces") if q[k]}
        if hints.get("closed", True) and (bad or q["signed_volume"] <= 0):
            g.fail("Q10", f"'{o.name}' topology: {bad or ''} signed volume {q['signed_volume']:.3e}")
        g.info.setdefault("meshQa", {})[o.name] = {k: q[k] for k in ("verts", "faces", "tris", "quads", "ngons", "signed_volume")}

    # Q11 helper empties: wu type matches the prefix; colliders have shape and positive size; COL_Grab >= 12 mm
    for o in empties:
        h = _py(o.get("wu", {}))
        prefix = next((p for p in HELPERS if o.name.startswith(p)), None)
        if prefix is None or h.get("type") != HELPERS[prefix]:
            g.fail("Q11", f"'{o.name}' wu.type must be '{HELPERS.get(prefix)}', got {h.get('type')}")
        if o.parent is not root:
            g.fail("Q11", f"'{o.name}' must be a child of the root")
        if prefix == "COL_":
            sc = [float(x) for x in o.scale]
            if h.get("shape") not in ("sphere", "box") or min(sc) <= 0:
                g.fail("Q11", f"'{o.name}' needs shape sphere|box and a positive scale; got {h.get('shape')} {sc}")
            if h.get("shape") == "sphere" and (not math.isclose(h.get("radius", -1), sc[0], rel_tol=1e-6) or not np.allclose(sc, sc[0])):
                g.fail("Q11", f"'{o.name}' radius {h.get('radius')} differs from its scale {sc}")
            if o.name == "COL_Grab" and h.get("shape") == "sphere" and sc[0] < MIN_GRAB_RADIUS_M:
                g.fail("Q11", f"COL_Grab radius {sc[0] * 1000:.1f} mm is under 12 mm (INTERACTION_SPEC 7.2)")
    for line in entry.get("colliders", []):
        m = re.match(r"(COL_\w+)", line)
        if m and m.group(1) not in names:
            g.fail("Q11", f"manifest lists {m.group(1)} but the part has no such empty")
    for check in hints.get("checks", []):                           # geometry rules only the generator knows (tooth count, ...)
        check(g, objs)
    return g


def check_glb(path, entry, manifest) -> Gate:
    """After export: structure, size and budgets of the file itself (a small subset of the validator's V01 to V50)."""
    g = Gate()
    js, binc, nbytes = wu.read_glb(path)
    bud, library = entry["budgets"], mf.material_library(manifest)
    acc, nodes = js.get("accessors", []), js.get("nodes", [])
    g.info.update(bytes=nbytes)
    if nbytes > bud["glbKB"] * 1000:
        g.fail("Q20", f"{nbytes} bytes exceed {bud['glbKB']} KB")
    if "Khronos glTF Blender I/O" not in js["asset"].get("generator", ""):
        g.warn("Q20", f"generator is '{js['asset'].get('generator')}'")
    if js.get("images") or js.get("textures") or js.get("samplers") or any("uri" in b for b in js["buffers"]):
        g.fail("Q21", "the GLB carries images, textures, samplers or an external buffer")
    ext = set(js.get("extensionsUsed", []))
    if ext - ALLOWED_EXT or js.get("extensionsRequired"):
        g.fail("Q22", f"extensions {sorted(ext - ALLOWED_EXT)} / required {js.get('extensionsRequired')} are not allowed")
    if js.get("animations") or js.get("skins") or js.get("cameras"):
        g.fail("Q22", "a static part carries animations, skins or cameras")
    top = js["scenes"][js.get("scene", 0)]["nodes"]
    if len(top) != 1:
        g.fail("Q23", f"{len(top)} top-level nodes; a part has exactly one root")
    else:
        rw = nodes[top[0]].get("extras", {}).get("wu", {})
        if rw.get("id") != entry["id"] or rw.get("family") != mf.family_folder(entry):
            g.fail("Q23", f"root extras.wu is {rw}")
        if nodes[top[0]].get("name") != (entry.get("meshes") or [None])[0]:
            g.warn("Q23", f"root node '{nodes[top[0]].get('name')}' is not the first manifest mesh")
    tris = prims = 0
    lo, hi = np.full(3, 1e30), np.full(3, -1e30)
    for m in js.get("meshes", []):
        for p in m["primitives"]:
            prims += 1
            tris += acc[p["indices"]]["count"] // 3
            a = p["attributes"]
            for need in ("POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0"):
                if need not in a:
                    g.fail("Q24", f"mesh '{m['name']}' primitive lacks {need}")
            if "JOINTS_0" in a or "WEIGHTS_0" in a or p.get("mode", 4) != 4:
                g.fail("Q24", f"mesh '{m['name']}': skin attributes or a non-triangle mode")
            pa = acc[a["POSITION"]]
            lo, hi = np.minimum(lo, pa["min"]), np.maximum(hi, pa["max"])
    g.info.update(tris=tris, primitives=prims, vertices=sum(acc[p["attributes"]["POSITION"]]["count"] for m in js.get("meshes", []) for p in m["primitives"]))
    if tris > bud["triangles"] or prims > bud["primitives"]:
        g.fail("Q25", f"{tris} triangles / {prims} primitives exceed the budget {bud['triangles']} / {bud['primitives']}")
    mats = js.get("materials", [])
    if len(mats) > bud["materials"]:
        g.fail("Q25", f"{len(mats)} materials exceed {bud['materials']}")
    for mt in mats:
        if mt.get("name") not in library:
            g.fail("Q26", f"material '{mt.get('name')}' is not in the library")
        if mt.get("doubleSided"):
            g.fail("Q26", f"material '{mt.get('name')}' is double-sided")
        if mt.get("alphaMode", "OPAQUE") != "OPAQUE" and mt.get("name") not in entry.get("allowAlpha", []):
            g.fail("Q26", f"material '{mt.get('name')}' is {mt['alphaMode']}")
    g.info["materialConstants"] = {m["name"]: m.get("pbrMetallicRoughness") for m in mats}
    dims = [float(x) for x in (hi - lo)]
    g.info["sizeMm"] = [round(d * 1000, 3) for d in dims]
    if entry.get("dimensionsBasis") in mf.TRUSTED_DIMENSION_BASIS and entry.get("approxDimensionsM"):
        _compare_dims(g, dims, entry["approxDimensionsM"], "GLB")
    for i, n in enumerate(nodes):                                    # helper nodes keep their wu (V28)
        for pre, typ in HELPERS.items():
            if n.get("name", "").startswith(pre) and n.get("extras", {}).get("wu", {}).get("type") != typ:
                g.fail("Q27", f"node '{n['name']}' extras.wu.type is not '{typ}'")
        if "mesh" in n and n.get("name") != js["meshes"][n["mesh"]]["name"]:
            g.fail("Q27", f"node '{n.get('name')}' differs from its mesh name '{js['meshes'][n['mesh']]['name']}'")
    return g
