// Attempt state machine for timed challenges: idle -> running (first keystroke) -> cleared.
export type AttemptState = 'idle' | 'running' | 'cleared';

export interface RunRecord {
  /** ms since attempt start */
  t: number;
  lines: number;
  errors: number;
  match: boolean;
  total: number;
  stagesPassed: number;
  /** explicit (Ctrl+Enter) runs count towards errorsAcrossRuns; live preview runs do not */
  explicit: boolean;
}

export interface GhostPoint {
  t: number;
  lines: number;
  stages: number;
}

export interface AttemptSnapshot {
  state: AttemptState;
  startedAt: number | null;
  clearedAt: number | null;
  runs: RunRecord[];
  hints: number;
  peeks: number;
  errorsAcrossRuns: number;
  ghost: GhostPoint[];
}

export class AttemptSession {
  state: AttemptState = 'idle';
  startedAt: number | null = null;
  clearedAt: number | null = null;
  runs: RunRecord[] = [];
  hints = 0;
  peeks = 0;
  errorsAcrossRuns = 0;
  ghost: GhostPoint[] = [];

  /** Call on every keystroke; starts the timer on the first one. */
  keystroke(now: number): boolean {
    if (this.state !== 'idle') return false;
    this.state = 'running';
    this.startedAt = now;
    return true;
  }

  elapsed(now: number): number {
    if (this.startedAt === null) return 0;
    if (this.clearedAt !== null) return this.clearedAt - this.startedAt;
    return Math.max(0, now - this.startedAt);
  }

  get running(): boolean {
    return this.state === 'running';
  }

  /** Record a run. `requestedAt` is when the script was submitted (clear time uses it). */
  recordRun(requestedAt: number, r: Omit<RunRecord, 't'>): RunRecord | null {
    if (this.state !== 'running' || this.startedAt === null) return null;
    const rec: RunRecord = { ...r, t: Math.max(0, requestedAt - this.startedAt) };
    this.runs.push(rec);
    if (r.explicit || r.match) this.errorsAcrossRuns += r.errors;
    const last = this.ghost[this.ghost.length - 1];
    if (!last || last.lines !== rec.lines || last.stages !== rec.stagesPassed) this.ghost.push({ t: rec.t, lines: rec.lines, stages: rec.stagesPassed });
    return rec;
  }

  /** Lock the attempt. Returns elapsed ms at clear. */
  clear(requestedAt: number): number {
    if (this.state !== 'running' || this.startedAt === null) return 0;
    this.state = 'cleared';
    this.clearedAt = Math.max(this.startedAt, requestedAt);
    return this.clearedAt - this.startedAt;
  }

  useHint(): boolean {
    if (this.hints >= 3 || this.state === 'cleared') return false;
    this.hints++;
    return true;
  }

  peek(): void {
    if (this.state === 'running') this.peeks++;
  }

  reset(): void {
    Object.assign(this, new AttemptSession());
  }

  snapshot(): AttemptSnapshot {
    return {
      state: this.state, startedAt: this.startedAt, clearedAt: this.clearedAt, runs: [...this.runs],
      hints: this.hints, peeks: this.peeks, errorsAcrossRuns: this.errorsAcrossRuns, ghost: [...this.ghost],
    };
  }

  restore(s: AttemptSnapshot): void {
    Object.assign(this, { ...s, runs: [...s.runs], ghost: [...s.ghost] });
  }
}

/** Ghost progress (stages passed) at time t on a recorded trace. */
export function ghostAt(trace: GhostPoint[] | undefined, t: number): GhostPoint | null {
  if (!trace || trace.length === 0) return null;
  let cur: GhostPoint | null = null;
  for (const p of trace) {
    if (p.t <= t) cur = p;
    else break;
  }
  return cur ?? { t: 0, lines: 0, stages: 0 };
}
