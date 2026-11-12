"""gen_ratchet.py - forge family `ratchet`: ratchet_wheel. The geometry lives in gen_mech_extras.py (shared Mechanical-library toolkit).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py --          --family ratchet --only ratchet_wheel --out-root <dir>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gen_mech_extras import build  # noqa: F401  (forge calls build(entry, PARAMS[id]))

FAMILY = "ratchet"
PARAMS = {"ratchet_wheel": {}}

if __name__ == "__main__":
    raise SystemExit("gen_ratchet.py is a forge family. Run blender/scripts/forge.py --family ratchet --only ratchet_wheel --out-root <dir>")
