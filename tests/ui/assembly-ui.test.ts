import { PokeInteractable, RayInteractable, World } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Raycaster, Scene } from 'three';
import type { Intersection } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { SAVE_KEY, parseSave, type Difficulty } from '../../src/game/save';
import { GameSession } from '../../src/game/session';
import { Socket } from '../../src/interaction/components';
import { setGazeModeFlag } from '../../src/interaction/gaze-state';
import { setXRayLens, writeXRayFlag } from '../../src/interaction/xray-state';
import { HELPER_BREATH_S, HELPER_COOLDOWN_S, type HelperView } from '../../src/ui/assembly';
import { DIFFICULTY_CARD, DIFFICULTY_COPY, DIFFICULTY_ROW, HELPER_COPY, SETTING_ROWS } from '../../src/ui/copy';
import { FlowUi, type AssemblyOptions, type FlowEvent } from '../../src/ui/flow-ui';
import { HELPER_SPOT, PANEL_SPOT } from '../../src/ui/layout';
import { PX_PER_M } from '../../src/ui/paint';
import { FakeStorage } from '../game/helpers';
import { viewAt } from './assembly-fixtures';
import { canvasFactory } from './fake-canvas';

/**
 * The intricate-assembly UI (ADR-050) against a real IWSDK World, with the same hand-built stand-ins for the six workshop GLBs as flow-ui.test.ts:
 * the first-build difficulty card, the Helper medallion and its timings, the step sheet and Master's "?", and the Pause row. Clicks and pointer
 * events are dispatched on the objects the way IWSDK's pointer-events do.
 */

const hinge = (axis: string, openDeg: number): object => ({ type: 'pivot', kind: 'hinge', axis, closedDeg: 0, openDeg });
const empty = (name: string, wu: object, at: [number, number, number] = [0, 0, 0]): Object3D => {
  const o = new Object3D();
  o.name = name;
  o.userData.wu = wu;
  o.position.set(...at);
  return o;
};
const slab = (w: number, h: number, d: number): Mesh => new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial());

function props(): Record<string, Object3D> {
  const trunk = new Group();
  trunk.name = 'trunk_main';
  trunk.add(slab(0.3, 0.14, 0.24), empty('PIV_Lid', hinge('+X', -95), [0, 0.14, -0.12]), empty('COL_Latch', { type: 'collider', shape: 'sphere', purpose: 'latch' }, [0, 0.138, 0.125]));
  const envelope = new Group();
  envelope.name = 'letter_envelope';
  envelope.add(slab(0.1, 0.004, 0.08), empty('PIV_Flap', hinge('+X', -160)), empty('COL_Pinch', { type: 'collider', shape: 'box', purpose: 'pinch' }));
  const parcel = new Group();
  parcel.name = 'parcel';
  parcel.add(slab(0.1, 0.05, 0.08), empty('PIV_Flap', hinge('+X', -105)), empty('COL_Open', { type: 'collider', shape: 'box', purpose: 'open' }));
  const tray = new Group();
  tray.name = 'parts_tray';
  for (let i = 1; i <= 8; i++) tray.add(empty(`SOCKET_Slot0${i}`, { type: 'socket', accepts: ['part'] }, [0.03 * (i % 2), 0.006, -0.08 + 0.02 * i]));
  const sheet = new Group();
  sheet.name = 'blueprint_sheet';
  sheet.add(slab(0.108, 0.004, 0.188));
  const bench = new Group();
  bench.name = 'workbench';
  bench.add(slab(0.45, 0.03, 0.25));
  return { trunk, envelope, parcel, tray, sheet, bench };
}

const propKey = (path: string): string => (path.includes('trunk') ? 'trunk' : path.includes('envelope') ? 'envelope' : path.includes('parcel') ? 'parcel' : path.includes('tray') ? 'tray' : path.includes('sheet') ? 'sheet' : 'bench');

interface Rig {
  world: World;
  ui: FlowUi;
  game: GameSession;
  storage: FakeStorage;
  events: FlowEvent[];
  stage: Entity;
  scene: Scene;
  canvases: ReturnType<typeof canvasFactory>;
}

interface RigOptions {
  assembly?: AssemblyOptions;
  /** Runs on the new session before the UI exists (a returning player's saved difficulty). */
  difficulty?: Difficulty;
}

