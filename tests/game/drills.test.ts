import { describe, expect, it } from 'vitest';
import { drills } from '../../src/content/drills';
import { canonString, canonEqual, canonicalize } from '../../src/game/canon';
import { createRng } from '../../src/game/rng';
import { resolveCommandName } from '../../src/apdl/commands/registry';

describe('drill templates', () => {
  it('has unique ids and ~60+ templates', () => {
    expect(drills.length).toBeGreaterThanOrEqual(60);
    expect(new Set(drills.map((d) => d.id)).size).toBe(drills.length);
  });
  for (const t of drills) {
    it(`${t.id} generates valid prompts over 50 seeds`, () => {
      for (let seed = 1; seed <= 50; seed++) {
        const g = t.gen(createRng(seed * 7919 + t.id.length));
        expect(g.prompt.length).toBeGreaterThan(5);
        expect(g.prompt).not.toMatch(/undefined|NaN/);
        expect(g.answer).not.toMatch(/undefined|NaN/);
        const c = canonString(g.answer);
        expect(canonString(c)).toBe(c);
        const cmds = canonicalize(g.answer);
        expect(cmds.length).toBe(1);
        expect(cmds[0].name).toBe(t.command);
        expect(t.command === '*SET' || resolveCommandName(t.command) === t.command).toBe(true);
        for (const a of g.accepted ?? []) {
          const ca = canonString(a);
          expect(canonString(ca)).toBe(ca);
          expect(canonicalize(a).length).toBe(1);
        }
        expect(canonEqual(g.answer, g.answer)).toBe(true);
      }
    });
  }
  it('is deterministic per seed', () => {
    for (const t of drills) expect(t.gen(createRng(5))).toEqual(t.gen(createRng(5)));
  });
});
