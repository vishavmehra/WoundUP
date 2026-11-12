"""contact_sheet.py - one size-aware review sheet per family per round, rendered from the RE-IMPORTED GLBs (GUIDELINES 11).

render(items, out_png, grade)   items = [dict(id, path, caption)], grade 'draft' (EEVEE, about 1280x960 pixels, 16 spl) or
                                'final' (Cycles, about 1920x1080 pixels, 64 spl, denoised, OPTIX when present). The pixel count is
                                that of the grade; the aspect follows the layout (1:1 to 16:9) so a tall layout is not a thumbnail.

Layout: one row per view (front, then a 3/4 view), one cell per asset, each cell as wide as its own asset plus a gap that
scales with the biggest asset (a fixed pitch made large gears overlap in the audit's test). Orthographic camera, so sizes
compare true. The sheet shows shape, proportion, bevels, baked AO and the proxy colour constants. It cannot show the shared
textured look and is no evidence of Quest appearance.
"""
from __future__ import annotations

import math
import time

import numpy as np

import bpy
from mathutils import Euler, Vector

import wu_common as wu

# key: studio key-light multiplier. EEVEE has no ray-traced reflection of the backdrop, so a metal proxy needs a dimmer key there
# than in Cycles, where 1.0 is the calibration of wu.build_studio.
GRADES = {"draft": dict(engine="BLENDER_EEVEE", res=(1280, 960), samples=16, key=0.6),
          "final": dict(engine="CYCLES", res=(1920, 1080), samples=64, key=1.0)}
VIEWS = (("front", (0.0, 0.0, 0.0)), ("3/4", (math.radians(-28), 0.0, math.radians(38))))


