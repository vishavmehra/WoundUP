"""gen_worm_gear.py - forge family `worm_gear`: worm_gear. The geometry lives in gen_mech_extras.py (shared Mechanical-library toolkit).

    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py --          --family worm_gear --only worm_gear --out-root <dir>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gen_mech_extras import build  # noqa: F401  (forge calls build(entry, PARAMS[id]))

FAMILY = "worm_gear"
PARAMS = {"worm_gear": {}}

if __name__ == "__main__":
    raise SystemExit("gen_worm_gear.py is a forge family. Run blender/scripts/forge.py --family worm_gear --only worm_gear --out-root <dir>")
