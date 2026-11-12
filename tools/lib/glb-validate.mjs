// Wound Up GLB validator: the checks (docs/GLB_EXPORT_AND_VALIDATION.md section 5, audit F section 2).
// Promoted from the audit F prototype. No dependency beyond Node built-ins and the three.js the game ships.
//
//   validateGlb(bytes, manifestEntry, ctx)  -> one asset's result (never throws; an exception is a FAIL)
//   crossChecks(results, manifest, opts)    -> checks that need several GLBs or the whole manifest
//
// Pure of the command line: tools/validate-glb.mjs is the CLI, tests/assets/validate-glb.test.ts calls this directly.
// It reads files and prints nothing. It never edits the manifest and never sets VALIDATED (ADR-037).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---- numbers a reviewer may want to question; every one is stated here and in the output header ----------------
export const LIMITS = Object.freeze({
  dimRelTol: 0.01, // V21: declared size within 1 % ...
  dimAbsTolM: 0.0005, // ... or 0.5 mm, whichever is larger (1 % of a 15 mm gear is 0.15 mm, below float and rounding noise)
  originTolM: 0.0005, // V22, V24: 0.5 mm
  loaderBoxTolM: 0.0001, // V70: loader Box3 against the raw box, 0.1 mm
  minGrabRadiusM: 0.012, // V61: INTERACTION_SPEC section 7.2
  maxTexturePx: 1024, // V32: ADR-023
  identityEps: 1e-6, // V23
  accessorBoundsEps: 1e-5, // V04: POSITION min and max against the data
  normalEps: 1e-3, // V12
  uvPerMetre: 10, // shared convention: 1 UV unit = 0.1 m
  uvPerMetreMin: 6, // V14: median texel density; box projection loses up to cos(54.7 deg) = 0.577 of the area, sqrt = 0.76
  uvPerMetreMax: 12,
  kib: 1024, // manifest budgets.glbKB is KiB: 250 KB = 256,000 bytes, 3072 KB = 3 MiB
});

export const ALLOWED_EXTENSIONS = ['KHR_materials_sheen', 'KHR_materials_clearcoat', 'KHR_materials_emissive_strength', 'KHR_materials_ior', 'KHR_texture_transform'];
const DENIED_EXTENSIONS = {
  KHR_draco_mesh_compression: 'Draco: the decoder path is a third-party CDN (ADR-025, ADR-035)',
  EXT_meshopt_compression: 'meshopt: IWSDK never installs the decoder, the GLB fails to load (ADR-035)',
  KHR_meshopt_compression: 'meshopt: IWSDK never installs the decoder, the GLB fails to load (ADR-035)',
  KHR_texture_basisu: 'KTX2: third-party decoder path (ADR-035)',
  KHR_materials_transmission: 'transmission adds a full extra render pass in three.js',
  KHR_materials_volume: 'volume adds a full extra render pass in three.js',
  KHR_lights_punctual: 'lights belong to code, not to GLBs (CLAUDE.md section 8)',
};

// Check ids in print order. Skipped checks are listed with the manifest field they need.
export const CHECK_ORDER = ['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V10', 'V12', 'V13', 'V14', 'V15', 'V16', 'V21', 'V22', 'V23', 'V24', 'V25', 'V26', 'V27', 'V28', 'V29', 'V30', 'V31', 'V32', 'V33', 'V34', 'V35', 'V40', 'V41', 'V50', 'V60', 'V61', 'V62', 'V70'];

const NAME_RE = /^[A-Z][A-Za-z0-9]*(?:_[A-Z0-9][A-Za-z0-9]*)*$/; // PascalCase_Underscore: every word group starts upper case (COL_Grab, GearSpur16_M1)
const HELPER_RE = /^(COL|PIV|SOCKET)_/;
const HELPER_TYPE = { COL: 'collider', PIV: 'pivot', SOCKET: 'socket' };
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const COMP = { 5120: [1, 'getInt8', 127], 5121: [1, 'getUint8', 255], 5122: [2, 'getInt16', 32767], 5123: [2, 'getUint16', 65535], 5125: [4, 'getUint32', 0], 5126: [4, 'getFloat32', 0] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const toBuffer = (b) => (Buffer.isBuffer(b) ? b : Buffer.from(b.buffer, b.byteOffset, b.byteLength));
const sha = (algo, b) => createHash(algo).update(b).digest('hex');
const MiB = 1048576;

// ---- result collector ---------------------------------------------------------------------------------------
class Rep {
  constructor() { this.items = []; this.ran = new Set(); this.skips = []; }
  check(id, ok, msg, level = 'FAIL') { this.ran.add(id); if (!ok) this.items.push({ level, id, msg }); return ok; }
  add(level, id, msg) { this.ran.add(id); this.items.push({ level, id, msg }); }
  skip(id, why) { this.skips.push({ id, why }); } // a skipped check did not run (unless another part of the same id did)
}

// ---- GLB container (V01) ------------------------------------------------------------------------------------
export function parseContainer(buf) {
  const errs = [];
  let json = null, bin = null;
  if (buf.length < 20) return { errs: ['file is shorter than a GLB header plus one chunk'], json, bin };
  if (buf.toString('latin1', 0, 4) !== 'glTF') errs.push('magic is not glTF');
  if (buf.readUInt32LE(4) !== 2) errs.push(`container version ${buf.readUInt32LE(4)}, need 2`);
  if (buf.readUInt32LE(8) !== buf.length) errs.push(`header length ${buf.readUInt32LE(8)} != file size ${buf.length}`);
  let off = 12, i = 0;
  while (off < buf.length) {
    if (off + 8 > buf.length) { errs.push('truncated chunk header'); break; }
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    if (off + 8 + len > buf.length) { errs.push(`chunk ${i} length ${len} runs past the end of the file`); break; }
    if (len % 4) errs.push(`chunk ${i} length ${len} is not 4-byte aligned`);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) {
      if (i !== 0) errs.push('JSON chunk is not first');
      else try { json = JSON.parse(body.toString('utf8')); } catch (e) { errs.push(`JSON chunk does not parse: ${e.message}`); }
    } else if (type === 0x004e4942) {
      if (i !== 1) errs.push('BIN chunk is not second');
      else bin = body;
    } else errs.push(`unknown chunk type 0x${type.toString(16)}`);
    off += 8 + len; i++;
  }
  if (!json && !errs.some((e) => e.startsWith('JSON chunk does not parse'))) errs.push('no JSON chunk');
  return { errs, json, bin };
}

function imageSize(b) {
  if (b.length > 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return [b.readUInt32BE(16), b.readUInt32BE(20), 'image/png'];
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5), 'image/jpeg'];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

// ---- matrices (column-major) --------------------------------------------------------------------------------
function localMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [(1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0, 2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0, 2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1];
}
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const xf = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const isIdentityTRS = (n) => {
  const e = LIMITS.identityEps, t = n.translation ?? [0, 0, 0], r = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1];
  return t.every((v) => Math.abs(v) < e) && Math.abs(r[0]) < e && Math.abs(r[1]) < e && Math.abs(r[2]) < e && Math.abs(r[3] - 1) < e && s.every((v) => Math.abs(v - 1) < e);
};

// ---- three.js, the version the game ships (super-three, installed as `three`) ---------------------------------
let threeP;
export function loadThree() {
  threeP ??= Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three')]).then(([l, t]) => ({ GLTFLoader: l.GLTFLoader, Box3: t.Box3 }));
  return threeP;
}

