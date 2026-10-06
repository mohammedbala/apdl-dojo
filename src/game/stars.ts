// Star rules (plan §6 Build Challenges).
export type Stars = 0 | 1 | 2 | 3;

export interface StarInput {
  match: boolean;
  timeMs: number;
  lines: number;
  parTimeSeconds: number;
  parLines: number;
  /** total error diagnostics across counted runs */
  errorsAcrossRuns: number;
  hints: number;
}

export function computeStars(i: StarInput): Stars {
  if (!i.match) return 0;
  const t = i.timeMs / 1000;
  const three = t <= i.parTimeSeconds && i.lines <= i.parLines && i.errorsAcrossRuns === 0 && i.hints === 0;
  if (three) return 3;
  if (t <= 2 * i.parTimeSeconds && i.lines <= 1.5 * i.parLines) return 2;
  return 1;
}

/** Reasons a run missed the next star (for HUD tooltips / clear modal). */
export function starBlockers(i: StarInput): string[] {
  const out: string[] = [];
  const t = i.timeMs / 1000;
  if (t > i.parTimeSeconds) out.push(t > 2 * i.parTimeSeconds ? 'time > 2x par' : 'time > par');
  if (i.lines > i.parLines) out.push(i.lines > 1.5 * i.parLines ? 'lines > 1.5x par' : 'lines > par');
  if (i.errorsAcrossRuns > 0) out.push('errors in runs');
  if (i.hints > 0) out.push('hint used (max 2 stars)');
  return out;
}
