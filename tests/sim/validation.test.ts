import { describe, expect, it } from 'vitest';
import { solve, validateBlueprint } from '../../src/sim';
import type { InstalledPart, MechanicalConnection, PartCatalogue, PowerInput, SolverBlueprint, SolverErrorCode, SolverInput } from '../../src/sim';
import { blueprint, errorsOf, gear, input, mesh, pin, plain, run, shaft, socket, sockets, spring } from './helpers';

// A valid baseline: spring -> 10-tooth gear -> 20-tooth gear.
const baseSockets = () => sockets('spring', 'a', 'b');
const baseConnections = (): MechanicalConnection[] => [shaft('s', 'spring', 'a'), mesh('m', 'a', 'b')];
const baseParts = (): InstalledPart[] => [spring(), gear('a', 10), gear('b', 20)];
const base = (overrides: Partial<SolverBlueprint> = {}): SolverBlueprint => blueprint(baseSockets(), baseConnections(), overrides);

const expectError = (i: SolverInput, code: SolverErrorCode, path: string) => {
  expect(errorsOf(i)).toContainEqual(expect.objectContaining({ code, path }));
};

describe('baseline', () => {
  it('is valid', () => {
    expect(run(input(base(), baseParts())).status).toBe('runs');
    expect(validateBlueprint(base())).toEqual([]);
  });
});

describe('invalid references fail instead of being ignored (SOLVER §16, DATA §13)', () => {
  it('rejects a connection endpoint that is not a socket', () => {
    expectError(input(blueprint(baseSockets(), [shaft('s', 'spring', 'ghost')]), baseParts()), 'unknown_connection_endpoint', 'connections[0].to');
    expectError(input(blueprint(baseSockets(), [shaft('s', 'ghost', 'a')]), baseParts()), 'unknown_connection_endpoint', 'connections[0].from');
  });

  it('rejects a connection from a socket to itself', () => {
    expectError(input(blueprint(baseSockets(), [shaft('s', 'a', 'a')]), baseParts()), 'self_connection', 'connections[0]');
  });

  it('rejects duplicate socket ids and duplicate connection ids', () => {
    expectError(input(blueprint(sockets('spring', 'a', 'a'), [shaft('s', 'spring', 'a')]), baseParts()), 'duplicate_socket_id', 'sockets[2].id');
    expectError(input(blueprint(baseSockets(), [shaft('s', 'spring', 'a'), shaft('s', 'a', 'b')]), baseParts()), 'duplicate_connection_id', 'connections[1].id');
  });

  it('rejects a connection type outside the closed set', () => {
    const odd = { id: 'x', type: 'gearbox', from: 'a', to: 'b' } as unknown as MechanicalConnection;
    expectError(input(blueprint(baseSockets(), [odd]), baseParts()), 'unknown_connection_type', 'connections[0].type');
  });

  it('rejects an installed part in a socket the blueprint does not have, and two parts in one socket', () => {
    expectError(input(base(), [...baseParts(), plain('ghost')]), 'unknown_socket', 'installedParts[3].socketId');
    expectError(input(base(), [...baseParts(), plain('a')]), 'duplicate_installed_socket', 'installedParts[3].socketId');
  });

  it('rejects an empty part id, and a part id the catalogue does not know', () => {
    expectError(input(base(), [spring(), plain('a', ''), gear('b', 20)]), 'invalid_part_id', 'installedParts[1].partId');
    const catalogue: PartCatalogue = { spring: {}, gear_10: {} };
    expectError(input(base(), baseParts(), 8, { partCatalogue: catalogue }), 'unknown_part', 'installedParts[2].partId');
  });

  it('rejects a part the socket does not accept', () => {
    const bp = blueprint([socket('spring'), socket('a', true, ['gear_10']), socket('b')], baseConnections());
    expectError(input(bp, [spring(), gear('a', 12), gear('b', 20)]), 'part_not_accepted', 'installedParts[1].partId');
  });

  it('rejects a power socket that is not a socket, and a power source that disagrees with the blueprint', () => {
    expectError(input(base({ power: { source: 'mainspring', socketId: 'ghost' } }), baseParts()), 'unknown_power_socket', 'power.socketId');
    const wrongSource: PowerInput = { source: 'ambient_wind' };
    expectError({ blueprint: base(), installedParts: baseParts(), power: wrongSource }, 'power_source_mismatch', 'power.source');
  });

  it('rejects targets that name nothing, or that have no tolerance', () => {
    expectError(input(base({ targets: { angularVelocity: { ghost: 1 }, tolerance: { ghost: 0.1 } } }), baseParts()), 'unknown_target_node', 'targets.angularVelocity.ghost');
    expectError(input(base({ targets: { angularVelocity: { b: 0.5 } } }), baseParts()), 'missing_target_tolerance', 'targets.tolerance.b');
  });

  it('rejects a mesh whose gears give no tooth count and no connection supplies one', () => {
    expectError(input(base(), [spring(), plain('a'), gear('b', 20)]), 'missing_parameter', 'connections[1].parameters.fromTeeth');
  });

  it('rejects a pin without a profile, with a degenerate profile, or a second driver of one follower', () => {
    const pinBp = (c: MechanicalConnection[]) => blueprint(sockets('spring', 'a', 'b'), c);
    const noProfile: MechanicalConnection = { id: 'p', type: 'pin', from: 'a', to: 'b' };
    expectError(input(pinBp([noProfile]), baseParts()), 'missing_parameter', 'connections[0].parameters.profile');
    expectError(input(pinBp([pin('p', 'a', 'b', [1])]), baseParts()), 'invalid_parameter', 'connections[0].parameters.profile.samples');
    expectError(input(pinBp([pin('p', 'a', 'b', [0, Number.NaN])]), baseParts()), 'invalid_parameter', 'connections[0].parameters.profile.samples');
    expectError(input(pinBp([pin('p1', 'spring', 'b', [0, 1]), pin('p2', 'a', 'b', [0, 1])]), baseParts()), 'multiple_pin_drivers', 'connections[1].to');
  });

  it('reports every problem at once, not just the first', () => {
    const errors = errorsOf(input(blueprint(sockets('spring', 'a'), [shaft('s', 'spring', 'x'), shaft('t', 'y', 'a')]), [plain('ghost')]));
    expect(errors.map((e) => e.code)).toEqual(['unknown_connection_endpoint', 'unknown_connection_endpoint', 'unknown_socket']);
  });
});

