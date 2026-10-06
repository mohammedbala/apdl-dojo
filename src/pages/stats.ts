// #/stats — CPM sparkline, per-command first-try heatmap, challenge table, speedrun PB history, XP by source.
import type { RouteCtx } from '../app/router';
import { COMMANDS } from '../content/commands';
import { getChallenge, drills } from '../content';
import { getSave } from '../app/persist';
import { XP_SOURCES } from '../app/schema';
import { h, fmtTime, fmtDate, pct } from '../ui/dom';
import { sparkline, lineChart } from '../ui/components/sparkline';
import { donut, stackedBar } from '../ui/components/charts';
import { starsEl } from '../ui/components/stars';
import { STAGE_LABEL } from '../game/splits';
import type { Stage } from '../grader/types';
import { pageHead } from './common';

const SRC_COLOR: Record<string, string> = { challenge: 'var(--accent)', drill: 'var(--accent-2)', flashcard: 'var(--trk-3)', speedrun: 'var(--err)', daily: 'var(--ok)', errorhunt: 'var(--trk-5)' };
const STAGE_COLOR: Record<Stage, string> = { geometry: 'var(--accent-2)', attributes: 'var(--trk-5)', mesh: 'var(--accent)', bcs: 'var(--ok)' };

function heatColor(r: number): string {
  // red (0) -> amber (0.5) -> green (1)
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const [c0, c1] = r < 0.5 ? [[255, 92, 92], [255, 176, 0]] : [[255, 176, 0], [61, 220, 151]];
  const t = r < 0.5 ? r * 2 : (r - 0.5) * 2;
  return `rgb(${lerp(c0[0], c1[0], t)},${lerp(c0[1], c1[1], t)},${lerp(c0[2], c1[2], t)})`;
}

export function statsPage({ root }: RouteCtx) {
  const s = getSave();
  root.appendChild(pageHead('Stats', `${s.xp.total} XP total.`));
  const sessions = s.drills.sessions;

  // CPM + XP by source
  const bySrc = XP_SOURCES.map((k) => ({ label: k, value: s.xp.bySource[k] ?? 0, color: SRC_COLOR[k] }));
  root.appendChild(h('div', { class: 'grid c2', style: 'margin-bottom:16px' },
    h('div', { class: 'card' }, h('div', { class: 'kicker' }, `Drill CPM · ${sessions.length} sessions`),
      h('div', { class: 'chart' }, sessions.length ? sparkline(sessions.slice(-60).map((x) => x.cpm), { width: 560, height: 80, min: 0 }) : h('div', { class: 'faint' }, 'No drill sessions yet.')),
      sessions.length ? h('div', { class: 'faint small' }, `last ${sessions[sessions.length - 1].cpm.toFixed(1)} · best ${Math.max(...sessions.map((x) => x.cpm)).toFixed(1)} · mean accuracy ${pct(sessions.reduce((a, x) => a + x.accuracy, 0) / sessions.length)}`) : null),
    h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'XP by source'),
      h('div', { class: 'row', style: 'gap:24px' }, donut(bySrc),
        h('div', { class: 'stack', style: 'gap:2px' }, ...bySrc.map((b) => h('div', { class: 'small' }, h('span', { style: `color:${b.color}` }, '■ '), `${b.label} `, h('span', { class: 'faint' }, String(b.value))))))),
  ));

  // Heatmap
  const drilled = new Set(drills.map((d) => d.command));
  const cmds = COMMANDS.filter((c) => drilled.has(c.name));
  root.appendChild(h('div', { class: 'card', style: 'margin-bottom:16px' },
    h('div', { class: 'row between' }, h('div', { class: 'kicker' }, 'First-try accuracy per command (click to drill)'), h('span', { class: 'faint xs' }, 'grey = not drilled yet')),
    h('div', { class: 'heat' }, ...cmds.map((c) => {
      const st = s.drills.commandStats[c.name];
      const r = st?.attempts ? st.firstTry / st.attempts : null;
      return h('a', {
        href: `#/drills/session?set=${encodeURIComponent('cmd:' + c.name)}&format=30c&strict=relaxed`,
        class: r === null ? 'none' : '',
        style: r === null ? '' : `background:${heatColor(r)}`,
        title: st ? `${c.name}: ${st.firstTry}/${st.attempts} first try · avg ${(st.totalMs / st.attempts / 1000).toFixed(1)} s` : `${c.name}: not drilled`,
      }, c.name);
    })),
  ));

  // Challenges
  const rows = Object.entries(s.challenges).filter(([id]) => getChallenge(id)).sort(([, a], [, b]) => (b.lastAttemptAt ?? 0) - (a.lastAttemptAt ?? 0));
  root.appendChild(h('div', { class: 'card', style: 'margin-bottom:16px' }, h('div', { class: 'kicker' }, 'Challenges'),
    rows.length ? h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', null, 'Challenge'), h('th', null, 'Track'), h('th', null, 'Stars'), h('th', { class: 'r' }, 'Best time'), h('th', { class: 'r' }, 'Par'), h('th', { class: 'r' }, 'Best lines'), h('th', { class: 'r' }, 'Attempts'), h('th', { class: 'r' }, 'Clears'))),
      h('tbody', null, ...rows.map(([id, r]) => {
        const c = getChallenge(id)!;
        return h('tr', null, h('td', null, h('a', { href: `#/challenge/${id}` }, c.title)), h('td', null, c.track.toUpperCase()), h('td', null, starsEl(r.bestStars)),
          h('td', { class: 'r' }, fmtTime(r.bestTimeMs)), h('td', { class: 'r faint' }, `${c.parTimeSeconds}s`), h('td', { class: 'r' }, r.bestLines == null ? '—' : `${r.bestLines}/${c.parLines}`),
          h('td', { class: 'r' }, String(r.attempts)), h('td', { class: 'r' }, String(r.clears)));
      }))) : h('div', { class: 'faint' }, 'No challenges attempted yet.')));

  // Speedrun PB history
  const runs = [...s.speedruns.any].sort((a, b) => a.t - b.t);
  const pbs: typeof runs = [];
  for (const r of runs) if (!pbs.length || r.timeMs < pbs[pbs.length - 1].timeMs) pbs.push(r);
  const last = pbs[pbs.length - 1];
  root.appendChild(h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Speedrun PB history (any%)'),
    pbs.length ? h('div', null,
      h('div', { class: 'chart' }, lineChart(pbs.map((r) => ({ x: r.t, y: r.timeMs / 1000, label: `${fmtTime(r.timeMs)} · ${r.technique}` })), { yLabel: (v) => `${Math.round(v)}s`, xLabel: (v) => fmtDate(v) })),
      h('div', { class: 'kicker', style: 'margin-top:12px' }, `Current PB splits · ${fmtTime(last.timeMs)}`),
      (() => {
        let prev = 0;
        const segs = (['geometry', 'attributes', 'mesh', 'bcs'] as Stage[]).filter((st) => last.splits[st] !== undefined).map((st) => {
          const v = Math.max(0, last.splits[st]! - prev);
          prev = Math.max(prev, last.splits[st]!);
          return { label: STAGE_LABEL[st], value: v, color: STAGE_COLOR[st] };
        });
        return stackedBar(segs, 600, 14);
      })(),
    ) : h('div', { class: 'faint' }, 'No speedruns yet.')));
}
