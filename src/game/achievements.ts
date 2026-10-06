// 30 achievements (plan §6). Each check runs after every scoring event; conditions are always visible.
import type { SaveV1, SpeedrunRecord, DrillSessionRecord } from '../app/schema';
import { challengesForTrack, lessonsForTrack, tracks } from '../content';
import { isMastered } from './leitner';
import { levelForXp, MAX_LEVEL } from './levels';
import { BOTTOM_UP, BOOLEANS, PRIMITIVES, SWEEPS, SOLID_MESHERS } from '../content/tracks';

export interface ChallengeClearEvent {
  kind: 'challenge';
  id: string;
  track: string;
  stars: 0 | 1 | 2 | 3;
  timeMs: number;
  lines: number;
  parTimeSeconds: number;
  parLines: number;
  script: string;
  commands: string[];
  maxLoopIterations: number;
  /** best time before this clear */
  prevBestMs: number | null;
  abbrevLong: number;
  abbrevDone: number;
  dollarChain: number;
  selectCount: number;
}

export type GameEvent =
  | ChallengeClearEvent
  | { kind: 'drill'; session: DrillSessionRecord }
  | { kind: 'flashcard' }
  | { kind: 'speedrun'; record: SpeedrunRecord; hundred: boolean }
  | { kind: 'daily' }
  | { kind: 'errorhunt' }
  | { kind: 'xp' }
  | { kind: 'boot' };

export interface AchCtx {
  save: SaveV1;
  event: GameEvent;
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  check: (c: AchCtx) => boolean;
}

const clear = (c: AchCtx): ChallengeClearEvent | null => (c.event.kind === 'challenge' && c.event.stars > 0 ? c.event : null);

function clearedCommands(s: SaveV1): Set<string> {
  const out = new Set<string>();
  for (const r of Object.values(s.challenges)) if (r.clears > 0) for (const x of r.commands ?? []) out.add(x);
  for (const r of [...s.speedruns.any, ...s.speedruns.hundred]) for (const x of r.commands) out.add(x);
  return out;
}

const hasAll = (set: Set<string>, list: string[]) => list.every((x) => set.has(x));

function bestSpeedrunMs(s: SaveV1): number | null {
  const all = [...s.speedruns.any, ...s.speedruns.hundred];
  return all.length ? Math.min(...all.map((r) => r.timeMs)) : null;
}
const subSeconds = (sec: number) => (c: AchCtx) => {
  const b = bestSpeedrunMs(c.save);
  return b !== null && b < sec * 1000;
};

function bestSession(s: SaveV1, pred: (x: DrillSessionRecord) => boolean): DrillSessionRecord[] {
  return s.drills.sessions.filter(pred);
}

