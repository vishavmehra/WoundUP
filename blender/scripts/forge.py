"""forge.py - the family runner (docs/BLENDER_PRODUCTION_GUIDELINES.md section 4.3).

    B="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
    "$B" --background --factory-startup --python-exit-code 1 --python blender/scripts/forge.py -- \\
         --family <folder> --only <id>[,<id>...] --out-root <dir> [--draft | --final | --no-sheet] [--rework] \\
         [--owner NAME] [--save-blend] [--ao-samples N] [--sheet-only] [--manifest FILE]

    --family     the family folder of the entries (public/assets/models/shared/<family>/), e.g. spur_gear
    --only       the manifest ids to build (R2: nothing else is touched). The generator is the script named by their
                 blenderSource; it holds PARAMS keyed by asset id (GUIDELINES 4.4) and build(entry, params).
    --out-root   REQUIRED (R1, no default). Everything is written under it, mirroring the repository: the GLB at
                 <out-root>/<glbPath>, the report and sheets at <out-root>/blender/previews/<family>/ (R5), a .blend at
                 <out-root>/blender/source/<family>/. Use the repository root to write the real paths, or a scratch folder.
    --rework     allow overwriting a GLB whose manifest status is VALIDATED or INTEGRATED (R3); the hash changes, so the
                 lead must drop the entry back to EXPORTED.
    --draft      review sheet in EEVEE, 1280x960, 16 samples (default).   --final  Cycles, 1920x1080, 64 samples.
    --owner      refuse entries whose manifest owner differs (R2).
    --sheet-only re-render the sheet (draft or final) from the GLBs already written, with no rebuild; refuses when a GLB no longer
                 matches its report record. A rebuild changes the GLB hash (EXACT boolean vertex order, GPU AO noise; sizes and
                 triangle counts stay equal), so use this to put the draft and the final sheet on the same build.

Per entry: build -> bake vertex AO into COLOR_0 -> in-Blender QA gate -> export profile L to a staging file -> post-export
GLB check -> copy to <out-root>/<glbPath> (only when both gates pass). Then <family>.report.json and one contact sheet
rendered from the re-imported GLBs. Exit code 1 when any entry fails. The manifest is only read, never written.
"""
from __future__ import annotations

import sys

sys.dont_write_bytecode = True                                    # R4: importing shared modules must not write __pycache__

import argparse
import datetime
import hashlib
import importlib.util
import json
import shutil
import tempfile
import time
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import bpy

import wu_common as wu
from lib import contact_sheet, export_profile, materials, qa_gate, vertex_ao
from lib import manifest as mf


def parse(argv):
    ap = argparse.ArgumentParser(prog="forge.py", description=__doc__.split("\n")[0])
    ap.add_argument("--family", required=True)
    ap.add_argument("--only", required=True, help="comma-separated manifest ids")
    ap.add_argument("--out-root", required=True, help="explicit output root (no default, R1)")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--draft", action="store_true")
    g.add_argument("--final", action="store_true")
    g.add_argument("--no-sheet", action="store_true")
    ap.add_argument("--rework", action="store_true")
    ap.add_argument("--sheet-only", action="store_true", help="re-render the sheet from the GLBs already under --out-root; no rebuild")
    ap.add_argument("--owner")
    ap.add_argument("--save-blend", action="store_true")
    ap.add_argument("--ao-samples", type=int, default=64)
    ap.add_argument("--manifest", default=str(mf.MANIFEST_PATH))
    return ap.parse_args(argv)


def load_generator(entries, family):
    srcs = {e["blenderSource"] for e in entries}
    if len(srcs) != 1:
        raise SystemExit(f"R2: the requested ids use {len(srcs)} generators {sorted(srcs)}; one family per run")
    path = wu.REPO_ROOT / srcs.pop()
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[path.stem] = mod                                  # dataclasses look their module up here
    spec.loader.exec_module(mod)
    if getattr(mod, "FAMILY", None) != family:
        raise SystemExit(f"{path.name} declares FAMILY={getattr(mod, 'FAMILY', None)!r}, not '{family}'")
    return path, mod


def inside(root: Path, p: Path) -> bool:
    try:
        p.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def build_one(gen, entry, manifest, out_root: Path, a) -> dict:
    t0 = time.time()
    rec = dict(id=entry["id"], exported=False)
    target = out_root / entry["glbPath"]
    if not inside(out_root, target):
        raise SystemExit(f"R1: {entry['glbPath']} escapes the output root")
    if mf.is_protected(entry) and target.exists() and not a.rework:
        rec["refused"] = f"R3: manifest status {entry['status']} and {target} exists; pass --rework"
        return rec
    wu.reset_scene()
    objs, hints = gen.build(entry, gen.PARAMS[entry["id"]])
    meshes = [o for o in objs if o.type == "MESH"]
    rec["ao"] = {o.name: (vertex_ao.bake(o, a.ao_samples) if hints.get("bake_ao", True) else vertex_ao.neutral(o)) for o in meshes}
    gate = qa_gate.check_scene(objs, entry, manifest, hints)
    rec.update(gate=gate.as_dict(), buildSeconds=round(time.time() - t0, 1))
    if not gate.ok:
        return rec
    if a.save_blend:
        blend = out_root / "blender" / "source" / a.family / f"{entry['id']}.blend"
        blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True, copy=True)
        rec["blend"] = str(blend.relative_to(out_root))
    stage = Path(tempfile.mkdtemp(prefix="forge_")) / f"{entry['id']}.glb"
    ex = export_profile.export(objs, stage, "L")
    post = qa_gate.check_glb(stage, entry, manifest)
    rec["post"] = post.as_dict()
    if ex["skippedProperties"]:
        rec["skippedExportProperties"] = ex["skippedProperties"]
    if post.ok:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(stage, target)
        sha = hashlib.sha256(target.read_bytes()).hexdigest()
        assert sha == ex["sha256"], "staged and copied GLB differ"
        rec.update(exported=True, glb=entry["glbPath"], bytes=ex["bytes"], sha256=sha, profile="L")
    shutil.rmtree(stage.parent, ignore_errors=True)
    rec["seconds"] = round(time.time() - t0, 1)
    return rec


