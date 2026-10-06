// Applying results to the save: XP, records, streak, unlocks, radar. Mutates the SaveV1 passed in.
import type { Challenge, Track, TrackId } from '../content/types';
import { challengesForTrack, tracks } from '../content';
import { COMMANDS } from '../content/commands';
import { emptyChallengeRecord, type SaveV1, type SpeedrunRecord, type XpSource, type DrillSessionRecord } from '../app/schema';
import { evaluateAchievements, type Achievement, type GameEvent } from './achievements';
import { recordActivity, effectiveStreak } from './streak';
import { challengeXp, applyCap, DRILL_DAILY_CAP, FLASH_DAILY_CAP, speedrunXp, dailyXp, errorHuntXp, type XpAward } from './xp';
import type { Stars } from './stars';
import type { GhostPoint } from './session';
import { BOTTOM_UP, BOOLEANS, PRIMITIVES, SWEEPS } from '../content/tracks';

export function awardXp(save: SaveV1, source: XpSource, amount: number, ref?: string, now = Date.now()): number {
  const a = Math.max(0, Math.round(amount));
  if (a === 0) return 0;
  save.xp.total += a;
  save.xp.bySource[source] = (save.xp.bySource[source] ?? 0) + a;
  save.xp.log.push({ t: now, source, amount: a, ref });
  return a;
}

export function rollCaps(save: SaveV1, today: string): SaveV1['dailyCaps'] {
  if (save.dailyCaps.date !== today) save.dailyCaps = { date: today, drill: 0, flashcard: 0, newCards: 0 };
  return save.dailyCaps;
}

/** Mark today as an active streak day. */
export function markActive(save: SaveV1, today: string): void {
  save.streak = recordActivity(save.streak, today);
}

export function currentStreak(save: SaveV1, today: string): number {
  return effectiveStreak(save.streak, today);
}

// ------------------------------------------------------------------ tracks / unlocks
export interface TrackProgress {
  total: number;
  cleared: number;
  stars: number;
  maxStars: number;
  halfDone: boolean;
}

export function trackProgress(save: SaveV1, t: TrackId | string): TrackProgress {
  const list = challengesForTrack(t);
  let cleared = 0;
  let stars = 0;
  for (const c of list) {
    const r = save.challenges[c.id];
    if (r && r.clears > 0) cleared++;
    stars += r?.bestStars ?? 0;
  }
  return { total: list.length, cleared, stars, maxStars: list.length * 3, halfDone: list.length > 0 && cleared * 2 >= list.length };
}

export function isTrackUnlocked(save: SaveV1, t: Track, unlockAll: boolean): boolean {
  if (unlockAll || !t.unlock) return true;
  const idx = tracks.findIndex((x) => x.id === t.id);
  const earlier = tracks.slice(0, Math.max(0, idx));
  if (t.unlock.tracksAtLeastHalf !== undefined) {
    const n = earlier.filter((x) => trackProgress(save, x.id).halfDone).length;
    if (n < t.unlock.tracksAtLeastHalf) return false;
  }
  if (t.unlock.starShareAcross !== undefined) {
    let s = 0;
    let m = 0;
    for (const x of tracks.filter((x) => x.id !== 't10')) {
      const p = trackProgress(save, x.id);
      s += p.stars;
      m += p.maxStars;
    }
    if (m === 0 || s / m < t.unlock.starShareAcross) return false;
  }
  return true;
}

export function unlockReason(t: Track): string {
  if (!t.unlock) return '';
  if (t.unlock.tracksAtLeastHalf !== undefined) return `Unlocks when ${t.unlock.tracksAtLeastHalf} earlier tracks are at least half cleared.`;
  if (t.unlock.starShareAcross !== undefined) return `Unlocks at ${Math.round(t.unlock.starShareAcross * 100)}% of all stars across tracks 1–9.`;
  return '';
}

// ------------------------------------------------------------------ challenges
export function recordAttempt(save: SaveV1, id: string, now = Date.now()): void {
  const r = (save.challenges[id] ??= emptyChallengeRecord());
  r.attempts++;
  r.lastAttemptAt = now;
}

export interface ClearInput {
  challenge: Pick<Challenge, 'id' | 'difficulty' | 'parLines' | 'parTimeSeconds'>;
  stars: Stars;
  timeMs: number;
  lines: number;
  hints: number;
  peeks: number;
  errorsAcrossRuns: number;
  commands: string[];
  etypes: string[];
  ghost: GhostPoint[];
  /** extra event fields for achievements */
  event: Omit<Extract<GameEvent, { kind: 'challenge' }>, 'kind' | 'prevBestMs' | 'id' | 'stars' | 'timeMs' | 'lines' | 'parLines' | 'parTimeSeconds' | 'commands'>;
  /** award XP from a different source (daily) — challenge XP is then not awarded */
  xpSource?: XpSource | null;
}

