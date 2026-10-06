// Speedrun splits: first time each grading stage passed.
import type { Score, Stage } from '../grader/types';

export const STAGES: Stage[] = ['geometry', 'attributes', 'mesh', 'bcs'];
export const STAGE_LABEL: Record<Stage, string> = { geometry: 'Geometry', attributes: 'Attributes', mesh: 'Mesh', bcs: 'BCs' };

export type Splits = Partial<Record<Stage, number>>;

/** Record first-pass timestamps (ms since start) of stages passing in `score`. Pure. */
export function updateSplits(splits: Splits, score: Pick<Score, 'stages'>, tMs: number): Splits {
  const out: Splits = { ...splits };
  for (const st of STAGES) {
    const s = score.stages[st];
    if (s && s.present && s.pass && out[st] === undefined) out[st] = tMs;
  }
  return out;
}

/** Stages present in the target, in order. */
export function presentStages(score: Pick<Score, 'stages'> | null): Stage[] {
  if (!score) return STAGES;
  return STAGES.filter((s) => score.stages[s]?.present);
}

export interface SplitRow {
  stage: Stage;
  time?: number;
  pb?: number;
  /** time - pb (negative = ahead) */
  delta?: number;
}

export function splitRows(splits: Splits, pb: Splits | undefined, stages: Stage[] = STAGES): SplitRow[] {
  return stages.map((stage) => {
    const time = splits[stage];
    const p = pb?.[stage];
    return { stage, time, pb: p, delta: time !== undefined && p !== undefined ? time - p : undefined };
  });
}

export function stagesPassed(score: Pick<Score, 'stages'> | null): number {
  if (!score) return 0;
  return STAGES.filter((s) => score.stages[s]?.present && score.stages[s]?.pass).length;
}
