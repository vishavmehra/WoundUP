"""render_hardware_fit.py - proof render of the Music Box with its hardware seated at the GLB sockets (ADR-050 / INTRICATE_ASSEMBLY_DESIGN section 8).

Not an asset generator. It imports the real GLBs, places every part at the SOCKET_ empty of its host (the case, then each part's own carried sockets, exactly
as the game's blueprint will) and renders three views, so the picture shows what the socket poses mean. Nothing is written but the PNGs.

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/render_hardware_fit.py -- <glb-root> <out-dir> [samples]

<glb-root> is a public/assets/models folder. Cycles on the GPU (wu.setup_cycles, OptiX). The lid is hidden. Gear teeth are not phased (the runtime turns each driven gear
half a tooth); only the hardware fit is on trial here.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Matrix, Vector

import wu_common as wu
from lib import contact_sheet
from lib import manifest as mf

PATH = {}                                   # asset id -> glb path, filled from the manifest (the repo manifest, or MANIFEST)


def spawn(asset_id: str, world: Matrix, tag: str):
    """Import `asset_id`, parent its roots to a pivot, put the pivot at `world`. Returns {socket name: empty object}."""
    objs = wu.import_glb(PATH[asset_id])
    contact_sheet._apply_vertex_ao(objs)
    pivot = bpy.data.objects.new(f"{tag}_{asset_id}", None)
    bpy.context.scene.collection.objects.link(pivot)
    for o in objs:
        if o.parent is None:
            o.parent = pivot
    pivot.matrix_world = world
    for o in objs:
        if o.type == "EMPTY":
            o.hide_render = True
        if o.name.startswith("MusicBoxCase_Lid"):
            o.hide_render = True
    bpy.context.view_layer.update()
    return {o.name.split(".")[0]: o for o in objs if o.type == "EMPTY" and o.name.startswith("SOCKET_")}


def main():
    args = wu.script_args()
    root, out = Path(args[0]), Path(args[1])
    samples = int(args[2]) if len(args) > 2 else 48
    manifest = mf.load(os.environ.get("WU_MANIFEST") or None)
    for e in manifest["assets"]:
        if e["glbPath"].startswith("public/assets/models/"):       # assets/future/... are not shipped and not needed
            PATH[e["id"]] = root / e["glbPath"][len("public/assets/models/"):]
    scene = wu.reset_scene()

    placed = 0

    def put(host, sock, asset, tag):
        nonlocal placed
        placed += 1
        return spawn(asset, host[f"SOCKET_{sock}"].matrix_world.copy(), tag)

    case = spawn("music_box_case", Matrix.Identity(4), "case")
    brl, brr = put(case, "BracketL", "bracket_support", "brL"), put(case, "BracketR", "bracket_support", "brR")
    for br in (brl, brr):
        put(br, "Bush", "bush_split_8", "bush")
        put(br, "Screw", "screw_slot_m3", "brscrew")
    arbor = put(case, "Arbor", "shaft_short", "arbor")
    cyl = put(arbor, "Cylinder", "cylinder_music_box", "cyl")
    for s in ("CollarL", "CollarR"):
        put(cyl, s, "collar_set_8", "collar")
    for s in ("WasherL1", "WasherL2", "WasherR1", "WasherR2"):
        put(arbor, s, "washer_plain_8", "washer")
    for s, g in (("WheelL", "gear_spur_16_m1"), ("WheelR", "gear_spur_20_m1")):
        put(put(arbor, s, g, "gear"), "Pin", "pin_taper_2", "pin")
    comb = put(case, "Comb", "comb_music_box", "comb")
    for s in ("ClipL", "ClipR"):
        put(put(comb, s, "clip_angle_small", "clip"), "Screw", "screw_slot_m3", "clipscrew")
    spring = put(case, "Spring", "spring_standard", "spring")
    put(spring, "Washer", "washer_plain_8", "washer")
    put(put(spring, "Pinion", "gear_spur_10_m1", "gear"), "Pin", "pin_taper_2", "pin")
    put(put(spring, "Key", "winding_key", "key"), "Screw", "screw_slot_m3", "keyscrew")
    gov = put(case, "Governor", "governor_standard", "gov")
    put(put(gov, "Pinion", "gear_spur_12_m1", "gear"), "Pin", "pin_taper_2", "pin")
    put(gov, "FrameScrew", "screw_slot_m3", "govscrew")
    put(case, "SpringAnchor", "pin_dowel_3", "anchor")
    wu.log(f"placed {placed} parts and pieces of hardware")

    wu.build_studio(scene, 0.4, floor_z=-0.001, key_energy=2.2)
    wu.setup_cycles(scene, samples=samples)
    box = Vector((0.0, 0.0, 0.04))                              # Blender: the middle of the case interior (glTF y 0.04)
    views = {                                                   # name: (camera in glTF metres, target in glTF metres, lens)
        "overview": ((0.02, 0.30, 0.20), (0.0, 0.04, 0.0), 50.0),
        "top": ((0.0, 0.36, 0.06), (0.0, 0.04, 0.0), 50.0),
        "left_end": ((-0.075, 0.21, 0.07), (-0.042, 0.040, -0.004), 90.0),      # governor wheel, left bracket, washers, cylinder collar
        "right_end": ((0.085, 0.21, 0.09), (0.042, 0.045, 0.006), 90.0),        # drive wheel, right bracket, spring, spring pinion, key
        "comb_clips": ((-0.005, 0.21, 0.015), (-0.005, 0.034, 0.024), 90.0),     # the comb's rear shelf with its two angle clips and their screws
    }
    out.mkdir(parents=True, exist_ok=True)
    only = [v for v in os.environ.get("WU_VIEWS", "").split(",") if v]       # e.g. WU_VIEWS=comb_clips renders just that view
    for name, (cam, tgt, lens) in views.items():
        if only and name not in only:
            continue
        wu.make_camera(scene, wu.g2b(cam), wu.g2b(tgt), lens=lens, name=f"cam_{name}")
        wu.render_to(scene, out / f"hardware_fit_{name}.png", res=(1280, 960), samples=samples)


main()