// ---- one GLB against its manifest entry ---------------------------------------------------------------------
/**
 * @param {Uint8Array} input the GLB bytes
 * @param {object} entry the manifest entry (fields read: id, glbPath, category, budgets, materials, meshes, animations,
 *   approxDimensionsM, dimensionsBasis, runtimeMotion, colliders, status, glbSha256, and the optional structured fields
 *   origin, pivotNodes, requiredNodes, sockets, colliderRadiusM, grabbable, tiledMaterials, allowAlpha, allowDoubleSided,
 *   variantOf, closed that schema v1 lacks)
 * @param {{materialLibrary: string[], color0Severity?: 'FAIL'|'WARN', legacy?: boolean, file?: string}} ctx
 */
export async function validateGlb(input, entry, ctx) {
  const buf = toBuffer(input);
  const rep = new Rep();
  const M = { bytes: buf.length };
  try {
    await runChecks(buf, entry, ctx, rep, M);
  } catch (e) {
    rep.add('FAIL', 'EXC', `VALIDATOR EXCEPTION (treated as FAIL): ${e.stack?.split('\n')[0] ?? e.message}`);
  }
  const findings = rep.items.sort((a, b) => (CHECK_ORDER.indexOf(a.id) + 1 || 999) - (CHECK_ORDER.indexOf(b.id) + 1 || 999) || (a.level === 'FAIL' ? -1 : 1));
  const touched = new Set(findings.map((f) => f.id));
  const failed = findings.some((f) => f.level === 'FAIL');
  return {
    id: entry.id,
    label: ctx.legacy ? 'legacy M0 file' : 'GLB',
    file: ctx.file ?? '',
    sha256: sha('sha256', buf),
    bytes: buf.length,
    status: entry.status,
    verdict: failed ? 'FAIL' : findings.length ? 'WARN' : 'PASS',
    findings,
    passed: CHECK_ORDER.filter((id) => rep.ran.has(id) && !touched.has(id)),
    skipped: rep.skips,
    metrics: M,
  };
}

async function runChecks(buf, entry, ctx, rep, M) {
  const { errs, json: js, bin } = parseContainer(buf);
  rep.ran.add('V01');
  errs.forEach((e) => rep.add('FAIL', 'V01', `container: ${e}`));
  if (!js) return;
  const G = { buf, js, bin, rep, M, entry, ctx, dv: bin ? new DataView(bin.buffer, bin.byteOffset, bin.byteLength) : null, cache: new Map(), badAcc: new Set() };
  const section = async (name, fn) => { try { await fn(); } catch (e) { rep.add('FAIL', 'EXC', `VALIDATOR EXCEPTION in ${name} (treated as FAIL): ${e.message}`); } };

  await section('header', () => checkHeader(G));
  await section('references', () => checkRefs(G));
  await section('accessors', () => checkAccessors(G));
  await section('scene', () => checkScene(G));
  await section('materials', () => checkMaterials(G));
  await section('images', () => checkImages(G));
  await section('geometry', () => checkGeometry(G));
  await section('colliders', () => checkColliders(G));
  await section('animation', () => checkAnimations(G));
  await section('budgets', () => checkBudgets(G));
  await section('loader', () => checkLoader(G));
}

// ---- V02, V05, V06 ----------------------------------------------------------------------------------------
function checkHeader(G) {
  const { js, rep, M } = G;
  rep.check('V02', js.asset?.version === '2.0', `asset.version is ${JSON.stringify(js.asset?.version)}, need "2.0"`);
  M.generator = js.asset?.generator;
  rep.check('V02', typeof js.asset?.generator === 'string' && js.asset.generator.startsWith('Khronos glTF Blender I/O'), `asset.generator is ${JSON.stringify(js.asset?.generator)}, not "Khronos glTF Blender I/O": hand-edited or another tool`, 'WARN');

  for (const [i, b] of (js.buffers ?? []).entries()) rep.check('V05', b.uri === undefined, `buffer ${i} has a uri (${String(b.uri).slice(0, 40)}): external or data: data`);
  for (const [i, im] of (js.images ?? []).entries()) rep.check('V05', im.uri === undefined, `image ${i} has a uri (${String(im.uri).slice(0, 40)}): external or data: image, must be embedded in the BIN chunk`);
  rep.check('V05', (js.buffers?.length ?? 0) <= 1, `${js.buffers.length} buffers, a GLB has one`);

  // every extension found anywhere in the JSON, not only those declared
  const found = new Set();
  const scan = (o) => { if (Array.isArray(o)) o.forEach(scan); else if (isObj(o)) for (const [k, v] of Object.entries(o)) { if (k === 'extensions' && isObj(v)) Object.keys(v).forEach((e) => found.add(e)); scan(v); } };
  scan(js);
  const used = new Set(js.extensionsUsed ?? []), req = js.extensionsRequired ?? [];
  M.extensions = [...new Set([...used, ...found])];
  for (const e of new Set([...used, ...found, ...req])) {
    rep.check('V06', !(e in DENIED_EXTENSIONS), `extension ${e} is forbidden: ${DENIED_EXTENSIONS[e]}`);
    if (!(e in DENIED_EXTENSIONS)) rep.check('V06', ALLOWED_EXTENSIONS.includes(e), `extension ${e} is not in the allow list (${ALLOWED_EXTENSIONS.join(', ')})`);
  }
  for (const e of found) rep.check('V06', used.has(e), `extension ${e} is used but missing from extensionsUsed`);
  rep.check('V06', !used.has('KHR_materials_ior'), 'KHR_materials_ior switches three.js to MeshPhysicalMaterial', 'WARN');
}

