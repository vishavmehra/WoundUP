"""fitlib.py - read GLBs as numpy meshes in glTF space (no Blender importer), place them by a socket, and test overlaps with mathutils BVH."""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve()
for p in ROOT.parents:
    if (p / "blender" / "scripts" / "wu_common.py").exists():
        ROOT = p
        break


def read_glb(path):
    b = Path(path).read_bytes()
    jl = struct.unpack_from("<I", b, 12)[0]
    js = json.loads(b[20:20 + jl].decode())
    off = 20 + jl
    bl = struct.unpack_from("<I", b, off)[0]
    return js, b[off + 8: off + 8 + bl]


CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def accessor(js, binb, i):
    a = js["accessors"][i]
    bv = js["bufferViews"][a["bufferView"]]
    dt = CT[a["componentType"]]
    n = NC[a["type"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride")
    cnt = a["count"]
    if stride and stride != n * np.dtype(dt).itemsize:
        arr = np.frombuffer(binb, dtype=np.uint8, count=stride * cnt, offset=off).reshape(cnt, stride)[:, : n * np.dtype(dt).itemsize].copy().view(dt)
    else:
        arr = np.frombuffer(binb, dtype=dt, count=cnt * n, offset=off)
    return arr.reshape(cnt, n) if n > 1 else arr.reshape(cnt)


def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def local(n):
    M = np.eye(4)
    M[:3, :3] = qmat(n.get("rotation", [0, 0, 0, 1])) * np.array(n.get("scale", [1, 1, 1]))[None, :]
    M[:3, 3] = n.get("translation", [0, 0, 0])
    return M


class Glb:
    """meshes: {node name: (V (N,3), T (M,3), material names per tri)} in the GLB's own root frame; helpers: {name: dict(M, wu)}."""

    def __init__(self, path):
        self.path = Path(path)
        js, binb = read_glb(path)
        self.js = js
        nodes = js["nodes"]
        parent = {}
        for i, n in enumerate(nodes):
            for c in n.get("children", []):
                parent[c] = i

        def world(i):
            M = local(nodes[i])
            while i in parent:
                i = parent[i]
                M = local(nodes[i]) @ M
            return M

        self.meshes = {}
        self.helpers = {}
        self.root = js["scenes"][0]["nodes"][0]
        for i, n in enumerate(nodes):
            W = world(i)
            if "mesh" in n:
                Vs, Ts, Ms = [], [], []
                base = 0
                for p in js["meshes"][n["mesh"]]["primitives"]:
                    V = accessor(js, binb, p["attributes"]["POSITION"]).astype(np.float64)
                    T = accessor(js, binb, p["indices"]).astype(np.int64).reshape(-1, 3)
                    V = V @ W[:3, :3].T + W[:3, 3]
                    Vs.append(V)
                    Ts.append(T + base)
                    Ms += [js["materials"][p["material"]]["name"]] * len(T)
                    base += len(V)
                self.meshes[n["name"]] = (np.vstack(Vs), np.vstack(Ts), Ms)
            elif n.get("name", "")[:4] in ("COL_", "PIV_") or n.get("name", "").startswith("SOCKET_"):
                self.helpers[n["name"]] = dict(M=W, wu=n.get("extras", {}).get("wu", {}), scale=n.get("scale"))

    def all(self, M=None):
        V = np.vstack([m[0] for m in self.meshes.values()])
        off, T = 0, []
        for v, t, _ in self.meshes.values():
            T.append(t + off)
            off += len(v)
        T = np.vstack(T)
        if M is not None:
            V = V @ M[:3, :3].T + M[:3, 3]
        return V, T


def place(pos, quat=(0, 0, 0, 1)):
    M = np.eye(4)
    M[:3, :3] = qmat(quat)
    M[:3, 3] = pos
    return M


def bvh(V, T):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    return BVHTree.FromPolygons([Vector(v) for v in V.tolist()], [tuple(t) for t in T.tolist()], epsilon=0.0)
