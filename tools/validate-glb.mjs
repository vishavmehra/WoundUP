#!/usr/bin/env node
// Wound Up GLB validator (ADR-037, docs/GLB_EXPORT_AND_VALIDATION.md section 5). No dependency beyond Node and the repo's three.js.
//
//   node tools/validate-glb.mjs                       every manifest entry whose glbPath exists (a legacy M0 file when glbPath does not)
//   node tools/validate-glb.mjs --only id[,id...]     just these entries
//   node tools/validate-glb.mjs --file <path> --id x  any GLB against the manifest entry x
//   --summary        one line per asset and the counts, no finding detail
//   --json           machine-readable output
//   --report-only    always exit 0 (reporting, not gating)
//   --color0-warn    report a missing COLOR_0 (V29) as WARN instead of FAIL
//   --manifest <p>   manifest path (default assets/manifest/glb-manifest.json)
//   --root <dir>     repository root (default: this script's parent); glbPath and the orphan scan resolve under it
//
// Exit code 1 on any FAIL. It prints results and never edits the manifest or sets VALIDATED; the lead records the evidence.
// Legacy M0 files are validated too. They fail the new rules (status REWORK_REQUIRED): that is reported, not hidden.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS, crossChecks, validateGlb } from './lib/glb-validate.mjs';

const argv = process.argv.slice(2);
const BOOL = ['--summary', '--json', '--report-only', '--color0-warn'], VAL = ['--only', '--file', '--id', '--manifest', '--root'];
const usage = (msg) => { console.error(`${msg}\nusage: node tools/validate-glb.mjs [--only id,id] [--file <path> --id <id>] [--summary] [--json] [--report-only] [--color0-warn] [--manifest <p>] [--root <dir>]`); process.exit(2); };
for (let i = 0; i < argv.length; i++) {
  if (VAL.includes(argv[i])) { if (argv[++i] === undefined) usage(`${argv[i - 1]} needs a value`); } else if (!BOOL.includes(argv[i])) usage(`unknown argument ${argv[i]}`);
}
const has = (f) => argv.includes(f);
const val = (f) => (has(f) ? argv[argv.indexOf(f) + 1] : undefined);

