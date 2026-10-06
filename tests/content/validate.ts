// Shared validation for authored content: every target must build without errors, every solution must
// grade as a match within par lines and obey the challenge's required/forbidden commands.
import { describe, expect, it, beforeAll } from 'vitest';
import Module from 'manifold-3d';
import { setKernel, hasKernel } from '../../src/geometry/kernel';
import { execute } from '../../src/apdl/interpreter';
import { grade } from '../../src/grader/diff';
import { countScriptLines } from '../../src/apdl/lexer';
import { defaultParams, withParams } from '../../src/game/params';
import { TRACKS } from '../../src/content/tracks';
import type { Challenge, ErrorHunt, Lesson } from '../../src/content/types';

export async function initKernel() {
  if (hasKernel()) return;
  const wasm = await Module();
  wasm.setup();
  setKernel(wasm);
}

/** Effective rules: challenge overrides track defaults. */
export function rulesFor(c: Challenge) {
  const t = TRACKS.find((x) => x.id === c.track);
  return {
    required: c.requiredCommands ?? t?.defaultRequired ?? [],
    forbidden: c.forbiddenCommands ?? t?.defaultForbidden ?? [],
  };
}

export function checkChallenge(c: Challenge) {
  const prm = defaultParams(c.params);
  const target = execute(withParams(c.targetScript, prm));
  const tErr = target.diagnostics.filter((d) => d.severity === 'error');
  expect(tErr.map((d) => `L${d.line} ${d.command}: ${d.text}`), `${c.id} target errors`).toEqual([]);
  const sol = execute(c.solution);
  const sErr = sol.diagnostics.filter((d) => d.severity === 'error');
  expect(sErr.map((d) => `L${d.line} ${d.command}: ${d.text}`), `${c.id} solution errors`).toEqual([]);
  const r = rulesFor(c);
  const score = grade(target, sol, {
    elemTolerance: c.grading?.elemTolerance,
    nodeTolerance: c.grading?.nodeTolerance,
    volumeTolerance: c.grading?.volumeTolerance,
    ignore: c.grading?.ignore,
    requiredCommands: r.required,
    forbiddenCommands: r.forbidden,
  });
  const failed = score.checks.filter((k) => !k.pass).map((k) => `${k.id}: expected ${k.expected}, got ${k.actual}`);
  expect(failed, `${c.id} solution does not match target`).toEqual([]);
  expect(score.match).toBe(true);
  expect(countScriptLines(c.solution), `${c.id} solution exceeds parLines`).toBeLessThanOrEqual(c.parLines);
  // the target must actually contain something gradeable
  expect(score.checks.length, `${c.id} has no gradeable checks`).toBeGreaterThan(0);
  // hints exist and are ordered
  expect(c.hints.map((h) => h.level), `${c.id} hints`).toEqual([1, 2, 3]);
}

export function checkLesson(l: Lesson, challengeIds: Set<string>) {
  const r = execute(l.workedExample.script);
  const errs = r.diagnostics.filter((d) => d.severity === 'error');
  expect(errs.map((d) => `L${d.line} ${d.command}: ${d.text}`), `${l.id} worked example errors`).toEqual([]);
  for (const id of l.challengeIds) expect(challengeIds.has(id), `${l.id} references missing challenge ${id}`).toBe(true);
}

export function checkErrorHunt(h: ErrorHunt) {
  const broken = execute(h.brokenScript);
  const nBad = broken.diagnostics.filter((d) => d.severity !== 'note').length;
  expect(nBad, `${h.id}: broken script should produce warnings/errors`).toBeGreaterThan(0);
  const target = execute(h.targetScript);
  expect(target.diagnostics.filter((d) => d.severity === 'error'), `${h.id} target errors`).toEqual([]);
}

/** Register a vitest suite for a set of lessons and challenges. */
export function suite(name: string, lessons: Lesson[], challenges: Challenge[]) {
  describe(name, () => {
    beforeAll(initKernel);
    const ids = new Set(challenges.map((c) => c.id));
    for (const c of challenges) it(`challenge ${c.id} — ${c.title}`, () => checkChallenge(c));
    for (const l of lessons) it(`lesson ${l.id} — ${l.title}`, () => checkLesson(l, ids));
  });
}
