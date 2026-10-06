// Header level badge, XP bar and streak strip.
import { getSave, saveState } from '../../app/persist';
import { levelInfo, foundationTier } from '../../game/levels';
import { streakStrip, isoDate, effectiveStreak } from '../../game/streak';
import { speedrunPB } from '../../game/progress';
import { clear, h } from '../dom';

export function streakStripEl(days = 14, big = false): HTMLElement {
  const s = getSave();
  const today = isoDate();
  const el = h('div', { class: `streak-strip ${big ? 'big' : ''}`, title: `Streak ${effectiveStreak(s.streak, today)} days · ${s.streak.freezes} freeze(s) banked` });
  for (const d of streakStrip(s.streak, today, days)) el.appendChild(h('i', { class: d.state, title: `${d.date}: ${d.state}` }));
  return el;
}

export function mountHeaderStatus(host: HTMLElement): () => void {
  const render = () => {
    const s = getSave();
    const li = levelInfo(s.xp.total);
    const pb = speedrunPB(s, 'any');
    const tier = li.level >= 12 ? foundationTier(pb ? pb.timeMs / 1000 : null) : '';
    clear(host);
    host.append(
      h('a', { href: '#/stats', class: 'lvl', title: `${s.xp.total} XP${li.nextAt ? ` · next level at ${li.nextAt}` : ''}` },
        h('span', { class: 'lvl-badge' }, `L${li.level}${tier}`),
        h('span', null, li.title),
        h('span', { class: 'xpbar' }, h('i', { style: `width:${Math.round(li.progress * 100)}%` })),
        h('span', { class: 'mono-num' }, `${s.xp.total} XP`),
      ),
      h('a', { href: '#/', class: 'lvl', title: 'Streak' }, streakStripEl(14), h('span', { class: 'mono-num' }, `${effectiveStreak(s.streak, isoDate())}d`)),
    );
  };
  render();
  return saveState().subscribe(render);
}
