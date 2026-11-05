"""compose_m0_stage.py - M0 stage composition render: tockton_base_round + meshing brass gears (12T / 16T / 24T).

    blender --background --factory-startup --python blender/scripts/compose_m0_stage.py -- [--samples 128]

Reads the EXPORTED GLBs (public/assets/models/... for the deliverables, blender/exports/variants/ for the 12T / 24T
helper gears produced by `gen_gear_spur.py --teeth 12|24 --res 512 --no-previews`) so the picture checks scale, colour
harmony and orientation of what actually ships. Gears lie flat on the velvet, resting on their hub bosses, phased so a
tooth of one enters a gap of the next (shared module => centre distance = module * (z1 + z2) / 2).
"""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Matrix, Vector

import wu_common as wu
from gen_gear_spur import GearParams


def main(argv):
    samples = 128
    if "--samples" in argv:
        samples = int(argv[argv.index("--samples") + 1])
    base_glb = wu.MODEL_DIR / "environment" / "tockton_base_round.glb"
    g16 = wu.MODEL_DIR / "props" / "gear_spur_16_brass.glb"
    g12 = wu.EXPORT_DIR / "variants" / "gear_spur_12_brass.glb"
    g24 = wu.EXPORT_DIR / "variants" / "gear_spur_24_brass.glb"
    for f in (base_glb, g16, g12, g24):
        assert f.exists(), f"missing {f} - generate it first"

    scene = wu.reset_scene()
    wu.setup_cycles(scene, samples=samples)
    base_objs = wu.import_glb(base_glb)
    base = next(o for o in base_objs if o.type == "MESH")
    y_floor = 0.041                                    # velvet surface (glTF y / Blender z)
    m = GearParams(teeth=16).derive().m                # shared module
    pitch = lambda z: m * z / 2.0

    def place(path, teeth, centre_xy, alpha):
        objs = wu.import_glb(path)
        o = next(x for x in objs if x.type == "MESH")
        p = GearParams(teeth=teeth).derive()
        h = p.h_boss                                   # rests on its hub boss
        M = (Matrix.Translation((centre_xy[0], centre_xy[1], y_floor + h)) @ Matrix.Rotation(alpha, 4, "Z")
             @ Matrix.Rotation(-math.pi / 2, 4, "X"))
        o.matrix_world = M
        return o

    A = Vector((-0.020, -0.012))
    psi_b, psi_c = 0.0, math.radians(135.0)
    B = A + (pitch(16) + pitch(12)) * Vector((math.cos(psi_b), math.sin(psi_b)))
    C = A + (pitch(16) + pitch(24)) * Vector((math.cos(psi_c), math.sin(psi_c)))
    place(g16, 16, A, 0.0)                                                   # tooth 0 points at B, tooth 6 at C
    place(g12, 12, B, psi_b + math.pi - math.pi / 12)                         # gap points back at A
    place(g24, 24, C, psi_c + math.pi - math.pi / 24)
    wu.log(f"centres A={tuple(round(v, 4) for v in A)} B={tuple(round(v, 4) for v in B)} C={tuple(round(v, 4) for v in C)}")

    wu.build_studio(scene, 0.40, floor_z=-0.0002)
    specs = {
        "m0_stage_composition": ((0.56, 0.60, 0.66), (-0.012, 0.040, 0.006), 50),
        "m0_stage_composition_close": ((0.20, 0.17, 0.25), (-0.005, 0.045, 0.012), 70),
    }
    for name, (pos, tgt, lens) in specs.items():
        cam = wu.make_camera(scene, wu.g2b(pos), wu.g2b(tgt), lens)
        wu.render_to(scene, wu.PREVIEW_DIR / f"{name}.png", res=(1280, 960), samples=samples, max_kb=600)
        bpy.data.objects.remove(cam)


if __name__ == "__main__":
    main(wu.script_args())
