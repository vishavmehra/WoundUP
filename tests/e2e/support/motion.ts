/**
 * Motion check: do the turning parts of a running machine actually turn in the live scene graph, at the speed and in the direction
 * the solver says? The sampling runs inside the page, one reading per XR frame, on the world orientation of each rotor's node (the
 * thing the renderer draws), not on the rotor's own angle counter. Speeds come from the angle the node swept between the first and
 * last frame divided by the XR clock between them.
 */
import type { Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- reaches into the ?debug world handle */

export interface RotorReading {
  socket: string;
  node: string;
  /** Meshes under the node, and whether every node on the way up to the scene is visible. */
  meshes: number;
  visible: boolean;
  /** Measured angular speed about the node's own turning axis, rad/s (signed, counter-clockwise looking down the axis towards the origin is positive). */
  measured: number;
  /** The solver's angular velocity for this socket times the rig's eased run factor (what the game feeds the rotor), rad/s. */
  expected: number;
  /** Measured over expected; null when the solver says the part does not turn. */
  ratio: number | null;
  /** How far the turning axis is from the machine's +X axis, 1 when parallel, -1 when opposite. Meshing gears are compared on a common axis. */
  alongMachineX: number;
  /** Total angle swept in the window, radians (unwrapped). */
  swept: number;
}

export interface BobberReading {
  index: number;
  /** Fitted amplitude of y = base + A sin(theta + phase) against the platform's measured angle, metres; and the fit's R squared. */
  amplitude: number;
  rSquared: number;
  /** Fitted phase, radians. */
  phase: number;
  /** Peak-to-peak travel actually seen, metres. */
  travel: number;
}

export interface MotionReport {
  machine: string;
  seconds: number;
  frames: number;
  runFactorMin: number;
  runFactorMax: number;
  running: boolean;
  status: string | null;
  rotors: RotorReading[];
  bobbers: BobberReading[];
}

/**
 * Waits for the machine's run factor to reach `minSpeed` (the rig eases up over about 2.5 seconds), then samples every XR frame for
 * `seconds` of the XR clock.
 */
export async function measureMotion(page: Page, machine: string, seconds: number, minSpeed = 0.97): Promise<MotionReport> {
  return page.evaluate(
    ({ machine, seconds, minSpeed }) =>
      new Promise<MotionReport>((resolve, reject) => {
        const w = (window as any).__world;
        const session = w.session;
        const rig = (window as any).__wu.town.rigOf(machine);
        if (!rig) return reject(new Error(`the town has no rig for ${machine}`));
        const Q = w.camera.quaternion.constructor;
        const V = w.camera.position.constructor;
        const qNow = new Q();
        const rotors = rig.rotors.map((r: any) => {
          const node = r.node;
          node.updateWorldMatrix(true, false);
          const q0 = node.getWorldQuaternion(new Q());
          const local = r.axis === 'x' ? new V(1, 0, 0) : r.axis === 'y' ? new V(0, 1, 0) : new V(0, 0, 1);
          return { r, node, last: q0.clone(), axis: local.applyQuaternion(q0).normalize(), swept: 0, t0: 0, t1: 0, meshes: 0, visible: true };
        });
        const machineX = new V(1, 0, 0).applyQuaternion(rig.root.getWorldQuaternion(new Q())).normalize();
        for (const s of rotors) {
          s.node.traverse((n: any) => {
            if (n.isMesh) s.meshes++;
          });
          for (let n = s.node; n; n = n.parent) if (n.visible === false) s.visible = false;
        }
        const bobbers = rig.bobbers.map((b: any) => ({ b, ys: [] as number[], thetas: [] as number[] }));
        const driver = rig.rotors.length ? rotors.find((s: any) => rig.bobbers[0] && s.r === rig.bobbers[0].driver) : null;
        let driverSwept = 0;
        let start = -1;
        let frames = 0;
        let lo = Infinity;
        let hi = -Infinity;
        const q = new Q();
        const inv = new Q();
        const dq = new Q();
        const began = performance.now();
        const tick = (now: number) => {
          if (start < 0) {
            if (rig.speed < minSpeed) {
              if (performance.now() - began > 25_000) {
                return reject(new Error(`${machine}: the run factor never reached ${minSpeed} in 25 s (running ${rig.running}, speed ${rig.speed}, solver ${rig.result?.status ?? 'none'}, runSeconds ${rig.result?.runSeconds}, continuous ${rig.result?.continuous}, rotors ${rig.rotors.length}; all rigs ${JSON.stringify((window as any).__wu.town.rigs.map((r: any) => [r.machineId, r.running, +r.speed.toFixed(3)]))}; state ${JSON.stringify((window as any).__wu.state())})`));
              }
              return void session.requestAnimationFrame(tick);
            }
            start = now;
            for (const s of rotors) {
              s.node.getWorldQuaternion(s.last);
              s.t0 = now;
            }
          }
          frames++;
          lo = Math.min(lo, rig.speed);
          hi = Math.max(hi, rig.speed);
          for (const s of rotors) {
            s.node.getWorldQuaternion(qNow);
            inv.copy(s.last).invert();
            dq.copy(qNow).multiply(inv);
            // The world-frame rotation since the last frame, projected on the node's own axis (a rotation about it leaves it alone).
            const dot = dq.x * s.axis.x + dq.y * s.axis.y + dq.z * s.axis.z;
            const sign = dq.w < 0 ? -1 : 1;
            const step = 2 * Math.atan2(sign * dot, sign * dq.w);
            s.swept += step;
            s.last.copy(qNow);
            s.t1 = now;
            if (s === driver) driverSwept = s.swept;
          }
          for (const o of bobbers) {
            o.ys.push(o.b.node.position.y);
            o.thetas.push(driverSwept);
          }
          if (now - start < seconds * 1000) return void session.requestAnimationFrame(tick);
          q.identity();
          const readings = rotors.map((s: any) => {
            const dt = (s.t1 - s.t0) / 1000;
            const measured = dt > 0 ? s.swept / dt : 0;
            const solver = rig.result?.angularVelocity?.[s.r.socketId] ?? 0;
            const expected = solver * ((lo + hi) / 2);
            return {
              socket: s.r.socketId,
              node: s.node.name,
              meshes: s.meshes,
              visible: s.visible,
              measured,
              expected,
              ratio: Math.abs(expected) > 1e-9 ? measured / expected : null,
              alongMachineX: s.axis.dot(machineX),
              swept: s.swept,
            };
          });
          const fits = bobbers.map((o: any, index: number) => {
            // y = c + a sin(theta) + b cos(theta), least squares through the normal equations.
            const n = o.ys.length;
            let sy = 0, ss = 0, sc = 0, sss = 0, scc = 0, ssc = 0, ssy = 0, scy = 0;
            for (let i = 0; i < n; i++) {
              const s = Math.sin(o.thetas[i]);
              const c = Math.cos(o.thetas[i]);
              sy += o.ys[i]; ss += s; sc += c; sss += s * s; scc += c * c; ssc += s * c; ssy += s * o.ys[i]; scy += c * o.ys[i];
            }
            const m = [[n, ss, sc], [ss, sss, ssc], [sc, ssc, scc]];
            const rhs = [sy, ssy, scy];
            const det = (a: number[][]) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
            const d = det(m);
            const solve = (col: number) => det(m.map((row, i) => row.map((v, j) => (j === col ? rhs[i] : v)))) / d;
            const c0 = solve(0), a = solve(1), b = solve(2);
            const mean = sy / n;
            let ssRes = 0, ssTot = 0, min = Infinity, max = -Infinity;
            for (let i = 0; i < n; i++) {
              const fit = c0 + a * Math.sin(o.thetas[i]) + b * Math.cos(o.thetas[i]);
              ssRes += (o.ys[i] - fit) ** 2;
              ssTot += (o.ys[i] - mean) ** 2;
              min = Math.min(min, o.ys[i]);
              max = Math.max(max, o.ys[i]);
            }
            return { index, amplitude: Math.hypot(a, b), rSquared: ssTot > 0 ? 1 - ssRes / ssTot : 0, phase: Math.atan2(b, a), travel: max - min };
          });
          resolve({
            machine,
            seconds: (now - start) / 1000,
            frames,
            runFactorMin: lo,
            runFactorMax: hi,
            running: rig.running,
            status: rig.result?.status ?? null,
            rotors: readings,
            bobbers: fits,
          });
        };
        session.requestAnimationFrame(tick);
      }),
    { machine, seconds, minSpeed },
  );
}

/* eslint-enable @typescript-eslint/no-explicit-any */

const within = (value: number, target: number, tolerance: number): boolean => Math.abs(value - target) <= tolerance * Math.abs(target);
const fmt = (n: number): string => n.toFixed(3);

/**
 * Judges a Music Box reading. Returns what is wrong, one sentence each; an empty list means every turning part turns at the speed
 * and in the direction the solver gives (within 10 %), and the gears that mesh turn against each other at the tooth ratio.
 */
export function checkMusicBox(report: MotionReport): string[] {
  const bad: string[] = [];
  const by = new Map(report.rotors.map((r) => [r.socket, r]));
  const turning = ['main_spring', 'spring_pinion', 'cylinder_wheel', 'arbor', 'cylinder', 'governor_wheel', 'governor_pinion', 'governor'];
  if (report.status !== 'runs') bad.push(`solver status is ${report.status}, not runs`);
  if (report.runFactorMin < 0.9) bad.push(`run factor dipped to ${fmt(report.runFactorMin)} during the window`);
  for (const id of turning) {
    const r = by.get(id);
    if (!r) {
      bad.push(`${id}: the rig has no rotor for it`);
      continue;
    }
    if (r.meshes === 0) bad.push(`${id}: node ${r.node} has no mesh under it`);
    if (!r.visible) bad.push(`${id}: node ${r.node} or an ancestor is hidden`);
    if (Math.abs(r.alongMachineX) < 0.99) bad.push(`${id}: turns about an axis ${fmt(r.alongMachineX)} along the machine's X, not the shared one`);
    if (r.ratio === null) bad.push(`${id}: solver gives no speed`);
    else if (!within(r.measured, r.expected, 0.1)) bad.push(`${id}: measured ${fmt(r.measured)} rad/s, solver ${fmt(r.expected)} rad/s (ratio ${fmt(r.ratio)})`);
  }
  const speed = (id: string): number => (by.get(id)?.measured ?? 0) * Math.sign(by.get(id)?.alongMachineX ?? 1); // on the common machine axis
  const mesh = (pinion: string, wheel: string, teethPinion: number, teethWheel: number): void => {
    const ratio = Math.abs(speed(pinion)) / Math.max(Math.abs(speed(wheel)), 1e-9);
    const want = teethWheel / teethPinion;
    if (!within(ratio, want, 0.1)) bad.push(`${pinion} / ${wheel}: speed ratio ${fmt(ratio)}, tooth ratio ${teethWheel}/${teethPinion} = ${fmt(want)}`);
    if (speed(pinion) * speed(wheel) >= 0) bad.push(`${pinion} and ${wheel} mesh but turn the same way (${fmt(speed(pinion))}, ${fmt(speed(wheel))})`);
  };
  mesh('spring_pinion', 'cylinder_wheel', 10, 20);
  mesh('governor_pinion', 'governor_wheel', 12, 16);
  for (const id of ['arbor', 'cylinder', 'governor_wheel']) {
    if (!within(speed(id), speed('cylinder_wheel'), 0.1)) bad.push(`${id} turns at ${fmt(speed(id))}, but it is on the 20-tooth wheel's shaft (${fmt(speed('cylinder_wheel'))})`);
  }
  return bad;
}

/** Judges a Carousel reading: the platform turns at the solver's speed, and each horse rises and falls once per platform turn. */
export function checkCarousel(report: MotionReport): string[] {
  const bad: string[] = [];
  if (report.status !== 'runs') bad.push(`solver status is ${report.status}, not runs`);
  const platform = report.rotors.find((r) => r.socket === 'platform');
  if (!platform) bad.push('the rig has no platform rotor');
  else {
    if (platform.meshes === 0 || !platform.visible) bad.push(`platform: meshes ${platform.meshes}, visible ${platform.visible}`);
    if (platform.ratio === null) bad.push('platform: solver gives no speed');
    else if (!within(platform.measured, platform.expected, 0.1)) bad.push(`platform: measured ${fmt(platform.measured)} rad/s, solver ${fmt(platform.expected)} rad/s`);
  }
  if (report.bobbers.length !== 3) bad.push(`expected 3 horses, the rig has ${report.bobbers.length}`);
  const phases: number[] = [];
  for (const b of report.bobbers) {
    if (!within(b.amplitude, 0.006, 0.1)) bad.push(`horse ${b.index}: amplitude ${fmt(b.amplitude * 1000)} mm, expected 6 mm`);
    if (b.rSquared < 0.98) bad.push(`horse ${b.index}: height is not one sine per platform turn (R2 ${fmt(b.rSquared)})`);
    phases.push(b.phase);
  }
  phases.sort((a, b) => a - b);
  for (let i = 0; i < phases.length; i++) {
    const gap = (phases[(i + 1) % phases.length] - phases[i] + 2 * Math.PI) % (2 * Math.PI);
    if (Math.abs(gap - (2 * Math.PI) / 3) > 0.26) bad.push(`horse phases are not a third of a turn apart (gap ${fmt((gap * 180) / Math.PI)} degrees)`);
  }
  return bad;
}

/** Judges a Windmill reading: the sails and the millstone turn at the solver's speeds. */
export function checkWindmill(report: MotionReport): string[] {
  const bad: string[] = [];
  if (report.status !== 'runs') bad.push(`solver status is ${report.status}, not runs`);
  for (const id of ['rotor', 'millstone']) {
    const r = report.rotors.find((x) => x.socket === id);
    if (!r) {
      bad.push(`${id}: the rig has no rotor for it`);
      continue;
    }
    if (r.meshes === 0 || !r.visible) bad.push(`${id}: meshes ${r.meshes}, visible ${r.visible}`);
    if (r.ratio === null) bad.push(`${id}: solver gives no speed`);
    else if (!within(r.measured, r.expected, 0.1)) bad.push(`${id}: measured ${fmt(r.measured)} rad/s, solver ${fmt(r.expected)} rad/s`);
  }
  return bad;
}
