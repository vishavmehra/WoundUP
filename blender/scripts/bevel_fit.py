"""bevel_fit.py - the Belfry's bevel pair over tooth phases, on the real GLBs: does the pair clear, and by how much, for a given axial shift of the sockets.

    "$B" --background --factory-startup --python blender/scripts/bevel_fit.py -- [--root <dir holding public/assets/models>] [--sweep] [--shift-a MM] [--shift-b MM]

The pair is read the way fit_check.py reads every machine: gear_bevel_12.glb at the SOCKET_BevelA and SOCKET_BevelB empties of belfry_base.glb (the sockets as
they are in the housing GLB under --root, default the repository), no importer, triangle crossings by mathutils' BVH tree. Both gears turn about their own local +Z
(ADR-020): A at -theta and B at +theta plus the rest phase the runtime gives it (src/machines/belfry/build.ts BEVEL_B_PHASE_RAD, 15 degrees), which is what the town
does, so one tooth pitch of theta (30 degrees, 12 teeth) is the whole motion: the pair repeats every pitch. A shift moves a gear along its own axis AWAY from the
apex (local -Z), in millimetres: the axes still cross at the same point, the cones simply stop touching, which is how a bevel pair gets backlash.

  default   motion check of the pair as seated (shift 0 and the shifts given), 120 samples over one pitch: crossings, deepest vertex inside the other gear, smallest gap
  --pairs   a list of A:B shifts (mm) to test, each with the motion check and the smallest gap to the 20T drive gear behind A
  --sweep   the shifts 0 to 1.6 mm in 0.1 mm steps on each gear, and the rest phase of B over a full pitch, to see where a clean window opens

Evidence of a run goes to blender/previews/belfry/bevel_fit.txt by hand (this script only prints).
"""
import argparse
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
REPO = next(p for p in HERE.parents if (p / "blender" / "scripts" / "wu_common.py").exists())

import numpy as np
from mathutils import Vector

from fit_lib import Glb, bvh

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--root", default=str(REPO))
ap.add_argument("--sweep", action="store_true")
ap.add_argument("--shift-a", type=float, default=0.0)
ap.add_argument("--shift-b", type=float, default=0.0)
ap.add_argument("--samples", type=int, default=120)
ap.add_argument("--phases", action="store_true", help="with --shift-a/--shift-b: the rest phase of B over one pitch, each phase's smallest gap through the motion")
ap.add_argument("--pairs", default="", help="comma list of A:B shifts in mm to test, e.g. 1.2:2.4,1.5:2.0")
args = ap.parse_args(argv)
ROOT = Path(args.root)
PITCH = 2 * math.pi / 12
REST_B = math.pi / 12  # BEVEL_B_PHASE_RAD in src/machines/belfry/build.ts


def rz(a):
    M = np.eye(4)
    c, s = math.cos(a), math.sin(a)
    M[:2, :2] = [[c, -s], [s, c]]
    return M


def tz(d):
    M = np.eye(4)
    M[2, 3] = d
    return M


def app(V, M):
    return V @ M[:3, :3].T + M[:3, 3]


def find(rel):
    for base in (ROOT, REPO):
        if (base / rel).exists():
            return base / rel
    raise FileNotFoundError(rel)


housing = Glb(find("public/assets/models/tockton/belfry/belfry_base.glb"))
gear = Glb(find("public/assets/models/shared/bevel_gear/gear_bevel_12.glb"))
GV, GT = gear.all()
M_A = housing.helpers["SOCKET_BevelA"]["M"]
M_B = housing.helpers["SOCKET_BevelB"]["M"]
print(f"SOCKET_BevelA at {np.round(M_A[:3, 3] * 1000, 3).tolist()} mm, SOCKET_BevelB at {np.round(M_B[:3, 3] * 1000, 3).tolist()} mm (housing under {ROOT})")


def inside_depth(tree, V):
    """Deepest vertex of V inside the closed mesh of `tree`, in mm (three-axis ray parity vote), and how many vertices lie inside."""
    depths = []
    for v in V:
        votes = 0
        for d in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
            hits, o = 0, Vector(v)
            while hits < 60:
                loc = tree.ray_cast(o, Vector(d))[0]
                if loc is None:
                    break
                hits += 1
                o = loc + Vector(d) * 1e-6
            votes += hits % 2
        if votes >= 2:
            depths.append(tree.find_nearest(Vector(v))[3])
    return len(depths), max(depths, default=0.0) * 1000


