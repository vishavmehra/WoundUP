"""gen_cam_hourly.py - the Clock Tower hourly chime cam: a stepped count cam with a trip notch (forge family 'cam').

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \
         --family cam --only cam_hourly_chime --out-root <dir> --owner Machines

(gen_cam.py re-exports this file's PARAMS and build, so a manifest `blenderSource` of either file builds it.)

A 25 mm brass count cam in the style of a strike-train snail. The rim is a staircase: five treads climb counter-clockwise from a
9.7 mm to a 12.5 mm radius, each tread also 0.3 mm thicker than the last, joined by short sloped risers; after the fifth tread the
rim falls off a cliff into a 9.0 mm trip notch that runs on to the first tread. The bell's striker lever therefore climbs the
steps one by one over most of the hour and drops into the notch at the top of the hour, which is the strike. Inside the stepped
track the web is recessed, three domed rivets sit in it behind the three tallest treads, and the 8 mm bored hub (6.4 mm radius) stands
proud on both sides (6 mm overall). No lightening holes: the stairs are the design.

Rotation axis local +Z, origin the bore centre, treads climbing counter-clockwise from 22.5 degrees. One mesh in Mat_AgedBrass, built
in mm (gen_cam_common: one closed manifold, 0.4 mm chamfers, 0.6 mm bore mouth) and exported in metres.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import wu_common as wu
from lib import empties

import gen_cam_common as cc
import gen_mech_common as mc

FAMILY = "cam"
PARAMS = {"cam_hourly_chime": dict(treads=(9.7, 10.4, 11.1, 11.8, 12.5), tread_h=(1.5, 1.8, 2.1, 2.4, 2.7), notch_r=9.0, notch_h=1.5,
                                   start=20.0, tread_samples=4, tread_gap=15.0, riser=4.0, notch_samples=6, track=1.8, h_web=0.9,
                                   h_boss=3.0, boss_r=6.4, rivet_r=8.2, rivet_treads=(2, 3, 4), grab=0.0125)}


def profile(p):
    """Vertex angles, outline radii, per-strip track half heights and the (first, last) sample of each tread.
    Samples sit only where the rim bends: four per tread, a 4 degree sloped riser between treads, a cliff after the last tread,
    and a coarse dwell on the notch circle that ends one riser before the first tread."""
    ang, r, spans = [], [], []
    a = p["start"]
    for rt in p["treads"]:
        lo = len(ang)
        for s in range(p["tread_samples"]):
            ang.append(a + s * p["tread_gap"])
            r.append(rt)
        spans.append((lo, len(ang) - 1))
        a = ang[-1] + p["riser"]                                   # the next sample: first of the next tread, or the cliff
    end = p["start"] + 360.0 - p["riser"]
    m = p["notch_samples"]
    for s in range(m):
        ang.append(a + (end - a) * s / (m - 1))
        r.append(p["notch_r"])
    n = len(ang)
    h = [p["notch_h"]] * n
    for (lo, hi), ht in zip(spans, p["tread_h"]):
        for i in range(lo - 1, hi):                                # strip i joins sample i and i+1; strip lo-1 is the riser into the tread
            h[i % n] = ht
    return ang, r, h, spans


def build(entry, p):
    ang, r, h, spans = profile(p)
    track = [x - p["track"] for x in r]
    assert min(track) - p["boss_r"] >= 0.5, "web between the hub and the track is too narrow"
    bm, keys = cc.relief(ang, [r, track, p["boss_r"], cc.BORE_R], [h, p["h_web"], p["h_boss"]])
    cc.chamfer(bm, keys, rings=(0, 1, 2))
    items = []
    for k in p["rivet_treads"]:
        lo, hi = spans[k]
        t = math.radians((ang[lo] + ang[hi]) / 2)
        room = track[lo] - (p["rivet_r"] + 0.7)
        assert room >= 0.35, f"rivet behind tread {k} has only {room:.2f} mm to the track"
        for sign in (1, -1):
            items.append((p["rivet_r"] * math.cos(t), p["rivet_r"] * math.sin(t), sign * p["h_web"], sign, 0.7, 0.55))
    bm = cc.union_shells(bm, [cc.rivet_shells(items, 6)])
    obj = mc.make_object(bm, entry["meshes"][0], [entry["materials"][0]])
    rmax, sx, sy = cc.outline_stats(obj)
    obj["wu"] = dict(id=entry["id"], family=FAMILY, profile="stepped count cam", treads=len(p["treads"]), notches=1,
                     treadRadiiMm=list(p["treads"]), notchRadiusMm=p["notch_r"], boreRadiusMm=cc.BORE_R, rotationAxis="+Z")
    wu.log(f"{entry['id']}: max radius {rmax:.3f} mm, plate {sx:.2f} x {sy:.2f} mm")
    col = empties.add_collider(obj, "Grab", "sphere", p["grab"], (0, 0, 0))
    return [obj, col], dict(thin_axis_z=True, closed=True, checks=[cc.bore_check])


if __name__ == "__main__":
    raise SystemExit("gen_cam_hourly.py is a forge family. Run blender/scripts/forge.py --family cam --only cam_hourly_chime --out-root <dir>")
