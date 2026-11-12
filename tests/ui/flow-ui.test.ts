import { PokeInteractable, RayInteractable, World } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { LETTERS } from '../../src/game/content';
import { SAVE_KEY, parseSave } from '../../src/game/save';
import { GameSession } from '../../src/game/session';
import { Socket } from '../../src/interaction/components';
import { FlowUi, type FlowEvent } from '../../src/ui/flow-ui';
import type { GiftHost } from '../../src/ui/gift-flow';
import { FakeStorage } from '../game/helpers';
import { canvasFactory } from './fake-canvas';

/**
 * The whole flow against a real IWSDK World (no renderer) with hand-built stand-ins for the six GLBs that carry the same
 * `PIV_`, `COL_` and `SOCKET_` empties as the real files. Clicks are dispatched on the objects the way pointer-events would.
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

interface Rig {
  world: World;
  ui: FlowUi;
  game: GameSession;
  storage: FakeStorage;
  events: FlowEvent[];
  stage: Entity;
  scene: Scene;
  canvases: ReturnType<typeof canvasFactory>;
  link: { delivered: string[] };
}

const GIFT_HOST: GiftHost = {
  build: () => null,
  options: { catalogue: { blueprint: () => undefined, hasPart: () => false }, verify: () => false },
  pageUrl: () => 'https://example.test/',
};

async function rig(prepare?: (game: GameSession) => void, gift: GiftHost = GIFT_HOST, storage = new FakeStorage()): Promise<Rig> {
  const world = new World();
  // Components are module singletons: register them in a fixed order so this World's ids are consistent (see systems.test.ts).
  for (const component of [RayInteractable, PokeInteractable, Socket]) world.registerComponent(component);
  const scene = new Scene();
  Object.assign(world, { scene });
  const stage = world.createTransformEntity(new Group());
  scene.add(stage.object3D as Object3D);
  const game = new GameSession({ storage });
  prepare?.(game);
  const events: FlowEvent[] = [];
  const canvases = canvasFactory();
  const link = { delivered: [] as string[] };
  const files = props();
  const ui = new FlowUi(world, {
    session: game,
    stage,
    townScale: () => 1,
    loadGlb: async (path) => {
      const key = path.includes('trunk') ? 'trunk' : path.includes('envelope') ? 'envelope' : path.includes('parcel') ? 'parcel' : path.includes('tray') ? 'tray' : path.includes('sheet') ? 'sheet' : 'bench';
      return files[key];
    },
    onEvent: (e) => events.push(e),
    gift,
    share: { writeText: async (t) => void link.delivered.push(t) },
    createCanvas: canvases.make,
    head: (out) => out.set(0, 0.4, 0.55),
  });
  await ui.init();
  return { world, ui, game, storage, events, stage, scene, canvases, link };
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
/** A ray or poke click on `name`: it does nothing unless the target is live. Returns whether it was live. */
const click = (r: Rig, name: string, hit?: Object3D): boolean => {
  const p = find(r, name);
  p.object.dispatchEvent({ type: 'click', object: hit ?? p.object } as never);
  return p.active;
};
const live = (r: Rig): string[] => r.ui.pressables().filter((p) => p.active).map((p) => p.name).sort();
const last = (r: Rig): FlowEvent => r.events[r.events.length - 1];
const types = (r: Rig): string[] => r.events.map((e) => e.type);
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

const toTown = async (r: Rig): Promise<void> => {
  const latch = r.scene.getObjectByName('COL_Latch_proxy') as Object3D;
  expect(click(r, 'trunk_main', latch)).toBe(true);
  run(r, 3.2);
};

