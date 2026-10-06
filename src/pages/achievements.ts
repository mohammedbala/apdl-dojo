// #/achievements — all 30, locked ones dimmed but with conditions visible.
import type { RouteCtx } from '../app/router';
import { ACHIEVEMENTS } from '../game/achievements';
import { getSave } from '../app/persist';
import { h, fmtDate } from '../ui/dom';
import { pageHead } from './common';

export function achievementsPage({ root }: RouteCtx) {
  const s = getSave();
  const got = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
  root.appendChild(pageHead('Achievements', `${got} of ${ACHIEVEMENTS.length} unlocked.`));
  root.appendChild(h('div', { class: 'ach-grid' }, ...ACHIEVEMENTS.map((a) => {
    const t = s.achievements[a.id];
    return h('div', { class: `ach ${t ? 'on' : 'off'}` },
      h('div', { class: 'ic' }, t ? '★' : '☆'),
      h('div', null, h('div', { class: 'tt' }, a.title), h('div', { class: 'dd' }, a.desc), t ? h('div', { class: 'when' }, `Unlocked ${fmtDate(t)}`) : null),
    );
  })));
}
