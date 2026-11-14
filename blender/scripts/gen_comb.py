"""gen_comb.py - the comb family: the tined comb of the Music Box (forge family 'comb').

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family comb --only comb_music_box --out-root <dir> --owner Machines [--manifest <file>]

Model space (glTF Y-up, centimetres while building): +X along the cylinder axis (bass tine on -X), +Y up, the tines run towards -Z
(towards the cylinder) from a slanted spine, the base block sits at +Z. Origin (docs/blueprints/MUSIC_BOX_BLUEPRINT.md section 7.1,
SOCKET_Comb): x = 0 at the middle, y = 0 on the TOP face, z = 0 on the tine-tip line. The comb therefore spans x +-29.3 mm,
y -10 to 0 mm, z 0 to +26 mm, and its socket (the tip line at the cylinder arbor's height) is the origin itself.

18 tines, aligned tips, lengths graded from 16.0 mm (bass) to 10.0 mm (treble) by a slanted root line, thickness 1.3 mm to 0.7 mm.
Channel k of the comb is channel k of the cylinder (gen_cylinder.py: pitch 2.588 mm, centres +-22.0 mm from the middle).

Size: docs/blueprints/MUSIC_BOX_BLUEPRINT.md section 11, [0.0586, 0.010, 0.026] (lead proposal, awaiting owner approval; as wide as the
cylinder). The manifest has none yet. The library has no steel material, so the tines use Mat_PolishedBrass and the base block
Mat_AgedBrass (see the report).
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
        half_w=2.93,                 # base block half width (58.6 mm)
        tines=18, span=2.20, tine_w=0.20,
        root_slant=0.40, z_root_mid=1.25,   # root line runs from z = 1.65 (bass, x = -2.93) to 0.85 (treble, x = +2.93)
        z_tip=0.0, z_back=2.60,
        y_lo=-1.00, y_block=-0.14, y_top=0.0, y_tine_top=-0.01,
        t_bass=0.13, t_treble=0.07,
        screws=(-2.0, 0.0, 2.0), z_screw=2.37, spine_back=2.05,
        grab_half=(0.0293, 0.012, 0.013), grab_centre=(0.0, -0.005, 0.013),
    )
}


def root_z(p, x):
    return p["z_root_mid"] - p["root_slant"] * x / p["half_w"]


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
    spine = [(-sx, root_z(p, -sx) + 0.05), (sx, root_z(p, sx) + 0.05), (sx, p["spine_back"]), (-sx, p["spine_back"])]
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
        b.lathe(prof, "Mat_PolishedBrass", axis="y", c=(sxp, p["y_block"], p["z_screw"]), segs=8)
    wu.log(f"== {entry['id']}: {n} tines, free length {lengths[0] * 10:.1f} to {lengths[-1] * 10:.1f} mm, pitch {pitch * 10:.3f} mm")
    obj = finish(b, name)
    obj["wu"] = dict(id=entry["id"], family=FAMILY, tines=n, tinePitchMm=round(pitch * 10, 3), fixed=True, tipLineZMm=0.0)
    # a box over the whole comb (blueprint 7.2): a 20 mm sphere would only catch the middle third of a 58.6 mm part
    col = empties.add_collider(obj, "Grab", "box", p["grab_half"], loc_g=p["grab_centre"])
    return [obj, col], dict(origin=("centre", "max", "min"), closed=True)


if __name__ == "__main__":
    raise SystemExit("gen_comb.py is a forge family. Run blender/scripts/forge.py --family comb --only comb_music_box --out-root <dir>")