// ---- V03 references in range, no cycles, one parent -----------------------------------------------------------
function checkRefs(G) {
  const { js, rep } = G;
  const len = (k) => js[k]?.length ?? 0;
  const ref = (idx, kind, where) => rep.check('V03', Number.isInteger(idx) && idx >= 0 && idx < len(kind), `${where}: ${kind} index ${idx} is out of range (${len(kind)} exist)`);
  if (js.scene !== undefined) ref(js.scene, 'scenes', 'scene');
  (js.scenes ?? []).forEach((s, i) => (s.nodes ?? []).forEach((x) => ref(x, 'nodes', `scene ${i}`)));
  (js.nodes ?? []).forEach((n, i) => {
    (n.children ?? []).forEach((c) => ref(c, 'nodes', `node ${i} child`));
    if (n.mesh !== undefined) ref(n.mesh, 'meshes', `node ${i}`);
    if (n.skin !== undefined) ref(n.skin, 'skins', `node ${i}`);
    if (n.camera !== undefined) ref(n.camera, 'cameras', `node ${i}`);
  });
  (js.meshes ?? []).forEach((m, i) => {
    rep.check('V03', Array.isArray(m.primitives) && m.primitives.length > 0, `mesh ${i} has no primitives`);
    (m.primitives ?? []).forEach((p, j) => {
      const w = `mesh ${i} primitive ${j}`;
      Object.entries(p.attributes ?? {}).forEach(([k, a]) => ref(a, 'accessors', `${w} ${k}`));
      if (p.indices !== undefined) ref(p.indices, 'accessors', `${w} indices`);
      if (p.material !== undefined) ref(p.material, 'materials', w);
    });
  });
  (js.accessors ?? []).forEach((a, i) => { if (a.bufferView !== undefined) ref(a.bufferView, 'bufferViews', `accessor ${i}`); });
  (js.bufferViews ?? []).forEach((b, i) => ref(b.buffer, 'buffers', `bufferView ${i}`));
  (js.textures ?? []).forEach((t, i) => { if (t.source !== undefined) ref(t.source, 'images', `texture ${i}`); if (t.sampler !== undefined) ref(t.sampler, 'samplers', `texture ${i}`); });
  (js.images ?? []).forEach((im, i) => { if (im.bufferView !== undefined) ref(im.bufferView, 'bufferViews', `image ${i}`); });
  (js.materials ?? []).forEach((m, i) => textureRefs(m, `material ${i}`, (idx, w) => ref(idx, 'textures', w)));
  (js.animations ?? []).forEach((an, i) => {
    (an.samplers ?? []).forEach((s, j) => { ref(s.input, 'accessors', `animation ${i} sampler ${j} input`); ref(s.output, 'accessors', `animation ${i} sampler ${j} output`); });
    (an.channels ?? []).forEach((c, j) => {
      rep.check('V03', Number.isInteger(c.sampler) && c.sampler >= 0 && c.sampler < (an.samplers?.length ?? 0), `animation ${i} channel ${j}: sampler ${c.sampler} out of range`);
      if (c.target?.node !== undefined) ref(c.target.node, 'nodes', `animation ${i} channel ${j} target`);
    });
  });

  // parents and cycles
  const nodes = js.nodes ?? [];
  const parents = new Array(nodes.length).fill(0);
  nodes.forEach((n) => (n.children ?? []).forEach((c) => { if (c >= 0 && c < nodes.length) parents[c]++; }));
  parents.forEach((p, i) => rep.check('V03', p <= 1, `node ${i} (${nodes[i].name}) has ${p} parents`));
  const roots = new Set((js.scenes ?? []).flatMap((s) => s.nodes ?? []));
  roots.forEach((r) => rep.check('V03', !parents[r], `scene root node ${r} (${nodes[r]?.name}) is also a child`));
  const state = new Map();
  let cyclic = false;
  const visit = (i) => {
    if (state.get(i) === 2 || !nodes[i]) return;
    if (state.get(i) === 1) { cyclic = true; return; }
    state.set(i, 1); (nodes[i].children ?? []).forEach(visit); state.set(i, 2);
  };
  nodes.forEach((_, i) => visit(i));
  rep.check('V03', !cyclic, 'the node graph has a cycle');
  G.acyclic = !cyclic;
  // meshes no node uses are dead weight in the file
  const used = new Set(nodes.map((n) => n.mesh));
  (js.meshes ?? []).forEach((m, i) => rep.check('V03', used.has(i), `mesh ${i} (${m.name}) is not used by any node`, 'WARN'));
}

function textureRefs(o, where, cb) {
  if (!isObj(o)) return;
  for (const [k, v] of Object.entries(o)) {
    if (/Texture$/.test(k) && isObj(v) && typeof v.index === 'number') cb(v.index, `${where}.${k}`);
    else if (isObj(v)) textureRefs(v, `${where}.${k}`, cb);
  }
}
const materialHasTexture = (m) => { let n = 0; textureRefs(m, '', () => n++); return n > 0; };

// ---- V04 accessors ------------------------------------------------------------------------------------------
function checkAccessors(G) {
  const { js, bin, rep } = G;
  // Draco and meshopt data cannot be read here (and V06 already fails them): leave those accessors alone instead of piling up noise.
  const packed = (bv) => !!(bv.extensions?.EXT_meshopt_compression || bv.extensions?.KHR_meshopt_compression);
  (js.bufferViews ?? []).forEach((bv, i) => {
    if (packed(bv)) { G.compressed = true; return; }
    rep.check('V04', bv.buffer === 0, `bufferView ${i} uses buffer ${bv.buffer}, a GLB has buffer 0 only`);
    rep.check('V04', !!bin && (bv.byteOffset ?? 0) + bv.byteLength <= bin.length, `bufferView ${i} runs past the BIN chunk (${bin?.length ?? 0} bytes)`);
  });
  (js.meshes ?? []).forEach((m) => (m.primitives ?? []).forEach((p) => {
    if (!p.extensions?.KHR_draco_mesh_compression) return;
    G.compressed = true;
    [...Object.values(p.attributes ?? {}), p.indices].forEach((x) => { if (x !== undefined) G.badAcc.add(x); });
  }));
  (js.accessors ?? []).forEach((a, i) => {
    if (G.badAcc.has(i) || packed(js.bufferViews?.[a.bufferView] ?? {})) { G.badAcc.add(i); return; }
    const comp = COMP[a.componentType], nc = NCOMP[a.type];
    if (!comp || !nc) { G.badAcc.add(i); rep.check('V04', false, `accessor ${i}: invalid componentType ${a.componentType} or type ${a.type}`); return; }
    if (!(Number.isInteger(a.count) && a.count >= 1)) { G.badAcc.add(i); rep.check('V04', false, `accessor ${i}: count ${a.count} is not a positive integer`); return; }
    if (a.sparse) rep.add('WARN', 'V04', `accessor ${i} is sparse, which this validator does not read`);
    if (a.bufferView === undefined) return;
    const bv = js.bufferViews?.[a.bufferView];
    if (!bv) { G.badAcc.add(i); return; }
    const esz = comp[0] * nc, stride = bv.byteStride || esz, off = a.byteOffset ?? 0;
    const ok = off % comp[0] === 0 && off + stride * (a.count - 1) + esz <= bv.byteLength && !!bin && (bv.byteOffset ?? 0) + bv.byteLength <= bin.length;
    if (!rep.check('V04', ok, `accessor ${i}: byteOffset ${off}, count ${a.count} do not fit bufferView ${a.bufferView} (${bv.byteLength} bytes) or are misaligned`)) G.badAcc.add(i);
  });
}

function rd(G, i) {
  if (i === undefined || G.badAcc.has(i)) return null;
  if (G.cache.has(i)) return G.cache.get(i);
  const a = G.js.accessors[i], [sz, getter, div] = COMP[a.componentType], n = NCOMP[a.type];
  const out = new Float64Array(a.count * n);
  if (a.bufferView !== undefined) {
    const bv = G.js.bufferViews[a.bufferView], stride = bv.byteStride || sz * n, base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      const v = G.dv[getter](base + k * stride + c * sz, true);
      out[k * n + c] = a.normalized && div ? Math.max(v / div, -1) : v;
    }
  }
  G.cache.set(i, out);
  return out;
}