def main(argv):
    t0 = time.time()
    a = parse(argv)
    out_root = Path(a.out_root).resolve()
    manifest = mf.load(a.manifest)
    ids = [i.strip() for i in a.only.split(",") if i.strip()]
    try:
        entries = [mf.find(manifest, i) for i in ids]
    except KeyError as e:
        raise SystemExit(f"R2: {e.args[0]}")
    for e in entries:
        if mf.family_folder(e) != a.family:
            raise SystemExit(f"R2: {e['id']} lives in family '{mf.family_folder(e)}', not '{a.family}'")
        if a.owner and e.get("owner") != a.owner:
            raise SystemExit(f"R2: {e['id']} is owned by '{e.get('owner')}', not '{a.owner}'")
    gen_path, gen = load_generator(entries, a.family)
    missing = [i for i in ids if i not in gen.PARAMS]
    if missing:
        raise SystemExit(f"{gen_path.name} has no PARAMS for {missing} (GUIDELINES 4.4: parameters live in the generator, keyed by id)")
    no_constants = materials.missing_constants(mf.material_library(manifest))
    wu.log(f"forge: family={a.family} ids={ids} out-root={out_root} blender={bpy.app.version_string}")
    if no_constants:
        wu.log("WARNING material library names without proxy constants:", no_constants)

    prev = out_root / "blender" / "previews" / a.family          # R5: previews never go under public/
    rpath = prev / f"{a.family}.report.json"
    old = json.loads(rpath.read_text(encoding="utf-8")) if rpath.exists() else None
    old_by_id = {r["id"]: r for r in (old or {}).get("entries", [])}
    if a.sheet_only:                                              # re-render the sheet from the GLBs already written, no rebuild
        recs = []
        for e in entries:
            r = old_by_id.get(e["id"])
            f = out_root / e["glbPath"]
            if not (r and r.get("exported") and f.exists() and hashlib.sha256(f.read_bytes()).hexdigest() == r["sha256"]):
                raise SystemExit(f"--sheet-only: {e['id']} has no exported record matching the GLB on disk; run without --sheet-only")
            recs.append(r)
        sheets = dict(old.get("sheets", {}))
    else:
        recs = [build_one(gen, e, manifest, out_root, a) for e in entries]
        voided = {k: v for k, v in (old or {}).get("sheets", {}).items() if set(ids) & set(v.get("ids", ids))}
        for v in voided.values():                                 # a rebuild voids the sheets of the build it replaces
            if inside(prev, Path(v["path"])):
                Path(v["path"]).unlink(missing_ok=True)
        sheets = {k: v for k, v in (old or {}).get("sheets", {}).items() if k not in voided}
    done = [r for r in recs if r["exported"]]
    if done and not a.no_sheet:
        grade = "final" if a.final else "draft"
        items = []
        for r in done:
            s = r["post"]["info"]["sizeMm"]
            items.append(dict(id=r["id"], path=out_root / r["glb"],
                              caption=f"{r['post']['info']['tris']:,} tris  {r['bytes'] / 1000:.0f} KB\n{s[0]:.1f} x {s[1]:.1f} x {s[2]:.1f} mm"))
        sheets[grade] = dict(contact_sheet.render(items, prev / f"{a.family}_sheet_{grade}.png", grade), ids=[r["id"] for r in done])
    report = dict(
        schema=1, family=a.family, generator=str(gen_path.relative_to(wu.REPO_ROOT)).replace("\\", "/"), blender=bpy.app.version_string,
        date=datetime.datetime.now().astimezone().isoformat(timespec="seconds"), outRoot=str(out_root), manifest=str(Path(a.manifest)),
        rework=a.rework, libraryJsonSha256=(hashlib.sha256(materials.LIBRARY_JSON.read_bytes()).hexdigest() if materials.LIBRARY_JSON.exists() else None),
        materialConstantsSource={n: materials.constants(n)["_source"] for n in mf.material_library(manifest) if n not in no_constants},
        entries=[r for r in old_by_id.values() if r["id"] not in ids] + recs, sheets=sheets, seconds=round(time.time() - t0, 1))
    if a.sheet_only:                                              # the build facts stay those of the run that wrote the GLBs
        report.update({k: old[k] for k in ("blender", "date", "rework", "libraryJsonSha256", "materialConstantsSource")})
        report["sheetsDate"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
        report["seconds"] = old["seconds"]
    prev.mkdir(parents=True, exist_ok=True)
    rpath.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    for r in recs:
        state = "EXPORTED" if r["exported"] else ("REFUSED" if "refused" in r else "FAILED")
        g = r.get("gate", {})
        wu.log(f"forge: {r['id']}: {state}", r.get("refused", ""), *g.get("fails", []), *r.get("post", {}).get("fails", []))
    wu.log(f"forge: report {rpath}  total {report['seconds']} s")
    if not all(r["exported"] for r in recs):
        sys.exit(1)


if __name__ == "__main__":
    try:
        main(wu.script_args())
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        sys.exit(1)
