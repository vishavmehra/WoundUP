"""selftest.py - runnable check of the framework conventions (no repository file is touched; scratch files only).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/lib/selftest.py

T1 every library proxy exports with its real constants, no images, the expected extension
T2 empties: position, scale and +Z axis land where the glTF-space convention says (the swizzle)
T3 metric box UVs: 1 UV unit = 0.1 m and no mirrored face
T4 the QA gate catches each seeded defect (and passes the clean part)
"""
from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

import bmesh
import bpy
import numpy as np
from mathutils import Quaternion, Vector

import wu_common as wu
from lib import empties, export_profile, materials, qa_gate, uvmetric, vertex_ao
from lib import manifest as mf

TMP = Path(tempfile.mkdtemp(prefix="forge_selftest_"))
MANIFEST = mf.load()
FAILS = []


def check(name, cond, detail=""):
    print(f"[selftest] {'PASS' if cond else 'FAIL'} {name} {detail}")
    if not cond:
        FAILS.append(name)


def cube(name="TestCube", size=0.1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=size)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return wu.link_object(name, me)


def part(mat="Mat_AgedBrass", name="TestCube"):
    wu.reset_scene()
    o = cube(name)
    materials.assign(o, mat)
    uvmetric.box_project(o)
    vertex_ao.neutral(o)
    o["wu"] = dict(id="test_cube", family="test")
    return o


# ---- T1 proxies
for name in mf.material_library(MANIFEST):
    o = part(name)
    ex = export_profile.export([o], TMP / f"{name}.glb")
    js = wu.read_glb(ex["path"])[0]
    m = js["materials"][0]
    c = materials.constants(name)
    pbr = m["pbrMetallicRoughness"]
    want = list(wu.hex_to_linear(c["baseColor"])) + [c.get("alpha", {}).get("opacity", 1.0)]
    ok = (m["name"] == name and not js.get("images") and not js.get("textures") and not m.get("doubleSided")
          and np.allclose(pbr["baseColorFactor"], want, atol=2e-3) and abs(pbr.get("metallicFactor", 1.0) - c["metallic"]) < 2e-3
          and abs(pbr.get("roughnessFactor", 1.0) - c["roughness"]) < 2e-3 and not ex["skippedProperties"])
    exts = sorted(js.get("extensionsUsed", []))
    expect = []
    if name == "Mat_VelvetTeal" and "sheen" in c:
        expect = ["KHR_materials_sheen"]
    if name == "Mat_WarmEmissive":
        expect = ["KHR_materials_emissive_strength"]
    check(f"T1 proxy {name}", ok and exts == expect, f"ext={exts} alpha={m.get('alphaMode')} src={c['_source']} skipped={ex['skippedProperties']}")
    if "alpha" in c:
        check(f"T1 {name} alphaMode BLEND", m.get("alphaMode") == "BLEND")

# ---- T2 empties
o = part()
col = empties.add_collider(o, "Box", "box", (0.03, 0.01, 0.02), loc_g=(0.01, 0.02, 0.03))
sock = empties.add_socket(o, "Plug", (0.0, 0.05, 0.0), ["shaft"], axis_g=(1, 0, 0))
piv = empties.add_pivot(o, "Hinge", (0.04, 0, 0), axis_g=(0, 1, 0), axis_label="+Y")
ex = export_profile.export([o, col, sock, piv], TMP / "empties.glb")
nd = {n["name"]: n for n in wu.read_glb(ex["path"])[0]["nodes"]}
check("T2 collider translation", np.allclose(nd["COL_Box"]["translation"], (0.01, 0.02, 0.03), atol=1e-6), str(nd["COL_Box"].get("translation")))
check("T2 collider scale swizzle", np.allclose(nd["COL_Box"]["scale"], (0.03, 0.01, 0.02), atol=1e-6), str(nd["COL_Box"].get("scale")))
for n, want in (("SOCKET_Plug", (1, 0, 0)), ("PIV_Hinge", (0, 1, 0))):
    q = Quaternion((nd[n]["rotation"][3], *nd[n]["rotation"][:3]))
    z = q @ Vector((0, 0, 1))
    check(f"T2 {n} +Z axis", np.allclose(z, want, atol=1e-5), f"+Z -> {tuple(round(x, 5) for x in z)}")
check("T2 wu extras", nd["SOCKET_Plug"]["extras"]["wu"]["accepts"] == ["shaft"] and nd["PIV_Hinge"]["extras"]["wu"]["kind"] == "rotation_axis")
check("T2 pivots and sockets keep scale 1", "scale" not in nd["SOCKET_Plug"] and "scale" not in nd["PIV_Hinge"])

# ---- T3 metric UVs
o = part()
me = o.data
uv = me.uv_layers["UVMap"].data
us = [uv[i].uv[0] for i in range(len(uv))]
vs = [uv[i].uv[1] for i in range(len(uv))]
areas = []
for p in me.polygons:
    a = np.array([uv[i].uv[:] for i in p.loop_indices])
    areas.append(0.5 * (np.dot(a[:, 0], np.roll(a[:, 1], -1)) - np.dot(a[:, 1], np.roll(a[:, 0], -1))))