// ---- scene graph: names, root, helper empties, transforms, required nodes (V23 to V28) ----------------------------
function checkScene(G) {
  const { js, rep, entry } = G;
  const nodes = js.nodes ?? [];

  // world matrices of everything reachable from the scene
  G.world = new Map();
  if (G.acyclic) {
    const walk = (i, parent) => { const n = nodes[i]; if (!n || G.world.has(i)) return; const w = mul(parent, localMatrix(n)); G.world.set(i, w); (n.children ?? []).forEach((c) => walk(c, w)); };
    (js.scenes?.[js.scene ?? 0]?.nodes ?? []).forEach((r) => walk(r, IDENTITY));
    nodes.forEach((n, i) => rep.check('V03', G.world.has(i), `node ${i} (${n.name}) is not reachable from the scene`, 'WARN'));
  }

  // V25 names
  const count = new Map(), meshUsers = new Map();
  nodes.forEach((n) => { if (n.mesh !== undefined) meshUsers.set(n.mesh, (meshUsers.get(n.mesh) ?? 0) + 1); });
  nodes.forEach((n, i) => {
    if (!rep.check('V25', typeof n.name === 'string' && n.name !== '', `node ${i} has no name`)) return;
    rep.check('V25', NAME_RE.test(n.name), `node name "${n.name}" is not PascalCase_Underscore`);
    rep.check('V25', !/\.\d{3,}$/.test(n.name), `node name "${n.name}" ends in a Blender .001 suffix`);
    count.set(n.name, (count.get(n.name) ?? 0) + 1);
    if (n.mesh !== undefined && meshUsers.get(n.mesh) === 1) rep.check('V25', js.meshes?.[n.mesh]?.name === n.name, `mesh name "${js.meshes?.[n.mesh]?.name}" differs from its node name "${n.name}"`);
  });
  for (const [nm, c] of count) rep.check('V25', c === 1, `node name "${nm}" is used ${c} times`);

  // V26 required nodes: the manifest `meshes` ("Required named nodes") plus the optional structured list
  const required = [...new Set([...(entry.meshes ?? []), ...(entry.requiredNodes ?? []), ...(entry.pivotNodes ?? [])])];
  if (!required.length) rep.skip('V26', 'manifest `meshes` is empty, so no node is required');
  for (const r of required) rep.check('V26', count.get(r) === 1, count.get(r) ? `required node ${r} appears ${count.get(r)} times` : `required node ${r} is missing`);
  const listed = new Set(entry.meshes ?? []);
  if (listed.size) nodes.forEach((n) => { if (n.mesh !== undefined && n.name && !listed.has(n.name) && !(entry.requiredNodes ?? []).includes(n.name)) rep.check('V26', false, `mesh node ${n.name} is not listed in the manifest \`meshes\``, 'WARN'); });

  // V27 root
  const folder = (entry.glbPath ?? '').split('/').at(-2);
  rep.check('V27', (js.scenes?.length ?? 0) === 1, `${js.scenes?.length ?? 0} scenes, need exactly 1`);
  const roots = js.scenes?.[js.scene ?? 0]?.nodes ?? [];
  rep.check('V27', roots.length === 1, `the scene has ${roots.length} top-level nodes, need exactly 1 (select the root and its helpers only)`);
  const wu = nodes[roots[0]]?.extras?.wu;
  if (rep.check('V27', isObj(wu) && typeof wu.id === 'string' && typeof wu.family === 'string', 'the root node has no well-formed extras.wu with string id and family')) {
    rep.check('V27', wu.id === entry.id, `root extras.wu.id "${wu.id}" is not the manifest id "${entry.id}"`);
    rep.check('V27', !folder || wu.family === folder, `root extras.wu.family "${wu.family}" is not the folder "${folder}"`);
  }

  // V28 helper empties, V23 transforms
  const pivots = new Set(entry.pivotNodes ?? []);
  nodes.forEach((n, ni) => {
    const name = n.name ?? '', m = HELPER_RE.exec(name), u = n.extras?.wu, type = HELPER_TYPE[m?.[1]];
    if (!m && isObj(u) && ['collider', 'pivot', 'socket'].includes(u.type)) rep.check('V28', false, `node ${name} has wu.type "${u.type}" but its name has no COL_, PIV_ or SOCKET_ prefix`);
    rep.check('V23', !n.matrix, `node ${name} uses a matrix (apply transforms)`);
    const s = n.scale ?? [1, 1, 1];
    rep.check('V23', s.every((v) => v > 0), `node ${name} has a zero or negative scale ${JSON.stringify(s)}`);
    if (m) {
      rep.check('V28', isObj(u) && u.type === type, `helper ${name} needs extras.wu.type "${type}", has ${JSON.stringify(u?.type)}`);
      rep.check('V28', n.mesh === undefined, `helper ${name} carries a mesh; helpers are empties`);
      rep.check('V28', !roots.includes(ni), `helper ${name} is the scene root`);
      if (!isObj(u) || u.type !== type) return;
      if (type === 'collider') {
        rep.check('V28', ['box', 'sphere'].includes(u.shape), `collider ${name}: wu.shape is ${JSON.stringify(u.shape)}, need "box" or "sphere"`);
        rep.check('V28', !!n.scale, `collider ${name} has no scale: the size (metres) lives in the node scale`);
        if (u.shape === 'sphere') rep.check('V28', Math.max(...s) - Math.min(...s) <= LIMITS.dimRelTol * Math.max(...s), `sphere collider ${name} has non-uniform scale ${JSON.stringify(s)}`);
      } else if (type === 'pivot') {
        rep.check('V28', typeof u.kind === 'string' && u.kind !== '', `pivot ${name}: wu.kind is missing`);
        rep.check('V28', u.axis === undefined || /^[+-][XYZ]$/.test(u.axis), `pivot ${name}: wu.axis ${JSON.stringify(u.axis)} is not like "+Z"`);
      } else {
        rep.check('V28', Array.isArray(u.accepts) && u.accepts.length > 0 && u.accepts.every((a) => typeof a === 'string'), `socket ${name}: wu.accepts must be a non-empty array of strings`);
      }
    } else if (pivots.has(name)) {
      rep.check('V23', s.every((v) => Math.abs(v - s[0]) < LIMITS.identityEps), `declared pivot node ${name} has non-uniform scale`);
    } else {
      rep.check('V23', isIdentityTRS(n), `node ${name} carries a transform (apply transforms in Blender, or declare it in the manifest pivotNodes)`);
    }
  });
}

// ---- materials and textures (V30, V31, V32, V33) ------------------------------------------------------------------
function checkMaterials(G) {
  const { js, rep, entry, ctx } = G;
  const lib = new Set(ctx.materialLibrary);
  const alpha = new Set(entry.allowAlpha ?? []), dbl = new Set(entry.allowDoubleSided ?? []);
  const usedMat = new Set((js.meshes ?? []).flatMap((m) => m.primitives ?? []).map((p) => p.material));
  rep.check('V30', lib.size > 0, 'no materialLibrary supplied: meta.materialLibrary is missing from the manifest');
  (js.materials ?? []).forEach((m, i) => {
    const name = m.name ?? `(unnamed ${i})`;
    rep.check('V30', lib.has(m.name), `material "${name}" is not in meta.materialLibrary`);
    rep.check('V30', usedMat.has(i), `material "${name}" is not used by any primitive`, 'WARN');
    rep.check('V31', (m.alphaMode ?? 'OPAQUE') === 'OPAQUE' || alpha.has(m.name), `material ${name} is alphaMode ${m.alphaMode} (transparent overdraw; the manifest does not allow alpha for it)`);
    rep.check('V31', !m.doubleSided || dbl.has(m.name) || alpha.has(m.name), `material ${name} is double-sided (set use_backface_culling in Blender; the manifest does not allow it)`);
    // (docs/GLB_EXPORT_AND_VALIDATION.md V31 says WARN for double-sided; the stage brief says single-sided unless allowed: FAIL.)
  }); // a texture on a proxy shows up as embedded images (V32) with no hero budget
  const entryMats = new Set(entry.materials ?? []), glbMats = new Set((js.materials ?? []).map((m) => m.name));
  for (const n of glbMats) if (entryMats.size && !entryMats.has(n) && lib.has(n)) rep.check('V30', false, `material ${n} is in the GLB but not in the manifest \`materials\` of ${entry.id}`, 'WARN');
  for (const n of entryMats) rep.check('V30', glbMats.has(n), `manifest lists material ${n} but the GLB does not contain it`, 'WARN');
  G.M.materials = (js.materials ?? []).length;
}

