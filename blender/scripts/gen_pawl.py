"""gen_pawl.py - forge family `pawl`: pawl_standard. The geometry lives in gen_mech_extras.py (shared Mechanical-library toolkit).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py --          --family pawl --only pawl_standard --out-root <dir>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gen_mech_extras import build  # noqa: F401  (forge calls build(entry, PARAMS[id]))

FAMILY = "pawl"
PARAMS = {"pawl_standard": {}}

if __name__ == "__main__":
    raise SystemExit("gen_pawl.py is a forge family. Run blender/scripts/forge.py --family pawl --only pawl_standard --out-root <dir>")
