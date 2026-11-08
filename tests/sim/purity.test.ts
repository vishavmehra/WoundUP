import { describe, expect, it } from 'vitest';

// ADR-008, SOLVER §2: src/sim is pure TypeScript. No Three.js, IWSDK, DOM or browser API, no frame timing, no randomness.
const sources = import.meta.glob<string>('../../src/sim/*.ts', { query: '?raw', import: 'default', eager: true });
const stripComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('src/sim stays pure', () => {
  it('finds the solver sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(6);
  });

  it('imports only its own modules', () => {
    let scanned = 0;
    for (const [file, raw] of Object.entries(sources)) {
      const code = stripComments(raw);
      const specifiers = [
        ...[...code.matchAll(/^\s*(?:import|export)\b[^;'"]*?\bfrom\s*(['"])(.+?)\1/gm)].map((m) => m[2]), // import/export ... from '...'
        ...[...code.matchAll(/^\s*import\s*(['"])(.+?)\1/gm)].map((m) => m[2]), // import '...'
        ...[...code.matchAll(/\bimport\s*\(\s*(['"])(.+?)\1/g)].map((m) => m[2]), // import('...')
      ];
      for (const specifier of specifiers) expect(specifier, `${file} imports ${specifier}`).toMatch(/^\.\//);
      scanned += specifiers.length;
    }
    expect(scanned, 'the scan must actually find the imports').toBeGreaterThan(8);
  });

  it('uses no browser API, timer or source of randomness', () => {
    const banned = /\b(window|document|navigator|localStorage|sessionStorage|requestAnimationFrame|setTimeout|setInterval|performance|fetch|THREE)\b|Math\.random|Date\.now|new Date\b/;
    for (const [file, raw] of Object.entries(sources)) {
      expect(stripComments(raw), file).not.toMatch(banned);
    }
  });
});
