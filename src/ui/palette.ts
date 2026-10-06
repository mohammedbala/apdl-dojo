// Ctrl+K command palette: jump to any route, track, lesson or challenge.
import { challenges, lessons, tracks, errorHunts, SPEEDRUN_TARGET_ID } from '../content';
import { navigate } from '../app/router';
import { openModal } from './components/modal';
import { clear, h } from './dom';

interface Item {
  label: string;
  hint: string;
  href: string;
}

function items(): Item[] {
  const out: Item[] = [
    { label: 'Home', hint: 'page', href: '#/' },
    { label: 'Drills', hint: 'page', href: '#/drills' },
    { label: 'Flashcards', hint: 'page', href: '#/flashcards' },
    { label: 'Tracks', hint: 'page', href: '#/tracks' },
    { label: 'Daily challenge', hint: 'page', href: '#/daily' },
    { label: 'Speedrun', hint: 'page', href: '#/speedrun' },
    { label: 'Error hunt', hint: 'page', href: '#/errorhunt' },
    { label: 'Stats', hint: 'page', href: '#/stats' },
    { label: 'Achievements', hint: 'page', href: '#/achievements' },
    { label: 'Reference', hint: 'page', href: '#/reference' },
    { label: 'Settings', hint: 'page', href: '#/settings' },
    { label: 'Drill: weak spots', hint: 'drill', href: '#/drills/session?set=weak' },
    { label: 'Drill: due commands', hint: 'drill', href: '#/drills/session?set=due' },
  ];
  for (const t of tracks) out.push({ label: `${t.id.toUpperCase()} ${t.title}`, hint: 'track', href: `#/tracks/${t.id}` });
  for (const l of lessons) out.push({ label: l.title, hint: `lesson ${l.track}`, href: `#/lesson/${l.id}` });
  for (const c of challenges) if (c.id !== SPEEDRUN_TARGET_ID) out.push({ label: c.title, hint: `challenge ${c.track}`, href: `#/challenge/${c.id}` });
  for (const e of errorHunts) out.push({ label: e.title, hint: 'error hunt', href: `#/errorhunt/${e.id}` });
  return out;
}

function score(label: string, q: string): number {
  const l = label.toLowerCase();
  if (!q) return 1;
  if (l.startsWith(q)) return 3;
  if (l.includes(q)) return 2;
  let i = 0;
  for (const c of l) if (c === q[i]) i++;
  return i === q.length ? 1 : 0;
}

let open = false;

export function openPalette(): void {
  if (open) return;
  open = true;
  const all = items();
  let sel = 0;
  let shown: Item[] = all;
  const input = h('input', { placeholder: 'Jump to…', 'aria-label': 'Jump to' }) as HTMLInputElement;
  const ul = h('ul');
  const render = () => {
    const q = input.value.trim().toLowerCase();
    shown = all.map((it) => ({ it, s: score(`${it.label} ${it.hint}`, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.it).slice(0, 40);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    clear(ul);
    shown.forEach((it, i) => ul.appendChild(h('li', { class: i === sel ? 'sel' : '', onmousedown: (e: Event) => { e.preventDefault(); go(it); } }, h('span', null, it.label), h('span', { class: 'k' }, it.hint))));
    ul.children[sel]?.scrollIntoView({ block: 'nearest' });
  };
  const go = (it: Item | undefined) => {
    if (!it) return;
    m.close();
    navigate(it.href);
  };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { go(shown[sel]); e.preventDefault(); }
  });
  const m = openModal(h('div', null, input, ul), { className: 'palette', onClose: () => { open = false; } });
  render();
  input.focus();
}
