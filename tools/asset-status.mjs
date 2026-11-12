#!/usr/bin/env node
// Wound Up asset status.
// Reads assets/manifest/glb-manifest.json, checks it against the schema's required fields and enums and against the
// files on disk, and prints the progress summary of directive Part 8. No dependencies; Node 20 or newer.
//
//   node tools/asset-status.mjs               summary, counts, disagreements
//   node tools/asset-status.mjs --list        also one line per entry
//   node tools/asset-status.mjs --json        machine-readable summary
//   node tools/asset-status.mjs --report-only exit 0 even when something disagrees
//   node tools/asset-status.mjs --manifest <path>
//
// This is not the GLB validator (ADR-037). It never sets VALIDATED; it only reports whether the manifest and the
// file system agree with the status written in the manifest.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const val = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
const manifestPath = resolve(ROOT, val('--manifest') ?? 'assets/manifest/glb-manifest.json');
const schemaPath = join(dirname(manifestPath), 'glb-manifest.schema.json');

const errors = []; // manifest or file-state disagreements: fail the run
const notes = [];
const onDisk = (p) => existsSync(join(ROOT, p));

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error(`Cannot read manifest ${manifestPath}: ${e.message}`);
  process.exit(2);
}
const assets = manifest.assets ?? [];
const schema = existsSync(schemaPath) ? JSON.parse(readFileSync(schemaPath, 'utf8')) : null;
if (!schema) notes.push(`Schema not found at ${schemaPath}; required-field and enum checks skipped.`);

const STATUS = ['NOT_STARTED', 'BLOCKED', 'IN_PROGRESS', 'SOURCE_READY', 'EXPORTED', 'VALIDATING', 'VALIDATED', 'INTEGRATED', 'REWORK_REQUIRED'];
const FAMILIES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const LABELS = manifest.meta?.classificationLabels ?? [];
const G0 = (a) => a.classification === 'G0-required' || a.classification === 'G0-optional';
const SCOPE_CLASSES = ['shared', 'world-specific', 'reused', 'future-planned']; // directive, world-by-world strategy, Production discipline
const scopeClassOf = (a) => (!G0(a) ? 'future-planned' : a.worldId === 'shared' ? 'shared' : a.reuseEligible ? 'reused' : 'world-specific');

// ---- structure: required fields, enums, unknown keys (read from the schema, one level of $ref)
if (schema) {
  const def = schema.definitions.asset;
  const enumOf = (p) => p?.enum ?? (p?.$ref ? schema.definitions[p.$ref.split('/').pop()]?.enum : undefined);
  for (const a of assets) {
    const who = a.id ?? '(no id)';
    for (const k of def.required) if (!(k in a)) errors.push(`${who}: missing field ${k}`);
    for (const k of Object.keys(a)) if (!(k in def.properties)) errors.push(`${who}: unknown field ${k}`);
    for (const [k, p] of Object.entries(def.properties)) {
      const e = enumOf(p);
      if (e && k in a && !e.includes(a[k])) errors.push(`${who}: ${k} = ${JSON.stringify(a[k])} is not one of ${e.join(', ')}`);
    }
  }
}