export interface ClearResult {
  xp: XpAward;
  prevBestStars: Stars;
  prevBestMs: number | null;
  isPB: boolean;
  firstClear: boolean;
  achievements: Achievement[];
}

export function recordClear(save: SaveV1, i: ClearInput, today: string, now = Date.now()): ClearResult {
  const id = i.challenge.id;
  const r = (save.challenges[id] ??= emptyChallengeRecord());
  const prevBestStars = r.bestStars;
  const prevBestMs = r.bestTimeMs;
  const xp = i.xpSource === null ? { total: 0, parts: [] } : challengeXp({
    difficulty: i.challenge.difficulty,
    stars: i.stars,
    prevBestStars,
    hints: i.hints,
    peeks: i.peeks,
    zeroErrors: i.errorsAcrossRuns === 0,
    linesUnderPar: i.lines <= i.challenge.parLines,
    timeUnderPar: i.timeMs <= i.challenge.parTimeSeconds * 1000,
  });
  if (xp.total) awardXp(save, i.xpSource ?? 'challenge', xp.total, id, now);
  r.clears++;
  if (r.firstClearAt === null) r.firstClearAt = now;
  r.bestStars = Math.max(r.bestStars, i.stars) as Stars;
  const isPB = prevBestMs !== null && i.timeMs < prevBestMs;
  if (prevBestMs === null || i.timeMs < prevBestMs) {
    r.bestTimeMs = i.timeMs;
    r.ghost = i.ghost;
  }
  r.bestLines = r.bestLines === null ? i.lines : Math.min(r.bestLines, i.lines);
  r.commands = [...new Set([...(r.commands ?? []), ...i.commands])];
  r.etypes = [...new Set([...(r.etypes ?? []), ...i.etypes])];
  markActive(save, today);
  const achievements = evaluateAchievements(save, {
    kind: 'challenge', id, stars: i.stars, timeMs: i.timeMs, lines: i.lines, parLines: i.challenge.parLines,
    parTimeSeconds: i.challenge.parTimeSeconds, commands: i.commands, prevBestMs, ...i.event,
  }, now);
  return { xp, prevBestStars, prevBestMs, isPB, firstClear: prevBestStars === 0, achievements };
}

// ------------------------------------------------------------------ drills / flashcards
export function recordDrillSession(save: SaveV1, s: DrillSessionRecord, rawXp: number, today: string, now = Date.now()): { xp: number; achievements: Achievement[] } {
  const caps = rollCaps(save, today);
  const xp = applyCap(rawXp, caps.drill, DRILL_DAILY_CAP);
  caps.drill += xp;
  awardXp(save, 'drill', xp, s.set, now);
  s.xp = xp;
  save.drills.sessions.push(s);
  if (s.commands >= 20) markActive(save, today);
  return { xp, achievements: evaluateAchievements(save, { kind: 'drill', session: s }, now) };
}

export function recordCommandStat(save: SaveV1, cmd: string, firstTry: boolean, ms: number, now = Date.now()): void {
  const st = (save.drills.commandStats[cmd] ??= { attempts: 0, firstTry: 0, totalMs: 0, lastAt: 0 });
  st.attempts++;
  if (firstTry) st.firstTry++;
  st.totalMs += ms;
  st.lastAt = now;
}

/** Grant flashcard XP for one review (respecting the cap). Returns XP granted. */
export function flashReviewXp(save: SaveV1, today: string, now = Date.now()): number {
  const caps = rollCaps(save, today);
  const xp = applyCap(1, caps.flashcard, FLASH_DAILY_CAP);
  caps.flashcard += xp;
  return awardXp(save, 'flashcard', xp, undefined, now);
}

// ------------------------------------------------------------------ speedrun
export function techniqueTag(commands: string[]): string {
  const has = (l: string[]) => l.some((c) => commands.includes(c));
  const solid = has([...BOTTOM_UP, ...PRIMITIVES, ...SWEEPS, ...BOOLEANS]);
  if (commands.includes('N') && commands.includes('E') && !solid) return 'Direct';
  if (commands.includes('SECTYPE') && (commands.includes('LMESH') || commands.includes('AMESH')) && !commands.includes('VMESH')) return 'Idealised';
  if (has(SWEEPS)) return 'Sweep';
  if (commands.includes('K') && has(['A', 'AL', 'V', 'VA', 'AGEN', 'KGEN'])) return 'Bottom-up';
  if (has(PRIMITIVES)) return 'Primitives';
  return 'Mixed';
}

