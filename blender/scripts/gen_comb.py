"""gen_comb.py - the comb family: the tined comb of the Music Box (forge family 'comb').

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family comb --only comb_music_box --out-root <dir> --owner Machines [--manifest <file>]

Model space (glTF Y-up, centimetres while building): +X along the cylinder axis (bass tine on -X), +Y up, the tines run towards -Z
(towards the cylinder) from a slanted spine, the base block sits at +Z. Origin: x = 0, y = middle of the 10 mm height, z = 0 on the
cylinder-side face of the base block at x = 0 ("centre of the comb base on the cylinder side", manifest originAndPivot).

18 tines, aligned tips, lengths graded from 15.8 mm (bass) to 9.2 mm (treble) by a slanted root line, thickness 1.3 mm to 0.7 mm.
Channel k of the comb is channel k of the cylinder (gen_cylinder.py: pitch 2.706 mm, centres +-23.0 mm from the middle).

Size: TOCKTON_DIMENSIONS.md section 11 (Opus draft, awaiting owner approval): [0.065, 0.010, 0.026]. The manifest has none yet.
The library has no steel material, so the tines use Mat_PolishedBrass and the base block Mat_AgedBrass (see the report).
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import wu_common as wu
from lib import empties
from gen_mb_common import Builder, finish

FAMILY = "comb"

PARAMS = {
    "comb_music_box": dict(
        half_w=3.25,                 # base block half width (65 mm)
        tines=18, span=2.30, tine_w=0.21,
        root_slant=0.40,             # root line runs from z = +0.40 (bass, x = -3.25) to -0.40 (treble, x = +3.25)
        z_tip=-1.25, z_back=1.35,
        y_lo=-0.50, y_block=0.36, y_top=0.50, y_tine_top=0.49,
        t_bass=0.13, t_treble=0.07,
        screws=(-2.2, 0.0, 2.2),
        grab_radius=0.020,
    )
}


def root_z(p, x):
    return -p["root_slant"] * x / p["half_w"]


def tine_poly(p, x, hw, z_root, z_tip):
    pts = [(x - hw, z_root), (x - hw, z_tip + hw)]
    for a in (225, 270, 315):                                   # rounded free end
        pts.append((x + hw * math.cos(math.radians(a)) * 1.0, z_tip + hw + hw * math.sin(math.radians(a))))
    pts += [(x + hw, z_tip + hw), (x + hw, z_root)]
    return pts


def build(entry: dict, params: dict):
    p = params
    name = entry["meshes"][0]
    b = Builder()
    hw = p["half_w"]
    # base block: slanted front face, straight back
    block = [(-hw, root_z(p, -hw)), (hw, root_z(p, hw)), (hw, p["z_back"]), (-hw, p["z_back"])]
    b.prism(block, "xz", p["y_lo"], p["y_block"], "Mat_AgedBrass", bev=0.05, seg=1)
    # steel spine (clamp plate) lying on the block, set back 0.5 mm from its front edge
    sx = hw - 0.15
    spine = [(-sx, root_z(p, -sx) + 0.05), (sx, root_z(p, sx) + 0.05), (sx, 0.80), (-sx, 0.80)]
    b.prism(spine, "xz", p["y_block"] - 0.02, p["y_top"], "Mat_PolishedBrass", bev=0.02, seg=1)
    # tines
    pitch = 2 * p["span"] / (p["tines"] - 1)
    n = p["tines"]
    lengths = []
    for k in range(n):
        x = -p["span"] + k * pitch
        zr = root_z(p, x) + 0.05
        t = p["t_bass"] + (p["t_treble"] - p["t_bass"]) * k / (n - 1)
        b.prism(tine_poly(p, x, p["tine_w"] / 2, zr + 0.22, p["z_tip"]), "xz", p["y_tine_top"] - t, p["y_tine_top"], "Mat_PolishedBrass")
        lengths.append(zr - p["z_tip"])
    # three pan-head screws on the rear shelf of the block
    for sxp in p["screws"]:
        prof = [(0.0, -0.03), (0.13, -0.03), (0.13, 0.0), (0.11, 0.04), (0.05, 0.06), (0.0, 0.06)]
        b.lathe(prof, "Mat_PolishedBrass", axis="y", c=(sxp, p["y_block"], 1.12), segs=8)
    wu.log(f"== {entry['id']}: {n} tines, free length {lengths[0] * 10:.1f} to {lengths[-1] * 10:.1f} mm, pitch {pitch * 10:.3f} mm")
    obj = finish(b, name)
    obj["wu"] = dict(id=entry["id"], family=FAMILY, tines=n, tinePitchMm=round(pitch * 10, 3), fixed=True, tipLineZMm=p["z_tip"] * 10)
    col = empties.add_collider(obj, "Grab", "sphere", p["grab_radius"], loc_g=(0.0, 0.0, 0.0005))
    return [obj, col], dict(closed=True)


if __name__ == "__main__":
    raise SystemExit("gen_comb.py is a forge family. Run blender/scripts/forge.py --family comb --only comb_music_box --out-root <dir>")