const ON: AssemblyOptions = { enabled: true, deepBuild: (letter) => letter?.id === 'letter_1' };

async function rig(options: RigOptions = {}): Promise<Rig> {
  const world = new World();
  for (const component of [RayInteractable, PokeInteractable, Socket]) world.registerComponent(component);
  const scene = new Scene();
  Object.assign(world, { scene, input: { xr: { gazeEnabled: false } } });
  const stage = world.createTransformEntity(new Group());
  scene.add(stage.object3D as Object3D);
  const storage = new FakeStorage();
  const game = new GameSession({ storage });
  if (options.difficulty) game.setDifficulty(options.difficulty);
  const events: FlowEvent[] = [];
  const canvases = canvasFactory();
  const files = props();
  const ui = new FlowUi(world, {
    session: game,
    stage,
    townScale: () => 1,
    loadGlb: async (path) => files[propKey(path)],
    onEvent: (e) => events.push(e),
    createCanvas: canvases.make,
    head: (out) => out.set(0, 0.4, 0.55),
    assembly: options.assembly,
  });
  await ui.init();
  return { world, ui, game, storage, events, stage, scene, canvases };
}

const FRAME = 1 / 72;
const run = (r: Rig, seconds: number): void => {
  for (let t = 0; t < seconds; t += FRAME) r.ui.update(FRAME);
};
const find = (r: Rig, name: string) => {
  const p = r.ui.pressables().find((x) => x.name === name);
  if (!p) throw new Error(`no pressable ${name}`);
  return p;
};
const click = (r: Rig, name: string): boolean => {
  const p = find(r, name);
  p.object.dispatchEvent({ type: 'click', object: p.object } as never);
  return p.active;
};
const pointer = (r: Rig, name: string, type: 'pointerdown' | 'pointerup' | 'pointerleave'): void => {
  const p = find(r, name);
  p.object.dispatchEvent({ type, object: p.object } as never);
};
const live = (r: Rig): string[] => r.ui.pressables().filter((p) => p.active).map((p) => p.name).sort();
const visible = (r: Rig, name: string): boolean => {
  let on = false;
  r.scene.traverse((o) => {
    if (o.name !== name) return;
    let v = true;
    for (let n: Object3D | null = o; n; n = n.parent) v = v && n.visible;
    on = on || v;
  });
  return on;
};
const last = <T>(list: readonly T[]): T => list[list.length - 1];
const real = (r: Rig): FlowEvent[] => r.events.filter((e) => e.type !== 'cue');
const helperEvents = (r: Rig): FlowEvent[] => r.events.filter((e) => e.type === 'helper');
const object = (r: Rig, name: string): Object3D => r.scene.getObjectByName(name) as Object3D;
/** The text painted by `act`, on any surface (a surface keeps what it drew before, so a change is the difference). */
const painted = (r: Rig, act: () => void): string[] => {
  const before = r.canvases.made.map((c) => c.calls.length);
  act();
  return r.canvases.made.flatMap((c, i) => c.calls.slice(before[i] ?? 0).map((t) => t.text));
};
const allText = (r: Rig): string[] => r.canvases.made.flatMap((c) => c.calls.map((t) => t.text));

const toBuild = async (r: Rig): Promise<void> => {
  const latch = r.scene.getObjectByName('COL_Latch_proxy') as Object3D;
  find(r, 'trunk_main').object.dispatchEvent({ type: 'click', object: latch } as never);
  run(r, 3.2);
  click(r, 'letter_envelope');
  run(r, 1);
  click(r, 'UI_Accept');
  run(r, 1.2);
};
/** The parcel is opened and the director has set the Music Box's sheet out (what `parcel-opened` does in gameplay.ts). */
const toParcel = async (r: Rig, done = 0): Promise<void> => {
  await toBuild(r);
  click(r, 'parcel');
  run(r, 1.2);
  r.ui.showBlueprint({ title: 'Music Box', slots: [{ id: 'case', label: 'Case' }] });
  r.ui.setAssembly(viewAt(done));
};

afterEach(() => {
  setXRayLens(false);
  writeXRayFlag(false, null);
  setGazeModeFlag(false);
});