describe('FlowUi: the first five minutes', () => {
  it('opens the trunk by its latch, sinks it, and brings the first letter', async () => {
    const r = await rig();
    expect(r.game.mode).toBe('intro');
    expect(visible(r, 'trunk_main')).toBe(true);
    expect(visible(r, 'workbench')).toBe(false);
    expect(live(r)).toEqual(['UI_Pause', 'trunk_main']);

    // Anything but the latch does nothing.
    const body = r.scene.getObjectByName('trunk_main')!.children[0];
    click(r, 'trunk_main', body);
    run(r, 0.2);
    expect(r.game.mode).toBe('intro');
    expect(r.ui.localFlow.trunk).toBe('closed');

    const latch = r.scene.getObjectByName('COL_Latch_proxy') as Object3D;
    expect(latch.userData.wuProxy.purpose).toBe('latch');
    click(r, 'trunk_main', latch);
    expect(r.ui.localFlow.trunk).toBe('opening');
    expect(find(r, 'trunk_main').active).toBe(false); // one pinch only
    expect(r.game.mode).toBe('intro');
    run(r, 0.7); // the lid is past half open
    expect(r.game.mode).toBe('town');
    expect(types(r)).toEqual(['trunk-opened']);
    expect(r.ui.localFlow.trunk).toBe('withdrawing');
    const lid = r.scene.getObjectByName('PIV_Lid') as Object3D;
    expect(lid.rotation.x).toBeLessThan(-0.7);

    run(r, 3);
    expect(r.ui.localFlow.trunk).toBe('gone');
    expect(visible(r, 'trunk_main')).toBe(false);
    expect(visible(r, 'letter_envelope')).toBe(true);
    expect(live(r)).toEqual(['UI_Pause', 'letter_envelope']);
  });

  it('opens the letter, shows its words on paper, and accepts it with a pinch', async () => {
    const r = await rig();
    await toTown(r);
    const letter = LETTERS.letter_1;
    // The words are painted on the paper (the Accept plaque and others are separate canvases).
    const painted = r.canvases.made.flatMap((c) => c.calls.map((t) => t.text)).join(' ');
    expect(painted).toContain(letter.message.split(' ').slice(0, 3).join(' '));
    expect(painted).toContain(`— ${letter.sender}`);

    expect(find(r, 'UI_Accept').active).toBe(false); // not before the letter is open
    expect(click(r, 'letter_envelope')).toBe(true);
    expect(r.ui.localFlow.envelope).toBe('open');
    expect(find(r, 'UI_Accept').active).toBe(false); // the card is still rising
    run(r, 1);
    expect(find(r, 'UI_Accept').active).toBe(true);
    expect(visible(r, 'UI_Accept')).toBe(true);
    expect(find(r, 'letter_envelope').active).toBe(false);

    const card = (find(r, 'UI_Accept').object.parent as Object3D).position;
    expect(card.y).toBeGreaterThan(0.1); // raised to reading height
    expect(r.game.mode).toBe('town');
    click(r, 'UI_Accept');
    expect(r.game.mode).toBe('build');
    expect(types(r)).toEqual(['trunk-opened', 'letter-accepted']);
    expect(r.events[1]).toMatchObject({ type: 'letter-accepted', letter: { id: 'letter_1' } });
    expect(visible(r, 'UI_Accept')).toBe(false);
    expect(visible(r, 'letter_envelope')).toBe(false);
    expect(visible(r, 'workbench')).toBe(true);
    expect(live(r)).toEqual(['UI_Pause', 'parcel']);
  });

  it('opens the parcel, shows the blueprint and parts in the tray', async () => {
    const r = await rig();
    await toTown(r);
    click(r, 'letter_envelope');
    run(r, 1);
    click(r, 'UI_Accept');
    run(r, 1.2);
    expect(visible(r, 'parts_tray')).toBe(false);
    expect(visible(r, 'blueprint_sheet')).toBe(false);

    expect(click(r, 'parcel')).toBe(true);
    expect(last(r)).toMatchObject({ type: 'parcel-opened', letter: { id: 'letter_1' } });
    expect(visible(r, 'parts_tray')).toBe(true);
    expect(visible(r, 'blueprint_sheet')).toBe(true);
    expect(live(r)).toEqual(['UI_Pause']);
    r.ui.showBlueprint({ title: 'Music Box', slots: [{ id: 'case', label: 'Case' }, { id: 'key', label: 'Winding key' }] });
    expect(r.canvases.made.flatMap((c) => c.calls.map((t) => t.text))).toEqual(expect.arrayContaining(['Music Box', 'Case', 'Winding key']));

    const slots = r.ui.traySlots();
    expect(slots).toHaveLength(8);
    const parts = [0, 1, 2].map(() => new Mesh(new BoxGeometry(0.01, 0.01, 0.01), new MeshBasicMaterial()));
    for (const p of parts) r.scene.add(p);
    r.ui.revealParts(parts);
    expect(parts[0].scale.x).toBeLessThan(0.01); // popping in
    run(r, 1.5);
    parts.forEach((p, i) => {
      expect(p.scale.x).toBe(1);
      expect(p.getWorldPosition(new Vector3()).distanceTo(slots[i])).toBeLessThan(1e-6);
    });
    r.ui.setSlotFilled('case', true);
    r.ui.setSlotFilled('case', true); // idempotent
  });
});

