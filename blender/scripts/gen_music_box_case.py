"""gen_music_box_case.py - the music_box family: the walnut case of the Music Box (forge family 'music_box').

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family music_box --only music_box_case --out-root <dir> --owner Machines [--manifest <file>]

One GLB, seven named mesh nodes (manifest `meshes`): MusicBoxCase_Body (the root: walnut tray, brass bands, teal front and back panels,
cream enamel medallion, the interior seats of the mechanism), _Lid (barrel-vault hollow walnut shell, brass straps, teal end panels),
_SidePanel_L and _SidePanel_R, _Hinge_L and _Hinge_R (three-knuckle brass hinges) and _Foot (the four feet as one mesh).

Model space (glTF Y-up, built in centimetres): x = width (the winding key is on +x), y up, z depth (front panel towards +z). Origin at the
centre of the floor-contact face (feet), +Y up (ADR-020). PIV_Lid sits on the hinge axis at the back (x = 0, y = 7.0, z = -4.27); its
local +Z is world -X, so a POSITIVE rotation about it opens the lid (the open angle of the lid is 100 degrees, wu.openDeg).

SIZES (TOCKTON_DIMENSIONS.md section 6 and 11, an Opus draft awaiting owner approval, used as the working values): case 13.0 x 10.0 x
9.0 cm with the lid closed (body 7.0 + lid 3.0), interior 11.8 x 6.4 x 7.8 cm (floor top at y = 0.6, rim at y = 7.0, walls about 5.5 mm).

SOCKETS: the 12 slots of docs/blueprints/MUSIC_BOX_BLUEPRINT.md section 7.1 (a lead proposal awaiting owner approval) plus SOCKET_BaseHandle
(section 7.3). Positions and rotations are the table's, in the Music Box frame, which is this file's frame. Every socket carries
wu.proposal = true until the owner approves the blueprint. The one-shot clip MusicBoxLid_Close is NOT in the file (forge exports profile L,
which has no clips); the runtime rotates the lid about PIV_Lid.
The blueprint's "nodes" Bush_SpringArbor, Post_SpringOuter, Seat_Comb, Seat_Governor and the bracket floor marks are geometry of
MusicBoxCase_Body (no extra mesh nodes; positions are listed in the root's wu.features).
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Matrix

import wu_common as wu
from lib import empties
from gen_mb_common import Builder, finish, offset_polyline, rrect, volute

FAMILY = "music_box"
WALN, PBR, ABR, TEAL, CREAM = "Mat_Walnut", "Mat_PolishedBrass", "Mat_AgedBrass", "Mat_TealPaint", "Mat_CreamEnamel"

W, D = 12.9, 8.8                       # walnut outline of body and lid (x, z), cm
X0, Z0 = W / 2, D / 2                  # 6.45, 4.40
IW, ID = 11.8, 7.8                     # interior
Y_FLOOR, Y_RIM = 0.60, 7.0
NX, NZ, NC = 12, 5, 3                  # ring density (vertices every ~1 cm for the vertex AO)
R_OUT, Y_CROWN = 5.84, 9.95            # lid arch
YC = Y_CROWN - R_OUT
PHI0 = math.degrees(math.asin(Z0 / R_OUT))
R_IN = R_OUT - 0.5
FLIP_X = Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))
FLIP_Z = Matrix.Diagonal((1.0, 1.0, -1.0, 1.0))

# mechanism layout in the case (cm), docs/blueprints/MUSIC_BOX_BLUEPRINT.md sections 6 and 7.1 (Music Box frame = this file's frame)
ARB_Y, ARB_Z = 3.50, -1.05              # cylinder arbor axis (along x)
BRK_L_X, BRK_R_X, CYL_X = -3.88, 2.78, -0.55
SPR = (5.30, 5.32, 2.23)                # main spring centre, spring arbor axis (along x)
GOV = (-3.58, 5.14, 2.04)               # governor weights centre, spindle axis (along x)
BUSH = (6.20, 5.32, 2.23)               # Bush_SpringArbor, through the right wall
COMB_Z0, COMB_Z1 = 2.0, 3.2             # Seat_Comb (z range) under the comb base; tine tips at z 0.60
SEAT_GOV_X = -2.63                      # Seat_Governor on the front wall's inner face (z = +3.9), y = GOV[1]

PARAMS = {"music_box_case": dict()}

# cross-section polygons (offset from the outline, height) of the brass strips
BAND_TOP = [(-0.08, 0.0), (0.03, 0.0), (0.05, 0.03), (0.05, 0.55), (0.03, 0.58), (-0.08, 0.58)]
BAND_BASE = [(-0.14, 0.0), (0.03, 0.0), (0.05, 0.03), (0.05, 0.52), (0.03, 0.55), (-0.14, 0.55)]
FRAME_Z = [(-0.18, 0.0), (0.10, 0.0), (0.10, 0.06), (0.06, 0.10), (-0.14, 0.10), (-0.18, 0.06)]      # frame of the front/back panel (z up to +0.10)
FRAME_X = [(-0.16, 0.0), (0.09, 0.0), (0.09, 0.05), (0.06, 0.08), (-0.12, 0.08), (-0.16, 0.05)]      # frame of the end panels (x up to +0.08)


def rr(w, d, r, y):
    return [(u, y, v) for u, v in rrect(w, d, r, NX, NZ, NC)]


def arch_pts(y_bottom, n_arc=14, phi=PHI0):
    """Walnut outer profile of the lid in (z, y), left to right: skirt, arc, skirt."""
    pts = [(-Z0, y_bottom)]
    for i in range(n_arc + 1):
        a = math.radians(-phi + 2 * phi * i / n_arc)
        pts.append((R_OUT * math.sin(a), YC + R_OUT * math.cos(a)))
    pts.append((Z0, y_bottom))
    return pts


# ======================================================================================
# scrolls and the medallion
# ======================================================================================
def curl_path(scale=1.0):
    """A scroll arm in local (x, dy): a short tail leaving the medallion bezel, then an inward volute curling upwards."""
    tail = [(1.0, 0.0, 0.0), (1.55, 0.02, 0.0), (2.2, 0.05, 0.0), (2.8, 0.03, 0.0), (3.3, 0.0, 0.0)]
    vol = volute(3.3, 0.62, 0.62, 0.11, -90.0, 1.6, 22)[1:]
    return [(x * scale, y * scale, 0.0) for x, y, _ in tail + vol]


def curl_radii(n):
    return [0.050 - 0.022 * i / (n - 1) for i in range(n)]


def medallion(b, centre, plane_ax, z0):
    """Cream enamel disc in a brass bezel, with a beamed pair of eighth notes in brass. Facing +z (plane_ax 'z') at depth z0."""
    cx, cy = centre
    b.lathe([(0.0, 0.0), (0.85, 0.0), (0.85, 0.05), (0.78, 0.07), (0.0, 0.075)], CREAM, axis="z", c=(cx, cy, z0), segs=24)
    b.lathe([(0.84, 0.0), (1.04, 0.0), (1.04, 0.07), (0.98, 0.10), (0.88, 0.10), (0.84, 0.07)], PBR, axis="z", c=(cx, cy, z0), segs=24, loop=True)
    zn = z0 + 0.082
    for hx, hy in ((-0.30, -0.32), (0.28, -0.42)):                    # note heads
        b.ellipsoid((cx + hx, cy + hy, zn), (0.19, 0.13, 0.03), PBR, segs=10, rows=4, xf=Matrix.Rotation(math.radians(-20), 4, "Z"))
    b.box((cx - 0.13, cy + 0.04, zn), (0.05, 0.72, 0.045), PBR, bev=0.01, seg=1)
    b.box((cx + 0.45, cy - 0.06, zn), (0.05, 0.72, 0.045), PBR, bev=0.01, seg=1)
    b.box((cx + 0.16, cy + 0.34, zn), (0.62, 0.10, 0.045), PBR, bev=0.01, seg=1, xf=Matrix.Rotation(math.radians(-9.8), 4, "Z"))


# ======================================================================================
# body (root)
# ======================================================================================
TRAY = [
    (12.6, 8.5, 0.50, 0.30), (W, D, 0.60, 0.46), (W, D, 0.60, 2.0), (W, D, 0.60, 3.7), (W, D, 0.60, 5.4), (W, D, 0.60, 6.84),
    (W - 0.16, D - 0.16, 0.52, Y_RIM), (IW + 0.14, ID + 0.14, 0.22, Y_RIM),
    (IW, ID, 0.15, 6.86), (IW, ID, 0.15, 5.6), (IW, ID, 0.15, 4.3), (IW, ID, 0.15, 3.0), (IW, ID, 0.15, 1.8), (IW, ID, 0.15, Y_FLOOR),
    (IW - 2, ID - 2, 0.15, Y_FLOOR), (IW - 4, ID - 4, 0.15, Y_FLOOR), (IW - 6, ID - 6, 0.15, Y_FLOOR),
]
PANEL_Z = dict(w=10.2, h=3.7, r=0.35, cy=3.45)


def bracket_seat(b, x):
    """Floor mark of a support bracket: a low brass pad, two guide tabs the 6 mm bracket foot slots between, two screws."""
    b.box((x, Y_FLOOR + 0.06, ARB_Z), (0.9, 0.12, 2.6), ABR, bev=0.03, seg=1)
    for dx in (-0.40, 0.40):
        b.box((x + dx, Y_FLOOR + 0.20, ARB_Z), (0.10, 0.40, 2.4), ABR, bev=0.025, seg=1)
    for dz in (-0.9, 0.9):
        b.lathe([(0.0, -0.02), (0.14, -0.02), (0.14, 0.0), (0.12, 0.04), (0.05, 0.06), (0.0, 0.06)], PBR, axis="y", c=(x, Y_FLOOR + 0.12, ARB_Z + dz), segs=8)


def wall_pad(b, x_face, sgn, y, z, r=0.55, mat=ABR):
    """Round bearing pad on a side wall's inner face (a shallow dimple in a raised ring); sgn +1 stands off the left wall (towards +x),
    -1 off the right wall (towards -x)."""
    prof = [(0.0, 0.04), (0.20, 0.04), (0.27, 0.075), (r - 0.07, 0.075), (r, 0.045), (r, -0.02), (0.0, -0.02)]
    b.lathe(prof, mat, axis="x", c=(x_face, y, z), segs=24, xf=Matrix.Diagonal((sgn, 1.0, 1.0, 1.0)))


def interior(b):
    xl, xr, zf = -IW / 2, IW / 2, ID / 2                              # inner faces of the left, right and front walls
    # seats of the two brackets: the arbor runs between them
    bracket_seat(b, BRK_L_X)
    bracket_seat(b, BRK_R_X)
    # arbor end seat and governor spindle seat on the left wall
    wall_pad(b, xl, +1, ARB_Y, ARB_Z, 0.55)
    wall_pad(b, xl, +1, GOV[1], GOV[2], 0.42)
    # Seat_Comb: a walnut riser from the floor to 25 mm, under the comb's rear 12 mm, with two brass studs beside the comb ends
    b.box((CYL_X, (Y_FLOOR - 0.02 + 2.5) / 2, (COMB_Z0 + COMB_Z1) / 2), (6.4, 2.5 - Y_FLOOR + 0.02, COMB_Z1 - COMB_Z0), WALN, bev=0.05, seg=1)
    for sx in (-1, 1):
        b.lathe([(0.0, -0.02), (0.10, -0.02), (0.10, 0.82), (0.07, 0.90), (0.0, 0.92)], ABR, axis="y", c=(CYL_X + sx * 3.11, 2.5, (COMB_Z0 + COMB_Z1) / 2), segs=10)
    # Seat_Governor: a brass pad with a locating boss and three bolts on the front wall, where the governor's frame arm clips on
    gx, gy = SEAT_GOV_X, GOV[1]
    fz = Matrix.Diagonal((1.0, 1.0, -1.0, 1.0))                        # h runs from the wall into the cavity (towards -z)
    b.lathe([(0.0, -0.02), (0.78, -0.02), (0.78, 0.12), (0.70, 0.16), (0.0, 0.16)], ABR, axis="z", c=(gx, gy, zf), segs=20, xf=fz)
    b.lathe([(0.0, 0.10), (0.20, 0.10), (0.20, 0.52), (0.14, 0.58), (0.0, 0.58)], ABR, axis="z", c=(gx, gy, zf), segs=10, xf=fz)
    for k in range(3):
        a = math.radians(90 + 120 * k)
        b.lathe([(0.0, -0.02), (0.10, -0.02), (0.10, 0.0), (0.08, 0.03), (0.04, 0.045), (0.0, 0.045)], PBR, axis="z",
                c=(gx + 0.54 * math.cos(a), gy + 0.54 * math.sin(a), zf - 0.16), segs=8, xf=fz)
    # Bush_SpringArbor: the right wall's bearing for the spring arbor and the key's drive square (inner collar, outer flange)
    bx, by, bz = BUSH
    wall_pad(b, xr, -1, by, bz, 0.50, ABR)
    b.lathe([(0.0, 0.05), (0.30, 0.05), (0.38, 0.09), (0.62, 0.09), (0.75, 0.05), (0.75, -0.02), (0.0, -0.02)], PBR, axis="x", c=(W / 2 - 0.02, by, bz), segs=24)
    # Post_SpringOuter: the anchor of the coil's outer end, on the right wall beside the coil (coil radius 1.5 about SPR)
    px, py, pz = xr, 4.00, 3.50
    b.lathe([(0.0, -0.02), (0.24, -0.02), (0.24, 0.06), (0.12, 0.06), (0.12, 0.84), (0.19, 0.88), (0.19, 0.96), (0.12, 1.0), (0.0, 1.0)], ABR,
            axis="x", c=(px, py, pz), segs=12, xf=Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0)))


def front_back_panels(b):
    p = PANEL_Z
    for sgn, xf in ((1, None), (-1, FLIP_Z)):
        b.slab_rrect("xy", p["w"], p["h"], p["r"], 4.37, 4.42, TEAL, cu=0.0, cv=p["cy"], insets=(0.6, 1.2, 1.6), xf=xf)
        b.band("xy", p["w"], p["h"], p["r"], 4.36, FRAME_Z, PBR, cu=0.0, cv=p["cy"], xf=xf)
    cy = p["cy"]
    medallion(b, (0.0, cy), "z", 4.38)
    path = curl_path(1.0)
    radii = curl_radii(len(path))
    for sx in (1, -1):
        for sy in (1, -1):
            b.tube(path, radii, PBR, normal=(0, 0, 1), sides=6, xf=Matrix.Translation((0.0, cy, 4.43)) @ Matrix.Diagonal((sx, sy, 1.0, 1.0)))
    # back: a maker's plate (brass frame, cream enamel label, four rivets)
    b.box((0.0, cy, -4.43), (3.2, 1.2, 0.07), PBR, bev=0.03, seg=1)
    b.box((0.0, cy, -4.465), (2.6, 0.7, 0.04), CREAM, bev=0.015, seg=1)
    for sx in (-1.4, 1.4):
        for sy in (-0.45, 0.45):
            b.lathe([(0.0, 0.0), (0.09, 0.0), (0.08, -0.025), (0.04, -0.04), (0.0, -0.04)], PBR, axis="z", c=(sx, cy + sy, -4.465), segs=8)
    # lock plate with keyhole escutcheon on the front, just under the seam
    b.box((0.0, 6.5, 4.44), (1.5, 0.95, 0.08), PBR, bev=0.03, seg=1)
    b.lathe([(0.0, 0.0), (0.19, 0.0), (0.19, 0.012), (0.15, 0.03), (0.0, 0.03)], ABR, axis="z", c=(0.0, 6.52, 4.47), segs=14)


def build_body():
    b = Builder()
    b.loft([rr(*r) for r in TRAY], WALN, cap_first=True, cap_last=True)
    b.band("xz", W, D, 0.60, 6.40, BAND_TOP, PBR, nx=NX, nz=NZ, nc=NC)
    b.band("xz", W, D, 0.60, 0.32, BAND_BASE, PBR, nx=NX, nz=NZ, nc=NC)
    front_back_panels(b)
    interior(b)
    return b


# ======================================================================================
# lid
# ======================================================================================
def lid_rings():
    rings = []
    for phi in (3, 10, 17, 24, 31, 38, 45, PHI0):                     # outer arch from the crown down to the skirt
        zh = R_OUT * math.sin(math.radians(phi))
        rings.append((W, 2 * zh, min(0.60, 0.7 * zh), YC + R_OUT * math.cos(math.radians(phi))))
    rings += [(W, D, 0.60, 7.55), (W, D, 0.60, 7.12), (W - 0.16, D - 0.16, 0.52, Y_RIM), (IW + 0.14, ID + 0.14, 0.22, Y_RIM)]
    phi_i0 = math.degrees(math.asin((ID / 2) / R_IN))
    rings += [(IW, ID, 0.15, 7.16), (IW, ID, 0.15, 7.5)]
    for phi in (phi_i0, 40, 33, 26, 19, 12, 5):                       # inner arch (the ceiling) from the skirt up to the crown
        zh = R_IN * math.sin(math.radians(phi))
        rings.append((IW, 2 * zh, min(0.15, 0.7 * zh), YC + R_IN * math.cos(math.radians(phi))))
    return rings


def build_lid():
    b = Builder()
    b.loft([rr(*r) for r in lid_rings()], WALN, cap_first=True, cap_last=True)
    b.band("xz", W, D, 0.60, 7.02, BAND_TOP, PBR, nx=NX, nz=NZ, nc=NC)
    base = arch_pts(7.02)                                              # brass straps over the barrel vault
    outer, inner = offset_polyline(base, 0.05), offset_polyline(base, -0.03)
    poly = outer + inner[::-1]
    for xc in (-5.2, -2.6, 2.6, 5.2):
        b.prism(poly, "zy", xc - 0.4, xc + 0.4, PBR, bev=0.03, seg=1)
    # teal end panels in brass frames (a circular segment with short straight sides)
    zh = 3.65
    a_end = math.degrees(math.asin(zh / (R_OUT - 0.6)))
    panel = [(-zh, 7.72)] + [((R_OUT - 0.6) * math.sin(math.radians(-a_end + 2 * a_end * i / 12)),
                              YC + (R_OUT - 0.6) * math.cos(math.radians(-a_end + 2 * a_end * i / 12))) for i in range(13)] + [(zh, 7.72)]
    for xf in (None, FLIP_X):
        b.slab_convex("zy", panel, 6.43, 6.48, TEAL, scales=(0.88, 0.76), xf=xf)
        b.band_loop("zy", panel, 6.42, FRAME_X, PBR, xf=xf)
    # catch plate and hasp boss on the front, mirror of the lock plate under the seam
    b.box((0.0, 7.52, 4.44), (1.5, 0.80, 0.08), PBR, bev=0.03, seg=1)
    b.lathe([(0.0, 0.0), (0.17, 0.0), (0.15, 0.03), (0.08, 0.045), (0.0, 0.045)], PBR, axis="z", c=(0.0, 7.52, 4.455), segs=12)
    return b


# ======================================================================================
# side panels, hinges, feet
# ======================================================================================
PANEL_L = dict(w=7.0, h=4.6, r=0.35, cy=3.4, zc=0.0)
PANEL_R = dict(w=4.7, h=4.6, r=0.35, cy=3.4, zc=-1.3)                 # pulled back: the key's bush sits at z 2.23, in front of it


def build_side_panel(sign):
    b = Builder()
    p = PANEL_R if sign > 0 else PANEL_L
    b.slab_rrect("zy", p["w"], p["h"], p["r"], 6.43, 6.465, TEAL, cu=p["zc"], cv=p["cy"], insets=(0.6, 1.2, 1.8))    # (u = z, v = y)
    b.band("zy", p["w"], p["h"], p["r"], 6.42, FRAME_X, PBR, cu=p["zc"], cv=p["cy"])
    medallion_x(b, (p["cy"], p["zc"]))
    if sign < 0:
        b.mirror_x()
    return b


def medallion_x(b, centre):
    """The medallion on an end panel: cream enamel disc in a brass bezel facing +x, seated in the teal slab (x 6.43 to 6.465) and standing
    proud of it by 0.04 cm; the notes lie on the disc. Nothing passes x = 6.515. centre = (y, z)."""
    cy, cz = centre
    x0 = 6.425
    b.lathe([(0.0, 0.0), (0.85, 0.0), (0.85, 0.045), (0.78, 0.068), (0.0, 0.070)], CREAM, axis="x", c=(x0, cy, cz), segs=24)
    b.lathe([(0.84, 0.0), (1.04, 0.0), (1.04, 0.06), (0.98, 0.085), (0.88, 0.085), (0.84, 0.065)], PBR, axis="x", c=(x0, cy, cz), segs=24, loop=True)
    xn = x0 + 0.074
    # eighth notes drawn in the (z, y) plane facing +x
    for hz, hy in ((-0.30, -0.32), (0.28, -0.42)):
        b.ellipsoid((xn, cy + hy, cz + hz), (0.014, 0.13, 0.19), PBR, segs=10, rows=4, xf=Matrix.Rotation(math.radians(20), 4, "X"))
    b.box((xn, cy + 0.04, cz - 0.13), (0.03, 0.72, 0.05), PBR, bev=0.008, seg=1)
    b.box((xn, cy - 0.06, cz + 0.45), (0.03, 0.72, 0.05), PBR, bev=0.008, seg=1)
    b.box((xn, cy + 0.34, cz + 0.16), (0.03, 0.10, 0.62), PBR, bev=0.008, seg=1, xf=Matrix.Rotation(math.radians(9.8), 4, "X"))


def build_hinge(cx):
    b = Builder()
    cz = -4.27
    for x0, x1 in ((-1.1, -0.42), (-0.38, 0.38), (0.42, 1.1)):         # three knuckles
        b.lathe([(0.0, x0), (0.18, x0), (0.22, x0 + 0.04), (0.22, x1 - 0.04), (0.18, x1), (0.0, x1)], PBR, axis="x", c=(cx, 7.0, cz), segs=14)
    for s in (-1, 1):                                                  # pin heads
        b.lathe([(0.0, s * 1.08), (0.16, s * 1.08), (0.14, s * 1.16), (0.0, s * 1.19)], ABR, axis="x", c=(cx, 7.0, cz), segs=10)
    b.box((cx, 6.55, -4.43), (2.3, 0.85, 0.06), PBR, bev=0.02, seg=1)  # leaf on the body, leaf on the lid
    b.box((cx, 7.45, -4.43), (2.3, 0.80, 0.06), PBR, bev=0.02, seg=1)
    for y in (6.55, 7.45):
        for dx in (-0.75, 0.75):
            b.lathe([(0.0, 0.02), (0.12, 0.02), (0.12, -0.012), (0.10, -0.028), (0.05, -0.036), (0.0, -0.036)], PBR, axis="z", c=(cx + dx, y, -4.46), segs=8)
    return b


def build_feet():
    b = Builder()
    for fx in (-5.5, 5.5):
        for fz in (-3.45, 3.45):
            b.lathe([(0.0, 0.0), (0.66, 0.0), (0.80, 0.08), (0.80, 0.22), (0.72, 0.32), (0.0, 0.32)], ABR, axis="y", c=(fx, 0.0, fz), segs=16)
    return b


# ======================================================================================
# assembly
# ======================================================================================
def heal_buried_ao(obj, thresh=0.03, rounds=10):
    """A vertex buried inside another closed shell (a slab vertex under the medallion's disc and bezel, a pad's base inside the wall) bakes
    to AO 0, and the vertex colour interpolates that black across the VISIBLE faces around it (rays fanning out of every medallion).
    Replace each such value by the mean of its already-healthy edge neighbours, outwards in rounds. Returns the number healed."""
    import bmesh
    import numpy as np
    from lib import vertex_ao
    ao = vertex_ao.read(obj)
    v = ao[:, 0].copy()
    good = v >= thresh
    n_bad = int((~good).sum())
    if n_bad == 0 or n_bad == len(v):
        return 0
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    nbrs = [[e.other_vert(vt).index for e in vt.link_edges] for vt in bm.verts]
    bm.free()
    for _ in range(rounds):
        todo = [(i, [j for j in nbrs[i] if good[j]]) for i in np.nonzero(~good)[0]]
        todo = [(i, g) for i, g in todo if g]
        if not todo:
            break
        for i, g in todo:
            v[i] = float(np.mean(v[g]))
        for i, _ in todo:
            good[i] = True
    ao[:, 0] = ao[:, 1] = ao[:, 2] = v
    obj.data.color_attributes.get(vertex_ao.AO_NAME).data.foreach_set("color", ao.reshape(-1))
    return n_bad - int((~good).sum())


def flatten_ao(obj, mat_name, k=0.5):
    """Teal panels are flat plates: their per-vertex AO only has vertices on a few concentric rings and one fan, so every contact shadow
    of the brass frame or the medallion shows as long wedges across the plate. Pull the AO of the faces of one material k of the way to
    the median of that material (the frame already reads as depth). Returns the number of vertices changed."""
    import numpy as np
    from lib import vertex_ao
    me = obj.data
    idx = [i for i, m in enumerate(me.materials) if m and m.name == mat_name]
    if not idx:
        return 0
    verts = sorted({v for p in me.polygons if p.material_index in idx for v in p.vertices})
    ao = vertex_ao.read(obj)
    med = float(np.median(ao[verts, 0]))
    ao[verts, 0] = ao[verts, 1] = ao[verts, 2] = (1.0 - k) * ao[verts, 0] + k * med
    me.color_attributes.get(vertex_ao.AO_NAME).data.foreach_set("color", ao.reshape(-1))
    return len(verts)


def rebake_ao(meshes, body, lid):
    """forge bakes every mesh with all the others present, so the closed lid shuts the interior in and the whole body bakes black. The lid
    is open whenever the player works, so re-bake the body without the lid, and the lid on its own (its ceiling is exposed when open).
    The AO distance is 5 cm: contact shading only, the runtime hemisphere light does the rest. Runs from the gate callback because
    forge.py has no hook between the bake and the export (reported as a framework gap)."""
    from lib import vertex_ao
    sc = bpy.context.scene
    if sc.world is None:
        sc.world = bpy.data.worlds.new("ao_world")
    sc.world.light_settings.distance = 0.05
    healed = {}
    for target in meshes:
        hidden = [lid] if target is not lid else [o for o in meshes if o is not lid]
        if target is not body and target is not lid:
            hidden = []                                                # outside parts: the closed lid is part of their surroundings
        for o in hidden:
            o.hide_render = True
        vertex_ao.bake(target, 64)
        healed[target.name] = heal_buried_ao(target)
        flatten_ao(target, TEAL)
        for o in hidden:
            o.hide_render = False
    wu.log("AO re-baked (5 cm, body without the lid, lid alone):", {o.name: vertex_ao.stats(o)["mean"] for o in meshes}, "buried vertices healed:", healed)


def build(entry: dict, params: dict):
    names = {n: n for n in entry["meshes"]}
    root = finish(build_body(), "MusicBoxCase_Body")
    root["wu"] = dict(id=entry["id"], family=FAMILY, lidPivot="PIV_Lid", lidOpenDeg=100, interiorCm=[11.8, 6.4, 7.8], floorTopCm=Y_FLOOR)
    parts = [finish(build_lid(), "MusicBoxCase_Lid", root)]
    ps_r, ps_l = build_side_panel(+1), build_side_panel(-1)
    parts += [finish(ps_l, "MusicBoxCase_SidePanel_L", root), finish(ps_r, "MusicBoxCase_SidePanel_R", root)]
    parts += [finish(build_hinge(-3.9), "MusicBoxCase_Hinge_L", root), finish(build_hinge(3.9), "MusicBoxCase_Hinge_R", root)]
    parts += [finish(build_feet(), "MusicBoxCase_Foot", root)]
    assert sorted(o.name for o in [root] + parts) == sorted(names), "mesh nodes differ from the manifest"

    m = lambda v: tuple(c / 100.0 for c in v)                          # cm -> m for the empties
    col = empties.add_collider(root, "Case", "box", (0.065, 0.05, 0.045), loc_g=(0.0, 0.05, 0.0))
    piv = empties.add_pivot(root, "Lid", loc_g=(0.0, 0.07, -0.0427), axis_g=(-1.0, 0.0, 0.0), kind="hinge", axis_label="-X")
    piv["wu"] = dict(type="pivot", kind="hinge", axis="-X", openDeg=100, closedDeg=0, hingeSide="back", note="positive rotation opens the lid")
    prop = dict(proposal=True, basis="docs/blueprints/MUSIC_BOX_BLUEPRINT.md section 7.1 (lead proposal, awaiting owner approval)")
    RX, I = dict(axis=(1, 0, 0), euler=[0, 90, 0], quat=[0.0, 0.7071068, 0.0, 0.7071068]), dict(axis=(0, 0, 1), euler=[0, 0, 0], quat=[0.0, 0.0, 0.0, 1.0])
    # (node, slot id, slot no., position cm, family, accepts, intended part, rotation, seats along, depends on)
    S = [
        ("BracketL", "bracket_left", 1, (BRK_L_X, ARB_Y, ARB_Z), "structural", ["bracket_support"], "bracket_support", RX, (0, -1, 0), []),
        ("BracketR", "bracket_right", 2, (BRK_R_X, ARB_Y, ARB_Z), "structural", ["bracket_support"], "bracket_support", RX, (0, -1, 0), []),
        ("Arbor", "arbor", 3, (CYL_X, ARB_Y, ARB_Z), "shaft", ["shaft_short"], "shaft_short", RX, (0, -1, 0), ["bracket_left", "bracket_right"]),
        ("Cylinder", "cylinder", 4, (CYL_X, ARB_Y, ARB_Z), "cylinder", ["cylinder_music_box"], "cylinder_music_box", RX, (0, -1, 0), ["arbor"]),
        ("Comb", "comb", 5, (CYL_X, ARB_Y, 0.60), "comb", ["comb_music_box"], "comb_music_box", I, (0, 0, -1), []),
        ("GearB", "cylinder_wheel", 6, (3.94, ARB_Y, ARB_Z), "spur_gear", ["spur_gear"], "gear_spur_20_m1", RX, (-1, 0, 0), ["arbor"]),
        ("GearC", "governor_wheel", 7, (-5.04, ARB_Y, ARB_Z), "spur_gear", ["spur_gear"], "gear_spur_16_m1", RX, (1, 0, 0), ["arbor"]),
        ("Spring", "main_spring", 8, SPR, "spring", ["spring_standard", "spring_worn"], "spring_standard", RX, (1, 0, 0), []),
        ("GearA", "spring_pinion", 9, (3.94, SPR[1], SPR[2]), "spur_gear", ["spur_gear"], "gear_spur_10_m1", RX, (1, 0, 0), ["main_spring"]),
        ("Governor", "governor", 10, GOV, "governor", ["governor_standard"], "governor_standard", RX, (0, -1, 0), []),
        ("GearD", "governor_pinion", 11, (-5.04, GOV[1], GOV[2]), "spur_gear", ["spur_gear"], "gear_spur_12_m1", RX, (1, 0, 0), ["governor"]),
        ("Key", "winding_key", 12, (6.00, SPR[1], SPR[2]), "winding_key", ["winding_key"], "winding_key", RX, (-1, 0, 0), ["main_spring"]),
    ]
    socks = []
    for node, sid, no, pos, fam, acc, intended, rot, seats, deps in S:
        socks.append(empties.add_socket(root, node, m(pos), acc, axis_g=rot["axis"], slot=sid, slotNo=no, partFamily=fam, intended=intended,
                                        seatsAlong=list(seats), rotationEulerDeg=rot["euler"], rotationQuat=rot["quat"], dependsOn=deps,
                                        note=f"slot {no} of 12", **prop))
    socks.append(empties.add_socket(root, "BaseHandle", m((0.0, 1.0, 4.5)), ["machine_base_handle"], axis_g=(0, 0, 1), slot="base_handle", partFamily="fitting",
                                    note="fixed fitting of every machine base, not one of the 12 slots; front centre, 1 cm up", **prop))
    root["wu"]["features"] = dict(
        Bush_SpringArbor=list(BUSH), Post_SpringOuter=[IW / 2, 4.00, 3.50], Seat_Comb=dict(x=[CYL_X - 3.2, CYL_X + 3.2], y=[Y_FLOOR, 2.5], z=[COMB_Z0, COMB_Z1]),
        Seat_Governor=[SEAT_GOV_X, GOV[1], ID / 2], BracketFloorMarks=[[BRK_L_X, Y_FLOOR, ARB_Z], [BRK_R_X, Y_FLOOR, ARB_Z]], unitsCm=True)

    def check(g, objs):
        lo, hi = (-IW / 2 / 100, Y_FLOOR / 100, -ID / 2 / 100), (IW / 2 / 100, Y_RIM / 100 + 0.03, ID / 2 / 100)
        for s in socks:
            if s.name in ("SOCKET_BaseHandle", "SOCKET_Key"):                        # outside the cavity by design (front fitting, through the right wall)
                continue
            pg = wu.Vector((s.location.x, s.location.z, -s.location.y))       # Blender -> glTF
            if not all(a - 1e-6 <= c <= b_ + 1e-6 for a, c, b_ in zip(lo, pg, hi)):
                g.fail("Q13", f"{s.name} at {[round(c * 100, 2) for c in pg]} cm is outside the interior")
        g.info["sockets"] = [s.name for s in socks]
        rebake_ao([root] + parts, root, parts[0])

    return [root] + parts + [col, piv] + socks, dict(origin=("centre", "min", "centre"), closed=True, checks=[check])


if __name__ == "__main__":
    raise SystemExit("gen_music_box_case.py is a forge family. Run blender/scripts/forge.py --family music_box --only music_box_case --out-root <dir>")
