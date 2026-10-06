import type { ModelState, Vec3 } from '../model/types';

export type Severity = 'note' | 'warning' | 'error';

export interface Diagnostic {
  severity: Severity;
  /** 1-based source line */
  line: number;
  col?: number;
  command?: string;
  /** ANSYS-style message text (without the *** WARNING *** header) */
  text: string;
  code: string;
}

export interface LogEntry {
  kind: 'echo' | 'output' | 'note' | 'warning' | 'error';
  line: number;
  text: string;
}

export type PlotWhat = 'kp' | 'line' | 'area' | 'volu' | 'node' | 'elem' | 'all';

export type ViewHint =
  | { kind: 'plot'; what: PlotWhat }
  | { kind: 'pnum'; what: string; on: boolean }
  | { kind: 'view'; dir: Vec3 }
  | { kind: 'auto' }
  | { kind: 'eshape'; on: boolean }
  | { kind: 'number'; mode: number };

export interface RunTimings {
  parseMs: number;
  execMs: number;
  commands: number;
}

export interface RunResult {
  model: ModelState;
  log: LogEntry[];
  diagnostics: Diagnostic[];
  viewHints: ViewHint[];
  timings: RunTimings;
  truncated?: boolean;
}

export interface RunOptions {
  maxIterations?: number;
  maxCommands?: number;
}

/** Thrown inside command handlers; caught per command by the interpreter. */
export class ApdlError extends Error {
  constructor(
    public code: string,
    message: string,
    public severity: Severity = 'error',
  ) {
    super(message);
  }
}

export const err = (code: string, text: string) => new ApdlError(code, text, 'error');
export const warn = (code: string, text: string) => new ApdlError(code, text, 'warning');

/** ANSYS-flavoured message templates. */
export const MSG = {
  kpUndefined: (n: number) => `Keypoint ${n} is undefined.`,
  lineUndefined: (n: number) => `Line ${n} is undefined.`,
  areaUndefined: (n: number) => `Area ${n} is undefined.`,
  voluUndefined: (n: number) => `Volume ${n} is undefined.`,
  nodeUndefined: (n: number) => `Node ${n} is undefined.`,
  elemUndefined: (n: number) => `Element ${n} is undefined.`,
  etypeUndefined: (n: number) => `Element type ${n} is not defined.`,
  etInvalid: (name: string) => `Element type ${name} is not a valid element type name.`,
  unknownCommand: (name: string, proc: string) =>
    `${name} is not a recognized ${proc} command, abbreviation, or macro.  This command will be ignored.`,
  wrongProcessor: (name: string, proc: string) =>
    `${name} is not a recognized ${proc} level command, abbreviation, or macro.  This command will be ignored.  (Did you forget /PREP7?)`,
  paramUndefined: (name: string) => `Parameter ${name} is not defined.  A value of zero will be used.`,
  overlap: (a: number, b: number) => `Volumes ${a} and ${b} overlap.  Use VOVLAP or VPTN instead of VGLUE.`,
};

export function formatDiagnostic(d: Diagnostic): string {
  const head = d.severity === 'error' ? '*** ERROR ***' : d.severity === 'warning' ? '*** WARNING ***' : '*** NOTE ***';
  return `${head}  line ${d.line}${d.command ? ` (${d.command})` : ''}\n ${d.text}`;
}
