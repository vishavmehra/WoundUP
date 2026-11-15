import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, MAX_HARDWARE_KINDS_PER_STAGE, MUSIC_BOX, validateMachineBlueprint } from '../../src/content/blueprints';
import type { MachineBlueprint, SocketDefinition, StageDefinition } from '../../src/content/blueprints';

// INTRICATE_ASSEMBLY_DESIGN §4.3 R1: what the validator says about carriers, stages, groups and hardware. Every case breaks one thing in the real Music Box.

const errors = (bp: MachineBlueprint): string => validateMachineBlueprint(bp).join('\n');
const withSocket = (id: string, patch: Partial<SocketDefinition>): MachineBlueprint => ({
  ...MUSIC_BOX,
  sockets: MUSIC_BOX.sockets.map((s) => (s.id === id ? { ...s, ...patch } : s)),
});
const withStages = (stages: readonly StageDefinition[]): MachineBlueprint => ({ ...MUSIC_BOX, stages });
const stages = MUSIC_BOX.stages!;
const without = (stage: string, socket: string): StageDefinition[] => stages.map((st) => (st.id === stage ? { ...st, sockets: st.sockets.filter((s) => s !== socket) } : st));

describe('the validator and the intricate assembly', () => {
  it('passes every blueprint, with and without stages', () => {
    for (const bp of BLUEPRINTS) expect(validateMachineBlueprint(bp), bp.id).toEqual([]);
    expect(BLUEPRINTS.filter((b) => b.stages !== undefined).map((b) => b.id)).toEqual(['music_box']); // the other machines keep today's build
  });

  it('wants every required socket in a stage', () => {
    expect(errors(withStages(without('power', 'screw_key')))).toContain('required socket "screw_key" is in no stage');
  });

  it('refuses a socket in two stages, an unknown socket, an empty stage and a repeated stage id', () => {
    const twice = stages.map((st) => (st.id === 'comb' ? { ...st, sockets: [...st.sockets, 'bush_left'] } : st));
    expect(errors(withStages(twice))).toContain('socket "bush_left" is in stages "frame" and "comb"');
    expect(errors(withStages(stages.map((st) => (st.id === 'comb' ? { ...st, sockets: [...st.sockets, 'ghost'] } : st))))).toContain('lists unknown socket "ghost"');
    expect(errors(withStages([...stages, { id: 'extra', name: 'Extra', site: 'case', sockets: [] }]))).toContain('stage "extra" has no sockets');
    expect(errors(withStages([...stages, stages[0]]))).toContain('stage "frame" is listed twice');
  });

  it('holds `socket.stage` to the stage that lists the socket', () => {
    expect(errors(withSocket('comb', { stage: 'frame' }))).toContain('socket "comb" says stage "frame" but is listed in "comb"');
  });

  it('needs stages for hardware, and refuses a stage name on a blueprint with none', () => {
    expect(errors({ ...MUSIC_BOX, stages: undefined })).toContain('hardware needs stages');
    expect(errors({ ...MUSIC_BOX, stages: undefined })).toContain('names stage "frame" but the blueprint has no stages');
  });

  it('wants a unit on every stand stage, and only on a stand stage', () => {
    expect(errors(withStages(stages.map((st) => (st.id === 'governor' ? { ...st, unit: undefined } : st))))).toContain('stage "governor": a stand stage has a unit');
    expect(errors(withStages(stages.map((st) => (st.id === 'comb' ? { ...st, unit: { carrier: 'comb', grip: 'COL_Grip' } } : st))))).toContain('stage "comb": a stand stage has a unit');
    expect(errors(withStages(stages.map((st) => (st.id === 'governor' ? { ...st, unit: { carrier: 'nobody', grip: 'COL_Grip' } } : st))))).toContain('unit on unknown socket "nobody"');
    expect(errors(withStages(stages.map((st) => (st.id === 'governor' ? { ...st, unit: { carrier: 'governor', grip: '' } } : st))))).toContain('unit with no grip node');
  });

  it('refuses a socket that needs one placed in a later stage', () => {
    // a gear before its arbor
    const early = stages.map((st) => (st.id === 'governor_end' ? { ...st, sockets: ['governor_wheel', ...st.sockets.filter((s) => s !== 'governor_wheel')] } : st));
    expect(errors(withStages(early))).toBe(''); // same stage: order inside a stage is free
    const late = stages.map((st) => (st.id === 'frame' ? { ...st, sockets: [...st.sockets, 'governor_wheel'] } : st.id === 'governor_end' ? { ...st, sockets: st.sockets.filter((s) => s !== 'governor_wheel') } : st));
    expect(errors(withStages(late))).toContain('socket "governor_wheel" needs "arbor", which is placed in a later stage');
  });

  it(`refuses a stage that needs more than ${MAX_HARDWARE_KINDS_PER_STAGE} kinds of hardware: the caddy has four bins`, () => {
    // frame: bush and screw; add a collar, a washer and a clip socket to it
    const crowded = stages.map((st) => (st.id === 'frame' ? { ...st, sockets: [...st.sockets, 'collar_cylinder_l', 'washer_arbor_l1', 'clip_comb_l'] } : st.sockets.some((s) => ['collar_cylinder_l', 'washer_arbor_l1', 'clip_comb_l'].includes(s)) ? { ...st, sockets: st.sockets.filter((s) => !['collar_cylinder_l', 'washer_arbor_l1', 'clip_comb_l'].includes(s)) } : st));
    expect(errors(withStages(crowded))).toContain('stage "frame" needs 5 kinds of hardware, the caddy has 4 bins');
  });

  it('checks carriers: known, not itself, no cycle, and a unitNode needs one', () => {
    expect(errors(withSocket('bush_left', { carrier: 'nowhere' }))).toContain('is carried by unknown socket "nowhere"');
    expect(errors(withSocket('bush_left', { carrier: 'bush_left' }))).toContain('carries itself');
    const cycle: MachineBlueprint = {
      ...MUSIC_BOX,
      sockets: MUSIC_BOX.sockets.map((s) => (s.id === 'bracket_left' ? { ...s, carrier: 'screw_bracket_left' } : s)),
    };
    expect(errors(cycle)).toContain('socket carriers form a cycle');
    expect(errors(withSocket('bracket_left', { unitNode: 'X' }))).toContain('has a unitNode but no carrier');
  });

  it('holds hardware to its rules: required, a node, exactly one accepted part, and nothing else is implied', () => {
    expect(errors(withSocket('bush_left', { required: false }))).toContain('hardware socket "bush_left" must be required');
    expect(errors(withSocket('bush_left', { node: undefined }))).toContain('hardware socket "bush_left" has no node');
    expect(errors(withSocket('bush_left', { acceptedPartIds: ['bush_split_8_brass', 'washer_plain_8_brass'] }))).toContain('must accept exactly one part');
    expect(errors(withSocket('comb', { implied: true }))).toContain('socket "comb" is implied but is not hardware');
  });

  it('keeps a family honest: a hardware socket takes hardware only, and a big socket takes no hardware', () => {
    expect(errors(withSocket('pin_governor_wheel', { acceptedPartIds: ['gear_spur_10_m1_brass'] }))).toContain('(fastener) accepts "gear_spur_10_m1_brass" of family spur_gear');
    expect(errors(withSocket('arbor', { acceptedPartIds: ['shaft_short_brass', 'washer_plain_8_brass'] }))).toContain('(shaft) accepts "washer_plain_8_brass" of family fastener');
  });

  it('wants the sockets of a group to share a carrier, accepted parts and dependencies', () => {
    expect(errors(withSocket('washer_arbor_l2', { carrier: 'cylinder' }))).toContain('group "arbor_washers": "washer_arbor_l2" and "washer_arbor_l1" have different carriers');
    expect(errors(withSocket('washer_arbor_l2', { acceptedPartIds: ['bush_split_8_brass'] }))).toContain('accept different parts');
    expect(errors(withSocket('washer_arbor_l2', { dependencies: ['arbor'] }))).toContain('have different dependencies');
  });

  it('allows the same hardware empty on different carriers (every gear has a Pin) and refuses it twice on one carrier', () => {
    expect(MUSIC_BOX.sockets.filter((s) => s.node === 'Pin')).toHaveLength(4);
    expect(MUSIC_BOX.sockets.filter((s) => s.node === 'Screw')).toHaveLength(5);
    const twice: MachineBlueprint = {
      ...MUSIC_BOX,
      sockets: MUSIC_BOX.sockets.map((s) => (s.id === 'screw_bracket_left' ? { ...s, node: 'Bush' } : s)), // the bush of the same bracket
    };
    expect(errors(twice)).toContain('socket node "Bush" is used twice');
    expect(errors(withSocket('bracket_right', { node: 'BracketL' }))).toContain('socket node "BracketL" is used twice'); // the housing's own stay unique
  });

  it('keeps hardware out of the tray, and does not ask the tray for it', () => {
    expect(errors({ ...MUSIC_BOX, tray: [...MUSIC_BOX.tray, { partId: 'washer_plain_8_brass', quantity: 5 }] })).toContain('tray holds hardware "washer_plain_8_brass"');
    expect(errors(MUSIC_BOX)).toBe(''); // 22 intended pieces of hardware, none in the tray, and the tray check still passes
  });
});
