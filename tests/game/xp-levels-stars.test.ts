import { describe, expect, it } from 'vitest';
import { challengeXp, drillXp, drillParMs, speedrunXp, dailyXp, errorHuntXp, applyCap } from '../../src/game/xp';
import { levelForXp, xpForLevel, levelInfo, foundationTier } from '../../src/game/levels';
import { computeStars } from '../../src/game/stars';

const base = { hints: 0, peeks: 0, zeroErrors: false, linesUnderPar: false, timeUnderPar: false };

describe('xp', () => {
  it('first clear by difficulty and stars', () => {
    expect(challengeXp({ ...base, difficulty: 1, stars: 3, prevBestStars: 0 }).total).toBe(50);
    expect(challengeXp({ ...base, difficulty: 3, stars: 2, prevBestStars: 0 }).total).toBe(160);
    expect(challengeXp({ ...base, difficulty: 5, stars: 1, prevBestStars: 0 }).total).toBe(300);
  });
  it('first clear bonuses +10% each', () => {
    expect(challengeXp({ difficulty: 2, stars: 3, prevBestStars: 0, hints: 0, peeks: 0, zeroErrors: true, linesUnderPar: true, timeUnderPar: true }).total).toBe(130);
  });
  it('repeat pays 25% of base; upgrade pays the delta', () => {
    expect(challengeXp({ ...base, difficulty: 2, stars: 2, prevBestStars: 2 }).total).toBe(25);
    expect(challengeXp({ ...base, difficulty: 2, stars: 3, prevBestStars: 1 }).total).toBe(50);
  });
  it('hint and peek penalties, min 5', () => {
    expect(challengeXp({ ...base, difficulty: 2, stars: 2, prevBestStars: 0, hints: 1 }).total).toBe(68);
    expect(challengeXp({ ...base, difficulty: 2, stars: 2, prevBestStars: 0, peeks: 2 }).total).toBe(64);
    expect(challengeXp({ ...base, difficulty: 1, stars: 1, prevBestStars: 1, hints: 3, peeks: 3 }).total).toBe(5);
    expect(challengeXp({ ...base, difficulty: 1, stars: 0, prevBestStars: 0 }).total).toBe(0);
  });
  it('drills', () => {
    expect(drillParMs('K,1,2,3')).toBe(1000 + 180 * 7);
    expect(drillXp([{ answer: 'K,1', firstTry: true, ms: 500 }, { answer: 'K,1', firstTry: false, ms: 500 }], 0.9)).toBe(3);
    expect(drillXp(Array.from({ length: 10 }, () => ({ answer: 'K,1', firstTry: true, ms: 100 })), 0.99)).toBe(22);
    expect(applyCap(50, 280, 300)).toBe(20);
    expect(applyCap(50, 300, 300)).toBe(0);
  });
  it('speedrun, daily, error hunt', () => {
    expect(speedrunXp({ category: 'any', timeMs: 100000, prevBestMs: null }).total).toBe(400);
    expect(speedrunXp({ category: 'hundred', timeMs: 100000, prevBestMs: null }).total).toBe(800);
    expect(speedrunXp({ category: 'any', timeMs: 100000, prevBestMs: 130500 }).total).toBe(30);
    expect(speedrunXp({ category: 'any', timeMs: 100000, prevBestMs: 900000 }).total).toBe(200);
    expect(speedrunXp({ category: 'any', timeMs: 100000, prevBestMs: 90000 }).total).toBe(0);
    expect(dailyXp(3, 0).total).toBe(150);
    expect(dailyXp(2, 3).total).toBe(170);
    expect(errorHuntXp(60, 30000)).toBe(180);
    expect(errorHuntXp(60, 240000)).toBe(60);
    expect(errorHuntXp(60, 60000)).toBe(120);
  });
});

describe('levels', () => {
  it('ladder', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(300);
    expect(xpForLevel(12)).toBe(19800);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(299)).toBe(1);
    expect(levelForXp(300)).toBe(2);
    expect(levelForXp(19799)).toBe(11);
    expect(levelForXp(19800)).toBe(12);
    expect(levelForXp(1e9)).toBe(12);
    expect(levelInfo(450)).toMatchObject({ level: 2, title: 'Line Drafter', into: 150, span: 600 });
    expect(levelInfo(20000).progress).toBe(1);
    expect(foundationTier(59)).toBe('★★★');
    expect(foundationTier(119)).toBe('★★');
    expect(foundationTier(299)).toBe('★');
    expect(foundationTier(400)).toBe('');
  });
});

describe('stars', () => {
  const s = { match: true, parTimeSeconds: 60, parLines: 10, errorsAcrossRuns: 0, hints: 0 };
  it('rules', () => {
    expect(computeStars({ ...s, match: false, timeMs: 1, lines: 1 })).toBe(0);
    expect(computeStars({ ...s, timeMs: 60000, lines: 10 })).toBe(3);
    expect(computeStars({ ...s, timeMs: 60001, lines: 10 })).toBe(2);
    expect(computeStars({ ...s, timeMs: 30000, lines: 11 })).toBe(2);
    expect(computeStars({ ...s, timeMs: 30000, lines: 10, errorsAcrossRuns: 1 })).toBe(2);
    expect(computeStars({ ...s, timeMs: 30000, lines: 10, hints: 1 })).toBe(2);
    expect(computeStars({ ...s, timeMs: 120000, lines: 15 })).toBe(2);
    expect(computeStars({ ...s, timeMs: 120001, lines: 15 })).toBe(1);
    expect(computeStars({ ...s, timeMs: 1000, lines: 16 })).toBe(1);
  });
});
