"""uvmetric.py - box-projected UVs at a fixed texel density: 1 UV unit = 0.1 m of surface (one library tile = 10 cm).

Every mesh that uses a library material gets this (one map named UVMap, UVs outside 0..1 by design: V14 allows that
only for materials the manifest declares tiled). Each face is projected along the axis its normal points along most;
the sign of that axis flips u so the UV winding matches the geometry (no mirrored islands). A seam is a vertex split
on export, so a curved wall pays a few extra vertices where its dominant axis changes.
"""
from __future__ import annotations

import numpy as np

TILE_M = 0.1
UV_NAME = "UVMap"


def box_project(obj, tile_m: float = TILE_M) -> dict:
    """Write metric box-projected UVs into the single UV map `UVMap` of a mesh object (object-space metres)."""
    me = obj.data
    for uvl in list(me.uv_layers):
        me.uv_layers.remove(uvl)
    uvl = me.uv_layers.new(name=UV_NAME)
    n_loop, n_poly = len(me.loops), len(me.polygons)
    co = np.empty(len(me.vertices) * 3, np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    vi = np.empty(n_loop, np.int64)
    me.loops.foreach_get("vertex_index", vi)
    nrm = np.empty(n_poly * 3, np.float64)
    me.polygons.foreach_get("normal", nrm)
    nrm = nrm.reshape(-1, 3)
    start = np.empty(n_poly, np.int64)
    total = np.empty(n_poly, np.int64)
    me.polygons.foreach_get("loop_start", start)
    me.polygons.foreach_get("loop_total", total)
    poly_of_loop = np.repeat(np.arange(n_poly), total)
    p = co[vi] / tile_m                                            # (n_loop, 3) in tiles
    n = nrm[poly_of_loop]
    ax = np.abs(n).argmax(axis=1)
    sg = np.where(n[np.arange(n_loop), ax] >= 0, 1.0, -1.0)
    # (u, v) by axis, chosen so that u x v points along +axis: X: (y, z)  Y: (z, x)  Z: (x, y)
    u_ax, v_ax = np.array([1, 2, 0]), np.array([2, 0, 1])
    u = p[np.arange(n_loop), u_ax[ax]] * sg
    v = p[np.arange(n_loop), v_ax[ax]]
    uvl.data.foreach_set("uv", np.stack([u, v], axis=1).ravel().astype(np.float32))
    me.update()
    return dict(layer=UV_NAME, loops=int(n_loop), u_range=[float(u.min()), float(u.max())], v_range=[float(v.min()), float(v.max())],
                tile_m=tile_m)
