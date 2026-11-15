/* eslint-disable no-undef -- a node script run by hand: it uses node and browser globals (the page functions run inside Chromium) that the repo's lint config does not list */
/**
 * Landing and loading measurements for docs/evidence/WEBPERF_2026-11-15.md. Not a test: a node script run by hand against a
 * production build (`npm run build`, then `node node_modules/vite/bin/vite.js preview --port 5199 --strictPort`).
 *
 *   WU_URL=https://localhost:5199/ WU_LABEL=before node tests/perf/measure-web.mjs
 *
 * Output: .tmp/webperf/<label>.json (and a table on stdout). Chromium is headed on the real GPU (ANGLE D3D11) when WU_HEADLESS is unset.
 * Profiles: "desktop" (no throttling), "slow" (CPU 4x throttle and Fast 4G: 9 Mbps down, 1.5 Mbps up, 60 ms RTT). Every load starts with
 * an empty cache. Frame rate is measured on a second page of the same profile, opened with ?debug so `renderer.info.render.frame` can be read.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const URL_BASE = (process.env.WU_URL ?? 'https://localhost:5199/').replace(/\/?$/, '/');
const LABEL = process.env.WU_LABEL ?? 'run';
const HEADLESS = process.env.WU_HEADLESS === '1';
const RUNS = Number(process.env.WU_RUNS ?? 3);
const PROFILES = (process.env.WU_PROFILES ?? 'desktop,slow').split(',');

const FAST_4G = { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 };

const kind = (url) => {
  const p = new URL(url).pathname;
  if (/\.html?$|\/$/.test(p)) return 'html';
  if (/\.m?js$/.test(p)) return 'js';
  if (/\.css$/.test(p)) return 'css';
  if (/\.glb$/.test(p)) return 'glb';
  if (/\/materials\/.+\.(png|jpe?g|webp|avif|ktx2)$/.test(p)) return 'texture';
  if (/\.(png|jpe?g|webp|avif|svg|ico)$/.test(p)) return 'image';
  if (/\.woff2?$/.test(p)) return 'font';
  if (/\.json$/.test(p)) return 'json';
  return 'other';
};

const median = (a) => {
  const v = [...a].sort((x, y) => x - y);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
};
const pct = (a, q) => {
  const v = [...a].sort((x, y) => x - y);
  return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : 0;
};

/** Runs inside the page before any script: records long tasks, paints and the moments the landing becomes visible and usable. */
const INIT = () => {
  const w = window;
  w.__wp = { long: [], paint: {}, lcp: 0, ready: 0, usable: 0, loaded: 0, support: '', errors: [] };
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__wp.long.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__wp.paint[e.name] = e.startTime))).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__wp.lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {
    w.__wp.errors.push(String(e));
  }
  w.addEventListener('error', (e) => w.__wp.errors.push(String(e.message)));
  const poll = () => {
    const root = document.querySelector('.wu');
    const now = performance.now();
    if (root) {
      if (!w.__wp.ready && root.dataset.ready === '1') w.__wp.ready = now;
      const go = document.querySelector('.wu-go');
      if (!w.__wp.usable && go && go.getAttribute('aria-disabled') === 'false') {
        w.__wp.usable = now;
        w.__wp.support = root.dataset.support;
      }
      if (!w.__wp.loaded && root.dataset.load === 'done' && root.dataset.support !== 'checking' && w.__wp.usable) w.__wp.loaded = now;
    }
    if (!w.__wp.usable) requestAnimationFrame(poll);
    else setTimeout(poll, 50);
  };
  document.addEventListener('DOMContentLoaded', poll);
  poll();
};

