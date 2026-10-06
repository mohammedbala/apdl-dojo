// #/lesson/:id — explanation card, worked example ("Load into viewer"), challenges.
import type { RouteCtx } from '../app/router';
import { getLesson, getChallenge, getTrack } from '../content';
import { runScript } from '../engine';
import { getSave } from '../app/persist';
import { h, clear } from '../ui/dom';
import { renderMarkdown } from '../ui/markdown';
import { starsEl } from '../ui/components/stars';
import { SafeViewer } from '../ui/viewer';
import { ApdlEditor } from '../editor/editor';
import { comingSoon, pageHead } from './common';

export function lessonPage({ params, root }: RouteCtx) {
  const l = getLesson(params.id);
  if (!l) return comingSoon(root, 'Lesson', `Lesson "${params.id}" has not been authored yet.`, { href: '#/tracks', label: 'Tracks' });
  const t = getTrack(l.track);
  const s = getSave();
  root.appendChild(pageHead(l.title, `${t?.id.toUpperCase()} · ${t?.title} · lesson ${l.order}`, h('a', { class: 'btn ghost', href: `#/tracks/${l.track}` }, '← Track')));
  const md = h('div', { class: 'md card' });
  md.innerHTML = renderMarkdown(l.explanation);
  const codeHost = h('div', { style: 'height:260px;border:1px solid var(--line);border-radius:4px;overflow:hidden' });
  const vpHost = h('div', { class: 'vp-host', style: 'height:360px;border:1px solid var(--line);border-radius:4px' });
  const log = h('div', { class: 'faint small', style: 'margin-top:6px;min-height:18px' });
  let viewer: SafeViewer | null = null;
  const load = async () => {
    clear(log);
    log.textContent = 'Running…';
    viewer ??= new SafeViewer(vpHost, 'yours');
    try {
      const r = await runScript(l.workedExample.script);
      viewer.setModel(r.model, r.viewHints);
      viewer.setMode('yours');
      setTimeout(() => viewer?.fit(), 50);
      const errs = r.diagnostics.filter((d) => d.severity === 'error').length;
      log.textContent = `${r.timings.commands} commands · ${r.model.volus.size} volumes · ${r.model.elems.size} elements${errs ? ` · ${errs} errors` : ''}`;
    } catch (e) {
      log.textContent = `Could not run: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
  root.appendChild(h('div', { class: 'grid c2' },
    h('div', { class: 'stack' }, md,
      h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Challenges'),
        ...(l.challengeIds.length ? l.challengeIds.map((id) => {
          const c = getChallenge(id);
          if (!c) return h('div', { class: 'faint' }, `${id} — coming soon`);
          return h('a', { class: 'list-row', href: `#/challenge/${c.id}` }, h('b', null, c.title), h('span', { class: 'faint small' }, `difficulty ${c.difficulty}`), h('span', { class: 'small' }, `par ${c.parLines} / ${c.parTimeSeconds}s`), starsEl(s.challenges[c.id]?.bestStars ?? 0));
        }) : [h('div', { class: 'faint' }, 'Coming soon')]))),
    h('div', { class: 'stack' },
      h('div', { class: 'card stack' },
        h('div', { class: 'row between' }, h('div', { class: 'kicker' }, 'Worked example'), h('button', { class: 'primary small', onclick: () => void load() }, 'Load into viewer')),
        codeHost,
        h('p', { class: 'muted small', style: 'margin:0' }, l.workedExample.commentary),
        vpHost, log,
      )),
  ));
  const ed = new ApdlEditor(codeHost, { value: l.workedExample.script, readOnly: true });
  return () => {
    ed.destroy();
    viewer?.dispose();
  };
}