// ---- manifest rules
const byId = new Map();
const paths = new Map();
const libNames = new Set((manifest.meta?.materialLibrary ?? []).map((m) => m.name));
const refsDir = join(ROOT, 'References');
const refsPresent = existsSync(refsDir);
for (const a of assets) {
  if (byId.has(a.id)) errors.push(`${a.id}: duplicate id`);
  byId.set(a.id, a);
  if (paths.has(a.glbPath)) errors.push(`${a.id}: glbPath also used by ${paths.get(a.glbPath)}`);
  paths.set(a.glbPath, a.id);
  if (a.filename !== `${a.id}.glb`) errors.push(`${a.id}: filename ${a.filename} is not <id>.glb`);
  if (basename(a.glbPath) !== a.filename) errors.push(`${a.id}: glbPath file name differs from filename`);
  if (G0(a) ? !a.glbPath.startsWith('public/assets/models/') : !a.glbPath.startsWith('assets/future/')) {
    errors.push(`${a.id}: ${a.classification} must not use ${a.glbPath} (G0 under public/assets/models, everything else under assets/future; ADR-033)`);
  }
  if (G0(a) && !['shared', 'tockton'].includes(a.worldId)) errors.push(`${a.id}: G0 asset with world ${a.worldId}`);
  if (a.scopeClass !== scopeClassOf(a)) errors.push(`${a.id}: scopeClass ${a.scopeClass} disagrees with classification ${a.classification}, worldId ${a.worldId} and reuseEligible ${a.reuseEligible} (expected ${scopeClassOf(a)})`);
  if ((a.worldId === 'shared') !== (a.sharedOrWorldSpecific === 'shared')) errors.push(`${a.id}: sharedOrWorldSpecific ${a.sharedOrWorldSpecific} disagrees with worldId ${a.worldId}`);
  if (a.boardExists !== (a.references?.length > 0)) errors.push(`${a.id}: boardExists disagrees with references`);
  if (a.specExists && !a.specifications?.length) errors.push(`${a.id}: specExists is true but specifications is empty`);
  if (a.status === 'BLOCKED' && !a.blockedBy?.length) errors.push(`${a.id}: BLOCKED without blockedBy`);
  if ((a.materials ?? []).length > (a.budgets?.materials ?? 99)) errors.push(`${a.id}: more materials than the budget allows`);
  for (const m of a.materials ?? []) if (libNames.size && !libNames.has(m)) errors.push(`${a.id}: material ${m} is not in meta.materialLibrary`);
  if (refsPresent) for (const r of a.references ?? []) if (!existsSync(join(refsDir, r))) errors.push(`${a.id}: reference board not found in References/: ${r}`);
}
const removed = manifest.meta?.removedByOwnerDecision ?? []; // deleted by an owner decision (ADR-039): listed, never counted
for (const r of removed) {
  for (const k of ['id', 'displayName', 'formerClassification', 'formerStatus', 'reason', 'decision', 'date']) if (!r[k]) errors.push(`removedByOwnerDecision ${r.id ?? '(no id)'}: missing ${k}`);
  if (byId.has(r.id)) errors.push(`${r.id}: listed in meta.removedByOwnerDecision but still an entry`);
}
if (refsPresent) for (const r of manifest.meta?.globalReferences ?? []) if (!existsSync(join(refsDir, r))) errors.push(`meta.globalReferences: board not found in References/: ${r}`);
if (!refsPresent) notes.push('References/ is not present (it is not in git): reference board names were not checked.');
for (const a of assets) for (const d of a.dependencies ?? []) if (!byId.has(d)) errors.push(`${a.id}: dependency ${d} is not an entry`);
{ // dependency cycles
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { errors.push(`dependency cycle: ${[...trail, id].join(' -> ')}`); return; }
    state.set(id, 1);
    for (const d of byId.get(id)?.dependencies ?? []) if (byId.has(d)) visit(d, [...trail, id]);
    state.set(id, 2);
  };
  for (const id of byId.keys()) visit(id, []);
}
for (const p of manifest.machineSlotPlans ?? []) {
  if (p.rows.length !== p.declaredSlots) errors.push(`slot plan ${p.machine}: ${p.rows.length} rows against ${p.declaredSlots} declared slots`);
  for (const r of p.rows) for (const m of r.mapsTo) if (!byId.has(m)) errors.push(`slot plan ${p.machine}: ${r.slot} maps to unknown ${m}`);
}

