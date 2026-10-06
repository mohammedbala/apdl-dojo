// #/challenge/:id — the core build-challenge screen.
import type { RouteCtx } from '../app/router';
import { getChallenge, getTrack, effectiveRules, nextChallenge, lessonForChallenge } from '../content';
import { defaultParams, fillBrief, withParams } from '../game/params';
import { recordAttempt, recordClear, isTrackUnlocked, unlockReason } from '../game/progress';
import { isoDate } from '../game/streak';
import { getSave, getSettings, updateSave } from '../app/persist';
import { mountAttempt } from './attempt';
import { comingSoon, padded } from './common';
import { h } from '../ui/dom';
import type { ClearResult } from '../game/progress';

export function challengePage({ params, root }: RouteCtx) {
  const c = getChallenge(params.id);
  if (!c) {
    comingSoon(padded(root), 'Challenge', `Challenge "${params.id}" has not been authored yet.`, { href: '#/tracks', label: 'Back to tracks' });
    return;
  }
  const track = getTrack(c.track);
  if (track && !isTrackUnlocked(getSave(), track, getSettings().unlockAll)) {
    const p = padded(root);
    comingSoon(p, c.title, `${track.title} is locked. ${unlockReason(track)} (Settings → unlock all overrides this.)`, { href: `#/tracks/${track.id}`, label: 'Back to track' });
    return;
  }
  const prm = defaultParams(c.params);
  const rules = effectiveRules(c);
  const next = nextChallenge(c.id);
  const lesson = lessonForChallenge(c.id);
  const rec = getSave().challenges[c.id];
  return mountAttempt(root, {
    key: c.id,
    mode: 'challenge',
    title: `${c.track.toUpperCase()} · ${c.title}`,
    brief: fillBrief(c.brief, prm),
    targetScript: withParams(c.targetScript, prm),
    parLines: c.parLines,
    parTimeSeconds: c.parTimeSeconds,
    required: rules.required,
    forbidden: rules.forbidden,
    hints: c.hints.map((x) => ({ ...x, text: fillBrief(x.text, prm) })),
    grading: c.grading,
    starter: c.starterScript,
    solution: c.solution,
    pasteBlocked: true,
    drafts: true,
    ghost: rec?.ghost ?? null,
    backHref: lesson ? `#/lesson/${lesson.id}` : `#/tracks/${c.track}`,
    nextHref: next ? `#/challenge/${next.id}` : `#/tracks/${c.track}`,
    nextLabel: next ? `Next: ${next.title}` : 'Back to track',
    onStart: () => updateSave((s) => recordAttempt(s, c.id)),
    onClear: (x) => {
      let r!: ClearResult;
      updateSave((s) => {
        r = recordClear(s, {
          challenge: c, stars: x.stars, timeMs: x.timeMs, lines: x.lines, hints: x.session.hints, peeks: x.session.peeks,
          errorsAcrossRuns: x.session.errorsAcrossRuns, commands: x.commands, etypes: x.etypes, ghost: x.ghost,
          event: { track: c.track, script: x.script, maxLoopIterations: x.result.model.maxLoopIterations ?? 0, abbrevLong: x.abbrevLong, abbrevDone: x.abbrevDone, dollarChain: x.dollarChain, selectCount: x.selectCount },
        }, isoDate());
      });
      return {
        stars: x.stars, xp: r.xp, achievements: r.achievements, isPB: r.isPB,
        title: r.firstClear ? 'Cleared' : r.isPB ? 'New best time' : 'Cleared again',
        extra: r.prevBestMs !== null ? h('p', { class: 'faint small', style: 'margin-top:12px' }, `Previous best ${(r.prevBestMs / 1000).toFixed(1)} s`) : undefined,
      };
    },
  });
}