const DIRECT_FORBIDDEN = new Set([...BOTTOM_UP, ...PRIMITIVES, ...SWEEPS, ...BOOLEANS, ...SOLID_MESHERS]);

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-blood', title: 'First Blood', desc: 'Clear your first challenge.', check: (c) => Object.values(c.save.challenges).some((r) => r.clears > 0) },
  { id: 'sub-300', title: 'Sub-300', desc: 'Finish the foundation speedrun in under 300 s.', check: subSeconds(300) },
  { id: 'sub-120', title: 'Sub-120', desc: 'Finish the foundation speedrun in under 120 s.', check: subSeconds(120) },
  { id: 'sub-60', title: 'Sub-60', desc: 'Finish the foundation speedrun in under 60 s.', check: subSeconds(60) },
  { id: 'thirty-club', title: 'Thirty Club', desc: 'Reach 30 CPM in a 60-command drill session.', check: (c) => bestSession(c.save, (s) => s.commands >= 60 && s.cpm >= 30).length > 0 },
  { id: 'forty-club', title: 'Forty Club', desc: 'Reach 40 CPM in a 60-command drill session.', check: (c) => bestSession(c.save, (s) => s.commands >= 60 && s.cpm >= 40).length > 0 },
  { id: 'flawless', title: 'Flawless', desc: '100% first-try accuracy over at least 50 drill commands in one session.', check: (c) => bestSession(c.save, (s) => s.commands >= 50 && s.firstTry >= 1).length > 0 },
  { id: 'par-buster', title: 'Par Buster', desc: 'Clear a challenge in under half the par time.', check: (c) => { const e = clear(c); return !!e && e.timeMs < e.parTimeSeconds * 500; } },
  { id: 'photo-finish', title: 'Photo Finish', desc: 'Earn 3★ within 5 s of par time.', check: (c) => { const e = clear(c); return !!e && e.stars === 3 && e.timeMs >= (e.parTimeSeconds - 5) * 1000; } },
  { id: 'ghost-buster', title: 'Ghost Buster', desc: 'Beat your own ghost by at least 20%.', check: (c) => { const e = clear(c); return !!e && e.prevBestMs !== null && e.timeMs <= 0.8 * e.prevBestMs; } },
  { id: 'four-char-fiend', title: 'Four-char Fiend', desc: 'Clear a challenge typing every command longer than 4 characters as its abbreviation (at least 3 of them).', check: (c) => { const e = clear(c); return !!e && e.abbrevLong >= 3 && e.abbrevDone === e.abbrevLong; } },
  { id: 'boolean-operator', title: 'Boolean Operator', desc: 'Use VSBV, VADD, VGLUE, VOVLAP, ASBA and AADD in cleared challenges.', check: (c) => hasAll(clearedCommands(c.save), ['VSBV', 'VADD', 'VGLUE', 'VOVLAP', 'ASBA', 'AADD']) },
  { id: 'primitive-instinct', title: 'Primitive Instinct', desc: 'Use BLOCK, BLC4, BLC5, CYLIND, CYL4 and RECTNG in cleared challenges.', check: (c) => hasAll(clearedCommands(c.save), ['BLOCK', 'BLC4', 'BLC5', 'CYLIND', 'CYL4', 'RECTNG']) },
  { id: 'extrudinaire', title: 'Extrudinaire', desc: 'Use VEXT, VOFFST, VROTAT and VDRAG in cleared challenges.', check: (c) => hasAll(clearedCommands(c.save), ['VEXT', 'VOFFST', 'VROTAT', 'VDRAG']) },
  { id: 'direct-hit', title: 'Direct Hit', desc: 'Clear a challenge with N/E direct generation only (no solid model, no meshers).', check: (c) => { const e = clear(c); return !!e && e.commands.includes('N') && e.commands.includes('E') && !e.commands.some((x) => DIRECT_FORBIDDEN.has(x)); } },
  { id: 'element-zoo', title: 'Element Zoo', desc: 'Use 6 different element types across cleared challenges.', check: (c) => { const s = new Set<string>(); for (const r of Object.values(c.save.challenges)) for (const t of r.etypes ?? []) s.add(t); return s.size >= 6; } },
  { id: 'loop-de-loop', title: 'Loop de Loop', desc: 'Clear a challenge with a *DO loop of at least 4 iterations.', check: (c) => { const e = clear(c); return !!e && e.maxLoopIterations >= 4; } },
  { id: 'selectively-brilliant', title: 'Selectively Brilliant', desc: 'Clear a challenge using at least 5 selection commands.', check: (c) => { const e = clear(c); return !!e && e.selectCount >= 5; } },
  { id: 'component-collector', title: 'Component Collector', desc: 'Use CM in 10 different cleared challenges.', check: (c) => Object.values(c.save.challenges).filter((r) => r.clears > 0 && (r.commands ?? []).includes('CM')).length >= 10 },
  { id: 'one-liner', title: 'One-liner', desc: 'Clear a challenge with at least 4 commands joined by $ on one line.', check: (c) => { const e = clear(c); return !!e && e.dollarChain >= 4; } },
  { id: 'streak-7', title: 'Streak 7', desc: 'Keep a 7-day streak.', check: (c) => c.save.streak.longest >= 7 },
  { id: 'streak-30', title: 'Streak 30', desc: 'Keep a 30-day streak.', check: (c) => c.save.streak.longest >= 30 },
  { id: 'streak-100', title: 'Streak 100', desc: 'Keep a 100-day streak.', check: (c) => c.save.streak.longest >= 100 },
  { id: 'daily-devotee', title: 'Daily Devotee', desc: 'Clear 10 daily challenges.', check: (c) => Object.values(c.save.daily).filter((d) => d.stars > 0).length >= 10 },
  { id: 'leitner-legend', title: 'Leitner Legend', desc: 'Master 50 flashcards (Leitner box 5).', check: (c) => Object.values(c.save.drills.cards).filter(isMastered).length >= 50 },
  { id: 'track-star', title: 'Track Star', desc: 'Earn 3★ on every challenge of a track.', check: (c) => tracks.some((t) => { const l = challengesForTrack(t.id); return l.length > 0 && l.every((ch) => (c.save.challenges[ch.id]?.bestStars ?? 0) === 3); }) },
  { id: 'four-ways', title: 'Four Ways', desc: 'Clear boss lessons 1–4 (the foundation four ways).', check: (c) => { const ls = lessonsForTrack('t10').filter((l) => l.order <= 4); return ls.length >= 4 && ls.every((l) => l.challengeIds.length > 0 && l.challengeIds.every((id) => (c.save.challenges[id]?.clears ?? 0) > 0)); } },
  { id: 'hundred-percent', title: 'Hundred Percent', desc: 'Complete a 100% speedrun (match, ≤ par lines, zero errors, no peeks).', check: (c) => c.save.speedruns.hundred.length > 0 },
  { id: 'bug-squasher', title: 'Bug Squasher', desc: 'Clear 10 error hunts.', check: (c) => Object.values(c.save.errorHunt).filter((r) => r.clears > 0).length >= 10 },
  { id: 'foundation-architect', title: 'Foundation Architect', desc: 'Reach level 12.', check: (c) => levelForXp(c.save.xp.total) >= MAX_LEVEL },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Evaluate all locked achievements; records unlocks in save.achievements and returns the new ones. */
export function evaluateAchievements(save: SaveV1, event: GameEvent, now = Date.now()): Achievement[] {
  const out: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id]) continue;
    let ok = false;
    try {
      ok = a.check({ save, event });
    } catch {
      ok = false;
    }
    if (ok) {
      save.achievements[a.id] = now;
      out.push(a);
    }
  }
  return out;
}