async function loadOnce(profile) {
  const browser = await launch(); // a new browser per load: its GPU process and shader cache start cold, as a first visit does
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(INIT);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (profile === 'slow') {
    await cdp.send('Network.emulateNetworkConditions', FAST_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  const reqs = new Map();
  let t0 = null;
  cdp.on('Network.requestWillBeSent', (e) => {
    if (t0 === null) t0 = e.timestamp;
    reqs.set(e.requestId, { url: e.request.url, start: e.timestamp - t0, end: null, bytes: 0, status: 0 });
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = reqs.get(e.requestId);
    if (r) r.status = e.response.status;
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (r) {
      r.end = e.timestamp - t0;
      r.bytes = e.encodedDataLength;
      if (r.bytes > 1000 && r.url.startsWith('http')) perUrl.set(r.url, (perUrl.get(r.url) ?? 0) + 1);
    }
  });
  const failed = [];
  const perUrl = new Map();
  const errors = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  const external = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') external.push(r.url());
  });

  const t = Date.now();
  await page.goto(URL_BASE, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__wp?.usable > 0, null, { timeout: 180_000, polling: 100 });
  const usableWall = Date.now() - t;
  // A page that loads the town after it is usable (WU_WAIT_TOWN=1) writes the mark `wu:town` when the town stands in the scene: wait for it, and for what it still downloads.
  if (process.env.WU_WAIT_TOWN === '1') await page.waitForFunction(() => performance.getEntriesByName('wu:town').length > 0, null, { timeout: 120_000, polling: 100 }).catch(() => undefined);
  await page.waitForTimeout(3000); // anything still downloading after the page is usable (idle prefetch) shows up here
  const wp = await page.evaluate(() => window.__wp);
  const marks = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('wu:')).map((m) => [m.name.slice(3), Math.round(m.startTime)])));
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, responseEnd: n.responseEnd };
  });
  const sumTo = (limit) => {
    const out = {};
    let total = 0;
    for (const r of reqs.values()) {
      if (r.end === null || r.end > limit || !r.url.startsWith('http')) continue;
      const k = kind(r.url);
      out[k] = out[k] ?? { n: 0, kb: 0 };
      out[k].n += 1;
      out[k].kb += r.bytes / 1024;
      total += r.bytes;
    }
    for (const v of Object.values(out)) v.kb = +v.kb.toFixed(1);
    return { byKind: out, totalKb: +(total / 1024).toFixed(1) };
  };
  // CDP timestamps are seconds since the document request; page.now() counts from the navigation start, the same moment within a few ms.
  const usableAt = wp.usable / 1000;
  const longTo = (limit) => wp.long.filter(([s]) => s <= limit);
  const tbt = (limit) => longTo(limit).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
  const result = {
    profile,
    fcpMs: Math.round(wp.paint['first-contentful-paint'] ?? 0),
    fpMs: Math.round(wp.paint['first-paint'] ?? 0),
    lcpMs: Math.round(wp.lcp),
    revealMs: Math.round(wp.ready),
    usableMs: Math.round(wp.usable),
    usableWallMs: usableWall,
    loadedMs: Math.round(wp.loaded || wp.usable),
    support: wp.support,
    marks,
    dclMs: Math.round(nav.dcl),
    loadEventMs: Math.round(nav.load),
    beforeUsable: sumTo(usableAt),
    afterUsable3s: sumTo(usableAt + 3),
    townMs: marks.town ?? null,
    beforeTown: marks.town ? sumTo(marks.town / 1000) : null,
    all: sumTo(Infinity),
    longTasksToUsable: { n: longTo(wp.usable).length, tbtMs: Math.round(tbt(wp.usable)), maxMs: Math.round(Math.max(0, ...longTo(wp.usable).map(([, d]) => d))) },
    longTasksToFcp: { n: longTo(wp.paint['first-contentful-paint'] ?? 0).length, tbtMs: Math.round(tbt(wp.paint['first-contentful-paint'] ?? 0)) },
    longTasksAll: { n: wp.long.length, tbtMs: Math.round(tbt(Infinity)) },
    // What happens on the main thread once the page is usable: the town's models being built (a page that defers the town), before the 3 s idle wait ends.
    longListAfterUsable: wp.long.filter(([s]) => s > wp.usable).map(([s, d]) => [Math.round(s), Math.round(d)]),
    longTasksAfterUsable: { n: wp.long.filter(([s]) => s > wp.usable).length, tbtMs: Math.round(tbt(Infinity) - tbt(wp.usable)), maxMs: Math.round(Math.max(0, ...wp.long.filter(([s]) => s > wp.usable).map(([, d]) => d))) },
    duplicateDownloads: [...perUrl.entries()].filter(([, n]) => n > 1).map(([u]) => u.replace(URL_BASE, '')),
    errors,
    failed,
    external,
    files: [...reqs.values()].filter((r) => r.end !== null).map((r) => ({ url: r.url.replace(URL_BASE, ''), kb: +(r.bytes / 1024).toFixed(1), endMs: Math.round(r.end * 1000) })),
  };
  await browser.close();
  return result;
}