def min_gap(Va, Ta, Vb, Tb, ta, tb):
    best = 1e9
    for v in Va[::2]:
        d = tb.find_nearest(Vector(v))[3]
        if d is not None and d < best:
            best = d
    for v in Vb[::2]:
        d = ta.find_nearest(Vector(v))[3]
        if d is not None and d < best:
            best = d
    return best * 1000


def pose(shift_a, shift_b, theta, rest_b=REST_B):
    VA = app(GV, M_A @ tz(-shift_a / 1000.0) @ rz(-theta))
    VB = app(GV, M_B @ tz(-shift_b / 1000.0) @ rz(rest_b + theta))
    return VA, VB


def motion(shift_a, shift_b, n=args.samples, rest_b=REST_B, depth=False):
    """Crossings over one pitch of the pair's motion: (samples that cross, most crossing triangle pairs, smallest gap of the clean samples, deepest vertex inside)."""
    crossing, worst, gap, deep = 0, 0, 1e9, 0.0
    for k in range(n):
        VA, VB = pose(shift_a, shift_b, PITCH * k / n, rest_b)
        ta, tb = bvh(VA, GT), bvh(VB, GT)
        c = len(ta.overlap(tb))
        if c:
            crossing += 1
            worst = max(worst, c)
            if depth:
                deep = max(deep, inside_depth(tb, VA)[1], inside_depth(ta, VB)[1])
        else:
            gap = min(gap, min_gap(VA, GT, VB, GT, ta, tb))
    return crossing, worst, gap, deep


if args.sweep:
    print("\nshift of A (rows) and of B (columns), mm: samples of 120 that cross (0 = the pair clears all the way round one pitch), smallest gap in mm when it clears")
    steps = [round(0.1 * i, 1) for i in range(0, 17)]
    print("        " + "".join(f"{b:>10.1f}" for b in steps[::2]))
    for a in steps[::2]:
        row = []
        for b in steps[::2]:
            c, _, g, _ = motion(a, b, n=40)
            row.append(f"{c:3d}/{g:5.2f}" if c == 0 else f"{c:3d}/  -- ")
        print(f"A {a:4.1f}  " + "  ".join(row))
    print("\nrest phase of B over one pitch (degrees), no shift: samples that cross out of 40")
    for deg in range(0, 30, 3):
        c, w, g, _ = motion(0, 0, n=40, rest_b=math.radians(deg))
        print(f"  {deg:2d} deg: {c:2d}/40 cross, worst {w} tri pairs")
elif args.phases:
    print(f"shift A {args.shift_a:.2f} mm, B {args.shift_b:.2f} mm: the rest phase of B (degrees about its own +Z; the town uses {math.degrees(REST_B):.0f}), samples that cross of 30, smallest gap of the clean ones")
    for deg in range(0, 30, 2):
        c, _, g, _ = motion(args.shift_a, args.shift_b, n=30, rest_b=math.radians(deg))
        print(f"  {deg:2d} deg: {c:2d}/30 cross" + (f", smallest gap {g:.3f} mm" if c == 0 else ""))
elif args.pairs:
    drive = Glb(find("public/assets/models/shared/spur_gear/gear_spur_20_m1.glb"))
    DV, DT = drive.all()
    M_D = housing.helpers["SOCKET_GearDrive"]["M"]
    VD = app(DV, M_D)
    td = bvh(VD, DT)
    for pair in args.pairs.split(","):
        a, b = (float(x) for x in pair.split(":"))
        c, w, g, deep = motion(a, b, n=args.samples)
        # the 20T sits behind A on the same axle: A at its worst phase (its own rotation does not change the gap by more than the hub's roundness)
        VA = app(GV, M_A @ tz(-a / 1000.0))
        ta = bvh(VA, GT)
        print(f"shift A {a:.2f} mm, B {b:.2f} mm: {'CLEARS' if c == 0 else 'CROSSES'} ({c}/{args.samples} cross), smallest bevel-bevel gap {g if c < args.samples else float('nan'):.3f} mm, A to the 20T {min_gap(VA, GT, VD, DT, ta, td):.2f} mm, 20T crossing tri pairs {len(ta.overlap(td))}")
else:
    shifts = [(0.0, 0.0), (args.shift_a, args.shift_b)] if (args.shift_a or args.shift_b) else [(0.0, 0.0)]
    for a, b in shifts:
        c, w, g, deep = motion(a, b, depth=True)
        verdict = "CLEARS" if c == 0 else "CROSSES"
        print(f"shift A {a:.2f} mm, B {b:.2f} mm: {verdict}: {c}/{args.samples} samples cross (worst {w} tri pairs, deepest vertex inside the other gear {deep:.2f} mm), smallest gap {g if c < args.samples else float('nan'):.2f} mm over the clean samples")
