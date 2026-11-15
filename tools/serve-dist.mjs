#!/usr/bin/env node
// Serves dist/ the way Vercel will: static files only, with the `headers` rules of vercel.json applied to every response.
// For testing the CSP and the other security headers locally (tests/csp/csp.spec.ts, playwright.csp.config.ts); not part of the build.
//
//   node tools/serve-dist.mjs [port]      default port 5194, or the PORT environment variable; binds 127.0.0.1 only
//
// No dependency. Vercel matches `source` with path-to-regexp; this reads only the subset vercel.json uses (literal text and
// `(...)` groups) and refuses anything else, so a rule it cannot honour fails loudly instead of being served without its header.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 5194);

/** Content types as Vercel sends them for the file types this build contains. */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
};

/** `/assets/(.*).js` -> /^\/assets\/(.*)\.js$/ */
function sourceToRegExp(source) {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '(') {
      let depth = 1;
      let j = i + 1;
      for (; j < source.length && depth > 0; j++) depth += source[j] === '(' ? 1 : source[j] === ')' ? -1 : 0;
      if (depth !== 0) throw new Error(`vercel.json source "${source}": unbalanced parenthesis`);
      out += source.slice(i, j);
      i = j - 1;
    } else if (/[:*+?{}|[\]\\^$]/.test(c)) {
      throw new Error(`vercel.json source "${source}": "${c}" is not supported by tools/serve-dist.mjs; extend it before using it in vercel.json`);
    } else out += c.replace(/[.]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

const config = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
const rules = (config.headers ?? []).map((rule) => {
  if (rule.has || rule.missing) throw new Error(`vercel.json source "${rule.source}": has/missing are not supported by tools/serve-dist.mjs`);
  return { pattern: sourceToRegExp(rule.source), headers: rule.headers };
});

/** Every matching rule adds its headers; two rules that set the same header would be ambiguous, so that is an error. */
function headersFor(pathname) {
  const out = new Map();
  for (const rule of rules) {
    if (!rule.pattern.test(pathname)) continue;
    for (const { key, value } of rule.headers) {
      if (out.has(key.toLowerCase())) throw new Error(`two vercel.json rules set ${key} for ${pathname}`);
      out.set(key.toLowerCase(), value);
    }
  }
  return out;
}

async function fileFor(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const full = resolve(DIST, `.${rel}`);
  if (full !== DIST && !full.startsWith(DIST + sep)) return null; // no way out of dist/
  const info = await stat(full).catch(() => null);
  if (info?.isDirectory()) return fileFor(`${rel.replace(/\/$/, '')}/index.html`);
  return info?.isFile() ? full : null;
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const file = await fileFor(pathname);
    const headers = Object.fromEntries(headersFor(pathname));
    if (!file) {
      res.writeHead(404, { ...headers, 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { ...headers, 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('Server error');
  }
});

if (!(await stat(join(DIST, 'index.html')).catch(() => null))) {
  console.error('dist/index.html is missing: run `npm run build` first.');
  process.exit(1);
}
server.listen(PORT, '127.0.0.1', () => console.log(`dist/ with ${rules.length} vercel.json header rules on http://127.0.0.1:${PORT}/`));