function checkImages(G) {
  const { js, bin, rep, entry, M } = G;
  const images = js.images ?? [], hashes = [];
  let texBytes = 0;
  const seen = new Set();
  M.images = images.length;
  rep.check('V32', images.length === 0 || (entry.budgets?.textureMiB ?? 0) > 0, `${images.length} embedded image(s), but the entry has no hero texture budget (budgets.textureMiB is 0; library parts embed none, ADR-032)`);
  images.forEach((im, i) => {
    if (im.bufferView === undefined || !js.bufferViews?.[im.bufferView] || !bin) { rep.check('V07', false, `image ${i} is not embedded in the BIN chunk`); return; }
    const bv = js.bufferViews[im.bufferView];
    const blob = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    hashes.push(sha('sha1', blob).slice(0, 12));
    const sz = imageSize(blob);
    if (!rep.check('V07', !!sz, `image ${i}: the header is neither PNG nor JPEG`)) return;
    rep.check('V07', im.mimeType === sz[2], `image ${i}: mimeType ${im.mimeType} but the data is ${sz[2]}`);
    rep.check('V32', Math.max(sz[0], sz[1]) <= LIMITS.maxTexturePx, `image ${i} is ${sz[0]} x ${sz[1]}, larger than ${LIMITS.maxTexturePx} px (ADR-023)`);
    rep.check('V32', [sz[0], sz[1]].every((v) => (v & (v - 1)) === 0), `image ${i} is ${sz[0]} x ${sz[1]}, not a power of two`);
    if (!seen.has(i)) { seen.add(i); texBytes += sz[0] * sz[1] * 4 * (4 / 3); }
  });
  M.imageHashes = hashes;
  M.textureMiB = texBytes / MiB;
}

