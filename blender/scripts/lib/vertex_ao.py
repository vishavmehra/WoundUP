"""vertex_ao.py - baked per-vertex ambient occlusion in the colour attribute `AO`, exported as COLOR_0.

Measured recipe (BLENDER_PRODUCTION_GUIDELINES section 8, audit E 2.2): a point-domain float colour attribute made the
active colour attribute, then Cycles AO baked to vertex colours (OPTIX, 64 samples: 1.71 s for 1,928 vertices, AO range
0.375 to 1.0, mean 0.803). Every mesh that uses a library material ships COLOR_0, neutral white when it is not baked.
"""
from __future__ import annotations

import numpy as np

import bpy

import wu_common as wu

AO_NAME = "AO"


def _attribute(me):
    for ca in list(me.color_attributes):                          # exactly one colour attribute: the AO one
        if ca.name != AO_NAME:
            me.color_attributes.remove(ca)
    ca = me.color_attributes.get(AO_NAME) or me.color_attributes.new(AO_NAME, "FLOAT_COLOR", "POINT")
    me.color_attributes.active_color = ca
    try:
        me.color_attributes.render_color_index = list(me.color_attributes).index(ca)
    except (AttributeError, ValueError):
        pass
    return ca


def read(obj) -> np.ndarray:
    ca = obj.data.color_attributes.get(AO_NAME)
    arr = np.zeros(len(obj.data.vertices) * 4, np.float32)
    ca.data.foreach_get("color", arr)
    return arr.reshape(-1, 4)


def stats(obj) -> dict:
    a = read(obj)[:, 0]
    return dict(min=round(float(a.min()), 4), mean=round(float(a.mean()), 4), max=round(float(a.max()), 4))


def bake(obj, samples: int = 64) -> dict:
    """Bake AO into the `AO` point colour attribute of a mesh object (Cycles, GPU when present)."""
    _attribute(obj.data)
    wu.setup_cycles(bpy.context.scene, samples=samples, denoise=False)
    wu.select_only(obj)
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    return dict(baked=True, samples=samples, **stats(obj))


def neutral(obj) -> dict:
    """Neutral white AO for a mesh that is not baked (still ships COLOR_0)."""
    ca = _attribute(obj.data)
    ca.data.foreach_set("color", np.ones(len(obj.data.vertices) * 4, np.float32))
    return dict(baked=False, min=1.0, mean=1.0, max=1.0)
