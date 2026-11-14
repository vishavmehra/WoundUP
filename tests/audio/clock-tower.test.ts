import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../../src/audio/engine';
import { bindClockTowerAudio } from '../../src/audio/clock-tower';
import { ClockTowerEvents, ClockTowerRuntime } from '../../src/machines/clock-tower';
import { asContext, FakeAudioContext } from './fake-context';

function engine() {
  const ctx = new FakeAudioContext();
  const audio = new AudioEngine({ createContext: () => asContext(ctx) });
  return { ctx, audio };
}

describe('the Clock Tower sounds', () => {
  it('are silent no-ops before a gesture and then ring the bell and tick the pendulum, every voice stopped', () => {
    const { ctx, audio } = engine();
    expect(() => {
      audio.bell(1, 12);
      audio.tick(0);
    }).not.toThrow();
    expect(ctx.nodes).toEqual([]);
    audio.unlock();
    const built = ctx.nodes.length;
    audio.bell(1, 2);
    const oscillators = ctx.ofKind('oscillator');
    expect(oscillators.length).toBeGreaterThanOrEqual(7); // the bell is several partials, not one tone
    audio.tick(1);
    expect(ctx.nodes.length).toBeGreaterThan(built);
    expect(ctx.leaks()).toEqual([]);
  });

  it('ring the last strike of the hour a little longer than the others', () => {
    const { ctx, audio } = engine();
    audio.unlock();
    audio.bell(1, 3);
    const stops = (): number => Math.max(...ctx.ofKind('oscillator').map((o) => o.stoppedAt ?? 0));
    const first = stops();
    audio.bell(3, 3);
    expect(stops()).toBeGreaterThan(first);
  });

  it('follow the tower: a tick per beat while it runs and a bell per strike, and nothing after the binding is removed', () => {
    const { audio } = engine();
    const tick = vi.spyOn(audio, 'tick');
    const bell = vi.spyOn(audio, 'bell');
    const events = new ClockTowerEvents();
    let now = new Date(2026, 10, 14, 10, 59, 55).getTime(); // local time: the hour is the local hour
    const runtime = new ClockTowerRuntime(() => now, events);
    const off = bindClockTowerAudio(audio, events);
    runtime.powered = true;
    for (let i = 0; i < 100; i++) {
      runtime.update();
      now += 100; // 10 s across the hour, a frame every tenth of a second
    }
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(8);
    expect(new Set(tick.mock.calls.map((c) => c[0]))).toEqual(new Set([0, 1])); // tick and tock alternate
    expect(bell.mock.calls.length).toBeGreaterThanOrEqual(1); // the hour struck inside the ten seconds
    for (const [index, total] of bell.mock.calls) expect(index).toBeLessThanOrEqual(total);
    off();
    const seen = bell.mock.calls.length;
    runtime.triggerStrikes(2);
    expect(bell).toHaveBeenCalledTimes(seen);
  });
});