// ---- geometry: counts, quality, attributes, box, origin, axis (V10 to V16, V21 to V24, V29, V35) ---------------------
function checkGeometry(G) {
  const { js, rep, entry, M, ctx } = G;
  const meshes = js.meshes ?? [], mats = js.materials ?? [];
  const tiled = new Set(entry.tiledMaterials ?? []);
  const geo = createHash('sha1');
  const density = [];
  let uniqueTris = 0, badNormals = 0, degenerate = 0, nonFinite = 0, closedVol = 0;
  const edges = entry.closed === true ? new Map() : null;
  const lit = entry.category === 'character' ? ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0', 'COLOR_0'] : ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0'];

  meshes.forEach((mesh, mi) => (mesh.primitives ?? []).forEach((p, pi) => {
    const w = `mesh ${mesh.name ?? mi} primitive ${pi}`, A = p.attributes ?? {};
    rep.check('V10', (p.mode ?? 4) === 4, `${w}: mode ${p.mode} is not TRIANGLES`);
    for (const need of ['POSITION', 'NORMAL', 'TEXCOORD_0']) rep.check('V35', A[need] !== undefined, `${w}: attribute ${need}${need === 'TEXCOORD_0' ? ' (UVMap)' : ''} is missing`);
    for (const k of Object.keys(A)) {
      if (k === 'TEXCOORD_1') rep.check('V35', false, `${w}: has a second UV map (TEXCOORD_1); a mesh has one map named UVMap`, 'WARN');
      else if (k === 'TANGENT') rep.check('V35', false, `${w}: exports TANGENT (adds size; profile L sets export_tangents False)`, 'WARN');
      else rep.check('V35', lit.includes(k), `${w}: attribute ${k} is not allowed${k.startsWith('JOINTS') || k.startsWith('WEIGHTS') ? ' (skin data is for characters only)' : ''}`);
    }
    rep.check('V29', p.material === undefined || A.COLOR_0 !== undefined, `${w}: material ${mats[p.material]?.name} has no COLOR_0 (baked AO, neutral white if not baked; BLENDER_PRODUCTION_GUIDELINES section 8)`, ctx.color0Severity ?? 'FAIL');
    rep.check('V30', p.material !== undefined, `${w}: has no material`);

    const pos = rd(G, A.POSITION);
    if (!pos) return;
    const idx = p.indices !== undefined ? rd(G, p.indices) : null;
    const nV = pos.length / 3, nI = idx ? idx.length : nV;
    rep.check('V10', nI % 3 === 0, `${w}: index count ${nI} is not a multiple of 3`);
    if (idx) {
      let mx = 0; for (const v of idx) if (v > mx) mx = v;
      rep.check('V04', mx < nV, `${w}: an index (${mx}) is >= the vertex count ${nV}`);
      rep.check('V15', !(js.accessors[p.indices].componentType === 5125 && nV < 65536), `${w}: uses 32-bit indices for ${nV} vertices`, 'WARN');
    }
    for (const k of Object.values(A)) if (js.accessors?.[k]) rep.check('V04', js.accessors[k].count === nV, `${w}: attribute accessor ${k} has ${js.accessors[k].count} vertices, POSITION has ${nV}`);
    const nT = Math.floor(nI / 3);
    uniqueTris += nT;
    geo.update(Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength));
    if (idx) geo.update(Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength));
    for (const v of pos) if (!Number.isFinite(v)) nonFinite++;
    if (A.POSITION !== undefined && js.accessors[A.POSITION].min && js.accessors[A.POSITION].max) {
      const a = js.accessors[A.POSITION], mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (let k = 0; k < pos.length; k += 3) for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], pos[k + d]); mx[d] = Math.max(mx[d], pos[k + d]); }
      rep.check('V04', mn.every((v, d) => Math.abs(v - a.min[d]) < LIMITS.accessorBoundsEps && Math.abs(mx[d] - a.max[d]) < LIMITS.accessorBoundsEps), `${w}: POSITION min/max in the file disagree with the vertex data (breaks culling and bounds)`);
    } else rep.check('V04', false, `${w}: POSITION accessor has no min and max`);

    const nor = rd(G, A.NORMAL);
    if (nor) for (let k = 0; k < nor.length; k += 3) if (Math.abs(Math.hypot(nor[k], nor[k + 1], nor[k + 2]) - 1) > LIMITS.normalEps) badNormals++;
    const uv = rd(G, A.TEXCOORD_0);
    const mat = mats[p.material];
    const textured = !!mat && materialHasTexture(mat), isTiled = tiled.has(mat?.name);
    if (uv) {
      let finite = true, out = false;
      for (const t of uv) { if (!Number.isFinite(t)) finite = false; else if (t < -1e-4 || t > 1 + 1e-4) out = true; }
      rep.check('V14', finite, `${w}: UVs contain NaN or infinity`);
      if (textured && !isTiled) rep.check('V14', !out, `${w}: UVs outside 0..1 on textured material ${mat?.name}, which the manifest does not list in tiledMaterials`);
    }
    const tri = (k) => (idx ? [idx[k * 3], idx[k * 3 + 1], idx[k * 3 + 2]] : [k * 3, k * 3 + 1, k * 3 + 2]);
    const key = (v) => `${pos[v * 3]},${pos[v * 3 + 1]},${pos[v * 3 + 2]}`;
    for (let k = 0; k < nT; k++) {
      const [a, b, c] = tri(k);
      if (a >= nV || b >= nV || c >= nV) continue;
      const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
      const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
      const cr = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      if (cr < 1e-14) { degenerate++; continue; }
      if (uv && !textured) { // metric UV convention: 1 UV unit = 0.1 m, so UV per metre is 10
        const s = uv[b * 2] - uv[a * 2], t = uv[b * 2 + 1] - uv[a * 2 + 1], s2 = uv[c * 2] - uv[a * 2], t2 = uv[c * 2 + 1] - uv[a * 2 + 1];
        const uvA = Math.abs(s * t2 - t * s2);
        if (uvA > 0) density.push(Math.sqrt(uvA / cr));
      }
      if (edges) {
        const ka = key(a), kb = key(b), kc = key(c);
        for (const [p0, p1] of [[ka, kb], [kb, kc], [kc, ka]]) { const e = p0 < p1 ? `${p0}|${p1}` : `${p1}|${p0}`; edges.set(e, (edges.get(e) ?? 0) + 1); }
        closedVol += (pos[a * 3] * (pos[b * 3 + 1] * pos[c * 3 + 2] - pos[b * 3 + 2] * pos[c * 3 + 1]) - pos[a * 3 + 1] * (pos[b * 3] * pos[c * 3 + 2] - pos[b * 3 + 2] * pos[c * 3]) + pos[a * 3 + 2] * (pos[b * 3] * pos[c * 3 + 1] - pos[b * 3 + 1] * pos[c * 3])) / 6;
      }
    }
  }));
  rep.check('V12', nonFinite === 0, `${nonFinite} non-finite POSITION values`);
  rep.check('V12', badNormals === 0, `${badNormals} normals are not unit length within ${LIMITS.normalEps}`, 'WARN');
  rep.check('V13', degenerate === 0, `${degenerate} degenerate triangles`);
  if (density.length) {
    density.sort((a, b) => a - b);
    const med = density[density.length >> 1];
    M.uvPerMetre = +med.toFixed(2);
    rep.check('V14', med >= LIMITS.uvPerMetreMin && med <= LIMITS.uvPerMetreMax, `median UV density is ${med.toFixed(2)} UV per metre on untextured (library) materials, the convention is ${LIMITS.uvPerMetre} (1 UV unit = 0.1 m; accepted ${LIMITS.uvPerMetreMin} to ${LIMITS.uvPerMetreMax})`, 'WARN');
  }
  if (edges) {
    const bad = [...edges.values()].filter((c) => c !== 2).length;
    rep.check('V16', bad === 0 && closedVol > 0, `entry is closed: ${bad} edges are not shared by exactly two triangles, signed volume ${closedVol.toExponential(3)} m3`, 'WARN');
  } else rep.skip('V16', 'manifest has no `closed` flag (schema v1)');

  // instances: draw primitives, triangles and the real box through the node matrices
  let tris = 0, verts = 0, prims = 0;
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  (js.nodes ?? []).forEach((n, i) => {
    const w = G.world.get(i);
    if (n.mesh === undefined || !w) return;
    for (const p of meshes[n.mesh]?.primitives ?? []) {
      const pos = rd(G, p.attributes?.POSITION);
      if (!pos) continue;
      const idx = p.indices !== undefined ? rd(G, p.indices) : null;
      prims++; verts += pos.length / 3; tris += (idx ? idx.length : pos.length / 3) / 3;
      for (let k = 0; k < pos.length; k += 3) { const q = xf(w, pos[k], pos[k + 1], pos[k + 2]); for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], q[d]); hi[d] = Math.max(hi[d], q[d]); } }
    }
  });
  Object.assign(M, { triangles: tris, vertices: verts, primitives: prims, nodes: (js.nodes ?? []).length, meshes: meshes.length, uniqueTriangles: uniqueTris });
  const hasBox = tris > 0;
  const size = hi.map((v, d) => v - lo[d]);
  G.box = hasBox && !nonFinite ? { lo, hi, size } : null;
  rep.check('V10', hasBox || G.compressed, 'the file has no triangles in the scene');
  M.geometryHash = geo.digest('hex').slice(0, 16);
  M.nearKey = `${tris}/${verts}/${size.map((v) => Math.round(v * 5000)).join('x')}`;
  if (!hasBox || nonFinite) { rep.skip('V21', G.compressed ? 'geometry is compressed (forbidden, see V06) and was not decoded' : 'no readable geometry'); return; }
  M.bboxM = { min: lo.map((v) => +v.toFixed(5)), max: hi.map((v) => +v.toFixed(5)), size: size.map((v) => +v.toFixed(5)) };

  // V21 declared size
  const decl = entry.approxDimensionsM, basis = entry.dimensionsBasis;
  if (Array.isArray(decl) && ['spec', 'measured', 'derived'].includes(basis)) {
    decl.forEach((want, d) => { if (want !== null) rep.check('V21', Math.abs(size[d] - want) <= Math.max(LIMITS.dimRelTol * want, LIMITS.dimAbsTolM), `size ${'XYZ'[d]} is ${size[d].toFixed(4)} m, declared ${want} m (tolerance ${LIMITS.dimRelTol * 100} % or ${LIMITS.dimAbsTolM * 1000} mm)`); });
  } else rep.skip('V21', `manifest approxDimensionsM is ${Array.isArray(decl) ? `only a proposal (dimensionsBasis ${basis})` : 'null'}; real size ${size.map((v) => v.toFixed(4)).join(' x ')} m reported, not checked`);

  // V22 origin, V24 rotation axis
  const rotating = entry.rotationAxis === '+Z' || /rotates\s+about\s+(the\s+)?local\s*\+Z/i.test(entry.runtimeMotion ?? '');
  const origin = entry.origin ?? (entry.category === 'gear' ? { x: 'centre', y: 'centre', z: 'centre' } : null);
  if (origin) {
    ['x', 'y', 'z'].forEach((ax, d) => {
      const got = origin[ax] === 'centre' ? (lo[d] + hi[d]) / 2 : origin[ax] === 'min' ? lo[d] : hi[d];
      rep.check('V22', Math.abs(got) <= LIMITS.originTolM, `origin ${ax}: the box ${origin[ax]} is ${(got * 1000).toFixed(2)} mm from 0 (tolerance ${LIMITS.originTolM * 1000} mm)`);
    });
  } else rep.skip('V22', 'manifest has no structured `origin` {x,y,z: centre|min|max} (originAndPivot is text)');
  if (rotating) {
    const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2;
    const lvl = entry.category === 'gear' ? 'FAIL' : 'WARN'; // cranks and cams are legitimately off-centre
    rep.check('V24', Math.hypot(cx, cy) <= LIMITS.originTolM, `rotating part: the XY box centre is ${(Math.hypot(cx, cy) * 1000).toFixed(2)} mm from the +Z axis`, lvl);
    if (entry.category === 'gear') rep.check('V24', size[2] <= Math.min(size[0], size[1]), `gear: the thin axis must be Z, extents are ${size.map((v) => v.toFixed(4)).join(' x ')}`);
    rep.skip('V24', 'tip radius check needs a manifest `tipRadiusM`');
  }
}

