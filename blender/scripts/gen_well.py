"""gen_well.py - the well family: the Tockton Well and Fountain housing (forge family 'well', Machines agent).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family well --only well_base --out-root <dir> --owner Machines [--manifest <file>]

Spec: docs/blueprints/WELL_FOUNTAIN_BLUEPRINT.md (fifth machine, ADR-048): 66 x 230 x 52 mm on the 6.8 x 6.0 cm pad `plot_well`. One GLB, five
mesh nodes (manifest `meshes`):

  Well_Plate       the root and everything static: stone slab and back wall of laid blocks, walnut stiles and corner posts, brass studs, guide and
                   bush hardware, the drip tray with its legs, the basin ring, the feed pipe, the walnut roof frame and the teal tiled gable roof
  Pump_Barrel      the brass pump barrel, y 116 to 155, foot open to the follower's head (the rod enters it at full stroke), a warm-glass sight glass
  Well_Nozzle      the brass fountain finial in the basin; its tip, y 176.0, is the emitter of the jet
  Bucket_Template  one wooden bucket with a brass hoop (9 x 9 x 6 mm). The runtime hides it and instances it 10 times along the chain; it stands on the
                   chain's right run so that, left visible by mistake, it reads as a bucket on the chain
  Well_WaterLevel  a 0.4 mm disc on the basin floor (y 158.2): the runtime lifts it to y 166 (the lip of the spout) and gives it the water material

Model space (glTF Y-up, built in millimetres): x right, y up, z towards the player; origin at the centre of the floor-contact face. The 11 sockets are
the blueprint's section 7.1, positions and the 230 degrees of the pawl as written there. The works run on three studs: the spring arbor S (-4, 36), the
cam axle C (-4, 74.5) and the top axle T (17, 195). Parts seat along -Z from the front, so no stud has a cap (a cap would stop the part).

PIV_ helpers (what moves, for the runtime): PIV_ChainDrive and PIV_ChainIdle (the two pulley centres the bucket loop runs round; wu has the radius,
the bucket count and pitch), PIV_FollowerRod (the follower's slide axis and stroke), PIV_Spout (the lip over which the water curtain falls) and PIV_Nozzle.

Fit proof: the installed parts at their sockets leave 0 triangle overlaps with the housing and with each other (BVH; face contact allowed) and the
gears mesh at m(N1+N2)/2 + 1.0 mm: see blender/previews/well/ and the fit script in the hand-over.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Quaternion, Vector

import wu_common as wu
from lib import empties

import gen_mech_common as mc
import gen_ct_common as ct
from gen_clock_tower import (ABRASS, BRASS, GLASS, STONE, TEAL, WALNUT, arch, ball_y, box, face_to, finish, hp, lathe_y, put, sq, stroke, vp)

FAMILY = "well"
PARAMS = {"well_base": dict()}

# ---- the machine frame, millimetres --------------------------------------------------------------------------------
S_AX = (-4.0, 36.0)          # spring arbor
C_AX = (-4.0, 74.5)          # cam axle
T_AX = (17.0, 195.0)         # top (idle) axle
PAWL = (14.9, 108.1)         # pawl stud
Z_PLATE = -20.0              # the front of the back wall
SLOT = dict(stone=0, walnut=1, abrass=2, brass=3, teal=4)
MATS = [STONE, WALNUT, ABRASS, BRASS, TEAL]


def m(v):
    """millimetres -> metres for the empties"""
    return tuple(c / 1000.0 for c in v)


# ======================================================================================
# toolkit
# ======================================================================================
def zstud(x, y, z0, z1, r, n=16, tip=0.55):
    """A pin standing on the wall along +Z (centre x, y), z0 to z1, a rounded tip so a part slides on."""
    return ct.lathe_along([(0.0, z0), (r, z0), (r, z1 - tip), (r - tip, z1), (0.0, z1)], n, (0.0, 0.0, 1.0), (x, y, 0.0))


def zring(x, y, z0, z1, ri, ro, n=28, ch=0.3):
    """A ring about +Z (centre x, y)."""
    return ct.lathe_along([(ri, z0), (ro - ch, z0), (ro, z0 + ch), (ro, z1 - ch), (ro - ch, z1), (ri, z1)], n, (0.0, 0.0, 1.0), (x, y, 0.0))


def xcyl(y, z, x0, x1, r, n=14):
    """A round bar along +X."""
    return ct.lathe_along([(0.0, x0), (r, x0), (r, x1), (0.0, x1)], n, (1.0, 0.0, 0.0), (0.0, y, z))


def ycyl(x, z, y0, y1, r, n=16):
    return lathe_y([(0.0, 0.0), (r, 0.0), (r, y1 - y0), (0.0, y1 - y0)], n, (x, y0, z))


def xprism(poly_zy, x0, x1, bevel=0.0):
    """Prism along +X: a polygon of (z, y) pairs extruded from x0 to x1."""
    bm = ct.shell_prism([(-z, y) for z, y in poly_zy], x0, x1, bevel)
    return face_to(bm, 1)


def jitter(i, lo=0.8, hi=1.2):
    """Deterministic 0..1 hash, so the laid blocks are irregular and the build is repeatable."""
    v = math.sin(i * 12.9898 + 4.1414) * 43758.5453
    return lo + (v - math.floor(v)) * (hi - lo)


def rotate_y(bm, ang):
    """Turn a shell about the Y axis through the origin (counter-clockwise seen from above)."""
    import bmesh
    from mathutils import Matrix
    bmesh.ops.rotate(bm, cent=(0.0, 0.0, 0.0), matrix=Matrix.Rotation(ang, 3, "Y"), verts=bm.verts)
    return bm


def block_wall(bm, slot, xa, xb, ya, yb, zf, zb, rowh=11.0, bw=14.2):
    """Laid stone blocks in running bond, front faces at zf, 0.6 mm joints; the joints show the backing behind (AO makes them read)."""
    rows = max(1, int(round((yb - ya) / rowh)))
    rh = (yb - ya) / rows
    n = 0
    for r in range(rows):
        y0 = ya + r * rh
        x = xa - (0.5 * bw if r % 2 else 0.0)
        i = 0
        while x < xb - 0.8:
            w = bw * jitter(r * 11 + i)
            xl, xr = max(x, xa), min(x + w, xb)
            x += w
            i += 1
            if xr - xl < 4.0:
                continue
            put(bm, box((xl + 0.3, y0 + 0.3, zb), (xr - 0.3, y0 + rh - 0.3, zf - 0.02 * jitter(n + 3, 0, 1)), 0.4), slot)
            n += 1
    return n


def roof_profile(hz, y_eave, y_ridge, courses, t=0.9):
    """Closed (z, y) outline of the gable roof: a flat underside, an eave fascia, then shallow tile courses with a step of t up both slopes."""
    y_top0 = y_eave + 1.5
    st = (y_ridge - y_top0 - courses * t) / hz                         # slope of one tile surface
    dz = hz / courses
    side = [(hz, y_top0)]
    y = y_top0
    for k in range(courses):
        y += st * dz
        side.append((hz - dz * (k + 1), y))
        y += t
        side.append((hz - dz * (k + 1), y))
    side = side[:-1] if abs(side[-1][0]) < 1e-9 else side            # the last step stops at the ridge line
    right = [(hz, y_eave)] + side                                      # eave, fascia, up the +z slope
    left = [(-z, yy) for z, yy in reversed(side)] + [(-hz, y_eave)]    # down the -z slope
    return right + left


# ======================================================================================
# the static body: Well_Plate
# ======================================================================================
def build_body(p):
    bm = ct.new()
    ST, WA, AB, BR, TL = (SLOT[k] for k in ("stone", "walnut", "abrass", "brass", "teal"))

    # --- slab and the front kerb -------------------------------------------------------------------------------
    put(bm, box((-33.0, 0.0, -26.0), (33.0, 3.4, 26.0), 0.7), ST)
    put(bm, box((-32.6, 3.2, -25.6), (32.6, 6.0, 25.6), 0.5), ST)
    put(bm, box((-32.2, 5.8, 21.0), (32.2, 12.0, 25.4), 0.5), ST)                       # front kerb: the handle stands on its face
    put(bm, box((-32.0, 11.9, 21.6), (32.0, 12.4, 24.8), 0.2), BR)                      # brass nosing

    # --- back wall: backing, laid blocks, walnut stiles, rails ------------------------------------------------
    put(bm, box((-32.4, 5.9, -25.5), (32.4, 211.1, -21.7), 0.3), ST)
    n_blocks = block_wall(bm, ST, -28.3, 28.3, 9.2, 207.2, Z_PLATE, -22.5)
    for sx in (-1, 1):
        lo, hi = sorted((sx * 28.4, sx * 32.4))
        put(bm, box((lo, 5.95, -25.5), (hi, 211.0, Z_PLATE), 0.5), WA)                  # stiles, flush with the block faces
    put(bm, box((-28.5, 5.95, -25.45), (28.5, 9.1, Z_PLATE + 0.03), 0.4), WA)           # base rail
    put(bm, box((-28.5, 207.3, -25.45), (28.5, 211.0, Z_PLATE + 0.03), 0.4), WA)        # top rail
    for sx in (-1, 1):                                                                  # corner posts above the 20T: they carry the roof frame
        lo, hi = sorted((sx * 28.55, sx * 32.25))
        put(bm, box((lo, 140.0, -25.4), (hi, 210.9, -17.0), 0.5), WA)
        lo, hi = sorted((sx * 29.1, sx * 31.7))
        put(bm, box((lo, 139.2, -17.05), (hi, 146.0, -16.5), 0.3), BR)                  # brass strap on the post foot
        put(bm, box((lo, 203.0, -17.05), (hi, 207.8, -16.5), 0.3), BR)
    for y in (82.0, 118.0, 152.0, 184.0):                                               # domed brass studs on the stiles (clear of the 20T's tip)
        for sx in (-1, 1):
            put(bm, ct.lathe_along([(0.0, 0.0), (1.55, 0.0), (1.55, 0.35), (1.0, 0.8), (0.0, 0.95)], 10, (0.0, 0.0, 1.0), (sx * 30.3, y, Z_PLATE - 0.01)), BR)

    # --- hardware on the wall: the three axles, the bush, the follower's guide ------------------------------
    put(bm, zstud(C_AX[0], C_AX[1], Z_PLATE - 0.2, 24.4, 3.7), BR)                      # Stud_C: gear, cam, ratchet, drive pulley seat along -Z
    put(bm, zring(C_AX[0], C_AX[1], Z_PLATE - 0.3, Z_PLATE + 0.5, 3.6, 6.4), BR)       # root washer: the 10T stands 1 mm off the wall
    put(bm, zstud(T_AX[0], T_AX[1], Z_PLATE - 0.2, 24.4, 3.7), BR)                      # Axle_Idle: bearing and idle pulley
    put(bm, zring(T_AX[0], T_AX[1], Z_PLATE - 0.3, Z_PLATE + 0.5, 3.6, 6.4), BR)
    put(bm, zstud(PAWL[0], PAWL[1], Z_PLATE - 0.2, 12.9, 3.7), BR)                      # Stud_Pawl
    put(bm, zring(PAWL[0], PAWL[1], Z_PLATE - 0.3, Z_PLATE + 0.5, 3.6, 6.4), BR)
    put(bm, zring(S_AX[0], S_AX[1], Z_PLATE - 0.4, Z_PLATE + 0.6, 4.7, 7.6), BR)        # Boss_S: the 20T's back face is 0.4 mm off its top

    gx, gy = -4.0, 90.0                                                                 # Guide_Follower: open-fronted U round the rod, y 100 to 108
    put(bm, box((gx - 10.4, 100.0, Z_PLATE - 0.4), (gx + 10.4, 108.0, -3.9), 0.5), AB)  # web, behind the head
    for sx in (-1, 1):
        lo, hi = sorted((gx + sx * 7.4, gx + sx * 10.4))
        put(bm, box((lo, 100.0, Z_PLATE - 0.3), (hi, 108.0, 5.0), 0.5), AB)             # cheeks
        put(bm, ct.lathe_along([(0.0, 0.0), (1.4, 0.0), (1.4, 0.3), (0.9, 0.7), (0.0, 0.8)], 8, (0.0, 0.0, 1.0), (gx + sx * 8.9, 104.0, 5.0)), BR)

    # --- drip tray under the drive pulley, on two legs ----------------------------------------------------------
    tx0, tx1, tz0, tz1 = -24.0, 16.0, 13.6, 20.1
    put(bm, box((tx0, 44.0, tz0), (tx1, 46.6, tz1), 0.5), ST)                           # floor
    for lo, hi in ((tx0, tx0 + 1.4), (tx1 - 1.4, tx1)):
        put(bm, box((lo, 46.4, tz0), (hi, 52.0, tz1), 0.5), ST)                         # end walls
    put(bm, box((tx0 + 0.02, 46.4, tz0), (tx1 - 0.02, 51.9, tz0 + 1.3), 0.4), ST)       # back wall (clear of the ratchet, 1.2 mm)
    put(bm, box((tx0 + 0.04, 46.4, tz1 - 1.3), (tx1 - 0.04, 51.8, tz1), 0.4), ST)       # front wall
    put(bm, box((tx0 - 0.3, 50.7, tz0 - 0.3), (tx1 + 0.3, 52.2, tz1 + 0.3), 0.3), BR)   # brass rim band
    for lo, hi in ((tx0 + 0.02, tx0 + 3.6), (tx1 - 3.6, tx1 - 0.02)):                   # legs on stone feet
        put(bm, box((lo, 8.0, tz1 - 3.2), (hi, 45.0, tz1 - 0.05), 0.5), WA)
        put(bm, box((lo - 0.3, 43.4, tz1 - 3.5), (hi + 0.3, 45.2, tz1 + 0.2), 0.3), BR)
        put(bm, box((lo - 0.6, 6.0, tz1 - 3.9), (hi + 0.6, 8.4, tz1 + 0.5), 0.4), ST)

    # --- basin ----------------------------------------------------------------------------------------------------
    bx, bz = -4.0, -3.0
    basin = [(0.0, 155.0), (13.6, 155.0), (13.6, 157.4), (15.1, 159.5), (15.6, 162.0), (15.7, 170.4), (16.0, 171.6), (16.0, 174.4),
             (15.6, 175.0), (13.4, 175.0), (13.0, 174.4), (13.0, 160.0), (12.5, 158.6), (11.4, 158.0), (0.0, 158.0)]
    bb = mc.boolean(ct.lathe_along([(r, y - 155.0) for r, y in basin], 40, (0.0, 1.0, 0.0), (bx, 155.0, bz)),
                    [ct.shell_box((bx - 4.2, 166.0, bz + 12.0), (bx + 4.2, 176.0, bz + 17.0), 0.0)])        # the spout notch, lip at y 166
    put(bm, bb, ST)
    put(bm, ct.lathe_along([(15.7, 0.0), (16.35, 0.0), (16.35, 1.4), (15.7, 1.4)], 40, (0.0, 1.0, 0.0), (bx, 169.8, bz)), BR)        # brass band round the bowl
    put(bm, box((bx - 5.2, 165.4, bz + 14.6), (bx + 5.2, 166.4, bz + 16.9), 0.3), BR)                                                   # spout lip
    for k in range(12):                                                                                                                  # gadroons: twelve stone staves on the bowl
        a = 2 * math.pi * k / 12
        if math.sin(a) < -0.5 and abs(math.cos(a)) < 0.45:                                                                               # none under the spout
            continue
        rib = rotate_y(box((15.2, 162.6, -1.5), (16.25, 169.4, 1.5), 0.45), a)
        put(bm, ct.move(rib, (bx, 0.0, bz)), ST)

    # --- the feed pipe: a hopper under the chain's turn, a gutter back, a downpipe over the basin -----------------
    put(bm, box((-6.1, 203.0, 14.4), (0.1, 208.0, 21.6), 0.5), BR)                      # hopper
    put(bm, box((-4.7, 203.3, 7.8), (-1.3, 206.0, 14.5), 0.4), BR)                      # gutter
    put(bm, ycyl(-3.0, 8.4, 178.4, 206.0, 2.3), BR)                                     # downpipe
    put(bm, lathe_y([(2.3, 0.0), (3.1, 0.0), (3.1, 1.3), (2.3, 1.3)], 14, (-3.0, 178.4, 8.4)), BR)
    put(bm, box((-4.9, 208.0, 19.8), (-1.1, 211.05, 21.2), 0.3), BR)                    # hanger up to the lintel

    # --- roof frame and gable roof ------------------------------------------------------------------------------
    put(bm, box((-32.9, 211.05, -25.9), (32.9, 214.95, -20.1), 0.5), WA)                # back beam
    put(bm, box((-32.9, 211.05, 20.1), (32.9, 214.95, 25.9), 0.5), WA)                  # front lintel
    for sx in (-1, 1):
        lo, hi = sorted((sx * 28.4, sx * 33.0))
        put(bm, box((lo, 211.0, -26.0), (hi, 215.0, 26.0), 0.5), WA)                    # side beams
    put(bm, xprism(roof_profile(26.0, 214.98, 228.7, 7), -33.0, 33.0, 0.3), TL)
    put(bm, xcyl(228.95, 0.0, -32.0, 32.0, 1.05), BR)                                   # ridge cap, top at y 230.0
    for sx in (-1, 1):
        put(bm, ball_y((sx * 31.4, 228.3, 0.0), 1.7, 10, 5), BR)                        # gable finials
    return bm, n_blocks


# ======================================================================================
# the runtime nodes
# ======================================================================================
def build_barrel():
    bx, bz = -4.0, 1.2
    bm = ct.new()
    outer = [(7.35, 116.0), (10.1, 116.0), (10.1, 119.6), (9.3, 120.2), (9.3, 126.0), (9.8, 126.6), (9.8, 128.0), (9.2, 128.6), (9.2, 149.0), (9.9, 149.6),
             (9.9, 152.4), (9.2, 153.0), (9.2, 155.0), (3.2, 155.0), (3.2, 126.0), (7.35, 126.0)]
    put(bm, lathe_y([(r, y - 116.0) for r, y in outer], 32, (bx, 116.0, bz)), 0)         # shell with the open foot (bore 7.35 to y 126)
    put(bm, ct.lathe_along([(9.0, 0.0), (10.0, 0.0), (10.0, 1.1), (9.0, 1.1)], 32, (0.0, 1.0, 0.0), (bx, 121.5, bz)), 1)             # polished bands
    put(bm, ct.lathe_along([(9.0, 0.0), (10.0, 0.0), (10.0, 1.1), (9.0, 1.1)], 32, (0.0, 1.0, 0.0), (bx, 146.5, bz)), 1)
    # sight glass on the front, in a polished bezel
    put(bm, ct.lathe_along([(0.0, 9.3), (4.1, 9.3), (4.1, 10.6), (3.6, 11.0), (0.0, 11.0)], 24, (0.0, 0.0, 1.0), (bx, 137.5, 0.0)), 2)
    put(bm, ct.lathe_along([(4.1, 8.4), (5.3, 8.4), (5.3, 10.6), (4.8, 11.2), (4.1, 11.0)], 24, (0.0, 0.0, 1.0), (bx, 137.5, 0.0)), 1)
    return bm


def build_nozzle():
    bx, bz = -4.0, -3.0
    prof = [(0.0, 0.0), (3.6, 0.0), (3.6, 1.0), (1.9, 2.0), (1.55, 3.6), (1.55, 12.4), (2.5, 13.2), (3.4, 14.6), (3.1, 15.6), (1.7, 16.2), (1.2, 17.0), (0.7, 17.6),
            (0.7, 18.0), (0.0, 18.0)]
    return lathe_y(prof, 24, (bx, 158.0, bz))                                           # tip at y 176.0


def build_bucket():
    bm = ct.new()
    tool = ct.shell_box((-3.7, 1.4, -2.3), (3.7, 9.6, 2.3), 0.0)
    body = mc.boolean(ct.shell_box((-4.5, 0.0, -3.0), (4.5, 9.0, 3.0), 0.5), [tool])
    ct.merge(bm, body, 0)
    ct.merge(bm, ct.shell_box((-4.75, 3.0, -3.25), (4.75, 4.7, 3.25), 0.3), 1)           # brass hoop (x overall 9.5, a hair over the nominal 9)
    ct.merge(bm, ct.shell_box((-1.3, 5.5, 3.2), (1.3, 8.6, 3.9), 0.25), 1)               # ear on the chain side
    return bm


def build_water():
    bx, bz = -4.0, -3.0
    return ct.lathe_along([(0.0, 0.0), (12.3, 0.0), (12.3, 0.4), (0.0, 0.4)], 40, (0.0, 1.0, 0.0), (bx, 158.2, bz))


# ======================================================================================
def build(entry: dict, params: dict):
    bm, n_blocks = build_body(params)
    root = finish(entry, bm, "Well_Plate", MATS)
    root["wu"] = dict(id=entry["id"], family=FAMILY, sizeMm=[66.0, 230.0, 52.0], blocks=n_blocks, studs=dict(C=list(C_AX), T=list(T_AX), pawl=list(PAWL), S=list(S_AX)),
                      zPlateMm=Z_PLATE, basin=dict(centreMm=[-4.0, -3.0], floorYMm=158.0, lipYMm=166.0, rimYMm=175.0, innerRadiusMm=13.0),
                      jet=dict(emitterMm=[-4.0, 176.0, -3.0], peakYMm=210.0),
                      chain=dict(drivePulleyMm=[C_AX[0], C_AX[1], 18.4], idlePulleyMm=[T_AX[0], T_AX[1], 18.4], grooveRadiusMm=11.8, buckets=10, pitchMm=32.0),
                      pool=dict(trayMm=[-24.0, 44.0, 13.6, 16.0, 58.0, 20.1]),
                      note="proposal: docs/blueprints/WELL_FOUNTAIN_BLUEPRINT.md; sockets of section 7.1")

    barrel = finish(entry, build_barrel(), "Pump_Barrel", [ABRASS, BRASS, GLASS], root)
    barrel["wu"] = dict(role="pump_barrel", axisMm=[-4.0, 1.2], footYMm=116.0, topYMm=155.0, note="the follower's head (x +-6, z +-4) enters the foot bore (r 7.35) at full stroke")
    nozzle = finish(entry, build_nozzle(), "Well_Nozzle", [BRASS], root)
    nozzle["wu"] = dict(role="nozzle", emitterMm=[-4.0, 176.0, -3.0], note="tip y 176.0 is the jet's emitter")
    bucket = finish(entry, ct.move(build_bucket(), (15.9, 112.0, 18.4)), "Bucket_Template", [WALNUT, ABRASS], root)
    bucket["wu"] = dict(role="bucket_template", hiddenByRuntime=True, instances=10, sizeMm=[9.5, 9.0, 6.5], originMm=[15.9, 112.0, 18.4],
                        note="stands on the chain's right run (plane z 18.4); its own origin is its bottom centre, so the runtime reads originMm and instances it along the loop")
    water = finish(entry, build_water(), "Well_WaterLevel", [GLASS], root)
    water["wu"] = dict(role="water_surface", centreMm=[-4.0, -3.0], baseYMm=158.2, maxYMm=166.0, radiusMm=12.3, hiddenAtRest=True,
                       note="the runtime raises this disc 0.8 cm as the first buckets tip and swaps in the water material")

    helpers = []
    col = empties.add_collider(root, "Case", "box", (0.033, 0.115, 0.026), (0.0, 0.115, 0.0))
    helpers.append(col)

    prop = dict(proposal=True, basis="docs/blueprints/WELL_FOUNTAIN_BLUEPRINT.md section 7.1")
    I, RZ = dict(axis=(0, 0, 1), euler=[0, 0, 0], quat=[0.0, 0.0, 0.0, 1.0]), None
    # (node, slot id, no., position mm, family, accepts, intended, seats along, depends on)
    S = [
        ("BearingTop", "bearing_top", 1, (17.0, 195.0, 6.4), "structural", ["bearing_pillow_block"], "bearing_pillow_block", []),
        ("GearDrive", "drive_gear", 2, (-4.0, 36.0, -11.4), "spur_gear", ["spur_gear"], "gear_spur_20_m1", []),
        ("Spring", "spring", 3, (-4.0, 36.0, 2.2), "spring", ["spring_standard", "spring_worn"], "spring_standard", ["drive_gear"]),
        ("Key", "key", 4, (-4.0, 36.0, 9.2), "winding_key", ["winding_key"], "winding_key", ["spring"]),
        ("GearCam", "cam_gear", 5, (-4.0, 74.5, -11.4), "spur_gear", ["spur_gear"], "gear_spur_10_m1", ["drive_gear"]),
        ("Cam", "cam", 6, (-4.0, 74.5, 1.2), "cam", ["cam_eccentric"], "cam_eccentric", ["cam_gear"]),
        ("Follower", "follower", 7, (-4.0, 90.0, 1.2), "follower", ["follower_roller"], "follower_roller", ["cam"]),
        ("Ratchet", "ratchet", 8, (-4.0, 74.5, 9.3), "ratchet", ["ratchet_wheel"], "ratchet_wheel", ["cam"]),
        ("Pawl", "pawl", 9, (14.9, 108.1, 9.3), "pawl", ["pawl_standard"], "pawl_standard", ["ratchet"]),
        ("PulleyDrive", "pulley_drive", 10, (-4.0, 74.5, 18.4), "pulley", ["pulley_standard"], "pulley_standard", ["ratchet"]),
        ("PulleyIdle", "pulley_idle", 11, (17.0, 195.0, 18.4), "pulley", ["pulley_standard"], "pulley_standard", ["bearing_top", "pulley_drive"]),
    ]
    socks = []
    for node, sid, no, pos, fam, acc, intended, deps in S:
        extra = dict(slot=sid, slotNo=no, partFamily=fam, intended=intended, seatsAlong=[0, 0, -1], rotationEulerDeg=[0, 0, 0], rotationQuat=[0.0, 0.0, 0.0, 1.0],
                     dependsOn=deps, note=f"slot {no} of 11", **prop)
        if sid == "pawl":
            extra.update(rotationEulerDeg=[0, 0, 230], rotationQuat=[0.0, 0.0, 0.9063078, -0.4226183])
        e = empties.add_socket(root, node, m(pos), acc, axis_g=(0, 0, 1), **extra)
        if sid == "pawl":                                               # roll 230 degrees about the glTF +Z axis (= Blender -Y)
            th = math.radians(230.0)
            e.rotation_quaternion = Quaternion((math.cos(th / 2), 0.0, -math.sin(th / 2), 0.0))
        socks.append(e)
    socks.append(empties.add_socket(root, "BaseHandle", m((0.0, 10.0, 26.0)), ["machine_base_handle"], axis_g=(0, 0, 1), slot="base_handle", partFamily="fitting",
                                    note="fixed fitting of every machine base, not one of the 11 slots; front centre of the kerb, 1 cm up", **prop))
    helpers += socks
    pivs = [
        ("ChainDrive", (C_AX[0], C_AX[1], 18.4), (0, 0, 1), "rotation_axis", "+Z", dict(radiusM=0.0118, role="chain_drive")),
        ("ChainIdle", (T_AX[0], T_AX[1], 18.4), (0, 0, 1), "rotation_axis", "+Z", dict(radiusM=0.0118, role="chain_idle", centreDistanceM=0.1223)),
        ("FollowerRod", (-4.0, 90.0, 1.2), (0, 1, 0), "slide", "+Y", dict(strokeM=0.0055, role="pump_rod")),
        ("Spout", (-4.0, 166.0, 13.6), (0, 0, 1), "anchor", "+Z", dict(role="water_lip", note="the curtain falls from here, z 13.6 to the pool")),
        ("Nozzle", (-4.0, 176.0, -3.0), (0, 1, 0), "anchor", "+Y", dict(role="jet_emitter", peakM=0.034)),
    ]
    for name, pos, ax, kind, label, extra in pivs:
        e = empties.add_pivot(root, name, m(pos), ax, kind, label)
        e["wu"] = dict(type="pivot", kind=kind, axis=label, **extra)
        helpers.append(e)

    objs = [root, barrel, nozzle, bucket, water] + helpers

    def check(g, objs_):
        g.info["blocks"] = n_blocks

    return objs, dict(origin=("centre", "min", "centre"), closed=True, checks=[check])


if __name__ == "__main__":
    raise SystemExit("gen_well.py is a forge family. Run blender/scripts/forge.py --family well --only well_base --out-root <dir>")
