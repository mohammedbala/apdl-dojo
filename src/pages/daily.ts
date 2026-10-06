// #/daily (landing + 30-day calendar) and #/daily/play (the seeded attempt).
import type { RouteCtx } from '../app/router';
import { dailyPool, effectiveRules } from '../content';
import type { Challenge } from '../content/types';
import { createRng, hashString } from '../game/rng';
import { drawParams, fillBrief, withParams, fmtNum, type Params } from '../game/params';
import { addDays, isoDate } from '../game/streak';
import { recordClear, recordDaily, currentStreak } from '../game/progress';
import { getSave, updateSave } from '../app/persist';
import { mountAttempt } from './attempt';
import { comingSoon, padded, pageHead } from './common';
import { h, fmtTime } from '../ui/dom';
import { starsEl } from '../ui/components/stars';

export function dailyFor(date: string): { challenge: Challenge; params: Params } | null {
  const pool = dailyPool();
  if (!pool.length) return null;
  const rng = createRng(hashString(`apdl-dojo:${date}`));
  const challenge = rng.pick(pool);
  return { challenge, params: drawParams(challenge.params, rng) };
}

export function calendarStrip(days = 30): HTMLElement {
  const s = getSave();
  const today = isoDate();
  const el = h('div', { class: 'cal' });
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const rec = s.daily[d];
    el.appendChild(h('div', { class: `d ${rec?.stars ? 's' + rec.stars : ''} ${d === today ? 'today' : ''}`, title: `${d}${rec ? ` · ${rec.stars}★ · ${fmtTime(rec.timeMs)}` : ''}` }, d.slice(8)));
  }
  return el;
}

export function dailyPage({ root }: RouteCtx) {
  const today = isoDate();
  const d = dailyFor(today);
  root.appendChild(pageHead('Daily challenge', 'One seeded challenge per day. The first clear counts for XP; it also keeps your streak alive.'));
  root.appendChild(h('div', { class: 'card', style: 'margin-bottom:16px' }, h('div', { class: 'kicker' }, 'Last 30 days'), calendarStrip(30)));
  if (!d) {
    comingSoon(root, '', 'No daily-eligible challenges have been authored yet.');
    return;
  }
  const rec = getSave().daily[today];
  const p = Object.entries(d.params);
  root.appendChild(h('div', { class: 'card' },
    h('div', { class: 'kicker' }, today),
    h('h2', null, d.challenge.title),
    h('p', { class: 'muted' }, `Track ${d.challenge.track.toUpperCase()} · difficulty ${d.challenge.difficulty} · par ${d.challenge.parLines} lines / ${d.challenge.parTimeSeconds} s`),
    p.length ? h('p', null, 'Today\'s parameters: ', ...p.map(([k, v]) => h('code', { style: 'margin-right:6px' }, `${k}=${fmtNum(v)}`))) : null,
    rec?.stars ? h('p', { class: 'ok' }, 'Cleared today ', starsEl(rec.stars), ` in ${fmtTime(rec.timeMs)} — replays are practice.`) : null,
    h('p', { class: 'faint small' }, `Streak: ${currentStreak(getSave(), today)} days. Bonus +50 XP at a streak of 3 or more.`),
    h('a', { class: 'btn primary', href: '#/daily/play' }, rec?.stars ? 'Play again (practice)' : 'Start daily'),
  ));
}

export function dailyPlayPage({ root }: RouteCtx) {
  const today = isoDate();
  const d = dailyFor(today);
  if (!d) {
    comingSoon(padded(root), 'Daily challenge', 'No daily-eligible challenges have been authored yet.', { href: '#/daily', label: 'Back' });
    return;
  }
  const c = d.challenge;
  const rules = effectiveRules(c);
  return mountAttempt(root, {
    key: `daily:${today}`,
    mode: 'daily',
    title: `Daily ${today} · ${c.title}`,
    brief: fillBrief(c.brief, d.params),
    targetScript: withParams(c.targetScript, d.params),
    parLines: c.parLines,
    parTimeSeconds: c.parTimeSeconds,
    required: rules.required,
    forbidden: rules.forbidden,
    hints: c.hints.map((x) => ({ ...x, text: fillBrief(x.text, d.params) })),
    grading: c.grading,
    starter: c.starterScript,
    pasteBlocked: true,
    drafts: true,
    backHref: '#/daily',
    nextHref: '#/',
    nextLabel: 'Home',
    onClear: (x) => {
      let res!: ReturnType<typeof recordDaily>;
      let achs: ReturnType<typeof recordClear>['achievements'] = [];
      updateSave((s) => {
        achs = recordClear(s, {
          challenge: c, stars: x.stars, timeMs: x.timeMs, lines: x.lines, hints: x.session.hints, peeks: x.session.peeks,
          errorsAcrossRuns: x.session.errorsAcrossRuns, commands: x.commands, etypes: x.etypes, ghost: x.ghost, xpSource: null,
          event: { track: c.track, script: x.script, maxLoopIterations: x.result.model.maxLoopIterations ?? 0, abbrevLong: x.abbrevLong, abbrevDone: x.abbrevDone, dollarChain: x.dollarChain, selectCount: x.selectCount },
        }, today).achievements;
        res = recordDaily(s, today, c.id, d.params, x.stars, x.timeMs);
      });
      return { title: res.counted ? 'Daily cleared' : 'Daily replay', stars: x.stars, xp: res.xp, achievements: [...achs, ...res.achievements], isPB: false };
    },
  });
}