// ---- V60, V61, V62 -----------------------------------------------------------------------------------------
function checkColliders(G) {
  const { js, rep, entry, M } = G;
  const nodes = js.nodes ?? [];
  const grab = nodes.find((n) => n.name === 'COL_Grab');
  const grabbable = entry.grabbable === true || isObj(entry.grabbable) || (entry.colliders ?? []).some((c) => /\bCOL_Grab\b/.test(c)) || !!grab;
  if (grabbable) {
    rep.check('V60', (M.triangles ?? 0) > 0, 'a grabbable asset needs at least one triangle mesh (IWSDK hit-tests by raycasting)');
    if (rep.check('V61', !!grab, 'grabbable asset has no COL_Grab collider node')) {
      const s = grab.scale ?? [1, 1, 1], shape = grab.extras?.wu?.shape;
      const radius = shape === 'sphere' ? s[0] : Math.max(...s); // sphere: its radius; box: its largest half-extent
      M.grabRadiusM = +radius.toFixed(5);
      rep.check('V61', radius >= LIMITS.minGrabRadiusM - 1e-9, `COL_Grab radius ${(radius * 1000).toFixed(1)} mm is below ${LIMITS.minGrabRadiusM * 1000} mm (INTERACTION_SPEC section 7.2)`);
      const want = entry.colliderRadiusM ?? entry.grabbable?.colliderRadiusM;
      if (typeof want === 'number') rep.check('V61', Math.abs(radius - want) <= LIMITS.originTolM, `COL_Grab radius ${radius} m differs from the manifest colliderRadiusM ${want} m`);
    }
  }
  if (Array.isArray(entry.sockets) && entry.sockets.length) {
    for (const s of entry.sockets) {
      const n = nodes.find((x) => x.name === s.name);
      if (!rep.check('V62', !!n, `socket ${s.name} is missing`)) continue;
      const t = n.translation ?? [0, 0, 0];
      rep.check('V62', Math.hypot(t[0] - s.positionM[0], t[1] - s.positionM[1], t[2] - s.positionM[2]) <= LIMITS.originTolM, `socket ${s.name} is at ${JSON.stringify(t)}, declared ${JSON.stringify(s.positionM)}`);
      if (s.axis) {
        const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
        const zAxis = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
        const want = { '+X': [1, 0, 0], '-X': [-1, 0, 0], '+Y': [0, 1, 0], '-Y': [0, -1, 0], '+Z': [0, 0, 1], '-Z': [0, 0, -1] }[s.axis];
        const ang = want ? Math.acos(Math.min(1, Math.max(-1, zAxis[0] * want[0] + zAxis[1] * want[1] + zAxis[2] * want[2]))) * 180 / Math.PI : 999;
        rep.check('V62', ang <= 1, `socket ${s.name}: +Z is ${ang.toFixed(1)} degrees from the declared axis ${s.axis}`);
      }
    }
  } else rep.skip('V62', 'manifest has no structured `sockets` [{name, positionM, axis}] (schema v1)');
  rep.skip('V41', 'needs manifest `pivotNodes` plus the moving-part tree (schema v1 has neither)');
}

// ---- V40 animation ------------------------------------------------------------------------------------------
function checkAnimations(G) {
  const { js, rep, entry } = G;
  const clips = js.animations ?? [], want = entry.animations ?? [];
  G.M.animations = clips.map((a) => a.name);
  for (const w of want) rep.check('V40', clips.some((a) => a.name === w), `animation clip ${w} listed in the manifest is missing`);
  for (const a of clips) rep.check('V40', want.includes(a.name), `animation clip ${a.name} is not listed in the manifest (static assets carry no clips)`);
  clips.forEach((an) => (an.channels ?? []).forEach((c, j) => {
    const s = an.samplers?.[c.sampler];
    const t = s ? rd(G, s.input) : null;
    if (!t) return;
    rep.check('V40', t.every((v, k) => k === 0 || v > t[k - 1]), `clip ${an.name} channel ${j}: key times are not strictly increasing`);
    rep.check('V40', t[t.length - 1] > t[0], `clip ${an.name} channel ${j}: zero duration`);
  }));
  if (clips.length) rep.skip('V40', 'loop check (first key equals last key) needs a manifest `loop` flag');
}

// ---- V50 budgets --------------------------------------------------------------------------------------------
function checkBudgets(G) {
  const { rep, entry, M, buf } = G;
  const b = entry.budgets;
  if (!rep.check('V50', isObj(b), 'the manifest entry has no budgets block')) return;
  M.budgets = b;
  rep.check('V50', M.triangles <= b.triangles, `triangles ${M.triangles} > budget ${b.triangles}`);
  rep.check('V50', M.primitives <= b.primitives, `primitives (draw calls) ${M.primitives} > budget ${b.primitives}`);
  rep.check('V50', (M.materials ?? 0) <= b.materials, `materials ${M.materials} > budget ${b.materials}`);
  rep.check('V50', (M.textureMiB ?? 0) <= b.textureMiB + 1e-9, `texture memory ${(M.textureMiB ?? 0).toFixed(3)} MiB > budget ${b.textureMiB} MiB`);
  rep.check('V50', buf.length <= b.glbKB * LIMITS.kib, `file ${buf.length} bytes (${(buf.length / MiB).toFixed(2)} MiB) > budget ${b.glbKB} KiB (${b.glbKB * LIMITS.kib} bytes)`);
}

// ---- V34, V70 loader round trip ---------------------------------------------------------------------------------
async function checkLoader(G) {
  const { js, rep, buf, M } = G;
  const { GLTFLoader, Box3 } = await loadThree();
  const warns = [];
  const saved = { warn: console.warn, cib: globalThis.createImageBitmap, self: globalThis.self };
  console.warn = (...a) => warns.push(a.map(String).join(' '));
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} }); // Node has no image decoder; real sizes come from the header
  globalThis.self ??= globalThis;
  try {
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), '', res, (e) => rej(e instanceof Error ? e : new Error(e?.message ?? String(e)))));
    rep.check('V70', gltf.scene.children.length > 0, 'the loader produced an empty scene');
    rep.check('V70', warns.length === 0, `GLTFLoader warnings: ${warns.join(' | ').slice(0, 300)}`);
    if (G.box) {
      const box = new Box3().setFromObject(gltf.scene);
      const lo = box.min.toArray(), hi = box.max.toArray();
      const off = Math.max(...lo.map((v, d) => Math.abs(v - G.box.lo[d])), ...hi.map((v, d) => Math.abs(v - G.box.hi[d])));
      M.loaderBoxM = { min: lo.map((v) => +v.toFixed(5)), max: hi.map((v) => +v.toFixed(5)) };
      rep.check('V70', off <= LIMITS.loaderBoxTolM, `the loader box differs from the raw box by ${(off * 1000).toFixed(3)} mm (tolerance ${LIMITS.loaderBoxTolM * 1000} mm)`);
    }
    try { rep.check('V70', gltf.scene.clone().children.length === gltf.scene.children.length, 'scene.clone() changed the child count'); } catch (e) { rep.check('V70', false, `scene.clone() threw: ${e.message}`); }

    const byName = new Map();
    const classes = {};
    gltf.scene.traverse((o) => {
      if (o.name) byName.set(o.name, o);
      if (o.isMesh) classes[o.material.name] = o.material.type;
    });
    for (const n of js.nodes ?? []) if (isObj(n.extras?.wu) && n.name) rep.check('V70', JSON.stringify(byName.get(n.name)?.userData?.wu) === JSON.stringify(n.extras.wu), `userData.wu of ${n.name} does not survive the loader`);
    M.materialClasses = classes;
    for (const [name, type] of Object.entries(classes)) {
      const m = (js.materials ?? []).find((x) => x.name === name);
      const physicalOk = !!m?.extensions && ('KHR_materials_sheen' in m.extensions || 'KHR_materials_clearcoat' in m.extensions);
      rep.check('V34', type === 'MeshStandardMaterial' || (type === 'MeshPhysicalMaterial' && physicalOk), `material ${name} loads as ${type}${type === 'MeshPhysicalMaterial' ? ' without a declared sheen or clearcoat' : ''}; expected MeshStandardMaterial`);
    }
  } catch (e) {
    rep.check('V70', false, `GLTFLoader could not load the file: ${e.message}`);
  } finally {
    console.warn = saved.warn;
    if (saved.cib === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = saved.cib;
    if (saved.self === undefined) delete globalThis.self; else globalThis.self = saved.self;
  }
}

