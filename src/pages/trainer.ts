// #/train and #/train/:id — continuous trainer: every challenge of every track in curriculum order on one
// screen. Sidebar = the whole curriculum with progress; main = the challenge (editor, 3-D view, checklist).
// Clearing a challenge (Enter on the clear dialog) moves straight on to the next one, across tracks.
import type { RouteCtx } from '../app/router';
import { challengesForTrack, getChallenge, lessonForChallenge, tracks, SPEEDRUN_TARGET_ID } from '../content';
import type { Challenge, Lesson } from '../content/types';
import { getSave } from '../app/persist';
import { navigate } from '../app/router';
import { hotkeys } from '../app/hotkeys';
import { h } from '../ui/dom';
import { renderMarkdown } from '../ui/markdown';
import { starsEl } from '../ui/components/stars';
import { openModal } from '../ui/components/modal';
import { runScript } from '../engine';
import { SafeViewer } from '../ui/viewer';
import { mountAttempt } from './attempt';
import { challengeAttemptConfig } from './challenge';

const LAST_KEY = 'apdl-dojo:trainer-last';
const SEEN_KEY = 'apdl-dojo:trainer-lessons-seen';
const COLLAPSE_KEY = 'apdl-dojo:trainer-collapsed';

function kvGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function kvSet(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* storage unavailable */ }
}

/** Every challenge in curriculum order (track t1..t10, then challenge order). */
export function curriculum(): Challenge[] {
  return tracks.flatMap((t) => challengesForTrack(t.id)).filter((c) => c.id !== SPEEDRUN_TARGET_ID);
}

function bestStars(id: string): number {
  return getSave().challenges[id]?.bestStars ?? 0;
}

/** Where to resume: the last challenge visited if it is not yet cleared, else the first uncleared one. */
export function resumeTarget(list: Challenge[]): Challenge | undefined {
  const last = kvGet(LAST_KEY);
  if (last && list.some((c) => c.id === last) && bestStars(last) === 0) return getChallenge(last);
  return list.find((c) => bestStars(c.id) === 0) ?? (last ? getChallenge(last) : undefined) ?? list[0];
}

