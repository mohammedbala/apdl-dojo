// Daily streak with freezes: +1 freeze per 7 streak days, bank max 2.
export interface StreakState {
  current: number;
  longest: number;
  lastActiveDate: string | null;
  freezes: number;
  /** ISO dates that counted as active (most recent last, capped) */
  history: string[];
  /** ISO dates covered by a freeze */
  frozen: string[];
}

export const MAX_FREEZES = 2;
const HISTORY_CAP = 400;

export function emptyStreak(): StreakState {
  return { current: 0, longest: 0, lastActiveDate: null, freezes: 0, history: [], frozen: [] };
}

/** Local ISO date (YYYY-MM-DD). */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86400000);
}

/** Record activity on `today`. Pure: returns a new state. */
export function recordActivity(s: StreakState, today: string): StreakState {
  if (s.lastActiveDate === today) return s;
  const next: StreakState = { ...s, history: [...s.history], frozen: [...s.frozen] };
  if (s.lastActiveDate === null) {
    next.current = 1;
  } else {
    const gap = daysBetween(s.lastActiveDate, today) - 1; // missed days
    if (gap < 0) return s; // clock went backwards; ignore
    if (gap === 0) next.current = s.current + 1;
    else if (gap <= s.freezes) {
      next.freezes = s.freezes - gap;
      for (let i = 1; i <= gap; i++) next.frozen.push(addDays(s.lastActiveDate, i));
      next.current = s.current + 1;
    } else next.current = 1;
  }
  if (next.current > 0 && next.current % 7 === 0) next.freezes = Math.min(MAX_FREEZES, next.freezes + 1);
  next.longest = Math.max(next.longest, next.current);
  next.lastActiveDate = today;
  next.history.push(today);
  if (next.history.length > HISTORY_CAP) next.history.splice(0, next.history.length - HISTORY_CAP);
  if (next.frozen.length > HISTORY_CAP) next.frozen.splice(0, next.frozen.length - HISTORY_CAP);
  return next;
}

/** Streak as displayed today: 0 when the chain is broken beyond what freezes can cover. */
export function effectiveStreak(s: StreakState, today: string): number {
  if (!s.lastActiveDate) return 0;
  const gap = daysBetween(s.lastActiveDate, today) - 1;
  if (gap <= 0) return s.current;
  return gap <= s.freezes ? s.current : 0;
}

export type DayState = 'active' | 'frozen' | 'missed' | 'today' | 'future';

/** Last `n` days ending today with their state (for the strip). */
export function streakStrip(s: StreakState, today: string, n = 14): { date: string; state: DayState }[] {
  const act = new Set(s.history);
  const fr = new Set(s.frozen);
  const out: { date: string; state: DayState }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    let state: DayState = act.has(date) ? 'active' : fr.has(date) ? 'frozen' : 'missed';
    if (date === today && state === 'missed') state = 'today';
    out.push({ date, state });
  }
  return out;
}