export function speedrunPB(save: SaveV1, cat: 'any' | 'hundred'): SpeedrunRecord | null {
  const l = save.speedruns[cat];
  return l.length ? l.reduce((a, b) => (b.timeMs < a.timeMs ? b : a)) : null;
}

export function recordSpeedrun(save: SaveV1, rec: SpeedrunRecord, hundredOk: boolean, today: string, now = Date.now()) {
  const parts: XpAward['parts'] = [];
  let total = 0;
  const pbAny = speedrunPB(save, 'any');
  const a = speedrunXp({ category: 'any', timeMs: rec.timeMs, prevBestMs: pbAny?.timeMs ?? null });
  parts.push(...a.parts);
  total += a.total;
  save.speedruns.any.push({ ...rec, category: 'any' });
  let pbHundred: SpeedrunRecord | null = null;
  if (hundredOk) {
    pbHundred = speedrunPB(save, 'hundred');
    const h = speedrunXp({ category: 'hundred', timeMs: rec.timeMs, prevBestMs: pbHundred?.timeMs ?? null });
    parts.push(...h.parts);
    total += h.total;
    save.speedruns.hundred.push({ ...rec, id: rec.id + '-h', category: 'hundred' });
  }
  awardXp(save, 'speedrun', total, rec.technique, now);
  markActive(save, today);
  const isPB = pbAny !== null && rec.timeMs < pbAny.timeMs;
  return { xp: { total, parts }, isPB, prevPB: pbAny, achievements: evaluateAchievements(save, { kind: 'speedrun', record: rec, hundred: hundredOk }, now) };
}

// ------------------------------------------------------------------ daily / error hunts
export function recordDaily(save: SaveV1, date: string, challengeId: string, params: Record<string, number>, stars: Stars, timeMs: number, now = Date.now()) {
  const prev = save.daily[date];
  const counted = !prev || prev.stars === 0;
  markActive(save, date);
  let xp: XpAward = { total: 0, parts: [] };
  if (counted) {
    xp = dailyXp(stars, currentStreak(save, date));
    awardXp(save, 'daily', xp.total, challengeId, now);
  }
  save.daily[date] = {
    challengeId, params, stars: Math.max(prev?.stars ?? 0, stars) as Stars,
    timeMs: prev?.timeMs != null ? Math.min(prev.timeMs, timeMs) : timeMs,
    clearedAt: prev?.clearedAt ?? now, attempts: (prev?.attempts ?? 0) + 1,
  };
  return { xp, counted, achievements: evaluateAchievements(save, { kind: 'daily' }, now) };
}

export function recordErrorHunt(save: SaveV1, id: string, parTimeSeconds: number, timeMs: number, today: string, now = Date.now()) {
  const r = (save.errorHunt[id] ??= { attempts: 0, clears: 0, bestTimeMs: null });
  const first = r.clears === 0;
  r.clears++;
  r.bestTimeMs = r.bestTimeMs === null ? timeMs : Math.min(r.bestTimeMs, timeMs);
  const amount = first ? errorHuntXp(parTimeSeconds, timeMs) : 0;
  awardXp(save, 'errorhunt', amount, id, now);
  markActive(save, today);
  return { xp: { total: amount, parts: amount ? [{ label: `Error hunt (120 × clamp(par/time))`, amount }] : [] }, achievements: evaluateAchievements(save, { kind: 'errorhunt' }, now) };
}

// ------------------------------------------------------------------ radar
/** Per-track skill 0..1: 0.6 · starShare + 0.4 · drillMastery. */
export function radar(save: SaveV1): { track: Track; value: number; starShare: number; drill: number }[] {
  return tracks.map((t) => {
    const p = trackProgress(save, t.id);
    const starShare = p.maxStars ? p.stars / p.maxStars : 0;
    const cmds = COMMANDS.filter((c) => c.trackIds.includes(t.id));
    let num = 0;
    let den = 0;
    for (const c of cmds) {
      const st = save.drills.commandStats[c.name];
      den++;
      if (st && st.attempts) num += (st.firstTry / st.attempts) * Math.min(1, st.attempts / 10);
    }
    const drill = den ? num / den : 0;
    return { track: t, value: 0.6 * starShare + 0.4 * drill, starShare, drill };
  });
}