def _world_box(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    a = np.array([[p.x, p.y, p.z] for p in pts])
    return a.min(0), a.max(0)


def _apply_vertex_ao(objs):
    """Make sure the proxy colour is multiplied by COLOR_0, as three.js does with vertexColors = true. Blender 5.2's glTF importer
    already wires colour x Color Attribute into Base Color (checked); this only covers an importer that does not."""
    for o in objs:
        if o.type != "MESH" or not o.data.color_attributes:
            continue
        layer = o.data.color_attributes[0].name
        for mat in o.data.materials:
            nt = mat.node_tree
            b = nt.nodes["Principled BSDF"]
            if b.inputs["Base Color"].is_linked:
                continue
            vc = nt.nodes.new("ShaderNodeVertexColor")
            vc.layer_name = layer
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
            mix.inputs[0].default_value = 1.0
            mix.inputs[6].default_value = b.inputs["Base Color"].default_value
            nt.links.new(vc.outputs["Color"], mix.inputs[7])
            nt.links.new(mix.outputs[2], b.inputs["Base Color"])


def _label(scene, text, size, loc, mat):
    cu = bpy.data.curves.new("lbl", "FONT")
    cu.body, cu.size, cu.align_x, cu.align_y = text, size, "CENTER", "TOP"
    cu.materials.append(mat)
    o = wu.link_object("lbl", cu, scene)
    o.location = loc
    o.rotation_euler = (math.pi / 2, 0.0, 0.0)               # text lies in XZ, readable from the -Y camera
    return o


def render(items: list[dict], out_png, grade: str = "draft") -> dict:
    t0 = time.time()
    cfg = GRADES[grade]
    scene = wu.reset_scene()
    cells = []
    for row, (view, rot) in enumerate(VIEWS):
        for it in items:
            objs = wu.import_glb(it["path"])
            _apply_vertex_ao(objs)
            pivot = bpy.data.objects.new(f"cell_{it['id']}_{row}", None)
            scene.collection.objects.link(pivot)
            for o in objs:
                if o.parent is None:
                    o.parent = pivot
            pivot.rotation_euler = Euler(rot, "XYZ")
            bpy.context.view_layer.update()
            lo, hi = _world_box(objs)
            cells.append(dict(item=it, view=view, row=row, pivot=pivot, lo=lo, hi=hi, w=float(hi[0] - lo[0]), h=float(hi[2] - lo[2])))
    big = max(max(c["w"], c["h"]) for c in cells)
    gap = 0.16 * big
    caps = {id(c): c["item"]["id"] + "\n" + (c["item"].get("caption", "") if c["row"] == 0 else f"({c['view']} view)") for c in cells}
    longest = max(len(line) for t in caps.values() for line in t.split("\n"))
    txt = max(min(min(c["w"] + 0.8 * gap for c in cells) / (longest * 0.62), 0.07 * big), 0.03 * big)
    lab_h = txt * 1.5 * (max(t.count("\n") for t in caps.values()) + 1)    # room for the caption lines
    row_w = [sum(c["w"] for c in cells if c["row"] == r) + gap * (len(items) - 1) for r in range(len(VIEWS))]
    row_h = [max(c["h"] for c in cells if c["row"] == r) for r in range(len(VIEWS))]
    W, H = max(row_w), sum(row_h) + (lab_h + gap) * len(VIEWS)
    ink = bpy.data.materials.new("lbl_ink")
    ink.use_nodes = True
    ink.node_tree.nodes.clear()
    em = ink.node_tree.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*wu.hex_to_linear("#1E1710"), 1.0)
    out = ink.node_tree.nodes.new("ShaderNodeOutputMaterial")
    ink.node_tree.links.new(em.outputs["Emission"], out.inputs["Surface"])
    y_top = H / 2
    for r in range(len(VIEWS)):
        rc = [c for c in cells if c["row"] == r]
        x = -row_w[r] / 2
        zc = y_top - row_h[r] / 2
        for c in rc:
            centre = (c["lo"] + c["hi"]) / 2
            c["pivot"].location += Vector((x + c["w"] / 2 - centre[0], -centre[1], zc - centre[2]))
            _label(scene, caps[id(c)], txt, (x + c["w"] / 2, -0.5 * big, zc - row_h[r] / 2 - gap * 0.35), ink)
            x += c["w"] + gap
        y_top -= row_h[r] + lab_h + gap
    bpy.context.view_layer.update()
    s = max(W, H) * 0.6
    wu.build_studio(scene, s, floor_z=-H / 2 - 0.1 * H, key_energy=cfg["key"])
    cd = bpy.data.cameras.new("sheet_cam")
    cd.type, cd.clip_start, cd.clip_end = "ORTHO", 0.001, 50
    px = cfg["res"][0] * cfg["res"][1]                           # keep the grade's pixel count, take the aspect from the layout
    aspect = min(max(W / H, 1.0), 16 / 9)
    res = (int(round(math.sqrt(px * aspect) / 16)) * 16, int(round(math.sqrt(px / aspect) / 16)) * 16)
    cd.ortho_scale = max(W * 1.1, H * 1.1 * res[0] / res[1])
    cam = wu.link_object("sheet_cam", cd, scene)
    cam.location = Vector((0.0, -4.0 * s, 0.0))
    cam.rotation_euler = (math.pi / 2, 0.0, 0.0)                 # looks along +Y
    scene.camera = cam
    if cfg["engine"] == "CYCLES":
        wu.setup_cycles(scene, samples=cfg["samples"])
    else:
        scene.render.engine = cfg["engine"]
        scene.eevee.taa_render_samples = cfg["samples"]
    wu.render_to(scene, out_png, res=res, samples=cfg["samples"])
    return dict(path=str(out_png), grade=grade, engine=scene.render.engine, device=getattr(scene.cycles, "device", None) if cfg["engine"] == "CYCLES" else "EEVEE",
                resolution=list(res), samples=cfg["samples"], seconds=round(time.time() - t0, 1), cells=len(cells),
                layoutMm=[round(W * 1000, 1), round(H * 1000, 1)])
