// #/tracks and #/tracks/:id
import type { RouteCtx } from '../app/router';
import { tracks, getTrack, challengesForTrack, lessonsForTrack, getChallenge, SPEEDRUN_TARGET_ID } from '../content';
import { isTrackUnlocked, trackProgress, unlockReason } from '../game/progress';
import { getSave, getSettings } from '../app/persist';
import { h, fmtTime } from '../ui/dom';
import { starsEl } from '../ui/components/stars';
import { comingSoon, pageHead } from './common';

export function tracksPage({ root }: RouteCtx) {
  const s = getSave();
  const unlockAll = getSettings().unlockAll;
  root.appendChild(pageHead('Technique tracks', 'Each track forces one technique with forbidden / required commands. Clear them to unlock the boss: the tabletop foundation.'));
  root.appendChild(h('div', { class: 'grid c2' }, ...tracks.map((t) => {
    const p = trackProgress(s, t.id);
    const open = isTrackUnlocked(s, t, unlockAll);
    return h('a', { class: `card link track-card ${open ? '' : 'locked'}`, href: `#/tracks/${t.id}`, style: `--tc: var(${t.color})` },
      h('div', { class: 'row between' }, h('span', { class: 'kicker' }, t.id.toUpperCase()), h('span', { class: 'faint small' }, open ? (p.total ? `${p.cleared}/${p.total} cleared · ${p.stars}/${p.maxStars} ★` : 'coming soon') : 'locked')),
      h('h2', null, t.title),
      h('p', { class: 'muted' }, t.tagline),
      h('p', { class: 'faint small' }, open ? t.whyFaster : unlockReason(t)),
      p.total ? h('div', { class: 'progress' }, h('i', { style: `width:${(p.stars / Math.max(1, p.maxStars)) * 100}%;background:var(${t.color})` })) : null,
    );
  })));
}

export function trackPage({ params, root }: RouteCtx) {
  const t = getTrack(params.id);
  if (!t) return comingSoon(root, 'Track', `Unknown track "${params.id}".`, { href: '#/tracks', label: 'All tracks' });
  const s = getSave();
  const open = isTrackUnlocked(s, t, getSettings().unlockAll);
  const p = trackProgress(s, t.id);
  root.appendChild(pageHead(`${t.id.toUpperCase()} · ${t.title}`, t.tagline, h('a', { class: 'btn ghost', href: '#/tracks' }, '← Tracks')));
  root.appendChild(h('div', { class: 'card', style: `margin-bottom:16px;border-left:3px solid var(${t.color})` },
    h('p', null, t.whyFaster),
    t.defaultForbidden?.length ? h('div', { class: 'row', style: 'margin-top:8px' }, h('span', { class: 'faint small' }, 'Forbidden by default:'), ...t.defaultForbidden.map((c) => h('span', { class: 'chip forb' }, c))) : null,
    t.defaultRequired?.length ? h('div', { class: 'row', style: 'margin-top:8px' }, h('span', { class: 'faint small' }, 'Required:'), ...t.defaultRequired.map((c) => h('span', { class: 'chip req' }, c))) : null,
    !open ? h('p', { class: 'warn', style: 'margin-top:8px' }, `Locked. ${unlockReason(t)} You can browse, or enable "unlock all" in Settings.`) : null,
    p.total ? h('p', { class: 'faint small', style: 'margin-top:8px' }, `${p.cleared}/${p.total} cleared · ${p.stars}/${p.maxStars} stars`) : null,
  ));
  const ls = lessonsForTrack(t.id);
  const loose = challengesForTrack(t.id).filter((c) => !ls.some((l) => l.challengeIds.includes(c.id)));
  if (!ls.length && !loose.length) {
    root.appendChild(h('div', { class: 'empty' }, h('div', { style: 'font-size:16px;margin-bottom:6px' }, 'Coming soon'), 'Lessons and challenges for this track are being written.'));
  }
  const row = (id: string) => {
    const c = getChallenge(id);
    if (!c) return h('div', { class: 'list-row locked' }, h('span', { class: 'faint' }, `${id} — coming soon`), h('span'), h('span'), h('span'));
    const r = s.challenges[c.id];
    return h('a', { class: 'list-row', href: open ? `#/challenge/${c.id}` : `#/tracks/${t.id}` },
      h('span', null, h('b', null, c.title), h('span', { class: 'faint small' }, `  · difficulty ${c.difficulty}`)),
      h('span', { class: 'faint small' }, `par ${c.parLines} lines / ${c.parTimeSeconds}s`),
      h('span', { class: 'small' }, r?.bestTimeMs != null ? `best ${fmtTime(r.bestTimeMs)}` : ''),
      starsEl(r?.bestStars ?? 0),
    );
  };
  for (const l of ls) {
    root.appendChild(h('div', { class: 'card', style: 'margin-bottom:12px' },
      h('div', { class: 'row between' }, h('div', null, h('div', { class: 'kicker' }, `Lesson ${l.order}`), h('h2', null, l.title)), h('a', { class: 'btn', href: `#/lesson/${l.id}` }, 'Open lesson')),
      h('div', { style: 'margin-top:8px' }, ...l.challengeIds.map(row)),
    ));
  }
  if (loose.length) root.appendChild(h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'More challenges'), ...loose.map((c) => row(c.id))));
  if (t.id === 't10') {
    root.appendChild(h('div', { class: 'card', style: 'margin-top:12px' },
      h('div', { class: 'kicker' }, 'Free choice'),
      h('h2', null, 'TGF-36 speedrun'),
      h('p', { class: 'muted' }, getChallenge(SPEEDRUN_TARGET_ID) ? 'Any technique, blank editor, splits and a leaderboard.' : 'Coming soon — the speedrun target is being authored.'),
      h('a', { class: 'btn primary', href: '#/speedrun' }, 'Speedrun'),
    ));
  }
}
