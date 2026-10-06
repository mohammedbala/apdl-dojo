// Public engine facade. UI / game code should import from here only.
//
//   runScript(src)            -> Promise<RunResult>   run APDL in the worker
//   createLiveRunner(ms)      -> debounced latest-wins runner for live editing
//   summarize(model, diags?)  -> ModelSummary         canonical fingerprint of a model
//   grade(target, user, opts) -> Score                compare a user's RunResult to a target RunResult
//   countScriptLines(src)     -> number               non-blank, non-comment lines ($-joined = 1 line)
//   resolveCommandName(name)  -> string | null        apply ANSYS 4-char abbreviation rules
//   Viewport                  -> Three.js viewer (see src/render/viewport.ts)

export { runScript, createLiveRunner } from './apdl/client';
export type { RunResult, Diagnostic, LogEntry, ViewHint, RunOptions } from './apdl/diagnostics';
export { formatDiagnostic } from './apdl/diagnostics';
export { summarize } from './model/summary';
export { grade } from './grader/diff';
export type { ModelSummary, Score, CheckResult, Stage, GradeOptions } from './grader/types';
export { countScriptLines, splitStatements } from './apdl/lexer';
export { resolveCommandName, allCommandNames } from './apdl/commands/registry';
export type { ModelState } from './model/types';
export { Viewport } from './render/viewport';
export type { ViewMode, ViewPreset, DisplayOptions } from './render/viewport';
