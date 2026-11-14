"""gen_coupling.py - forge family `coupling`: coupling_rigid. The geometry lives in gen_mech_extras.py (shared Mechanical-library toolkit).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py --          --family coupling --only coupling_rigid --out-root <dir>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gen_mech_extras import build  # noqa: F401  (forge calls build(entry, PARAMS[id]))

FAMILY = "coupling"
PARAMS = {"coupling_rigid": {}}

if __name__ == "__main__":
    raise SystemExit("gen_coupling.py is a forge family. Run blender/scripts/forge.py --family coupling --only coupling_rigid --out-root <dir>")