describe('FlowUi: winding, running and the result', () => {
  const toWind = async (r: Rig): Promise<void> => {
    await toTown(r);
    click(r, 'letter_envelope');
    run(r, 1);
    click(r, 'UI_Accept');
    run(r, 1.2);
    click(r, 'parcel');
    run(r, 1);
    expect(r.game.assemblyComplete()).toBe(true);
    r.ui.onModeChange('wind');
  };

  it('offers Run only once the machine is wound, and reports each verdict on the sign', async () => {
    const r = await rig();
    await toWind(r);
    expect(visible(r, 'UI_Run')).toBe(true);
    expect(find(r, 'UI_Run').active).toBe(false); // nothing wound yet
    r.ui.setWind(0, 8);
    expect(find(r, 'UI_Run').active).toBe(false);
    r.ui.setWind(3, 8);
    expect(find(r, 'UI_Run').active).toBe(true);
    expect(r.canvases.made.flatMap((c) => c.calls.map((t) => t.text))).toContain('Wound 3 of 8');

    expect(click(r, 'UI_Run')).toBe(true);
    expect(last(r)).toEqual({ type: 'run' });

    r.ui.showResult({ status: 'jams', jamReason: 'module_mismatch' });
    expect(visible(r, 'UI_Adjust')).toBe(true);
    expect(find(r, 'UI_Adjust').active).toBe(true);
    expect(r.canvases.made.flatMap((c) => c.calls.map((t) => t.text))).toContain('The gears jam.');

    expect(click(r, 'UI_Adjust')).toBe(true);
    expect(r.game.mode).toBe('build');
    expect(last(r)).toEqual({ type: 'adjust' });
    expect(visible(r, 'UI_Run')).toBe(false);
    expect(find(r, 'UI_Run').active).toBe(false);
    expect(find(r, 'UI_Adjust').active).toBe(false);
    expect(r.ui.localFlow.result).toBeNull();
  });

  it('keeps the "It works!" label through Place and drops the Run controls', async () => {
    const r = await rig();
    await toWind(r);
    r.ui.setWind(4, 8);
    r.ui.showResult({ status: 'runs' });
    expect(visible(r, 'UI_Adjust')).toBe(false); // a good run needs no Adjust
    expect(r.game.machineRanCorrectly('music_box')).toBe(true);
    r.ui.onModeChange('place');
    expect(r.game.mode).toBe('place');
    expect(r.ui.currentView?.runSign).toBe(true);
    expect(visible(r, 'UI_Run')).toBe(false);
    expect(find(r, 'UI_Run').active).toBe(false);
    expect(r.canvases.made.flatMap((c) => c.calls.map((t) => t.text))).toContain('It works!');
  });
});

describe('FlowUi: the pause menu', () => {
  it('pauses, toggles accessibility settings into the save, and resumes', async () => {
    const r = await rig();
    await toTown(r);
    expect(click(r, 'UI_Pause')).toBe(true);
    expect(r.game.mode).toBe('pause');
    expect(r.ui.currentView?.panel).toBe('pause');
    expect(live(r)).toEqual(['UI_PanelLeft', 'UI_PanelRight', 'UI_Toggle_easySnap', 'UI_Toggle_gazeMode', 'UI_Toggle_xrayHint']);
    expect(find(r, 'UI_Pause').active).toBe(false);
    expect(visible(r, 'letter_envelope')).toBe(true); // the paused scene stays as it was

    expect(r.game.save.settings.easySnap).toBe(false);
    click(r, 'UI_Toggle_easySnap');
    expect(r.game.save.settings.easySnap).toBe(true);
    expect(last(r)).toEqual({ type: 'setting', key: 'easySnap', value: true });
    expect(parseSave(r.storage.data.get(SAVE_KEY) ?? null).save.settings.easySnap).toBe(true); // persisted
    click(r, 'UI_Toggle_gazeMode');
    click(r, 'UI_Toggle_easySnap');
    expect(r.game.save.settings).toMatchObject({ easySnap: false, gazeMode: true });

    click(r, 'UI_PanelLeft'); // Resume
    expect(r.game.mode).toBe('town');
    expect(live(r)).toEqual(['UI_Pause', 'letter_envelope']);
  });

  it('asks before it deletes progress, keeps the settings, and starts the trunk over', async () => {
    const r = await rig();
    await toTown(r);
    click(r, 'UI_Pause');
    click(r, 'UI_Toggle_xrayHint');
    const hint = r.game.save.settings.xrayHint;
    click(r, 'UI_PanelRight'); // Restart chapter: only asks
    expect(r.ui.currentView?.panel).toBe('restart');
    expect(r.game.save.letters.letter_1).not.toBe('locked');
    expect(live(r)).toEqual(['UI_PanelLeft', 'UI_PanelRight']);

    click(r, 'UI_PanelLeft'); // Keep playing
    expect(r.ui.currentView?.panel).toBe('pause');
    expect(r.game.save.letters.letter_1).not.toBe('locked');
    click(r, 'UI_PanelRight');
    click(r, 'UI_PanelRight'); // Restart, confirmed
    expect(r.game.mode).toBe('intro');
    expect(r.game.save.letters.letter_1).toBe('locked');
    expect(r.game.save.settings.xrayHint).toBe(hint);
    expect(last(r)).toEqual({ type: 'restarted' });
    expect(r.ui.localFlow.trunk).toBe('closed');
    expect(visible(r, 'trunk_main')).toBe(true);
    expect(visible(r, 'letter_envelope')).toBe(false);
    expect(live(r)).toEqual(['UI_Pause', 'trunk_main']);
    expect(Math.abs((r.scene.getObjectByName('PIV_Lid') as Object3D).rotation.x)).toBeLessThan(1e-9); // the lid is shut again

    // And the whole introduction plays again.
    await toTown(r);
    expect(r.game.mode).toBe('town');
  });
});