describe('without the assembly option the UI is today\'s (the INTRICATE_ASSEMBLY fallback)', () => {
  it('asks no question, shows no Helper and ignores a step list', async () => {
    const r = await rig();
    await toBuild(r);
    expect(r.ui.currentView?.panel).toBe('none');
    expect(live(r)).toEqual(['UI_Lens', 'UI_Pause', 'parcel']);
    click(r, 'parcel');
    run(r, 1);
    r.ui.showBlueprint({ title: 'Music Box', slots: [] });
    r.ui.setAssembly(viewAt(3)); // ignored
    expect(visible(r, 'UI_Helper')).toBe(false);
    expect(find(r, 'UI_Helper').active).toBe(false);
    expect(find(r, 'UI_StepHelp').active).toBe(false);
    expect(allText(r)).not.toContain('4. Right bracket');
    expect(live(r)).toEqual(['UI_Lens', 'UI_Pause']);
  });

  it('also when enabled but the build has no stages: no card, no Helper', async () => {
    const r = await rig({ assembly: { enabled: true, deepBuild: () => false } });
    await toBuild(r);
    expect(r.ui.currentView?.panel).toBe('none');
    expect(r.game.save.settings.difficulty).toBeNull();
    expect(live(r)).toEqual(['UI_Lens', 'UI_Pause', 'parcel']);
    click(r, 'UI_Pause');
    expect(live(r)).not.toContain('UI_Difficulty'); // nothing chosen, nothing to change
  });
});

describe('the first-build difficulty card', () => {
  it('stands over the closed parcel with the three levels, Standard recommended, and nothing else answers', async () => {
    const r = await rig({ assembly: ON });
    await toBuild(r);
    const text = allText(r);
    expect(r.game.mode).toBe('build');
    expect(r.ui.currentView?.panel).toBe('difficulty');
    expect(live(r)).toEqual(['UI_Difficulty_master', 'UI_Difficulty_relaxed', 'UI_Difficulty_standard']); // Pause, the lens and the parcel wait
    for (const d of ['relaxed', 'standard', 'master'] as const) {
      expect(text).toContain(DIFFICULTY_COPY[d].name);
      expect(text).toContain(DIFFICULTY_COPY[d].time);
    }
    expect(text.join(' ')).toContain('The full workshop. Every pin and washer.');
    expect(text).toContain(DIFFICULTY_CARD.recommended);
    expect(text).toContain(DIFFICULTY_CARD.title);
    expect(text).toContain(DIFFICULTY_CARD.note);
    expect(visible(r, 'UI_Difficulty_standard')).toBe(true);
    expect(visible(r, 'UI_PanelLeft')).toBe(false); // the pause panel's buttons are not on the card
    expect(visible(r, 'UI_Toggle_easySnap')).toBe(false);
    expect(visible(r, 'UI_Difficulty')).toBe(false); // the Pause row is not the card's
  });

  it('lists the three choices top to bottom inside the panel, evenly spaced', async () => {
    const r = await rig({ assembly: ON });
    await toBuild(r);
    const ys = ['relaxed', 'standard', 'master'].map((d) => object(r, `UI_Difficulty_${d}`).position.y);
    expect(ys[0]).toBeGreaterThan(ys[1]);
    expect(ys[1]).toBeGreaterThan(ys[2]);
    expect(ys[0] - ys[1]).toBeCloseTo(ys[1] - ys[2], 9);
    const panel = object(r, 'UI_Difficulty_standard').parent as Object3D;
    expect(panel.position.y).toBeCloseTo(PANEL_SPOT.y, 9);
    const base = (panel.children.find((c) => c instanceof Mesh && c.visible && !c.name) as Mesh).geometry as unknown as { parameters: { height: number; width: number } };
    for (const y of ys) expect(Math.abs(y) + 0.035).toBeLessThanOrEqual(base.parameters.height / 2 - 0.01);
    expect(base.parameters.width).toBeGreaterThanOrEqual(0.23 + 0.03);
  });

  it('saves the answer, tells the director, takes the card away and lets the parcel be opened', async () => {
    const r = await rig({ assembly: ON });
    await toBuild(r);
    expect(click(r, 'UI_Difficulty_standard')).toBe(true);
    expect(r.game.save.settings.difficulty).toBe('standard');
    expect(last(real(r))).toEqual({ type: 'difficulty', value: 'standard', first: true });
    expect(parseSave(r.storage.data.get(SAVE_KEY) ?? null).save.settings.difficulty).toBe('standard'); // persisted
    expect(r.ui.currentView?.panel).toBe('none');
    expect(visible(r, 'UI_Difficulty_standard')).toBe(false);
    expect(live(r)).toEqual(['UI_Lens', 'UI_Pause', 'parcel']);
    expect(click(r, 'UI_Difficulty_standard')).toBe(false); // gone: a stray press does nothing
    expect(real(r).filter((e) => e.type === 'difficulty')).toHaveLength(1);
  });

  it.each(['relaxed', 'master'] as const)('saves %s too', async (level) => {
    const r = await rig({ assembly: ON });
    await toBuild(r);
    click(r, `UI_Difficulty_${level}`);
    expect(r.game.save.settings.difficulty).toBe(level);
    expect(last(real(r))).toMatchObject({ type: 'difficulty', value: level, first: true });
  });

  it('is not asked again once answered, even after a reload', async () => {
    const r = await rig({ assembly: ON, difficulty: 'relaxed' });
    await toBuild(r);
    expect(r.ui.currentView?.panel).toBe('none');
    expect(live(r)).toEqual(['UI_Lens', 'UI_Pause', 'parcel']);
  });

  it('greys Master out with its note while its test has not passed, and offers it once it has', async () => {
    const r = await rig({ assembly: { ...ON, masterAvailable: false } });
    await toBuild(r);
    expect(live(r)).toEqual(['UI_Difficulty_relaxed', 'UI_Difficulty_standard']);
    expect(visible(r, 'UI_Difficulty_master')).toBe(true); // still on the card, so the player sees it exists
    expect(allText(r)).toContain(DIFFICULTY_CARD.masterUnavailable);
    expect(click(r, 'UI_Difficulty_master')).toBe(false);
    expect(r.game.save.settings.difficulty).toBeNull();
    expect(r.ui.currentView?.panel).toBe('difficulty');
    r.ui.setMasterAvailable(true);
    expect(live(r)).toEqual(['UI_Difficulty_master', 'UI_Difficulty_relaxed', 'UI_Difficulty_standard']);
    expect(click(r, 'UI_Difficulty_master')).toBe(true);
    expect(r.game.save.settings.difficulty).toBe('master');
  });
});

