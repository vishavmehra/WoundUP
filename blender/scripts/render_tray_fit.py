"""render_tray_fit.py - top-down proof render of the parts tray with the Music Box parts in their compartments.

Not an asset generator: it reads the placements that tests/assets/tray-fit.test.ts writes (the same poses the game spawns the parts in,
src/tray-layout.ts) and puts the real GLBs there, so the picture shows what the test measured.

    WU_TRAY_PLACEMENTS=<json> npx vitest run tests/assets/tray-fit.test.ts
    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/render_tray_fit.py -- <json> <out.png> [samples]

Cycles on the GPU (wu.setup_cycles, OptiX), orthographic camera straight down, the back of the tray (glTF -z) at the top of the picture.
"""
from __future__ import annotations

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Matrix, Quaternion, Vector

import wu_common as wu
from lib import contact_sheet
from lib import manifest as mf

C = Matrix.Rotation(math.radians(90.0), 3, "X")                      # glTF (x, y, z) -> Blender (x, -z, y)


def blender_pose(position, quaternion):
    """glTF position and [x, y, z, w] -> Blender location and quaternion (rotation conjugated by the axis change)."""
    p = C @ Vector(position)
    x, y, z, w = quaternion
    q = Quaternion((w, x, y, z)).to_matrix()
    return p, (C @ q @ C.inverted()).to_quaternion()


def place(objs, position, quaternion, name):
    pivot = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(pivot)
    for o in objs:
        if o.parent is None:
            o.parent = pivot
    loc, rot = blender_pose(position, quaternion)
    pivot.rotation_mode = "QUATERNION"
    pivot.location, pivot.rotation_quaternion = loc, rot
    return pivot


def main():
    args = wu.script_args()
    src, out = args[0], args[1]
    samples = int(args[2]) if len(args) > 2 else 48
    data = json.loads(open(src, encoding="utf-8").read())
    manifest = mf.load()
    scene = wu.reset_scene()

    tray = wu.import_glb(wu.REPO_ROOT / mf.find(manifest, "parts_tray")["glbPath"])
    contact_sheet._apply_vertex_ao(tray)
    for k, part in enumerate(data["parts"]):
        objs = wu.import_glb(wu.REPO_ROOT / mf.find(manifest, part["asset"])["glbPath"])
        contact_sheet._apply_vertex_ao(objs)
        for o in objs:                                                # the grab colliders and sockets are not for the picture
            if o.type == "EMPTY":
                o.hide_render = True
        place(objs, part["position"], part["quaternion"], f"part_{k}_{part['asset']}")
    for o in tray:
        if o.type == "EMPTY":
            o.hide_render = True
    bpy.context.view_layer.update()

    wu.build_studio(scene, 0.3, floor_z=-0.0006, key_energy=1.0)
    cd = bpy.data.cameras.new("top_cam")
    cd.type, cd.clip_start, cd.clip_end = "ORTHO", 0.001, 5.0
    res = (900, 1488)
    cd.ortho_scale = 0.222                                            # the 0.21 m tray plus a margin, along the picture's longer side
    cam = wu.link_object("top_cam", cd, scene)
    cam.location = Vector((0.0, 0.0, 1.0))
    cam.rotation_euler = (0.0, 0.0, 0.0)                              # straight down, +Y (glTF -z, the back) at the top
    scene.camera = cam
    wu.setup_cycles(scene, samples=samples)
    wu.render_to(scene, out, res=res, samples=samples)


main()