/** Frame cadence of the page (requestAnimationFrame) and the renderer's actual draws, idle on the landing and in the 2D preview with the pointer moving. */
async function frameRates(profile) {
  const browser = await launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (profile === 'slow') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`${URL_BASE}?debug`, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('.wu-go')?.getAttribute('aria-disabled') === 'false' && window.__world, null, { timeout: 180_000, polling: 100 });
  await page.waitForTimeout(2500); // the landing's own entrance and the first draws settle
  const sample = (ms, move) =>
    page.evaluate(
      ([ms, move]) =>
        new Promise((resolve) => {
          const r = window.__world.renderer;
          const f0 = r.info.render.frame;
          const times = [];
          const start = performance.now();
          let last = 0;
          const tick = (now) => {
            if (last) times.push(now - last);
            last = now;
            if (move) {
              const a = (now / 700) % (Math.PI * 2);
              window.dispatchEvent(new PointerEvent('pointermove', { clientX: 640 + Math.cos(a) * 300, clientY: 360 + Math.sin(a) * 160, bubbles: true }));
            }
            if (now - start < ms) requestAnimationFrame(tick);
            else resolve({ times, draws: r.info.render.frame - f0, secs: (now - start) / 1000, calls: r.info.render.calls, tris: r.info.render.triangles });
          };
          requestAnimationFrame(tick);
        }),
      [ms, move],
    );
  const summarise = (s) => ({
    rafFps: +(s.times.length / s.secs).toFixed(1),
    rafP50Ms: +median(s.times).toFixed(1),
    rafP95Ms: +pct(s.times, 0.95).toFixed(1),
    rafMaxMs: +Math.max(...s.times).toFixed(1),
    over20ms: s.times.filter((x) => x > 20).length,
    drawsPerSec: +(s.draws / s.secs).toFixed(1),
    calls: s.calls,
    tris: s.tris,
  });
  const idle = summarise(await sample(5000, false));
  await page.getByRole('button', { name: /preview in this browser/i }).first().click();
  await page.waitForTimeout(1800);
  const preview = summarise(await sample(5000, true));
  const previewRest = summarise(await sample(3000, false));
  await browser.close();
  return { profile, idleLanding: idle, previewPointerMoving: preview, previewAtRest: previewRest };
}

/**
 * A new browser per measurement, so no shader of ours is cached, but with its GPU process already started by a trivial WebGL page of
 * another origin-less document: a real visitor's browser is running already, and the cold start of Chromium's own GPU process is not the page's cost.
 */
const launch = async () => {
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-precise-memory-info', '--disable-background-timer-throttling'],
  });
  const page = await browser.newPage();
  await page.setContent('<canvas id="c" width="64" height="64"></canvas>');
  await page.evaluate(() => {
    const gl = document.getElementById('c').getContext('webgl2');
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, ['#version 300 es', 'void main(){gl_Position=vec4(0.,0.,0.,1.);gl_PointSize=4.;}'].join('\n')));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, ['#version 300 es', 'precision mediump float;out vec4 o;void main(){o=vec4(1.);}'].join('\n')));
    gl.linkProgram(p); gl.useProgram(p); gl.drawArrays(gl.POINTS, 0, 1); gl.getProgramParameter(p, gl.LINK_STATUS);
  });
  await page.waitForTimeout(400);
  await page.close();
  return browser;
};
const out = { label: LABEL, url: URL_BASE, when: new Date().toISOString(), runs: {}, frames: {} };
for (const profile of PROFILES) {
  out.runs[profile] = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await loadOnce(profile);
    out.runs[profile].push(r);
    console.log(
      `${profile} #${i + 1}: FCP ${r.fcpMs} ms, marks ${JSON.stringify(r.marks)}, reveal ${r.revealMs}, usable ${r.usableMs} ms, loaded ${r.loadedMs}; before usable ${r.beforeUsable.totalKb} KB (${JSON.stringify(Object.fromEntries(Object.entries(r.beforeUsable.byKind).map(([k, v]) => [k, v.kb])))}); TBT to usable ${r.longTasksToUsable.tbtMs} ms (${r.longTasksToUsable.n} tasks, max ${r.longTasksToUsable.maxMs}); total ${r.all.totalKb} KB; errors ${r.errors.length}`,
    );
  }
  out.frames[profile] = await frameRates(profile);
  console.log(profile, 'frames', JSON.stringify(out.frames[profile]));
}
mkdirSync('.tmp/webperf', { recursive: true });
writeFileSync(`.tmp/webperf/${LABEL}.json`, JSON.stringify(out, null, 1));
const med = (profile, f) => median(out.runs[profile].map(f));
for (const profile of PROFILES) {
  console.log(
    `\n${profile} median of ${RUNS}: FCP ${med(profile, (r) => r.fcpMs)} ms | usable ${med(profile, (r) => r.usableMs)} ms | KB before usable ${med(profile, (r) => r.beforeUsable.totalKb)} | TBT to usable ${med(profile, (r) => r.longTasksToUsable.tbtMs)} ms`,
  );
}