describe('the Helper medallion', () => {
  it('is not there before the parcel is open, appears above Pause with the tray, and is gone in Place', async () => {
    const r = await rig({ assembly: ON, difficulty: 'standard' });
    await toBuild(r);
    expect(visible(r, 'UI_Helper')).toBe(false);
    click(r, 'parcel');
    run(r, 1.2);
    expect(visible(r, 'UI_Helper')).toBe(false); // no stages given yet: a build without them has no Helper
    r.ui.showBlueprint({ title: 'Music Box', slots: [] });
    r.ui.setAssembly(viewAt(0));
    expect(visible(r, 'UI_Helper')).toBe(true);
    expect(find(r, 'UI_Helper').active).toBe(true);
    expect(live(r)).toEqual(['UI_Helper', 'UI_Lens', 'UI_Pause']);
    const at = object(r, 'UI_Helper').position;
    expect([at.x, at.y, at.z]).toEqual([HELPER_SPOT.x, HELPER_SPOT.y, HELPER_SPOT.z]);
    expect(allText(r)).toContain(HELPER_COPY.label);

    r.game.assemblyComplete();
    r.ui.onModeChange('wind');
    expect(visible(r, 'UI_Helper')).toBe(true); // wound with its help too
    r.ui.setWind(3, 8);
    r.ui.showResult({ status: 'runs' });
    expect(r.game.machineRanCorrectly('music_box')).toBe(true);
    r.ui.onModeChange('place');
    expect(visible(r, 'UI_Helper')).toBe(false);
    expect(find(r, 'UI_Helper').active).toBe(false);
  });

  it('is gone while the game is paused, and a build given no step list again (a machine without stages) loses it', async () => {
    const r = await rig({ assembly: ON, difficulty: 'standard' });
    await toParcel(r);
    click(r, 'UI_Pause');
    expect(visible(r, 'UI_Helper')).toBe(false);
    expect(find(r, 'UI_Helper').active).toBe(false);
    click(r, 'UI_PanelLeft'); // Resume
    expect(visible(r, 'UI_Helper')).toBe(true);
    r.ui.showBlueprint({ title: 'Carousel', slots: [] }); // the next build has no stages
    expect(visible(r, 'UI_Helper')).toBe(false);
    expect(find(r, 'UI_Helper').active).toBe(false);
  });

  it('is pressed with a tap, then rests for 1.2 s so a double poke cannot skip a rung', async () => {
    const r = await rig({ assembly: ON, difficulty: 'standard' });
    await toParcel(r);
    expect(click(r, 'UI_Helper')).toBe(true);
    expect(helperEvents(r)).toEqual([{ type: 'helper', long: false }]);
    expect(last(r.events)).toEqual({ type: 'helper', long: false });
    expect(r.events.filter((e) => e.type === 'cue' && e.cue === 'button').length).toBeGreaterThan(0);
    expect(find(r, 'UI_Helper').active).toBe(false);
    expect(click(r, 'UI_Helper')).toBe(false); // a poke during the rest does nothing
    run(r, HELPER_COOLDOWN_S - 0.2);
    expect(find(r, 'UI_Helper').active).toBe(false);
    expect(object(r, 'UI_Helper').scale.x).toBe(1); // the dip is over; the dim rest goes on
    run(r, 0.3);
    expect(find(r, 'UI_Helper').active).toBe(true);
    expect(click(r, 'UI_Helper')).toBe(true);
    expect(helperEvents(r)).toHaveLength(2);
  });

  it('dips as it is pressed and dims while it rests', async () => {
    const r = await rig({ assembly: ON, difficulty: 'standard' });
    await toParcel(r);
    const mesh = object(r, 'UI_Helper') as Mesh;
    const opacity = (): number => (mesh.material as MeshBasicMaterial).opacity;
    expect(opacity()).toBe(1);
    click(r, 'UI_Helper');
    run(r, FRAME * 2);
    expect(mesh.scale.x).toBeLessThan(1);
    expect(opacity()).toBeLessThan(1);
    run(r, HELPER_COOLDOWN_S + 0.1);
    expect(mesh.scale.x).toBe(1);
    expect(opacity()).toBe(1);
  });

  it('answers a hold of 0.8 s in hands mode as the third rung at once, and a short press as a tap', async () => {
    const r = await rig({ assembly: ON, difficulty: 'standard' });
    await toParcel(r);
    pointer(r, 'UI_Helper', 'pointerdown');
    run(r, 0.6);
    expect(helperEvents(r)).toHaveLength(0);
    run(r, 0.3);
    expect(helperEvents(r)).toEqual([{ type: 'helper', long: true }]);
    expect(find(r, 'UI_Helper').active).toBe(false); // and it rests, as after any press
    run(r, 3);
    expect(helperEvents(r)).toHaveLength(1); // held on, and still one press
    pointer(r, 'UI_Helper', 'pointerup');

    run(r, 1);
    pointer(r, 'UI_Helper', 'pointerdown');
    run(r, 0.3);
    pointer(r, 'UI_Helper', 'pointerup');
    run(r, 1);
    expect(helperEvents(r)).toHaveLength(1); // let go early: nothing until the click
    click(r, 'UI_Helper');
    expect(helperEvents(r)).toHaveLength(2);
    expect(helperEvents(r)[1]).toEqual({ type: 'helper', long: false });
  });

  it('does not take a hold as a long press in gaze mode (a hold there means "remove")', async () => {
    const r = await rig({ assembly: ON, difficulty: 'standard' });
    await toParcel(r);
    r.game.setSetting('gazeMode', true);
    pointer(r, 'UI_Helper', 'pointerdown');
    run(r, 2);
    expect(helperEvents(r)).toHaveLength(0);
    pointer(r, 'UI_Helper', 'pointerleave');
    expect(click(r, 'UI_Helper')).toBe(true); // the tap works
    expect(helperEvents(r)).toEqual([{ type: 'helper', long: false }]);
  });

  it('lights its halo for an offer: a breath of 2 s for 12 s, then a dim steady glow, and an answer puts it out', async () => {
    const r = await rig({ assembly: ON, difficulty: 'standard' });
    await toParcel(r);
    const halo = (object(r, 'UI_Helper') as Mesh).children[0] as Mesh;
    const opacity = (): number => (halo.material as MeshBasicMaterial).opacity;
    run(r, 0.1);
    expect(halo.visible).toBe(false);
    r.ui.setHelper({ offer: true, slip: null });
    run(r, 1.0);
    expect(halo.visible).toBe(true);
    expect(opacity()).toBeGreaterThan(0.9); // the top of the first breath
    run(r, 1.0);
    expect(opacity()).toBeLessThan(0.4); // and back down
    const seen: number[] = [];
    for (let t = 0; t < HELPER_BREATH_S - 2; t += 0.25) {
      run(r, 0.25);
      seen.push(opacity());
    }
    expect(Math.max(...seen)).toBeGreaterThan(0.9); // it keeps breathing
    expect(Math.min(...seen)).toBeLessThan(0.4);
    run(r, 3);
    expect(halo.visible).toBe(true);
    expect(opacity()).toBeCloseTo(0.3, 9); // dim and steady
    run(r, 3);
    expect(opacity()).toBeCloseTo(0.3, 9);

    click(r, 'UI_Helper'); // the player answers
    run(r, FRAME * 2);
    expect(halo.visible).toBe(false);
    r.ui.setHelper({ offer: true, slip: null }); // the director may offer again; the breath starts over
    run(r, 1.1);
    expect(halo.visible).toBe(false); // during the rest, no glow either
    run(r, 0.3);
    expect(halo.visible).toBe(true);
    expect(opacity()).toBeGreaterThan(0.3);
  });

  it('is only light: its halo can never be hit by a ray or a poke', async () => {
    const r = await rig({ assembly: ON, difficulty: 'standard' });
    await toParcel(r);
    const halo = (object(r, 'UI_Helper') as Mesh).children[0] as Mesh;
    const hits: Intersection[] = [];
    halo.raycast(new Raycaster(), hits);
    expect(hits).toEqual([]);
  });

  it('shows the director\'s one-line slip above it, and takes it away when the line goes or a panel opens', async () => {
    const r = await rig({ assembly: ON, difficulty: 'standard' });
    await toParcel(r);
    expect(visible(r, 'UI_HelperHint')).toBe(false);
    const offer: HelperView = { offer: true, slip: HELPER_COPY.offer };
    expect(painted(r, () => r.ui.setHelper(offer))).toContain('Need a hand?');
    expect(visible(r, 'UI_HelperHint')).toBe(true);
    expect(object(r, 'UI_HelperHint').position.y).toBeGreaterThan(HELPER_SPOT.y + 0.05);
    expect(painted(r, () => r.ui.setHelper({ offer: false, slip: HELPER_COPY.next('the left bracket') }))).toContain('Next: the left bracket');
    expect(painted(r, () => r.ui.setHelper({ offer: false, slip: HELPER_COPY.next('the left bracket') }))).toEqual([]); // the same line is not repainted
    click(r, 'UI_Pause');
    expect(visible(r, 'UI_HelperHint')).toBe(false); // a panel is up
    click(r, 'UI_PanelLeft');
    expect(visible(r, 'UI_HelperHint')).toBe(true);
    r.ui.setHelper({ offer: false, slip: null });
    expect(visible(r, 'UI_HelperHint')).toBe(false);
  });

  it('forgets the step list and the offer when the chapter is restarted', async () => {
    const r = await rig({ assembly: ON, difficulty: 'standard' });
    await toParcel(r);
    r.ui.setHelper({ offer: true, slip: 'Need a hand?' });
    click(r, 'UI_Pause');
    click(r, 'UI_PanelRight'); // Restart chapter
    click(r, 'UI_PanelRight'); // Restart
    expect(r.game.mode).toBe('intro');
    expect(last(real(r))).toEqual({ type: 'restarted' } as FlowEvent);
    expect(visible(r, 'UI_Helper')).toBe(false);
    expect(visible(r, 'UI_HelperHint')).toBe(false);
    expect(r.game.save.settings.difficulty).toBe('standard'); // a setting, kept like the others
  });
});

