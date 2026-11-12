"""manifest.py - READ-ONLY access to assets/manifest/glb-manifest.json (the lead owns that file; nothing here writes it).

The manifest has no field for generator parameters, sockets or colliders yet (BLENDER_PRODUCTION_GUIDELINES 4.4), so a
generator keeps its parameter table in its own script, keyed by asset id.
"""
from __future__ import annotations

import json
from pathlib import Path

import wu_common as wu

MANIFEST_PATH = wu.REPO_ROOT / "assets" / "manifest" / "glb-manifest.json"
PROTECTED_STATUS = ("VALIDATED", "INTEGRATED")            # R3: not overwritten without --rework
TRUSTED_DIMENSION_BASIS = ("spec", "measured", "derived")  # V21 checks only these (GLB_EXPORT_AND_VALIDATION 5.4)


def load(path: Path | str | None = None) -> dict:
    return json.loads(Path(path or MANIFEST_PATH).read_text(encoding="utf-8"))


def find(manifest: dict, asset_id: str) -> dict:
    for e in manifest["assets"]:
        if e["id"] == asset_id:
            return e
    raise KeyError(f"asset id '{asset_id}' is not in the manifest")


def material_library(manifest: dict) -> list[str]:
    return [m["name"] for m in manifest["meta"]["materialLibrary"]]


def family_folder(entry: dict) -> str:
    """Family = the folder that holds the GLB (public/assets/models/shared/<family>/<id>.glb)."""
    return Path(entry["glbPath"]).parent.name


def is_protected(entry: dict) -> bool:
    return entry.get("status") in PROTECTED_STATUS
