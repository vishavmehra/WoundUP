"""Shared Blender asset framework for Wound Up (docs/BLENDER_PRODUCTION_GUIDELINES.md).

Run only inside Blender, through blender/scripts/forge.py. Modules:

    manifest        read-only access to assets/manifest/glb-manifest.json
    materials       constants-only Mat_* proxy materials (the shared library, ADR-032)
    uvmetric        box-projected UVs, 1 UV unit = 0.1 m
    vertex_ao       baked per-vertex ambient occlusion -> COLOR_0
    empties         COL_ / PIV_ / SOCKET_ helper empties with userData.wu
    export_profile  the fixed GLB export profiles (GLB_EXPORT_AND_VALIDATION section 2)
    qa_gate         the in-Blender QA gate (before export) and the GLB check (after export)
    contact_sheet   one size-aware review sheet, rendered from the re-imported GLBs

Every module imports wu_common for the helpers that already worked there; wu_common itself is unchanged.
"""
