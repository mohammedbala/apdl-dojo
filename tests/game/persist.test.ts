import { beforeEach, describe, expect, it } from 'vitest';
import { loadSaveFrom, mergeSaves, KEY_SAVE, parseImport, exportFileName, type KV } from '../../src/app/persist';
import { migrate } from '../../src/app/migrations';
import { emptySave, SCHEMA_VERSION } from '../../src/app/schema';

function mockKV(init: Record<string, string> = {}): KV & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('persist', () => {
  let kv: ReturnType<typeof mockKV>;
  beforeEach(() => { kv = mockKV(); });

  it('empty storage gives a fresh save', () => {
    const r = loadSaveFrom(kv, 1);
    expect(r.save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(r.corruptBackup).toBeUndefined();
  });
  it('corrupt blob is backed up, never dropped', () => {
    kv.setItem(KEY_SAVE, '{not json');
    const r = loadSaveFrom(kv, 123);
    expect(r.corruptBackup).toBe(`${KEY_SAVE}.corrupt-123`);
    expect(kv.data.get(`${KEY_SAVE}.corrupt-123`)).toBe('{not json');
    expect(r.save.xp.total).toBe(0);
  });
  it('migrates v0 blobs and fills missing fields', () => {
    const s = migrate({ xp: { total: 42 }, challenges: { a: { attempts: 1, clears: 1, bestStars: 2 } } });
    expect(s.schemaVersion).toBe(1);
    expect(s.xp.total).toBe(42);
    expect(s.xp.bySource.drill).toBe(0);
    expect(s.streak.history).toEqual([]);
    expect(s.challenges.a.bestStars).toBe(2);
  });
  it('rejects future schema versions', () => {
    expect(() => migrate({ schemaVersion: 99 })).toThrow();
    kv.setItem(KEY_SAVE, JSON.stringify({ schemaVersion: 99 }));
    expect(loadSaveFrom(kv, 5).corruptBackup).toBeDefined();
  });
  it('round-trips through storage', () => {
    const s = emptySave(1);
    s.xp.total = 300;
    kv.setItem(KEY_SAVE, JSON.stringify(s));
    expect(loadSaveFrom(kv).save.xp.total).toBe(300);
  });
  it('merge: max xp/stars, min times, union achievements and runs, max box', () => {
    const a = emptySave(10), b = emptySave(5);
    a.xp.total = 100; a.xp.bySource.challenge = 100;
    b.xp.total = 250; b.xp.bySource.drill = 250;
    a.challenges.x = { attempts: 3, clears: 1, firstClearAt: 50, bestStars: 1, bestTimeMs: 9000, bestLines: 8, ghost: null };
    b.challenges.x = { attempts: 1, clears: 1, firstClearAt: 40, bestStars: 3, bestTimeMs: 12000, bestLines: 6, ghost: [] };
    a.achievements = { 'first-blood': 100 };
    b.achievements = { 'first-blood': 50, 'streak-7': 70 };
    a.drills.cards.k = { box: 2, due: '2026-01-01', reviews: 3, lapses: 0 };
    b.drills.cards.k = { box: 4, due: '2026-01-05', reviews: 5, lapses: 1 };
    b.speedruns.any.push({ id: 'r1', t: 1, category: 'any', timeMs: 100, lines: 1, errors: 0, peeks: 0, splits: {}, technique: 'Mixed', commands: [] });
    const m = mergeSaves(a, b);
    expect(m.xp.total).toBe(350);
    expect(m.challenges.x).toMatchObject({ bestStars: 3, bestTimeMs: 9000, bestLines: 6, attempts: 3, firstClearAt: 40 });
    expect(m.achievements).toEqual({ 'first-blood': 50, 'streak-7': 70 });
    expect(m.drills.cards.k.box).toBe(4);
    expect(m.speedruns.any).toHaveLength(1);
    expect(m.createdAt).toBe(5);
  });
  it('parses export envelopes and raw saves', () => {
    const s = emptySave(1);
    s.xp.total = 7;
    expect(parseImport(JSON.stringify({ app: 'apdl-dojo', save: s })).save.xp.total).toBe(7);
    expect(parseImport(JSON.stringify(s)).save.xp.total).toBe(7);
    expect(() => parseImport('nope')).toThrow(/JSON/);
    expect(exportFileName(new Date(2026, 9, 5))).toBe('apdl-dojo-2026-10-05.json');
  });
});
