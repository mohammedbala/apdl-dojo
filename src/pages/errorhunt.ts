// #/errorhunt (list) and #/errorhunt/:id (play: starter = broken script; win = zero diagnostics + match).
import type { RouteCtx } from '../app/router';
import { errorHunts, getErrorHunt } from '../content';
import { recordErrorHunt } from '../game/progress';
import { isoDate } from '../game/streak';
import { getSave, updateSave } from '../app/persist';
import { mountAttempt } from './attempt';
import { comingSoon, padded, pageHead } from './common';
import { h, fmtTime } from '../ui/dom';
import { countScriptLines } from '../engine';

export function errorHuntListPage({ root }: RouteCtx) {
  root.appendChild(pageHead('Error hunt', 'Each script has 3 planted bugs that produce real-looking ANSYS messages. Win = zero warnings/errors and a grader match.'));
  if (!errorHunts.length) {
    comingSoon(root, '', 'Error hunts are being written.', { href: '#/tracks', label: 'Go to tracks' });
    return;
  }
  const s = getSave();
  for (const e of errorHunts) {
    const r = s.errorHunt[e.id];
    root.appendChild(h('a', { class: 'list-row', href: `#/errorhunt/${e.id}` },
      h('span', null, h('b', null, e.title), h('span', { class: 'faint' }, `  · ${e.bugs.length} bugs`)),
      h('span', { class: 'faint small' }, `difficulty ${e.difficulty}`),
      h('span', { class: 'small' }, `par ${e.parTimeSeconds}s`),
      h('span', { class: r?.clears ? 'ok small' : 'faint small' }, r?.clears ? `best ${fmtTime(r.bestTimeMs)}` : 'not cleared'),
    ));
  }
}

export function errorHuntPage({ params, root }: RouteCtx) {
  const e = getErrorHunt(params.id);
  if (!e) {
    comingSoon(padded(root), 'Error hunt', `Error hunt "${params.id}" has not been authored yet.`, { href: '#/errorhunt', label: 'Back' });
    return;
  }
  const idx = errorHunts.findIndex((x) => x.id === e.id);
  const next = errorHunts[idx + 1];
  let par = 0;
  try { par = countScriptLines(e.targetScript); } catch { par = e.brokenScript.split('\n').length; }
  return mountAttempt(root, {
    key: `eh:${e.id}`,
    mode: 'errorhunt',
    title: `Error hunt · ${e.title}`,
    brief: `Fix the script so it runs with **zero warnings and errors** and matches the target.\n\nThere are **${e.bugs.length}** planted bugs. Click a message in the Errors tab to jump to its line.`,
    targetScript: e.targetScript,
    parLines: Math.max(par, countScriptLinesSafe(e.brokenScript)),
    parTimeSeconds: e.parTimeSeconds,
    required: [],
    forbidden: [],
    hints: e.bugs.slice(0, 3).map((b, i) => ({ level: (i + 1) as 1 | 2 | 3, text: `Line ${b.line} (${b.kind}): ${b.hint}` })),
    starter: e.brokenScript,
    solution: e.targetScript,
    pasteBlocked: true,
    drafts: false,
    requireNoDiagnostics: true,
    backHref: '#/errorhunt',
    nextHref: next ? `#/errorhunt/${next.id}` : '#/errorhunt',
    nextLabel: next ? `Next: ${next.title}` : 'All hunts',
    onStart: () => updateSave((s) => { const r = (s.errorHunt[e.id] ??= { attempts: 0, clears: 0, bestTimeMs: null }); r.attempts++; }),
    onClear: (x) => {
      let r!: ReturnType<typeof recordErrorHunt>;
      const prev = getSave().errorHunt[e.id]?.bestTimeMs ?? null;
      updateSave((s) => { r = recordErrorHunt(s, e.id, e.parTimeSeconds, x.timeMs, isoDate()); });
      return { title: 'Bugs squashed', stars: x.stars, xp: r.xp, achievements: r.achievements, isPB: prev !== null && x.timeMs < prev };
    },
  });
}

function countScriptLinesSafe(s: string): number {
  try { return countScriptLines(s); } catch { return s.split('\n').length; }
}
