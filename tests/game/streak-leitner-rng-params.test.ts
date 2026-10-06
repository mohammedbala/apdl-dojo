import { describe, expect, it } from 'vitest';
import { recordActivity, emptyStreak, effectiveStreak, addDays, streakStrip } from '../../src/game/streak';
import { review, newCard, buildQueue, isMastered } from '../../src/game/leitner';
import { createRng, hashString } from '../../src/game/rng';
import { defaultParams, drawParams, withParams, fillBrief } from '../../src/game/params';
import { updateSplits, splitRows } from '../../src/game/splits';
import { AttemptSession, ghostAt } from '../../src/game/session';

describe('streak', () => {
  it('consecutive days and same day', () => {
    let s = recordActivity(emptyStreak(), '2026-01-01');
    s = recordActivity(s, '2026-01-01');
    s = recordActivity(s, '2026-01-02');
    expect(s.current).toBe(2);
    expect(s.longest).toBe(2);
  });
  it('earns freezes every 7 days, bank max 2, consumes on gaps', () => {
    let s = emptyStreak();
    let d = '2026-03-01';
    for (let i = 0; i < 21; i++) { s = recordActivity(s, d); d = addDays(d, 1); }
    expect(s.current).toBe(21);
    expect(s.freezes).toBe(2);
    // miss 2 days -> both freezes used
    d = addDays(d, 2);
    s = recordActivity(s, d);
    expect(s.current).toBe(22);
    expect(s.freezes).toBe(0);
    expect(s.frozen.length).toBe(2);
    // miss 1 day without freezes -> reset
    s = recordActivity(s, addDays(d, 2));
    expect(s.current).toBe(1);
    expect(s.longest).toBe(22);
  });
  it('effective streak and strip', () => {
    let s = recordActivity(emptyStreak(), '2026-05-10');
    expect(effectiveStreak(s, '2026-05-11')).toBe(1);
    expect(effectiveStreak(s, '2026-05-13')).toBe(0);
    s = { ...s, freezes: 1 };
    expect(effectiveStreak(s, '2026-05-12')).toBe(1);
    const strip = streakStrip(s, '2026-05-12', 3);
    expect(strip.map((x) => x.state)).toEqual(['active', 'missed', 'today']);
  });
});

describe('leitner', () => {
  it('transitions', () => {
    let c = newCard('2026-01-01');
    c = review(c, true, '2026-01-01');
    expect(c).toMatchObject({ box: 1, due: '2026-01-02' });
    c = review(c, true, '2026-01-02');
    expect(c).toMatchObject({ box: 2, due: '2026-01-05' });
    for (let i = 0; i < 5; i++) c = review(c, true, '2026-02-01');
    expect(c.box).toBe(5);
    expect(isMastered(c)).toBe(true);
    expect(c.due).toBe('2026-03-03');
    c = review(c, false, '2026-03-03');
    expect(c).toMatchObject({ box: 0, due: '2026-03-03', lapses: 1 });
  });
  it('queue: due first then new, capped', () => {
    const cards = { a: { ...newCard('2026-01-01'), box: 2, due: '2026-01-01' }, b: { ...newCard('2026-01-01'), due: '2026-02-01' } };
    const q = buildQueue(['a', 'b', 'c', 'd'], cards, '2026-01-10', 1);
    expect(q).toEqual([{ id: 'a', isNew: false }, { id: 'c', isNew: true }]);
  });
});

describe('rng', () => {
  it('deterministic per seed', () => {
    const a = createRng(42), b = createRng(42), c = createRng(43);
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(sa);
    expect(hashString('apdl-dojo:2026-10-05')).toBe(hashString('apdl-dojo:2026-10-05'));
    expect(createRng('x').int(1, 6)).toBe(createRng('x').int(1, 6));
  });
  it('int/float/pick bounds', () => {
    const r = createRng(7);
    for (let i = 0; i < 500; i++) {
      const n = r.int(2, 5);
      expect(n >= 2 && n <= 5 && Number.isInteger(n)).toBe(true);
      const f = r.float(1, 2, 0.25);
      expect(f >= 1 && f <= 2 && (f * 4) % 1 === 0).toBe(true);
      expect(['a', 'b']).toContain(r.pick(['a', 'b']));
    }
  });
});

describe('params', () => {
  it('defaults are midpoint rounded to step', () => {
    expect(defaultParams({ H: { min: 6, max: 10, step: 1 }, W: { min: 1, max: 2, step: 0.25 }, L: { min: 0, max: 3, step: 2 } })).toEqual({ H: 8, W: 1.5, L: 2 });
    expect(defaultParams(undefined)).toEqual({});
  });
  it('random draws stay in range', () => {
    const r = createRng(1);
    for (let i = 0; i < 100; i++) {
      const p = drawParams({ H: { min: 6, max: 10, step: 1 } }, r);
      expect(p.H >= 6 && p.H <= 10 && Number.isInteger(p.H)).toBe(true);
    }
  });
  it('injection and brief substitution', () => {
    expect(withParams('BLOCK,0,1,0,1,0,H', { H: 8, W: 0.1 + 0.2 })).toBe('H=8\nW=0.3\nBLOCK,0,1,0,1,0,H');
    expect(withParams('X', {})).toBe('X');
    expect(fillBrief('a {{H}} x {{ W }} {{Q}}', { H: 8, W: 2.5 })).toBe('a 8 x 2.5 {{Q}}');
  });
});

describe('splits + session', () => {
  it('first-pass timestamps only', () => {
    const st = (g: boolean, a: boolean) => ({ stages: { geometry: { pass: g, score: 1, present: true }, attributes: { pass: a, score: 1, present: true }, mesh: { pass: false, score: 0, present: true }, bcs: { pass: false, score: 0, present: false } } });
    let s = updateSplits({}, st(true, false), 1000);
    s = updateSplits(s, st(true, true), 2000);
    s = updateSplits(s, st(true, true), 3000);
    expect(s).toEqual({ geometry: 1000, attributes: 2000 });
    expect(splitRows(s, { geometry: 1500 })[0]).toMatchObject({ delta: -500 });
  });
  it('attempt state machine', () => {
    const a = new AttemptSession();
    expect(a.recordRun(10, { lines: 1, errors: 0, match: false, total: 0, stagesPassed: 0, explicit: true })).toBeNull();
    expect(a.keystroke(100)).toBe(true);
    expect(a.keystroke(200)).toBe(false);
    a.recordRun(1100, { lines: 2, errors: 2, match: false, total: 10, stagesPassed: 1, explicit: false });
    expect(a.errorsAcrossRuns).toBe(0);
    a.recordRun(2100, { lines: 3, errors: 1, match: false, total: 50, stagesPassed: 2, explicit: true });
    expect(a.errorsAcrossRuns).toBe(1);
    a.useHint();
    a.peek();
    expect(a.clear(5100)).toBe(5000);
    expect(a.elapsed(99999)).toBe(5000);
    expect(a.useHint()).toBe(false);
    expect(ghostAt(a.ghost, 1500)).toMatchObject({ stages: 1 });
    expect(ghostAt(a.ghost, 50)).toMatchObject({ stages: 0 });
    const snap = a.snapshot();
    a.reset();
    expect(a.state).toBe('idle');
    a.restore(snap);
    expect(a.state).toBe('cleared');
  });
});
