// Content authoring contract: tracks, lessons, challenges, drills, error hunts.

export type TrackId = 't1' | 't2' | 't3' | 't4' | 't5' | 't6' | 't7' | 't8' | 't9' | 't10';

export interface Track {
  id: TrackId;
  title: string;
  tagline: string;
  /** one sentence: why this technique makes you faster */
  whyFaster: string;
  /** CSS colour token name, e.g. '--trk-1' */
  color: string;
  lessonIds: string[];
  defaultForbidden?: string[];
  defaultRequired?: string[];
  unlock?: { tracksAtLeastHalf?: number; starShareAcross?: number };
}

export interface Lesson {
  id: string;
  track: TrackId;
  order: number;
  title: string;
  /** markdown, ~150 words */
  explanation: string;
  workedExample: { script: string; commentary: string };
  challengeIds: string[];
}

export interface ParamSpec {
  min: number;
  max: number;
  step?: number;
}

export interface Hint {
  level: 1 | 2 | 3;
  text: string;
}

export interface Challenge {
  id: string;
  track: TrackId;
  order: number;
  title: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** markdown; {{NAME}} is replaced with parameter values */
  brief: string;
  /** randomisable parameters (daily mode); defaults are the midpoint rounded to step */
  params?: Record<string, ParamSpec>;
  /** APDL that generates the target model; parameters are injected as NAME=value lines on top */
  targetScript: string;
  /** reference answer shown after clearing; must match target and meet par */
  solution: string;
  parLines: number;
  parTimeSeconds: number;
  requiredCommands?: string[];
  forbiddenCommands?: string[];
  hints: Hint[];
  tags: string[];
  grading?: {
    elemTolerance?: number;
    nodeTolerance?: number;
    volumeTolerance?: number;
    ignore?: string[];
  };
  /** pre-filled editor content (rare) */
  starterScript?: string;
}

export interface Rng {
  next(): number; // [0,1)
  int(min: number, max: number): number; // inclusive
  pick<T>(arr: readonly T[]): T;
  float(min: number, max: number, step?: number): number;
}

export interface DrillTemplate {
  id: string;
  /** canonical command name being drilled */
  command: string;
  track: TrackId;
  family: CommandFamily;
  tags: string[];
  gen: (r: Rng) => { prompt: string; answer: string; accepted?: string[] };
  /** flashcard back side */
  explain: string;
  distractors?: string[];
}

export type CommandFamily =
  | 'session'
  | 'geometry'
  | 'primitive'
  | 'boolean'
  | 'sweep'
  | 'direct'
  | 'attribute'
  | 'mesh'
  | 'select'
  | 'load'
  | 'macro'
  | 'display';

export interface CommandArg {
  name: string;
  /** a blank field means 0 for this argument (for canonical comparison) */
  blankIsZero?: boolean;
}

export interface CommandInfo {
  name: string;
  /** 4-char abbreviation if the name is longer than 4 characters */
  abbrev?: string;
  family: CommandFamily;
  signature: string;
  args: CommandArg[];
  summary: string;
  trackIds: TrackId[];
}

export interface ErrorHunt {
  id: string;
  title: string;
  difficulty: 1 | 2 | 3;
  brokenScript: string;
  targetScript: string;
  bugs: { line: number; kind: string; hint: string }[];
  parTimeSeconds: number;
}
