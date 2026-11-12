"""empties.py - collider, pivot and socket helper empties (BLENDER_PRODUCTION_GUIDELINES section 9).

Every helper is an Empty parented to the part root, with a custom property `wu` that three.js reads as userData.wu.
Callers think in glTF space (Y up, +Z towards the viewer); this module converts to Blender space, so a gear built with its
axis along local glTF +Z gets a collider at the right place without anyone doing the swizzle by hand:

    position   Blender (x, y, z) = glTF (x, -z, y)           (the exporter writes (x, z, -y))
    scale      Blender (sx, sy, sz) = glTF (sx, sz, sy)      (swizzled like position, never negated; measured, audit E 3)
    rotation   the glTF local +Z axis of a node is the Blender local -Y axis (see _aim)

`empty_display_size` is not exported, so a collider's size lives in the empty's scale (display size 1). Pivots and sockets keep
scale 1 (their display size is for the Blender viewport only).
"""
from __future__ import annotations

import bpy
from mathutils import Vector

import wu_common as wu

MIN_GRAB_RADIUS_M = 0.012           # INTERACTION_SPEC 7.2; validator V61


def _empty(name: str, display: str, parent, loc_g, scale_g, wu_dict: dict, display_size: float = 1.0):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.empty_display_type = display
    e.empty_display_size = display_size
    e.parent = parent                                             # parent is applied (identity), so parent inverse stays identity
    e.location = wu.g2b(loc_g)
    e.scale = (scale_g[0], scale_g[2], scale_g[1])
    e["wu"] = wu_dict
    return e


def _aim(e, axis_g):
    """Rotate empty `e` so its glTF-local +Z points along `axis_g` (glTF space). Local +Z in glTF = local -Y in Blender."""
    e.rotation_mode = "QUATERNION"
    e.rotation_quaternion = Vector((0.0, -1.0, 0.0)).rotation_difference(wu.g2b(Vector(axis_g).normalized()))


def add_collider(parent, purpose: str, shape: str, size, loc_g=(0.0, 0.0, 0.0)):
    """COL_<Purpose>. shape 'sphere': size = radius (m). shape 'box': size = half extents (hx, hy, hz) in glTF axes (m)."""
    if shape == "sphere":
        r = float(size)
        d = dict(type="collider", shape="sphere", purpose=purpose.lower(), radius=r)
        return _empty(f"COL_{purpose}", "SPHERE", parent, loc_g, (r, r, r), d)
    if shape == "box":
        h = tuple(float(x) for x in size)
        d = dict(type="collider", shape="box", purpose=purpose.lower(), halfExtents=list(h))
        return _empty(f"COL_{purpose}", "CUBE", parent, loc_g, h, d)
    raise ValueError(f"collider shape must be 'sphere' or 'box', got '{shape}'")


def add_pivot(parent, name: str, loc_g=(0.0, 0.0, 0.0), axis_g=(0.0, 0.0, 1.0), kind: str = "rotation_axis", axis_label: str = "+Z"):
    """PIV_<Name>: a secondary pivot (hinge, rotation axis). The mesh origin stays the main pivot."""
    e = _empty(f"PIV_{name}", "SINGLE_ARROW", parent, loc_g, (1.0, 1.0, 1.0), dict(type="pivot", kind=kind, axis=axis_label), 0.02)
    _aim(e, axis_g)
    return e


def add_socket(parent, name: str, loc_g, accepts: list[str], axis_g=(0.0, 0.0, 1.0), **extra):
    """SOCKET_<Name>: placed by location; its +Z is the mating axis. `accepts` lists asset ids or families."""
    e = _empty(f"SOCKET_{name}", "ARROWS", parent, loc_g, (1.0, 1.0, 1.0), dict(type="socket", accepts=list(accepts), **extra), 0.004)
    _aim(e, axis_g)
    return e
