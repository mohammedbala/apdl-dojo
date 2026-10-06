import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, evaluateAchievements, type ChallengeClearEvent } from '../../src/game/achievements';
import { emptySave } from '../../src/app/schema';
import { recordClear, techniqueTag, recordDrillSession } from '../../src/game/progress';

const ev = (p: Partial<ChallengeClearEvent> = {}): ChallengeClearEvent => ({
  kind: 'challenge', id: 'x', track: 't2', stars: 3, timeMs: 50000, lines: 5, parTimeSeconds: 60, parLines: 6,
  script: '', commands: ['BLOCK'], maxLoopIterations: 0, prevBestMs: null, abbrevLong: 0, abbrevDone: 0, dollarChain: 1, selectCount: 0, ...p,
});

describe('achievements', () => {
  it('has 30 unique achievements', () => {
    expect(ACHIEVEMENTS).toHaveLength(30);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(30);
  });
  it('first blood, photo finish, loop de loop via recordClear', () => {
    const s = emptySave(0);
    const r = recordClear(s, {
      challenge: { id: 'x', difficulty: 1, parLines: 6, parTimeSeconds: 60 }, stars: 3, timeMs: 57000, lines: 5, hints: 0, peeks: 0,
      errorsAcrossRuns: 0, commands: ['BLOCK', '*DO'], etypes: ['SOLID185'], ghost: [],
      event: { track: 't2', script: '', maxLoopIterations: 8, abbrevLong: 0, abbrevDone: 0, dollarChain: 1, selectCount: 0 },
    }, '2026-01-01', 1000);
    const ids = r.achievements.map((a) => a.id);
    expect(ids).toContain('first-blood');
    expect(ids).toContain('photo-finish');
    expect(ids).toContain('loop-de-loop');
    expect(ids).not.toContain('par-buster');
    expect(s.achievements['first-blood']).toBe(1000);
    expect(r.xp.total).toBeGreaterThan(0);
    expect(s.streak.current).toBe(1);
  });
  it('ghost buster needs 20% improvement; does not re-unlock', () => {
    const s = emptySave(0);
    expect(evaluateAchievements(s, ev({ prevBestMs: 60000, timeMs: 49000 })).map((a) => a.id)).not.toContain('ghost-buster');
    expect(evaluateAchievements(s, ev({ prevBestMs: 60000, timeMs: 48000 })).map((a) => a.id)).toContain('ghost-buster');
    expect(evaluateAchievements(s, ev({ prevBestMs: 60000, timeMs: 48000 })).map((a) => a.id)).not.toContain('ghost-buster');
  });
  it('four-char fiend and direct hit', () => {
    const s = emptySave(0);
    const ids = evaluateAchievements(s, ev({ abbrevLong: 3, abbrevDone: 3, commands: ['N', 'NGEN', 'E', 'EGEN'] })).map((a) => a.id);
    expect(ids).toContain('four-char-fiend');
    expect(ids).toContain('direct-hit');
  });
  it('drill clubs', () => {
    const s = emptySave(0);
    const r = recordDrillSession(s, { t: 1, set: 'all', format: '60c', strict: 'relaxed', commands: 60, cpm: 31, accuracy: 0.99, firstTry: 1, durationMs: 1, xp: 0 }, 500, '2026-01-01');
    expect(r.xp).toBe(300);
    const ids = r.achievements.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['thirty-club', 'flawless']));
    expect(ids).not.toContain('forty-club');
  });
  it('technique tags', () => {
    expect(techniqueTag(['N', 'E', 'NGEN'])).toBe('Direct');
    expect(techniqueTag(['BLOCK', 'VSBV', 'VEXT'])).toBe('Sweep');
    expect(techniqueTag(['K', 'A', 'KGEN', 'VEXT'])).toBe('Sweep');
    expect(techniqueTag(['K', 'KGEN', 'A'])).toBe('Bottom-up');
    expect(techniqueTag(['BLOCK', 'VSBV'])).toBe('Primitives');
    expect(techniqueTag(['K', 'L', 'SECTYPE', 'LMESH'])).toBe('Idealised');
  });
});