// ---- file state against status
const sha = (p) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const diverge = [];
const note = (a, msg) => diverge.push(`${a.id} [${a.status}]: ${msg}`);
let filesMatched = 0;
for (const a of assets) {
  const glb = onDisk(a.glbPath);
  const src = onDisk(a.blenderSource);
  const lg = a.legacy;
  const lgGlb = lg && onDisk(lg.glb);
  const lgBlend = lg && onDisk(lg.blend);
  if (glb || lgGlb) filesMatched++;
  switch (a.status) {
    case 'NOT_STARTED': case 'BLOCKED': case 'IN_PROGRESS':
      if (glb) note(a, `a GLB exists at ${a.glbPath}`);
      break;
    case 'SOURCE_READY':
      if (!src) note(a, `blenderSource ${a.blenderSource} is missing`);
      if (glb) note(a, `a GLB exists at ${a.glbPath}, so the status should be EXPORTED or later`);
      break;
    case 'EXPORTED': case 'VALIDATING': case 'VALIDATED': case 'INTEGRATED':
      if (!glb) note(a, `GLB ${a.glbPath} is missing`);
      if (!src) note(a, `blenderSource ${a.blenderSource} is missing`);
      if ((a.status === 'VALIDATED' || a.status === 'INTEGRATED') && glb) {
        if (!a.glbSha256) note(a, 'no glbSha256: validation is bound to the file hash (ADR-037)');
        else if (sha(a.glbPath) !== a.glbSha256) note(a, 'GLB hash differs from glbSha256, so validation no longer holds');
      }
      break;
    case 'REWORK_REQUIRED':
      if (lg) {
        if (!lgGlb) note(a, `legacy GLB ${lg.glb} is missing`);
        if (!lgBlend) note(a, `legacy source ${lg.blend} is missing`);
        else if (lgGlb && sha(lg.glb) !== lg.glbSha256) note(a, `legacy GLB ${lg.glb} changed since the manifest recorded it`);
      } else if (!glb) note(a, `GLB ${a.glbPath} is missing`);
      break;
  }
  if (a.validationStatus === 'PASS' && !['VALIDATED', 'INTEGRATED'].includes(a.status)) note(a, 'validationStatus is PASS but status is not VALIDATED or INTEGRATED');
  if (a.integrationStatus === 'INTEGRATED' && !['INTEGRATED', 'REWORK_REQUIRED'].includes(a.status)) note(a, 'integrationStatus is INTEGRATED but status says otherwise');
}
{ // GLBs on disk that no entry owns
  const known = new Set([...assets.map((a) => a.glbPath), ...assets.filter((a) => a.legacy).map((a) => a.legacy.glb), ...(manifest.thirdParty ?? []).map((t) => t.path)]);
  const walk = (dir) => {
    if (!existsSync(join(ROOT, dir))) return;
    for (const f of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${f}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (f.endsWith('.glb') || f.endsWith('.gltf')) { if (!known.has(rel)) diverge.push(`${rel}: on disk, not in the manifest (orphan)`); }
    }
  };
  walk('public/assets');
  walk('assets/future');
}
const thirdPresent = (manifest.thirdParty ?? []).filter((t) => onDisk(t.path)).length;
for (const t of manifest.thirdParty ?? []) if (!onDisk(t.path)) diverge.push(`third party ${t.id}: ${t.path} is missing`);

// ---- counts
const n = (f) => assets.filter(f).length;
const tally = (key) => {
  const m = new Map();
  for (const a of assets) m.set(key(a), (m.get(key(a)) ?? 0) + 1);
  return m;
};
const total = assets.length;
const summary = {
  total,
  removedByOwnerDecision: removed.length,
  existingValidated: n((a) => a.status === 'VALIDATED' || a.status === 'INTEGRATED'),
  inProduction: n((a) => a.status === 'IN_PROGRESS' || a.status === 'SOURCE_READY'),
  exportedAwaitingValidation: n((a) => a.status === 'EXPORTED' || a.status === 'VALIDATING'),
  reworkRequired: n((a) => a.status === 'REWORK_REQUIRED'),
  blocked: n((a) => a.status === 'BLOCKED'),
  notStarted: n((a) => a.status === 'NOT_STARTED'),
  integrated: n((a) => a.status === 'INTEGRATED'),
  legacyIntegrated: n((a) => a.integrationStatus === 'INTEGRATED' && a.status !== 'INTEGRATED'), // M0 legacy file loaded, regenerated file not yet at glbPath
  filesOnDisk: filesMatched,
  placeholders: n((a) => a.placeholder === true),
  thirdPartyPresent: thirdPresent,
  thirdPartyListed: (manifest.thirdParty ?? []).length,
};
const sumCheck = summary.existingValidated + summary.inProduction + summary.exportedAwaitingValidation + summary.reworkRequired + summary.blocked + summary.notStarted;
if (sumCheck !== total) errors.push(`status counts add up to ${sumCheck}, not ${total}`);
const order = (map, keys) => keys.filter((k) => map.has(k)).map((k) => [k, map.get(k)]).concat([...map].filter(([k]) => !keys.includes(k)));
const counts = {
  byLabel: order(tally((a) => a.classification), LABELS),
  byFamily: order(tally((a) => a.family), FAMILIES),
  byScopeClass: order(tally((a) => a.scopeClass), SCOPE_CLASSES), // unique deliverables only; the four add up to the total
  byWorld: [...tally((a) => a.worldId)],
  byOwner: [...tally((a) => a.owner)].sort(),
  byStatus: order(tally((a) => a.status), STATUS),
};
const scopeSum = counts.byScopeClass.filter(([k]) => SCOPE_CLASSES.includes(k)).reduce((s, [, v]) => s + v, 0);
if (scopeSum !== total) errors.push(`scope class counts add up to ${scopeSum}, not ${total}`);
const g0 = (label) => assets.filter((a) => a.classification === label);
const scope = {
  g0Required: { total: g0('G0-required').length, blocked: g0('G0-required').filter((a) => a.status === 'BLOCKED').length, existingFiles: g0('G0-required').filter((a) => onDisk(a.glbPath) || (a.legacy && onDisk(a.legacy.glb))).length },
  g0Optional: { total: g0('G0-optional').length, blocked: g0('G0-optional').filter((a) => a.status === 'BLOCKED').length },
  future: n((a) => !G0(a)),
};
const disagreements = [...diverge];

