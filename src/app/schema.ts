// Persistent save schema (plan §6 localStorage). Bump SCHEMA_VERSION + add a migration when changing shape.
import type { LeitnerCard } from '../game/leitner';
import type { GhostPoint } from '../game/session';
import type { Splits } from '../game/splits';
import type { Stars } from '../game/stars';
import { emptyStreak, type StreakState } from '../game/streak';

export const SCHEMA_VERSION = 1;

export type XpSource = 'challenge' | 'drill' | 'flashcard' | 'speedrun' | 'daily' | 'errorhunt';
export const XP_SOURCES: XpSource[] = ['challenge', 'drill', 'flashcard', 'speedrun', 'daily', 'errorhunt'];

export interface XpLogEntry {
  t: number;
  source: XpSource;
  amount: number;
  ref?: string;
}

export interface ChallengeRecord {
  attempts: number;
  clears: number;
  firstClearAt: number | null;
  bestStars: Stars;
  bestTimeMs: number | null;
  bestLines: number | null;
  /** trace of the best-time clear */
  ghost: GhostPoint[] | null;
  lastAttemptAt?: number;
  /** union of canonical commands used in clearing runs */
  commands?: string[];
  /** element type names used in clearing runs */
  etypes?: string[];
}

export interface DrillSessionRecord {
  t: number;
  set: string;
  format: string;
  strict: string;
  commands: number;
  cpm: number;
  /** keystroke accuracy 0..1 */
  accuracy: number;
  /** first-try accuracy 0..1 */
  firstTry: number;
  durationMs: number;
  xp: number;
}

export interface CommandStat {
  attempts: number;
  firstTry: number;
  totalMs: number;
  lastAt: number;
}

export interface SpeedrunRecord {
  id: string;
  t: number;
  category: 'any' | 'hundred';
  timeMs: number;
  lines: number;
  errors: number;
  peeks: number;
  splits: Splits;
  technique: string;
  commands: string[];
  /** kept for the top 3 only */
  script?: string;
}

export interface DailyRecord {
  challengeId: string;
  params: Record<string, number>;
  stars: Stars;
  timeMs: number | null;
  clearedAt: number | null;
  attempts: number;
}

export interface ErrorHuntRecord {
  attempts: number;
  clears: number;
  bestTimeMs: number | null;
}

export interface SaveV1 {
  schemaVersion: number;
  createdAt: number;
  xp: { total: number; bySource: Record<XpSource, number>; log: XpLogEntry[] };
  dailyCaps: { date: string; drill: number; flashcard: number; newCards: number };
  challenges: Record<string, ChallengeRecord>;
  drills: { cards: Record<string, LeitnerCard>; sessions: DrillSessionRecord[]; commandStats: Record<string, CommandStat> };
  speedruns: { any: SpeedrunRecord[]; hundred: SpeedrunRecord[] };
  daily: Record<string, DailyRecord>;
  streak: StreakState;
  achievements: Record<string, number>;
  errorHunt: Record<string, ErrorHuntRecord>;
}

export const LIMITS = { xpLog: 500, drillSessions: 200, speedruns: 50, speedrunScripts: 3 };

export function emptySave(now = Date.now()): SaveV1 {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    xp: { total: 0, bySource: { challenge: 0, drill: 0, flashcard: 0, speedrun: 0, daily: 0, errorhunt: 0 }, log: [] },
    dailyCaps: { date: '', drill: 0, flashcard: 0, newCards: 0 },
    challenges: {},
    drills: { cards: {}, sessions: [], commandStats: {} },
    speedruns: { any: [], hundred: [] },
    daily: {},
    streak: emptyStreak(),
    achievements: {},
    errorHunt: {},
  };
}

export function emptyChallengeRecord(): ChallengeRecord {
  return { attempts: 0, clears: 0, firstClearAt: null, bestStars: 0, bestTimeMs: null, bestLines: null, ghost: null };
}

export interface Settings {
  sound: boolean;
  unlockAll: boolean;
  drillSet: string;
  drillFormat: string;
  drillStrict: string;
}

export function defaultSettings(): Settings {
  return { sound: false, unlockAll: false, drillSet: 'all', drillFormat: '30c', drillStrict: 'relaxed' };
}