describe('invalid numerical input (SOLVER §12, §17)', () => {
  const partWith = (socketId: string, parameters: Record<string, number>): InstalledPart => ({ socketId, partId: 'p', parameters });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['zero', 0],
    ['negative', -3],
    ['fractional', 1.5],
  ])('rejects a %s tooth count', (_name, toothCount) => {
    expectError(input(base(), [spring(), partWith('a', { toothCount, module: 1 }), gear('b', 20)]), 'invalid_parameter', 'installedParts[1].parameters.toothCount');
  });

  it.each([
    ['module', 0],
    ['module', -1],
    ['radius', 0],
    ['radius', -2],
    ['drainRate', 0],
    ['drainRate', -1],
    ['energyPerUnit', -1],
    ['angularVelocity', Number.NaN],
    ['energyPerUnit', Number.POSITIVE_INFINITY],
  ])('rejects %s = %s on an installed part', (name, value) => {
    expectError(input(base(), [spring(), partWith('a', { [name]: value }), gear('b', 20)]), 'invalid_parameter', `installedParts[1].parameters.${name}`);
  });

  it.each([[Number.NaN], [-1], [8.5], [9], [Number.POSITIVE_INFINITY]])('rejects %s wind units', (windUnits) => {
    expectError(input(base(), baseParts(), windUnits), 'invalid_parameter', 'power.windUnits');
  });

  it('requires wind units for a mainspring', () => {
    expectError({ blueprint: base(), installedParts: baseParts(), power: { source: 'mainspring' } }, 'missing_parameter', 'power.windUnits');
  });

  it('rejects invalid numbers the blueprint itself supplies', () => {
    const bad = (parameters: NonNullable<MechanicalConnection['parameters']>, path: string) =>
      expectError(input(blueprint(baseSockets(), [shaft('s', 'spring', 'a'), mesh('m', 'a', 'b', parameters)]), baseParts()), 'invalid_parameter', path);
    bad({ fromTeeth: 0 }, 'connections[1].parameters.fromTeeth');
    bad({ toTeeth: Number.NaN }, 'connections[1].parameters.toTeeth');
    bad({ module: -1 }, 'connections[1].parameters.module');
    bad({ fromRadius: -1 }, 'connections[1].parameters.fromRadius');
    bad({ direction: 1 }, 'connections[1].parameters.direction'); // an external mesh always reverses
  });

  it('rejects a belt direction that is not 1 or -1', () => {
    const belts = (direction: number) => blueprint(baseSockets(), [shaft('s', 'spring', 'a'), { id: 'b', type: 'belt', from: 'a', to: 'b', parameters: { direction, fromRadius: 1, toRadius: 2 } }]);
    expectError(input(belts(0.5), baseParts()), 'invalid_parameter', 'connections[1].parameters.direction');
    expectError(input(belts(0), baseParts()), 'invalid_parameter', 'connections[1].parameters.direction');
    expect(run(input(belts(-1), baseParts())).angularVelocity.b).toBe(-0.5);
  });

  it('rejects an invalid target, tolerance, minimum run time or power definition', () => {
    expectError(input(base({ targets: { angularVelocity: { b: Number.NaN }, tolerance: { b: 0.1 } } }), baseParts()), 'invalid_parameter', 'targets.angularVelocity.b');
    expectError(input(base({ targets: { angularVelocity: { b: 1 }, tolerance: { b: -0.1 } } }), baseParts()), 'invalid_parameter', 'targets.tolerance.b');
    expectError(input(base({ targets: { minRunSeconds: Number.NaN } }), baseParts()), 'invalid_parameter', 'targets.minRunSeconds');
    expectError(input(base({ power: { source: 'mainspring', socketId: 'spring', drainRate: 0 } }), baseParts()), 'invalid_parameter', 'power.drainRate');
    const wind = base({ power: { source: 'ambient_wind', socketId: 'spring', angularVelocity: Number.NaN } });
    expectError({ blueprint: wind, installedParts: baseParts(), power: { source: 'ambient_wind' } }, 'invalid_parameter', 'power.angularVelocity');
  });

  it('rejects a cam angle that is not a number, or names no socket', () => {
    expectError(input(base(), baseParts(), 8, { nodeAngles: { a: Number.NaN } }), 'invalid_parameter', 'nodeAngles.a');
    expectError(input(base(), baseParts(), 8, { nodeAngles: { ghost: 0 } }), 'unknown_socket', 'nodeAngles.ghost');
  });

  it('rejects an invalid value that comes from the catalogue, at the connection that needs it', () => {
    const catalogue: PartCatalogue = {
      spring: {},
      gear_a: { mechanical: { toothCount: Number.NaN, module: 1 } },
      gear_b: { mechanical: { toothCount: 20, module: 1 } },
    };
    const parts = [{ socketId: 'spring', partId: 'spring', parameters: { angularVelocity: 1, energyPerUnit: 1, drainRate: 1 } }, { socketId: 'a', partId: 'gear_a' }, { socketId: 'b', partId: 'gear_b' }];
    expect(errorsOf(input(base(), parts, 8, { partCatalogue: catalogue }))).toContainEqual({ code: 'invalid_parameter', path: 'connections[1].parameters.fromTeeth', id: 'a' });
  });

  it('never throws on invalid input: it returns ok: false', () => {
    const out = solve(input(base(), baseParts(), Number.NaN));
    expect(out.ok).toBe(false);
  });
});