if (has('--json')) {
  console.log(JSON.stringify({ summary, scope, counts, errors, disagreements, notes }, null, 2));
} else {
  const line = (label, v) => console.log(`  ${label.padEnd(36)}${String(v).padStart(4)}`);
  console.log(`Manifest: ${manifestPath.replace(ROOT, '.').replaceAll('\\', '/')}  (schema ${manifest.schemaVersion}, reviewed ${manifest.meta?.reviewed})`);
  console.log('\nProgress (directive Part 8)');
  line('Total planned assets:', summary.total);
  line('Removed by owner decision:', summary.removedByOwnerDecision);
  line('Existing validated:', summary.existingValidated);
  line('In production:', summary.inProduction);
  line('Exported, awaiting validation:', summary.exportedAwaitingValidation);
  line('Rework required (files exist):', summary.reworkRequired);
  line('Blocked:', summary.blocked);
  line('Not started:', summary.notStarted);
  line('Integrated (status INTEGRATED):', summary.integrated);
  line('  legacy M0 file loaded:', summary.legacyIntegrated);
  console.log(`  (${summary.filesOnDisk} of ${summary.total} entries have a GLB on disk; ${summary.placeholders} are placeholders; ${summary.thirdPartyPresent} of ${summary.thirdPartyListed} third-party GLBs present, not counted)`);
  console.log('\nCompetition scope');
  line('G0-required:', scope.g0Required.total);
  line('  of which blocked:', scope.g0Required.blocked);
  line('  of which with a GLB on disk:', scope.g0Required.existingFiles);
  line('G0-optional:', scope.g0Optional.total);
  line('  of which blocked:', scope.g0Optional.blocked);
  line('Future (G1 to Research):', scope.future);
  const table = (title, rows) => { console.log(`\n${title}`); for (const [k, v] of rows) line(`${k}:`, v); };
  table('By label', counts.byLabel);
  table('By family', counts.byFamily);
  table('By scope class (unique deliverables)', counts.byScopeClass);
  table('By world', counts.byWorld);
  table('By owner', counts.byOwner);
  table('By status', counts.byStatus);
  if (has('--list')) {
    console.log('\nEntries');
    for (const a of assets) console.log(`  ${a.id.padEnd(26)} ${a.family} ${a.classification.padEnd(24)} ${a.status.padEnd(16)} P${String(a.priority).padEnd(3)} ${a.owner}`);
  }
  console.log(`\nStatus against files: ${disagreements.length ? disagreements.length + ' disagreement(s)' : 'all entries agree with the files on disk'}`);
  for (const d of disagreements) console.log(`  - ${d}`);
  console.log(`Manifest checks: ${errors.length ? errors.length + ' error(s)' : 'no errors'}`);
  for (const e of errors) console.log(`  - ${e}`);
  for (const t of notes) console.log(`Note: ${t}`);
}
process.exit((errors.length || disagreements.length) && !has('--report-only') ? 1 : 0);