describe('FlowUi: a returning player', () => {
  it('skips the introduction and finds the letter waiting', async () => {
    const first = await rig();
    await toTown(first);
    const r = await rig(undefined, GIFT_HOST, first.storage);
    expect(r.game.mode).toBe('town');
    expect(r.ui.localFlow.trunk).toBe('gone');
    expect(visible(r, 'trunk_main')).toBe(false);
    run(r, 2);
    expect(visible(r, 'letter_envelope')).toBe(true);
    expect(live(r)).toEqual(['UI_Pause', 'letter_envelope']);
  });
});

describe('FlowUi: the gift panel', () => {
  const story = (game: GameSession): void => {
    game.openTrunk();
    for (const [n, machine, plot] of [[1, 'music_box', 'plot_music_box']] as const) {
      game.acceptLetter(`letter_${n}` as 'letter_1');
      game.assemblyComplete();
      game.machineRanCorrectly(machine);
      game.machinePlaced(machine, plot);
    }
    game.acceptLetter('letter_2');
    game.assemblyComplete();
    game.repairVerified('worn_spring');
    game.machineRanCorrectly('music_box');
    game.machinePlaced('music_box', 'plot_music_box');
  };

  it('shows the ribbon only when gifting is unlocked, then makes and delivers a link', async () => {
    const fresh = await rig();
    await toTown(fresh);
    expect(visible(fresh, 'UI_Gift')).toBe(false);

    const host: GiftHost = {
      build: (machineId, engraving) => ({ blueprintId: machineId, blueprintVersion: 1, placements: [{ socketId: 's', partId: 'p' }], engraving }),
      options: {
        catalogue: { blueprint: () => ({ version: 1, sockets: [{ id: 's', required: true }], accepts: () => true }), hasPart: () => true },
        verify: () => true,
      },
      pageUrl: () => 'https://example.test/',
    };
    const r = await rig(story, host);
    expect(r.game.mode).toBe('town');
    expect(r.game.giftAvailable).toBe(true);
    expect(visible(r, 'UI_Gift')).toBe(true);
    expect(find(r, 'UI_Gift').active).toBe(true);

    click(r, 'UI_Gift');
    expect(r.game.mode).toBe('gift');
    expect(r.ui.currentView?.panel).toBe('gift');
    expect(live(r)).toEqual(expect.arrayContaining(['UI_PanelLeft', 'UI_PanelRight']));
    expect(live(r).filter((n) => n.startsWith('UI_Engraving_'))).toHaveLength(8);
    expect(find(r, 'UI_Pause').active).toBe(false);

    click(r, 'UI_Engraving_thank_you');
    click(r, 'UI_PanelLeft'); // Make link
    expect(r.link.delivered).toHaveLength(0); // it is asynchronous: the codec compresses
    await new Promise((done) => setTimeout(done, 50));
    expect(r.link.delivered).toHaveLength(1);
    expect(r.link.delivered[0].startsWith('https://example.test/#g=')).toBe(true);
    expect(last(r)).toMatchObject({ type: 'gift-link', machineId: 'music_box', delivered: 'copied' });
    expect(r.canvases.made.flatMap((c) => c.calls.map((t) => t.text)).join(' ')).toContain('Link copied.');

    click(r, 'UI_PanelRight'); // Close
    expect(r.game.mode).toBe('town');
    run(r, 2);
    expect(live(r)).toEqual(['UI_Gift', 'UI_Pause', 'letter_envelope']);
  });

  it('says so, and makes no link, when the machine cannot be built', async () => {
    const r = await rig(story, GIFT_HOST);
    click(r, 'UI_Gift');
    click(r, 'UI_PanelLeft');
    await new Promise((done) => setTimeout(done, 20));
    expect(r.link.delivered).toHaveLength(0);
    expect(r.events.map((e) => e.type)).not.toContain('gift-link');
    expect(r.canvases.made.flatMap((c) => c.calls.map((t) => t.text)).join(' ')).toContain('not on the table');
  });
});

describe('FlowUi: housekeeping', () => {
  it('does nothing before init and releases every target on dispose', async () => {
    const r = await rig();
    expect(live(r).length).toBeGreaterThan(0);
    r.ui.dispose();
    expect(live(r)).toEqual([]);
    r.ui.update(0.1); // harmless after dispose
  });
});