function seenLessons(): Set<string> {
  try { return new Set(JSON.parse(kvGet(SEEN_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}

function markLessonSeen(id: string) {
  const s = seenLessons();
  s.add(id);
  kvSet(SEEN_KEY, JSON.stringify([...s]));
}

function lessonModal(lesson: Lesson, startLabel = 'Start') {
  const md = h('div', { class: 'md' });
  md.innerHTML = renderMarkdown(lesson.explanation);
  const code = h('pre', { class: 'tr-code' }, h('code', null, lesson.workedExample.script));
  const vpHost = h('div', { class: 'tr-lesson-vp' });
  let viewer: SafeViewer | null = null;
  const showBtn = h('button', {
    onclick: async () => {
      showBtn.setAttribute('disabled', '');
      vpHost.style.display = '';
      viewer ??= new SafeViewer(vpHost, 'yours', false);
      try {
        const r = await runScript(lesson.workedExample.script);
        viewer.setModel(r.model, r.viewHints);
        setTimeout(() => viewer?.fit(), 40);
      } catch {
        vpHost.textContent = 'Could not run the example.';
      }
    },
  }, 'Show example in 3-D');
  vpHost.style.display = 'none';
  const start = h('button', { class: 'primary', onclick: () => m.close() }, startLabel);
  const m = openModal(h('div', null,
    h('div', { class: 'kicker' }, `Lesson · ${lesson.track.toUpperCase()}`),
    h('h1', { style: 'margin-top:4px' }, lesson.title),
    md,
    h('h3', null, 'Worked example'),
    code,
    h('p', { class: 'faint small' }, lesson.workedExample.commentary),
    vpHost,
    h('div', { class: 'actions' }, showBtn, start),
  ), { wide: true, onClose: () => viewer?.dispose() });
  start.focus();
}

export function trainerPage({ params, root }: RouteCtx) {
  const list = curriculum();
  if (!list.length) {
    root.append(h('div', { class: 'page' }, 'No challenges have been authored yet.'));
    return;
  }
  if (!params.id) {
    const t = resumeTarget(list);
    navigate(`#/train/${t?.id ?? list[0].id}`);
    return;
  }
  const idx = list.findIndex((c) => c.id === params.id);
  const c = idx >= 0 ? list[idx] : undefined;
  if (!c) {
    navigate(`#/train/${list[0].id}`);
    return;
  }
  kvSet(LAST_KEY, c.id);
  const prev = idx > 0 ? list[idx - 1] : undefined;
  const next = idx < list.length - 1 ? list[idx + 1] : undefined;
  const lesson = lessonForChallenge(c.id);

  // ---------------------------------------------------------------- sidebar
  const save = getSave();
  const cleared = list.filter((x) => (save.challenges[x.id]?.bestStars ?? 0) > 0).length;
  const stars = list.reduce((a, x) => a + (save.challenges[x.id]?.bestStars ?? 0), 0);
  const items: HTMLElement[] = [];
  let currentEl: HTMLElement | null = null;
  for (const t of tracks) {
    const cs = list.filter((x) => x.track === t.id);
    if (!cs.length) continue;
    const done = cs.filter((x) => (save.challenges[x.id]?.bestStars ?? 0) > 0).length;
    items.push(h('div', { class: 'tr-track' },
      h('span', null, `${t.id.toUpperCase()} · ${t.title}`),
      h('span', { class: 'faint' }, `${done}/${cs.length}`)));
    for (const x of cs) {
      const st = save.challenges[x.id]?.bestStars ?? 0;
      const isCur = x.id === c.id;
      const el = h('a', {
        class: `tr-item${isCur ? ' on' : ''}${st ? ' done' : ''}`,
        href: `#/train/${x.id}`,
        title: `${x.title} · difficulty ${x.difficulty}`,
      },
      h('span', { class: 'tr-mark' }, st ? '✓' : isCur ? '▸' : '○'),
      h('span', { class: 'tr-title' }, x.title),
      st ? starsEl(st) : h('span', { class: 'tr-diff faint' }, '•'.repeat(x.difficulty)));
      if (isCur) currentEl = el;
      items.push(el);
    }
  }
  items.push(h('div', { class: 'tr-track' }, h('span', null, 'Finale'), h('span', null, '')));
  items.push(h('a', { class: 'tr-item', href: '#/speedrun/run?cat=any', title: 'Full TGF-36 against the clock' },
    h('span', { class: 'tr-mark' }, '⏱'), h('span', { class: 'tr-title' }, 'TGF-36 speedrun'), h('span', null, '')));

  const pct = Math.round((100 * cleared) / list.length);
  const sidebar = h('aside', { class: 'tr-side' },
    h('div', { class: 'tr-head' },
      h('div', { class: 'row between' }, h('strong', null, 'Trainer'), h('span', { class: 'faint small' }, `${cleared}/${list.length} cleared · ${stars}/${list.length * 3} ★`)),
      h('div', { class: 'progress', title: `${pct}% cleared` }, h('i', { style: `width:${pct}%` })),
      h('div', { class: 'tr-nav' },
        h('button', { class: 'small', disabled: !prev, title: 'Previous challenge (Alt+P outside the editor)', onclick: () => prev && navigate(`#/train/${prev.id}`) }, '← Prev'),
        lesson ? h('button', { class: 'small', onclick: () => lessonModal(lesson, 'Back to the challenge') }, 'Lesson') : null,
        h('button', { class: 'small', disabled: !next, title: 'Skip to the next challenge (Alt+N outside the editor)', onclick: () => next && navigate(`#/train/${next.id}`) }, 'Skip →'),
      ),
      h('div', { class: 'faint small tr-pos' }, `Challenge ${idx + 1} of ${list.length}${lesson ? ` · ${lesson.title}` : ''}`),
    ),
    h('div', { class: 'tr-list' }, ...items),
  );
  const collapseBtn = h('button', { class: 'tr-collapse small ghost', title: 'Show / hide the curriculum' }, '☰');
  const main = h('div', { class: 'tr-main' });
  const layout = h('div', { class: `trainer${kvGet(COLLAPSE_KEY) === '1' ? ' collapsed' : ''}` }, sidebar, main, collapseBtn);
  collapseBtn.addEventListener('click', () => {
    layout.classList.toggle('collapsed');
    kvSet(COLLAPSE_KEY, layout.classList.contains('collapsed') ? '1' : '0');
    window.dispatchEvent(new Event('resize'));
  });
  root.append(layout, h('style', null, TRAINER_CSS));
  requestAnimationFrame(() => (currentEl as HTMLElement | null)?.scrollIntoView({ block: 'center' }));

  // ---------------------------------------------------------------- the challenge itself
  const cleanup = mountAttempt(main, challengeAttemptConfig(c, {
    title: `${idx + 1}/${list.length} · ${c.track.toUpperCase()} · ${c.title}`,
    backHref: '#/tracks',
    nextHref: next ? `#/train/${next.id}` : '#/speedrun',
    nextLabel: next ? `Next: ${next.title}${next.track !== c.track ? ` (${next.track.toUpperCase()})` : ''}` : 'On to the speedrun',
  }));

  // lesson briefing when entering a lesson for the first time
  if (lesson && lesson.challengeIds[0] === c.id && !seenLessons().has(lesson.id) && bestStars(c.id) === 0) {
    markLessonSeen(lesson.id);
    setTimeout(() => lessonModal(lesson), 50);
  }

  const offKeys = hotkeys({
    'alt+n': () => { if (next) navigate(`#/train/${next.id}`); },
    'alt+p': () => { if (prev) navigate(`#/train/${prev.id}`); },
  }, { inInputs: false });

  return () => {
    offKeys();
    cleanup();
  };
}

const TRAINER_CSS = `
.trainer{display:grid;grid-template-columns:270px minmax(0,1fr);height:calc(100vh - var(--header-h));min-height:560px;position:relative}
.trainer.collapsed{grid-template-columns:0 minmax(0,1fr)}
.trainer.collapsed .tr-side{display:none}
.tr-side{display:grid;grid-template-rows:auto minmax(0,1fr);border-right:1px solid var(--line);background:var(--bg-1);min-height:0}
.tr-head{padding:10px 12px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:8px}
.tr-nav{display:flex;gap:6px}
.tr-nav button{flex:1}
.tr-pos{line-height:1.3}
.tr-list{overflow:auto;padding:4px 0 24px}
.tr-track{display:flex;justify-content:space-between;gap:8px;padding:10px 12px 4px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--fg-muted)}
.tr-item{display:grid;grid-template-columns:16px minmax(0,1fr) auto;gap:6px;align-items:center;padding:4px 12px;font-size:12px;color:var(--fg);text-decoration:none;border-left:2px solid transparent}
.tr-item:hover{background:var(--bg-2)}
.tr-item.on{background:var(--bg-2);border-left-color:var(--accent)}
.tr-item.done .tr-mark{color:var(--ok)}
.tr-item.on .tr-mark{color:var(--accent)}
.tr-mark{color:var(--fg-muted);text-align:center}
.tr-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tr-diff{font-size:10px;letter-spacing:1px}
.tr-main{min-width:0;min-height:0}
.tr-main .attempt{height:calc(100vh - var(--header-h))}
.tr-collapse{position:absolute;left:6px;bottom:6px;z-index:5}
.trainer:not(.collapsed) .tr-collapse{left:230px}
.tr-code{max-height:220px;overflow:auto}
.tr-lesson-vp{height:300px;border:1px solid var(--line);border-radius:4px;margin-top:8px;position:relative}
`;