describe('the step sheet and Master\'s "?"', () => {
  it('paints the stages, the current step and the next two, and repaints only when the build moves', async () => {
    const r = await rig({ assembly: ON, difficulty: 'standard' });
    await toBuild(r);
    click(r, 'parcel');
    run(r, 1.2);
    r.ui.showBlueprint({ title: 'Music Box', slots: [] });
    const first = painted(r, () => r.ui.setAssembly(viewAt(3)));
    expect(first).toContain('Music Box');
    expect(first).toContain('Frame');
    expect(first).toContain('Power unit');
    expect(first).toContain('4. Right bracket');
    expect(first).toContain('5. Bush');
    expect(first).toContain('6. Screw');
    expect(first).toContain('Stage 1 of 7');
    expect(painted(r, () => r.ui.setAssembly(viewAt(3)))).toEqual([]); // the same list: nothing repainted
    const next = painted(r, () => r.ui.setAssembly(viewAt(4)));
    expect(next).toContain('5. Bush');
    expect(next).not.toContain('4. Right bracket');
    const closed = painted(r, () => r.ui.setAssembly(viewAt(34)));
    expect(closed).toContain('All stages built');
  });

  it('has no "?" for Relaxed and Standard: the step is always on the sheet', async () => {
    for (const level of ['relaxed', 'standard'] as const) {
      const r = await rig({ assembly: ON, difficulty: level });
      await toParcel(r, 3);
      expect(visible(r, 'UI_StepHelp'), level).toBe(false);
      expect(find(r, 'UI_StepHelp').active, level).toBe(false);
      expect(allText(r), level).toContain('4. Right bracket');
    }
  });

  it('shows Master stage names only, with a "?" that opens the current step for 8 s and then shuts it again', async () => {
    const r = await rig({ assembly: ON, difficulty: 'master' });
    await toBuild(r);
    click(r, 'parcel');
    run(r, 1.2);
    r.ui.showBlueprint({ title: 'Music Box', slots: [] });
    const shown = painted(r, () => r.ui.setAssembly(viewAt(3)));
    expect(shown).toContain('Governor');
    expect(shown.some((t) => /^\d+\. /.test(t))).toBe(false); // no step lines
    expect(visible(r, 'UI_StepHelp')).toBe(true);
    expect(live(r)).toContain('UI_StepHelp');

    const revealed = painted(r, () => click(r, 'UI_StepHelp'));
    expect(revealed).toContain('4. Right bracket');
    expect(visible(r, 'UI_StepHelp')).toBe(false); // out of the way while the step shows
    expect(find(r, 'UI_StepHelp').active).toBe(false);
    run(r, 7.5);
    expect(visible(r, 'UI_StepHelp')).toBe(false);
    const shut = painted(r, () => run(r, 0.7));
    expect(shut.some((t) => /^\d+\. /.test(t))).toBe(false);
    expect(shut).toContain('Frame');
    expect(visible(r, 'UI_StepHelp')).toBe(true);
    expect(find(r, 'UI_StepHelp').active).toBe(true);
  });

  it('does not run the 8 s while the game is paused, and keeps the "?" off the screen under a panel', async () => {
    const r = await rig({ assembly: ON, difficulty: 'master' });
    await toParcel(r, 3);
    click(r, 'UI_StepHelp');
    run(r, 4);
    click(r, 'UI_Pause');
    expect(visible(r, 'UI_StepHelp')).toBe(false);
    run(r, 30);
    click(r, 'UI_PanelLeft');
    run(r, 3); // 4 + 3 s of 8: still showing
    expect(allText(r).filter((t) => t === '4. Right bracket').length).toBeGreaterThan(0);
    expect(visible(r, 'UI_StepHelp')).toBe(false);
    run(r, 1.5);
    expect(visible(r, 'UI_StepHelp')).toBe(true);
  });

  it('turns Master\'s sheet into the full sheet when the level is changed in Pause, and back', async () => {
    const r = await rig({ assembly: ON, difficulty: 'master' });
    await toParcel(r, 3);
    expect(visible(r, 'UI_StepHelp')).toBe(true);
    click(r, 'UI_Pause');
    const toRelaxed = painted(r, () => click(r, 'UI_Difficulty')); // master -> relaxed
    expect(r.game.save.settings.difficulty).toBe('relaxed');
    click(r, 'UI_PanelLeft');
    expect(toRelaxed.length).toBeGreaterThan(0);
    expect(visible(r, 'UI_StepHelp')).toBe(false);
    expect(allText(r).filter((t) => t === '4. Right bracket').length).toBeGreaterThan(0);
  });
});

