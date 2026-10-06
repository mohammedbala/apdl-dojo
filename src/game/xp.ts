// XP formulas (plan §6 Progression).
import type { Stars } from './stars';

export const BASE: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 50, 2: 100, 3: 200, 4: 350, 5: 600 };
export const STAR_MULT: Record<1 | 2 | 3, number> = { 1: 0.5, 2: 0.8, 3: 1.0 };
export const HINT_PENALTY = 0.15;
export const PEEK_PENALTY = 0.1;
export const DRILL_DAILY_CAP = 300;
export const FLASH_DAILY_CAP = 100;
export const MIN_XP = 5;

export interface XpPart {
  label: string;
  amount: number;
}
export interface XpAward {
  total: number;
  parts: XpPart[];
}

export interface ChallengeXpInput {
  difficulty: 1 | 2 | 3 | 4 | 5;
  stars: Stars;
  /** best stars before this clear (0 = never cleared) */
  prevBestStars: Stars;
  hints: number;
  peeks: number;
  zeroErrors: boolean;
  linesUnderPar: boolean;
  timeUnderPar: boolean;
}

export function challengeXp(i: ChallengeXpInput): XpAward {
  if (i.stars === 0) return { total: 0, parts: [] };
  const base = BASE[i.difficulty];
  const parts: XpPart[] = [];
  const firstClear = i.prevBestStars === 0;
  let raw: number;
  if (firstClear) {
    raw = base * STAR_MULT[i.stars];
    parts.push({ label: `First clear ${i.stars}★ (${base} × ${STAR_MULT[i.stars]})`, amount: raw });
  } else if (i.stars > i.prevBestStars) {
    raw = base * (STAR_MULT[i.stars] - STAR_MULT[i.prevBestStars as 1 | 2 | 3]);
    parts.push({ label: `Star upgrade ${i.prevBestStars}★ → ${i.stars}★`, amount: raw });
  } else {
    raw = base * 0.25;
    parts.push({ label: 'Repeat clear (25% of base)', amount: raw });
  }
  let bonus = 0;
  if (firstClear) {
    if (i.zeroErrors) bonus += 0.1;
    if (i.linesUnderPar) bonus += 0.1;
    if (i.timeUnderPar) bonus += 0.1;
    if (bonus > 0) parts.push({ label: `First-clear bonuses +${Math.round(bonus * 100)}%`, amount: raw * bonus });
  }
  const penalty = Math.min(1, HINT_PENALTY * i.hints + PEEK_PENALTY * i.peeks);
  const gross = raw * (1 + bonus);
  if (penalty > 0) parts.push({ label: `Hints/peeks −${Math.round(penalty * 100)}%`, amount: -gross * penalty });
  let total = Math.round(gross * (1 - penalty));
  if (total < MIN_XP) {
    parts.push({ label: 'Minimum award', amount: MIN_XP - total });
    total = MIN_XP;
  }
  return { total, parts: parts.map((p) => ({ ...p, amount: Math.round(p.amount) })) };
}

/** Drill par time for a single command (ms). */
export function drillParMs(answer: string): number {
  return 1000 + 180 * answer.length;
}

export interface DrillItemResult {
  answer: string;
  firstTry: boolean;
  ms: number;
}

/** Raw drill XP for a session before the daily cap. */
export function drillXp(items: DrillItemResult[], keystrokeAccuracy: number): number {
  let xp = 0;
  for (const it of items) xp += it.firstTry && it.ms < drillParMs(it.answer) ? 2 : 1;
  if (keystrokeAccuracy >= 0.98) xp *= 1.1;
  return Math.round(xp);
}

/** Apply a daily cap: returns the amount actually granted. */
export function applyCap(amount: number, usedToday: number, cap: number): number {
  return Math.max(0, Math.min(amount, cap - usedToday));
}

export function flashcardXp(reviews: number): number {
  return reviews;
}

export interface SpeedrunXpInput {
  category: 'any' | 'hundred';
  timeMs: number;
  /** previous PB in this category (ms), null if none */
  prevBestMs: number | null;
}

export function speedrunXp(i: SpeedrunXpInput): XpAward {
  if (i.prevBestMs == null) {
    const amount = i.category === 'any' ? 400 : 800;
    return { total: amount, parts: [{ label: `First ${i.category === 'any' ? 'any%' : '100%'} finish`, amount }] };
  }
  const gained = Math.floor((i.prevBestMs - i.timeMs) / 1000);
  if (gained <= 0) return { total: 0, parts: [] };
  const amount = Math.min(200, gained);
  return { total: amount, parts: [{ label: `PB improved by ${gained}s`, amount }] };
}

export function dailyXp(stars: Stars, streak: number): XpAward {
  if (stars === 0) return { total: 0, parts: [] };
  const parts: XpPart[] = [{ label: `Daily ${stars}★ (150 × ${STAR_MULT[stars]})`, amount: Math.round(150 * STAR_MULT[stars]) }];
  if (streak >= 3) parts.push({ label: 'Streak ≥ 3 bonus', amount: 50 });
  return { total: parts.reduce((s, p) => s + p.amount, 0), parts };
}

export function errorHuntXp(parTimeSeconds: number, timeMs: number): number {
  const ratio = Math.max(0.5, Math.min(1.5, parTimeSeconds / Math.max(0.001, timeMs / 1000)));
  return Math.round(120 * ratio);
}