const ROOT = resolve(val('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const manifestPath = resolve(ROOT, val('--manifest') ?? 'assets/manifest/glb-manifest.json');
let manifest;
try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch (e) { console.error(`Cannot read manifest ${manifestPath}: ${e.message}`); process.exit(2); }
const entries = manifest.assets ?? [];
const byId = new Map(entries.map((a) => [a.id, a]));
const library = (manifest.meta?.materialLibrary ?? []).map((m) => (typeof m === 'string' ? m : m.name));
const rel = (p) => relative(ROOT, p).replaceAll('\\', '/');

// ---- what to validate ---------------------------------------------------------------------------------------
const targets = [], requestedMissing = [];
const selected = has('--file') || has('--only');
if (has('--file')) {
  const entry = byId.get(val('--id') ?? '');
  if (!entry) usage('--file needs --id <manifest id>');
  const abs = resolve(val('--file'));
  if (!existsSync(abs)) usage(`file not found: ${abs}`);
  targets.push({ entry, abs, legacy: !!entry.legacy && abs === resolve(ROOT, entry.legacy.glb) });
} else {
  const only = has('--only') ? val('--only').split(',').filter(Boolean) : null;
  for (const id of only ?? []) if (!byId.has(id)) usage(`--only: no manifest entry ${id}`);
  for (const entry of entries) {
    if (only && !only.includes(entry.id)) continue;
    const abs = resolve(ROOT, entry.glbPath), legacyAbs = entry.legacy ? resolve(ROOT, entry.legacy.glb) : null;
    if (existsSync(abs)) targets.push({ entry, abs, legacy: false });
    else if (legacyAbs && existsSync(legacyAbs)) targets.push({ entry, abs: legacyAbs, legacy: true });
    else if (only) requestedMissing.push(entry);
  }
}

// ---- run ----------------------------------------------------------------------------------------------------
const t0 = Date.now();
const results = [];
for (const t of targets) {
  const r = await validateGlb(readFileSync(t.abs), t.entry, { materialLibrary: library, legacy: t.legacy, file: rel(t.abs), color0Severity: has('--color0-warn') ? 'WARN' : 'FAIL' });
  const want = t.legacy ? t.entry.legacy.glbSha256 : t.entry.glbSha256;
  r.manifestHash = want ? (want === r.sha256 ? 'matches the manifest' : 'DIFFERS from the manifest (a recorded validation belongs to another file)') : 'no hash recorded in the manifest';
  r.expectedFail = r.verdict === 'FAIL' && (t.legacy || (!has('--file') && t.entry.status === 'REWORK_REQUIRED'));
  results.push(r);
}
const cross = crossChecks(results, manifest, { root: ROOT, manifestWide: !selected });
const missingFindings = requestedMissing.map((e) => ({ level: 'FAIL', id: 'X04', msg: `${e.id} was requested but no GLB exists at ${e.glbPath} (status ${e.status})` }));
const allCross = [...missingFindings, ...cross.findings];

const count = (v) => results.filter((r) => r.verdict === v).length;
const counts = {
  manifestEntries: entries.length,
  validated: results.length,
  legacyFiles: results.filter((r) => r.label === 'legacy M0 file').length,
  PASS: count('PASS'), WARN: count('WARN'), FAIL: count('FAIL'),
  expectedFail: results.filter((r) => r.expectedFail).length,
  crossFAIL: allCross.filter((f) => f.level === 'FAIL').length, crossWARN: allCross.filter((f) => f.level === 'WARN').length,
  uniqueGeometryByLabel: cross.uniqueGeometryByLabel,
  assetIdReferences: cross.assetIdReferences,
  entriesWithGlbOnDisk: entries.filter((a) => existsSync(resolve(ROOT, a.glbPath)) || (a.legacy && existsSync(resolve(ROOT, a.legacy.glb)))).length,
};
const failing = counts.FAIL + counts.crossFAIL > 0;

if (has('--json')) {
  console.log(JSON.stringify({ root: ROOT, manifest: rel(manifestPath), limits: LIMITS, results, cross: allCross, counts }, null, 2));
  process.exit(failing && !has('--report-only') ? 1 : 0);
}

// ---- print --------------------------------------------------------------------------------------------------
const n = (v) => Number(v).toLocaleString('en-US');
console.log(`Wound Up GLB validator   root ${ROOT.replaceAll('\\', '/')}   manifest ${rel(manifestPath)} (${entries.length} entries, ${library.length} library materials)`);
console.log(`Tolerances: size ${LIMITS.dimRelTol * 100} % or ${LIMITS.dimAbsTolM * 1000} mm (V21), origin ${LIMITS.originTolM * 1000} mm (V22), grab collider >= ${LIMITS.minGrabRadiusM * 1000} mm (V61), loader box ${LIMITS.loaderBoxTolM * 1000} mm (V70), budgets.glbKB is KiB (x${LIMITS.kib})`);
if (selected) console.log('Selection run: manifest-wide checks (X04 orphans, X05, X07) are skipped; a full run does them.');
console.log('');

for (const r of results) {
  const m = r.metrics;
  const tag = r.verdict === 'FAIL' ? 'FAIL' : r.verdict;
  if (has('--summary')) {
    console.log(`${tag.padEnd(5)} ${r.id.padEnd(28)} ${r.label.padEnd(15)} ${r.findings.filter((f) => f.level === 'FAIL').length} FAIL, ${r.findings.filter((f) => f.level === 'WARN').length} WARN   ${r.file}${r.expectedFail ? '   (expected: ' + (r.label === 'legacy M0 file' ? 'legacy M0 file, ' : '') + 'status ' + r.status + ')' : ''}`);
    if (r === results.at(-1)) console.log('');
    continue;
  }
  console.log(`== ${r.id}   [${r.label}]   ${r.file}`);
  console.log(`   sha256 ${r.sha256}   ${n(r.bytes)} bytes (${(r.bytes / 1048576).toFixed(2)} MiB)   ${r.manifestHash}   manifest status ${r.status}`);
  if (m.triangles !== undefined) console.log(`   triangles ${n(m.triangles)}  primitives ${m.primitives}  materials ${m.materials ?? 0}  images ${m.images ?? 0} (${(m.textureMiB ?? 0).toFixed(2)} MiB)  nodes ${m.nodes}  generator ${m.generator ?? 'unknown'}${m.bboxM ? `  size ${m.bboxM.size.map((v) => v.toFixed(4)).join(' x ')} m` : ''}`);
  for (const f of r.findings) console.log(`   ${f.level.padEnd(4)} ${f.id}  ${f.msg}`);
  for (const s of r.skipped) console.log(`   SKIP ${s.id}  ${s.why}`);
  if (r.passed.length) console.log(`   PASS ${r.passed.join(' ')}`);
  const nf = r.findings.filter((f) => f.level === 'FAIL').length, nw = r.findings.filter((f) => f.level === 'WARN').length;
  console.log(`   => ${r.verdict}  (${nf} FAIL, ${nw} WARN)${r.expectedFail ? `  expected: ${r.label === 'legacy M0 file' ? 'legacy M0 file, ' : ''}status ${r.status} (reported, not hidden)` : ''}\n`);
}

if (allCross.length) {
  console.log('== Cross-manifest');
  for (const f of allCross) console.log(`   ${f.level.padEnd(4)} ${f.id}  ${f.msg}`);
  console.log('');
}
if (counts.assetIdReferences === 0) console.log('NOTE X04  no `assetId` reference found under src/ (no PartDefinition data exists yet), so visual.assetId was not checked.\n');

console.log('== Summary');
const line = (k, v) => console.log(`   ${k.padEnd(44)}${String(v).padStart(5)}`);
line('manifest entries', counts.manifestEntries);
line('entries with a GLB on disk', counts.entriesWithGlbOnDisk);
line('GLBs validated this run', counts.validated);
line('  of which legacy M0 files', counts.legacyFiles);
line('PASS', counts.PASS);
line('WARN', counts.WARN);
line('FAIL', counts.FAIL);
line('  of which expected (REWORK_REQUIRED / legacy)', counts.expectedFail);
line('cross-manifest FAIL', counts.crossFAIL);
line('cross-manifest WARN', counts.crossWARN);
for (const [label, c] of Object.entries(counts.uniqueGeometryByLabel)) line(`unique geometry (X06), ${label}`, c);
console.log(`\n${failing ? 'RESULT: FAIL' : counts.WARN || counts.crossWARN ? 'RESULT: PASS with WARN lines to read and answer' : 'RESULT: PASS'}   (${((Date.now() - t0) / 1000).toFixed(2)} s)`);
if (failing && has('--report-only')) console.log('--report-only: exit code 0 although there are FAIL lines.');
process.exit(failing && !has('--report-only') ? 1 : 0);
