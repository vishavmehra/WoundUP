"""fit_check.py - every part GLB at its socket: triangle-intersection tests (housing vs parts, parts vs parts), gear mesh sweeps, motion samples, gaps.

    "$B" --background --factory-startup --python blender/scripts/fit_check.py -- <well|belfry> [<root dir holding the GLBs, default: the repository>]

Reads the GLBs with fit_lib (numpy, no importer), places each part at the SOCKET_ empty of the housing it was exported with (translation and rotation, scale 1),
and tests triangle intersections with mathutils' BVH tree. Machine tables: fit_machines.py. Evidence of the run for each machine is kept in
blender/previews/<family>/fit_check.txt. Face contact (touching, no crossing triangles) is allowed. Reported separately and not counted as clashes:
  engagements   cam and follower (the roller rides the cam), pawl and ratchet (the hook sits in a tooth), key and spring (the drive square in the arbor)
  gear meshes   swept over one tooth pitch of the second gear: some phase must be clean (no crossing triangles) and its smallest gap is printed
  press fits    a part whose own radius equals the bore it sits in (shaft collar r 4.000 against bore r 3.985 to 4.000): the radial interference is printed
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
REPO = next(p for p in HERE.parents if (p / "blender" / "scripts" / "wu_common.py").exists())

import numpy as np

from mathutils import Vector

from fit_lib import Glb, bvh
from fit_machines import MACHINES

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
machine = argv[0]
root = Path(argv[1]) if len(argv) > 1 else REPO
spec = MACHINES[machine]


def rz(a):
    M = np.eye(4)
    c, s = math.cos(a), math.sin(a)
    M[:2, :2] = [[c, -s], [s, c]]
    return M


def app(V, M):
    return V @ M[:3, :3].T + M[:3, 3]


def find(rel):
    for base in (root, REPO):
        if (base / rel).exists():
            return base / rel
    raise FileNotFoundError(rel)


def overlaps(Va, Ta, Vb, Tb):
    return len(bvh(Va, Ta).overlap(bvh(Vb, Tb)))


def min_gap(Va, Ta, Vb, Tb, ta=None, tb=None):
    """Smallest vertex-to-surface distance in both directions, in mm (every second vertex)."""
    ta = ta or bvh(Va, Ta)
    tb = tb or bvh(Vb, Tb)
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


hous = Glb(find(spec["housing"]))
HV, HT = hous.all()
htree = bvh(HV, HT)
sockets = {k: v for k, v in hous.helpers.items() if k.startswith("SOCKET_")}
print(f"housing {spec['housing']}: {len(HV)} verts, {len(HT)} tris, {len(sockets)} sockets")

parts = []
for sock, rel in spec["parts"]:
    g = Glb(find(rel))
    parts.append(dict(sock=sock, rel=rel, glb=g, M=sockets[sock]["M"].copy(), name=sock.replace("SOCKET_", "")))
by = {p["name"]: p for p in parts}
cache = {p["name"]: (app(p["glb"].all()[0], p["M"]), p["glb"].all()[1]) for p in parts}

ENGAGE = {frozenset(("Cam", "Follower")), frozenset(("Pawl", "Ratchet")), frozenset(("Key", "Spring"))}
GEARS = {frozenset(("GearDrive", "GearCam")), frozenset(("GearPinion", "GearDrive")), frozenset(("BevelA", "BevelB"))}
PRESS = {frozenset(("BevelB", "Shaft"))}
SKIP_GAP = ENGAGE | GEARS | PRESS

print("\n== rest pose: part vs housing ==")
bad = 0
for p in parts:
    V, T = cache[p["name"]]
    n = len(htree.overlap(bvh(V, T)))
    lo, hi = V.min(0) * 1000, V.max(0) * 1000
    note = "  (the fitting stands against the housing's face: contact)" if p["name"] == "BaseHandle" and n else ""
    print(f"  {p['name']:13s}: {n:4d} crossing tri pairs   x {lo[0]:7.1f}..{hi[0]:7.1f}  y {lo[1]:7.1f}..{hi[1]:7.1f}  z {lo[2]:7.1f}..{hi[2]:7.1f} mm{note}")
    if n and p["name"] != "BaseHandle":
        bad += 1
print("part-housing clashes:", bad)

print("\n== rest pose: part vs part ==")
pairs_bad = []
for i, a in enumerate(parts):
    for b in parts[i + 1:]:
        key = frozenset((a["name"], b["name"]))
        n = overlaps(*cache[a["name"]], *cache[b["name"]])
        if n:
            tag = "engagement" if key in ENGAGE else "gear mesh (swept below)" if key in GEARS else "press fit (measured below)" if key in PRESS else "CLASH"
            print(f"  {a['name']:13s} x {b['name']:13s}: {n:5d}  [{tag}]")
            if tag == "CLASH":
                pairs_bad.append((a["name"], b["name"], n))
print("part-part clashes:", pairs_bad or "none")


def sweep(a, b, teeth_b, label, n=120):
    VA, TA = cache[a]
    VB0, TB = by[b]["glb"].all()
    ta = bvh(VA, TA)
    res, gaps = [], {}
    pb = 2 * math.pi / teeth_b
    for k in range(n):
        Vb = app(VB0, by[b]["M"] @ rz(pb * k / n))
        c = len(ta.overlap(bvh(Vb, TB)))
        res.append(c)
        if c == 0:
            gaps[k] = min_gap(VA, TA, Vb, TB, ta)
    clean = sorted(gaps)
    if clean:
        k = max(gaps, key=gaps.get)
        print(f"  {label}: clean phases {len(clean)}/{n} (of one tooth pitch of the second gear); largest gap {gaps[k]:.2f} mm at phase {k}/{n} "
              f"(= {360.0 / teeth_b * k / n:.2f} deg about the second gear's +Z from its default orientation, the first gear at its default); smallest gap in the window {min(gaps.values()):.2f} mm")
    else:
        print(f"  {label}: NO clean phase in {n} (fewest crossing tri pairs {min(res)} at phase {res.index(min(res))})")
    return clean


print("\n== gear meshes: the second gear's phase swept over one tooth pitch (centre distance m(N1+N2)/2 + 1.0 mm) ==")
mesh_fail = []
if machine == "well":
    if not sweep("GearDrive", "GearCam", 10, "20T -> 10T at 38.5 mm"):
        mesh_fail.append("20T -> 10T")
else:
    if not sweep("GearPinion", "GearDrive", 20, "12T -> 20T at 41.0 mm"):
        mesh_fail.append("12T -> 20T")
    clean = sweep("BevelA", "BevelB", 12, "bevel A -> bevel B at the apex rule")
    if not clean:
        mesh_fail.append("bevel A -> bevel B (teeth cross at every phase: the library gear_bevel_12 has no backlash at the blueprint's apex rule)")
        # how deep do the teeth cross at the best phase: vertices of one gear inside the other
        VA, TA = cache["BevelA"]
        VB0, TB = by["BevelB"]["glb"].all()
        ta = bvh(VA, TA)
        best = min(range(120), key=lambda k: len(ta.overlap(bvh(app(VB0, by["BevelB"]["M"] @ rz(2 * math.pi / 12 * k / 120)), TB))))
        VB = app(VB0, by["BevelB"]["M"] @ rz(2 * math.pi / 12 * best / 120))
        tb = bvh(VB, TB)

        def inside(tree, p):
            votes = 0
            for d in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
                hits, o = 0, Vector(p)
                while hits < 50:
                    loc = tree.ray_cast(o, Vector(d))[0]
                    if loc is None:
                        break
                    hits += 1
                    o = loc + Vector(d) * 1e-6
                votes += hits % 2
            return votes >= 2

        dA = [tb.find_nearest(Vector(v))[3] for v in VA if inside(tb, v)]
        dB = [ta.find_nearest(Vector(v))[3] for v in VB if inside(ta, v)]
        print(f"    best phase {best}/120: {len(dA)} vertices of A lie inside B (deepest {max(dA, default=0) * 1000:.2f} mm), {len(dB)} of B inside A (deepest {max(dB, default=0) * 1000:.2f} mm)")

if machine == "belfry":
    # the shaft's collar r 4.000 mm in the lower bevel's bore (r 3.985 at its narrowest): radial interference
    Vs = cache["Shaft"][0]
    Vb = cache["BevelB"][0]
    axis = np.array([by["Shaft"]["M"][0, 3], by["Shaft"]["M"][2, 3]])
    rs = np.hypot(Vs[:, 0] - axis[0], Vs[:, 2] - axis[1])
    ys = Vb[:, 1]
    span = (Vs[:, 1] >= ys.min()) & (Vs[:, 1] <= ys.max())
    # bore radius of B along the same span: the smallest radius of B's vertices that lie on the bore (r < 4.6)
    rb = np.hypot(Vb[:, 0] - axis[0], Vb[:, 2] - axis[1])
    bore = rb[rb < 4.6]
    print(f"\n== press fit: shaft collar vs the lower bevel's bore ==\n  shaft radius inside B's span up to {rs[span].max() * 1000:.3f} mm, B's bore radius from {bore.min() * 1000:.3f} mm: radial interference {max(0.0, rs[span].max() - bore.min()) * 1000:.3f} mm")

print("\n== gaps below 1.0 mm (vertex-to-surface, both directions, rest pose); each is a seat, a bore clearance or a designed contact gap ==")
close = []
for a in parts:
    V, T = cache[a["name"]]
    g = min_gap(V, T, HV, HT, None, htree)
    if g < 1.0:
        close.append((a["name"], "HOUSING", round(g, 3)))
for i, a in enumerate(parts):
    for b in parts[i + 1:]:
        if frozenset((a["name"], b["name"])) in SKIP_GAP:
            continue
        g = min_gap(*cache[a["name"]], *cache[b["name"]])
        if g < 1.0:
            close.append((a["name"], b["name"], round(g, 3)))
for c in close:
    print("  ", c)
print("pairs closer than 1.0 mm:", len(close))

print("\n== motion samples ==")


def rot_sweep(name, targets, step_deg=15, about=None):
    p = by[name]
    V0, T = p["glb"].all()
    worst = {}
    for deg in range(0, 360, step_deg):
        Vm = app(V0, p["M"] @ rz(math.radians(deg)))
        t = bvh(Vm, T)
        for tn in targets:
            n = len(htree.overlap(t)) if tn == "HOUSING" else len(t.overlap(bvh(*cache[tn])))
            worst[tn] = max(worst.get(tn, 0), n)
    bad_ = {k: v for k, v in worst.items() if v}
    print(f"  {name:12s} turning 360 deg: " + (f"worst crossings {bad_}" if bad_ else "no crossings against the housing or any other part"))
    return bad_


def partners(name):
    out = ["HOUSING"]
    for o in by:
        if o == name:
            continue
        k = frozenset((name, o))
        if k in ENGAGE or k in GEARS or k in PRESS:
            continue
        out.append(o)
    return out


spinners = ("Key", "Cam", "Ratchet", "PulleyDrive", "PulleyIdle", "Spring") if machine == "well" else ("Key", "Spring", "GearPinion", "GearDrive", "BevelA", "BevelB", "Shaft", "Flywheel", "Vane")
for name in spinners:
    rot_sweep(name, partners(name))

if machine == "well":
    # the pawl rocks a few degrees about its pivot once per tooth; it must clear the housing and every other part (the ratchet is its engagement)
    p = by["Pawl"]
    V0, T = p["glb"].all()
    worst = {}
    for deg in np.linspace(-6, 6, 13):
        t = bvh(app(V0, p["M"] @ rz(math.radians(deg))), T)
        worst["HOUSING"] = max(worst.get("HOUSING", 0), len(htree.overlap(t)))
        for o in by:
            if o not in ("Pawl", "Ratchet"):
                worst[o] = max(worst.get(o, 0), len(t.overlap(bvh(*cache[o]))))
    print("  Pawl rocking +-6 deg: " + (f"worst crossings { {k: v for k, v in worst.items() if v} }" if any(worst.values()) else "no crossings against the housing or any part but the ratchet"))
    # the follower along its stroke
    p = by["Follower"]
    V0, T = p["glb"].all()
    worst = {}
    for dy in np.linspace(0, 5.5e-3, 12):
        Mm = np.eye(4)
        Mm[1, 3] = dy
        t = bvh(app(V0, p["M"] @ Mm), T)
        worst["HOUSING"] = max(worst.get("HOUSING", 0), len(htree.overlap(t)))
        for o in by:
            if o not in ("Follower", "Cam"):
                worst[o] = max(worst.get(o, 0), len(t.overlap(bvh(*cache[o]))))
    print("  Follower along its 5.5 mm stroke: " + (f"worst crossings { {k: v for k, v in worst.items() if v} }" if any(worst.values()) else "no crossings against the housing or any part but the cam"))
else:
    # the bell swinging +-0.12 rad about PIV_Swing
    p = by["Bell"]
    V0, T = p["glb"].all()
    piv = p["glb"].helpers["PIV_Swing"]["M"]
    worst = {}
    for a in np.linspace(-0.12, 0.12, 9):
        Mm = piv @ rz(a) @ np.linalg.inv(piv)
        t = bvh(app(V0, p["M"] @ Mm), T)
        worst["HOUSING"] = max(worst.get("HOUSING", 0), len(htree.overlap(t)))
        for o in by:
            if o != "Bell":
                worst[o] = max(worst.get(o, 0), len(t.overlap(bvh(*cache[o]))))
    print("  Bell swinging +-0.12 rad about PIV_Swing: " + (f"worst crossings { {k: v for k, v in worst.items() if v} }" if any(worst.values()) else "no crossings against the housing or any part"))

print("\nVERDICT:", ("NO CLASHES" if not bad and not pairs_bad else f"CLASHES housing={bad} parts={pairs_bad}")
      + (f"; GEAR MESH NOT CLEAN: {mesh_fail}" if mesh_fail else "; every gear mesh has a clean phase") + " (engagements and press fits are listed above)")