check("T3 cube face = 1.0 UV unit (0.1 m)", np.allclose(areas, 1.0, atol=1e-5), f"areas={np.round(areas, 3).tolist()}")
check("T3 no mirrored face, one map named UVMap", min(areas) > 0 and [u.name for u in me.uv_layers] == ["UVMap"])

# ---- T4 gate
entry = dict(id="test_cube", glbPath="public/assets/models/shared/test/test_cube.glb", meshes=["TestCube"], materials=["Mat_AgedBrass"],
             budgets=dict(triangles=100, primitives=1, materials=1, textureMiB=0, glbKB=20), approxDimensionsM=[0.1, 0.1, 0.1],
             dimensionsBasis="derived", colliders=["COL_Grab (sphere)"])


def gate_of(mutate=None, hints=None):
    o = part()
    col = empties.add_collider(o, "Grab", "sphere", 0.05)
    if mutate:
        mutate(o, col)
    return qa_gate.check_scene([o, col], entry, MANIFEST, hints)


g = gate_of()
check("T4 clean part passes", g.ok, str(g.fails))


def seeded(label, qid, mutate, hints=None):
    g = gate_of(mutate, hints)
    check(f"T4 gate catches: {label}", any(f.startswith(qid) for f in g.fails), f"fails={g.fails}")


def over_budget(o, c):
    entry["budgets"]["triangles"] = 5


seeded("triangle budget", "Q06", over_budget)
entry["budgets"]["triangles"] = 100
seeded("material not in library", "Q08", lambda o, c: setattr(o.data.materials[0], "name", "Brass_Final2"))
seeded("double-sided material", "Q08", lambda o, c: setattr(o.data.materials[0], "use_backface_culling", False))


def with_image(o, c):
    nt = o.data.materials[0].node_tree
    tx = nt.nodes.new("ShaderNodeTexImage")
    tx.image = bpy.data.images.new("img", 4, 4)
    nt.links.new(tx.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])


def small_grab(o, c):
    c.scale = (0.005, 0.005, 0.005)
    c["wu"] = dict(c["wu"].to_dict(), radius=0.005)


def shift_x(o, c):
    for v in o.data.vertices:
        v.co.x += 0.01


def grow(o, c):
    for v in o.data.vertices:
        v.co *= 1.5


def open_mesh(o, c):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[0]], context="FACES_ONLY")
    bm.to_mesh(o.data)
    bm.free()


seeded("image-linked material", "Q07", with_image)
seeded("missing COLOR_0", "Q09", lambda o, c: o.data.color_attributes.remove(o.data.color_attributes[0]))
seeded("COL_Grab under 12 mm", "Q11", small_grab)
seeded("wrong root wu.id", "Q01", lambda o, c: o.__setitem__("wu", dict(id="other", family="test")))
seeded("name with .001 suffix", "Q02", lambda o, c: setattr(o, "name", "TestCube.001"))
seeded("non-identity transform", "Q03", lambda o, c: setattr(o, "location", (0.01, 0, 0)))
seeded("two UV maps", "Q12", lambda o, c: o.data.uv_layers.new(name="UVMap.001"))
seeded("origin off centre", "Q05", shift_x, hints=dict(origin=("centre",) * 3))
seeded("wrong size", "Q04", grow)
seeded("open mesh", "Q10", open_mesh)

# post-export check: clean file passes, double-sided file fails
o = part()
col = empties.add_collider(o, "Grab", "sphere", 0.05)
ex = export_profile.export([o, col], TMP / "clean.glb")
pg = qa_gate.check_glb(ex["path"], entry, MANIFEST)
check("T4 clean GLB passes", pg.ok, str(pg.fails))
o = part()
o.data.materials[0].use_backface_culling = False
ex = export_profile.export([o], TMP / "dbl.glb")
pg = qa_gate.check_glb(ex["path"], entry, MANIFEST)
check("T4 GLB check catches double-sided", any(f.startswith("Q26") for f in pg.fails), str(pg.fails))

# ---- T5 the gear check measures the mesh, not the parameters
import math

import gen_gear_spur as gg

wu.reset_scene()
objs, hints = gg.build(mf.find(MANIFEST, "gear_spur_12_m1"), gg.PARAMS["gear_spur_12_m1"])
g = qa_gate.Gate()
hints["checks"][0](g, objs)
check("T5 12T gear passes its geometry check", g.ok, f"{g.fails} {g.info}")
kw = {k: v for k, v in gg.PARAMS["gear_spur_12_m1"].items() if k != "grab_radius"}
g = qa_gate.Gate()
gg.geometry_check(gg.GearParams(**{**kw, "teeth": 13}).derive())(g, objs)
check("T5 wrong tooth count is caught", any("teeth found" in f for f in g.fails), str(g.fails))
a = math.radians(3.0)
for v in objs[0].data.vertices:                                   # turn the gear 3 degrees about its axis (Blender Y)
    v.co.x, v.co.z = v.co.x * math.cos(a) - v.co.z * math.sin(a), v.co.x * math.sin(a) + v.co.z * math.cos(a)
g = qa_gate.Gate()
hints["checks"][0](g, objs)
check("T5 tooth 0 off +X is caught", any("off +X" in f for f in g.fails), str(g.fails))

print(f"[selftest] {'ALL PASSED' if not FAILS else 'FAILED: ' + ', '.join(FAILS)}  (scratch {TMP})")
sys.exit(1 if FAILS else 0)