// ---- cross-manifest checks (X01 to X07) -----------------------------------------------------------------------------
/**
 * @param {object[]} results validateGlb results (several GLBs)
 * @param {object} manifest the parsed manifest
 * @param {{root?: string, manifestWide?: boolean, byId?: Map<string, object>}} opts manifestWide adds the checks that read the whole manifest and the disk
 */
export function crossChecks(results, manifest, opts = {}) {
  const out = [];
  const add = (level, id, msg) => out.push({ level, id, msg });
  const entries = manifest.assets ?? [];
  const byId = new Map(entries.map((a) => [a.id, a]));
  const groups = (key) => { const g = new Map(); for (const r of results) for (const k of [].concat(r.metrics[key] ?? [])) (g.get(k) ?? g.set(k, new Set()).get(k)).add(r.id); return [...g].filter(([, ids]) => ids.size > 1); };

  for (const [, ids] of groups('geometryHash')) add('FAIL', 'X01', `identical geometry under several ids: ${[...ids].join(', ')} (an exact duplicate export, ADR-030 item 1)`);
  for (const [k, ids] of groups('nearKey')) {
    const dup = [...ids];
    const variant = dup.some((a) => dup.some((b) => a !== b && byId.get(a)?.variantOf === b));
    const same = groups('geometryHash').some(([, g]) => dup.every((d) => g.has(d)));
    if (!variant && !same) add('WARN', 'X02', `near duplicate (triangles/vertices/size ${k}): ${dup.join(', ')}; needs variantOf and a stated differing parameter`);
  }
  for (const [h, ids] of groups('imageHashes')) add('WARN', 'X03', `the same embedded image ${h} is in several GLBs: ${[...ids].join(', ')} (repeated textures; decision 4 turns this into a FAIL)`);

  // X06 the real count: unique geometry hashes per classification label
  const perLabel = {};
  for (const r of results) {
    const label = byId.get(r.id)?.classification ?? 'unknown';
    (perLabel[label] ??= new Set()).add(r.metrics.geometryHash);
  }
  const counts = Object.fromEntries(Object.entries(perLabel).map(([k, v]) => [k, v.size]));
  let assetIdReferences = null; // null: not scanned (selection run)

  if (opts.manifestWide) {
    const root = opts.root;
    // X07 ids, filenames, paths unique
    for (const key of ['id', 'filename', 'glbPath']) {
      const seen = new Map();
      for (const a of entries) seen.set(a[key], (seen.get(a[key]) ?? 0) + 1);
      for (const [v, n] of seen) if (n > 1) add('FAIL', 'X07', `${key} "${v}" is used by ${n} entries`);
    }
    // X04 files against the manifest, both ways
    const known = new Set(entries.flatMap((a) => [a.glbPath, a.legacy?.glb].filter(Boolean)));
    const walk = (dir) => {
      if (!existsSync(join(root, dir))) return;
      for (const f of readdirSync(join(root, dir))) {
        const rel = `${dir}/${f}`;
        if (statSync(join(root, rel)).isDirectory()) walk(rel);
        else if (/\.(glb|gltf)$/.test(f) && !known.has(rel)) add('FAIL', 'X04', `${rel} is on disk but not in the manifest (orphan)`);
      }
    };
    walk('public/assets/models');
    for (const a of entries) {
      if (['EXPORTED', 'VALIDATING', 'VALIDATED', 'INTEGRATED'].includes(a.status) && !existsSync(join(root, a.glbPath))) add('FAIL', 'X04', `${a.id} is ${a.status} but ${a.glbPath} does not exist`);
      if (a.status === 'REWORK_REQUIRED' && !existsSync(join(root, a.glbPath)) && !(a.legacy && existsSync(join(root, a.legacy.glb)))) add('FAIL', 'X04', `${a.id} is REWORK_REQUIRED but neither ${a.glbPath} nor a legacy file exists`);
    }
    // X04 references in source: URLs in src/assets.ts and assetId strings
    const assetsTs = join(root, 'src/assets.ts');
    if (existsSync(assetsTs)) {
      for (const m of readFileSync(assetsTs, 'utf8').matchAll(/['"`]([^'"`]+\.glb)['"`]/g)) {
        const rel = m[1].startsWith('assets/') ? `public/${m[1]}` : `public/assets/models/${m[1]}`;
        if (!existsSync(join(root, rel))) add('FAIL', 'X04', `src/assets.ts refers to ${rel}, which does not exist`);
        else if (!known.has(rel)) add('FAIL', 'X04', `src/assets.ts refers to ${rel}, which is not in the manifest`);
      }
    }
    let assetIds = 0;
    const scanSrc = (dir) => {
      if (!existsSync(join(root, dir))) return;
      for (const f of readdirSync(join(root, dir))) {
        const rel = `${dir}/${f}`;
        if (statSync(join(root, rel)).isDirectory()) scanSrc(rel);
        else if (/\.ts$/.test(f)) for (const m of readFileSync(join(root, rel), 'utf8').matchAll(/\bassetId\s*[:=]\s*['"`]([a-z][a-z0-9_]*)['"`]/g)) { assetIds++; if (!byId.has(m[1])) add('FAIL', 'X04', `${rel} uses assetId "${m[1]}", which is not a manifest id`); }
      }
    };
    scanSrc('src');
    assetIdReferences = assetIds;
    // X05 artificial splitting: no usedBy, or four or more siblings with one parent and the same materials
    const unused = entries.filter((a) => !(a.usedBy?.length > 0)).map((a) => a.id);
    if (unused.length) add('WARN', 'X05', `${unused.length} entries have an empty usedBy (listed for review): ${unused.join(', ')}`);
    const sib = new Map();
    for (const a of entries) if (a.dependencies?.length === 1) { const k = `${a.dependencies[0]}|${[...(a.materials ?? [])].sort().join(',')}`; (sib.get(k) ?? sib.set(k, []).get(k)).push(a.id); }
    for (const [k, ids] of sib) if (ids.length >= 4) add('WARN', 'X05', `${ids.length} siblings of ${k.split('|')[0]} share one material set (possible artificial splitting): ${ids.join(', ')}`);
  }
  return { findings: out, uniqueGeometryByLabel: counts, assetIdReferences };
}
