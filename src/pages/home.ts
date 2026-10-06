import { curriculum, resumeTarget } from './trainer';
// #/ — streak strip, daily card, due cards, continue, speedrun PB, level bar, mini radar.
import type { RouteCtx } from '../app/router';
import { getChallenge, challenges, SPEEDRUN_TARGET_ID, tracks } from '../content';
import { getSave } from '../app/persist';
import { levelInfo } from '../game/levels';
import { isoDate } from '../game/streak';
import { currentStreak, radar, speedrunPB } from '../game/progress';
import { buildQueue, MAX_NEW_PER_DAY } from '../game/leitner';
import { h, fmtTime } from '../ui/dom';
import { streakStripEl } from '../ui/components/levelbar';
import { starsEl } from '../ui/components/stars';
import { radarChart } from '../ui/components/charts';
import { dailyFor } from './daily';
import { CARD_IDS } from './flashcards';

export function homePage({ root }: RouteCtx) {
  const s = getSave();
  const today = isoDate();
  const li = levelInfo(s.xp.total);
  const streak = currentStreak(s, today);
  const daily = dailyFor(today);
  const dailyRec = s.daily[today];
  const caps = s.dailyCaps.date === today ? s.dailyCaps : { newCards: 0 };
  const due = buildQueue(CARD_IDS, s.drills.cards, today, MAX_NEW_PER_DAY - caps.newCards);
  const recent = Object.entries(s.challenges).filter(([id, r]) => r.lastAttemptAt && getChallenge(id)).sort(([, a], [, b]) => (b.lastAttemptAt ?? 0) - (a.lastAttemptAt ?? 0));
  const cont = recent.find(([, r]) => r.bestStars < 3) ?? recent[0];
  const firstOpen = challenges.find((c) => c.id !== SPEEDRUN_TARGET_ID && !(s.challenges[c.id]?.clears));
  const pb = speedrunPB(s, 'any');

  root.appendChild(h('div', { class: 'page-head' },
    h('div', null, h('h1', null, 'APDL Dojo'), h('p', null, 'Get fast at ANSYS Mechanical APDL — until a turbine-generator tabletop foundation takes minutes, not hours.')),
    h('div', { class: 'row' }, h('span', { class: 'faint small' }, 'Press'), h('kbd', null, 'Ctrl K'), h('span', { class: 'faint small' }, 'to jump anywhere,'), h('kbd', null, '?'), h('span', { class: 'faint small' }, 'for shortcuts')),
  ));

  root.appendChild(h('div', { class: 'grid c3', style: 'margin-bottom:16px' },
    h('div', { class: 'card' },
      h('div', { class: 'kicker' }, `Level ${li.level}`), h('h2', null, li.title),
      h('div', { class: 'progress', style: 'margin:8px 0' }, h('i', { style: `width:${li.progress * 100}%` })),
      h('div', { class: 'faint small' }, li.nextAt ? `${s.xp.total} / ${li.nextAt} XP to level ${li.level + 1}` : `${s.xp.total} XP · max level`)),
    h('div', { class: 'card' },
      h('div', { class: 'kicker' }, 'Streak'), h('div', { class: 'row' }, h('div', { class: 'big-num' }, String(streak)), h('span', { class: 'muted' }, 'days')),
      h('div', { style: 'margin:8px 0' }, streakStripEl(14, true)),
      h('div', { class: 'faint small' }, `${s.streak.freezes} freeze(s) banked · longest ${s.streak.longest}`)),
    h('a', { class: 'card link', href: daily ? '#/daily' : '#/tracks' },
      h('div', { class: 'kicker' }, `Daily · ${today}`),
      daily ? h('h2', null, daily.challenge.title) : h('h2', { class: 'faint' }, 'Coming soon'),
      daily ? h('div', { class: 'muted small' }, dailyRec?.stars ? h('span', null, 'Cleared ', starsEl(dailyRec.stars)) : `difficulty ${daily.challenge.difficulty} · par ${daily.challenge.parTimeSeconds}s`) : null,
      h('div', { class: 'btn primary', style: 'margin-top:12px' }, dailyRec?.stars ? 'View' : 'Play daily')),
  ));

  const trainList = curriculum();
  const trainNext = resumeTarget(trainList);
  const trainDone = trainList.filter((x) => (s.challenges[x.id]?.bestStars ?? 0) > 0).length;
  root.appendChild(h('div', { class: 'grid c4', style: 'margin-bottom:16px' },
    h('a', { class: 'card link', href: '#/train' },
      h('div', { class: 'kicker' }, 'Continue training'),
      h('h2', null, trainNext?.title ?? (cont ? getChallenge(cont[0])!.title : firstOpen ? firstOpen.title : 'Browse tracks')),
      h('div', { class: 'faint small' }, `${trainDone}/${trainList.length} challenges cleared · one continuous run`)),
    h('a', { class: 'card link', href: '#/flashcards' },
      h('div', { class: 'kicker' }, 'Flashcards'), h('div', { class: 'big-num' }, String(due.length)), h('div', { class: 'faint small' }, 'due or new today')),
    h('a', { class: 'card link', href: '#/drills' },
      h('div', { class: 'kicker' }, 'Drills'),
      h('div', { class: 'big-num' }, s.drills.sessions.length ? Math.max(...s.drills.sessions.map((x) => x.cpm)).toFixed(1) : '—'),
      h('div', { class: 'faint small' }, 'best CPM')),
    h('a', { class: 'card link', href: '#/speedrun' },
      h('div', { class: 'kicker' }, 'Speedrun PB'),
      h('div', { class: 'big-num' }, pb ? fmtTime(pb.timeMs) : '—'),
      h('div', { class: 'faint small' }, getChallenge(SPEEDRUN_TARGET_ID) ? (pb ? pb.technique : 'no runs yet') : 'target coming soon')),
  ));

  const rd = radar(s);
  root.appendChild(h('div', { class: 'grid c2' },
    h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Skill radar'),
      h('div', { style: 'max-width:340px;margin:0 auto' }, radarChart(rd.map((r) => ({ label: r.track.id.toUpperCase(), value: r.value, color: r.track.color })), 220)),
      h('div', { class: 'faint xs', style: 'text-align:center' }, '0.6 × star share + 0.4 × drill mastery per track')),
    h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Tracks'),
      ...tracks.map((t, i) => h('a', { href: `#/tracks/${t.id}`, class: 'row between', style: 'padding:4px 0;color:inherit' },
        h('span', null, h('span', { style: `color:var(${t.color})` }, '■ '), `${t.id.toUpperCase()} ${t.title}`),
        h('span', { class: 'faint small mono-num' }, `${Math.round(rd[i].value * 100)}%`)))),
  ));
}