describe('the Difficulty row in Pause', () => {
  const pause = async (r: Rig): Promise<void> => {
    click(r, 'UI_Pause');
    expect(r.ui.currentView?.panel).toBe('pause');
  };

  it('adds one row, taller panel, and its sentence under it, once the level is chosen', async () => {
    const r = await rig({ assembly: ON, difficulty: 'standard' });
    await toParcel(r);
    await pause(r);
    expect(live(r)).toEqual(['UI_Difficulty', 'UI_PanelLeft', 'UI_PanelRight', 'UI_Toggle_easySnap', 'UI_Toggle_gazeMode', 'UI_Toggle_night', 'UI_Toggle_xrayHint']);
    expect(allText(r)).toContain('Difficulty: Standard');
    expect(allText(r)).toContain(DIFFICULTY_ROW.hint);
  });

  it('keeps the small panel\'s bottom edge where it was, and every row and button inside the taller panel without touching its neighbour', async () => {
    const r = await rig({ assembly: ON, difficulty: 'standard' });
    await toParcel(r);
    await pause(r);
    const panel = object(r, 'UI_Difficulty').parent as Object3D;
    const base = panel.children.find((c) => c instanceof Mesh && c.visible && !c.name) as Mesh;
    const { height } = (base.geometry as unknown as { parameters: { height: number } }).parameters;
    expect(height).toBeCloseTo(0.325 + 0.056, 9);
    expect(panel.position.y - height / 2).toBeCloseTo(PANEL_SPOT.y - 0.325 / 2, 9); // the bottom is where the four-row panel's was
    const rows = [...SETTING_ROWS.map((row) => `UI_Toggle_${row.key}`), 'UI_Difficulty'].map((n) => object(r, n).position.y);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1] - rows[i]).toBeCloseTo(0.056, 9); // the same pitch as the others
    const buttons = object(r, 'UI_PanelLeft').position.y;
    expect(last(rows) - buttons).toBeGreaterThanOrEqual(0.07);
    expect(rows[0] + 0.016).toBeLessThanOrEqual(height / 2 - 0.04); // under the title
    expect(buttons - 0.017).toBeGreaterThanOrEqual(-height / 2 + 0.005); // the margin the four-row panel has too (0.008)
    // The sentence under the fifth row sits between it and the buttons, clear of both.
    const captionY = last(rows) - 0.0235;
    const half = 26 / PX_PER_M / 2;
    expect(captionY + half).toBeLessThan(last(rows) - 0.016);
    expect(captionY - half).toBeGreaterThan(buttons + 0.017);
  });

  it('cycles the level, saves it each time and tells the director', async () => {
    const r = await rig({ assembly: ON, difficulty: 'relaxed' });
    await toParcel(r);
    await pause(r);
    const walk: Difficulty[] = [];
    for (let i = 0; i < 4; i++) {
      expect(click(r, 'UI_Difficulty')).toBe(true);
      walk.push(r.game.save.settings.difficulty as Difficulty);
      expect(last(real(r))).toEqual({ type: 'difficulty', value: last(walk), first: false });
    }
    expect(walk).toEqual(['standard', 'master', 'relaxed', 'standard']);
    expect(allText(r)).toContain('Difficulty: Master');
    expect(parseSave(r.storage.data.get(SAVE_KEY) ?? null).save.settings.difficulty).toBe('standard');
    expect(r.ui.currentView?.panel).toBe('pause'); // still paused
  });

  it('skips Master while it is not available', async () => {
    const r = await rig({ assembly: { ...ON, masterAvailable: false }, difficulty: 'standard' });
    await toParcel(r);
    await pause(r);
    click(r, 'UI_Difficulty');
    expect(r.game.save.settings.difficulty).toBe('relaxed');
    click(r, 'UI_Difficulty');
    expect(r.game.save.settings.difficulty).toBe('standard');
  });

  it('is not there before a level is chosen, and the panel is then the usual size', async () => {
    const r = await rig({ assembly: ON }); // in the introduction: nothing chosen yet
    await pause(r);
    expect(find(r, 'UI_Difficulty').active).toBe(false);
    expect(visible(r, 'UI_Difficulty')).toBe(false);
    expect((object(r, 'UI_Toggle_easySnap').parent as Object3D).position.y).toBe(PANEL_SPOT.y);
  });

  it('is not there when the assembly is off, even with a level saved, and the panel is then the usual size', async () => {
    const r = await rig({ assembly: { ...ON, enabled: false }, difficulty: 'standard' });
    await toBuild(r);
    await pause(r);
    expect(find(r, 'UI_Difficulty').active).toBe(false);
    expect(visible(r, 'UI_Difficulty')).toBe(false);
    expect((object(r, 'UI_Toggle_easySnap').parent as Object3D).position.y).toBe(PANEL_SPOT.y);
  });
});
