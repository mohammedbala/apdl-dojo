// App shell: header (nav, level badge, XP bar, streak strip), narrow-screen notice, global shortcuts.
import { h } from '../ui/dom';
import { mountHeaderStatus } from '../ui/components/levelbar';
import { hotkey, SHORTCUTS } from './hotkeys';
import { openPalette } from '../ui/palette';
import { openModal, modalOpen } from '../ui/components/modal';
import { toggleReferenceDrawer } from '../ui/reference';
import type { Router } from './router';

export const NAV: [string, string][] = [
  ['Home', '#/'], ['Train', '#/train'], ['Drills', '#/drills'], ['Flashcards', '#/flashcards'], ['Tracks', '#/tracks'], ['Daily', '#/daily'],
  ['Speedrun', '#/speedrun'], ['Sandbox', '#/sandbox'], ['Stats', '#/stats'], ['Achievements', '#/achievements'], ['Reference', '#/reference'], ['Settings', '#/settings'],
];

export const LOGO_SVG = `<svg width="20" height="20" viewBox="0 0 32 32" fill="none" stroke="#ffb000" stroke-width="2" stroke-linejoin="round"><path d="M16 3 L28 9.5 L28 22.5 L16 29 L4 22.5 L4 9.5 Z"/><path d="M4 9.5 L16 16 L28 9.5 M16 16 L16 29"/></svg>`;

export function buildShell(app: HTMLElement): { main: HTMLElement; bind: (r: Router) => void } {
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' }, ...NAV.map(([label, href]) => h('a', { href, dataset: { href } }, label)));
  const status = h('div', { class: 'hdr-right' });
  const header = h('header', { class: 'header' },
    h('a', { class: 'brand', href: '#/', html: `${LOGO_SVG}<span>APDL Dojo</span>` }),
    nav,
    status,
  );
  const notice = h('div', { class: 'narrow-notice' }, 'APDL Dojo is built for desktop screens (960 px and wider). Some screens will be cramped.');
  const main = h('main', { class: 'main', id: 'main' });
  app.append(header, notice, main);
  mountHeaderStatus(status);

  const bind = (router: Router) => {
    const mark = (path: string) => {
      for (const a of nav.querySelectorAll<HTMLAnchorElement>('a')) {
        const href = a.dataset.href!.slice(1);
        const active = href === '/' ? path === '/' : path === href || path.startsWith(href + '/') || (href === '/tracks' && (path.startsWith('/lesson') || path.startsWith('/challenge')));
        a.classList.toggle('active', active);
      }
    };
    router.onChange(mark);
  };

  hotkey('mod+k', () => { openPalette(); });
  hotkey('?', () => { if (!modalOpen()) showShortcutSheet(); }, { inInputs: false });
  // Global reference drawer; the challenge page registers its own (peek-counting) handler on top.
  hotkey('mod+r', () => { toggleReferenceDrawer(); });
  return { main, bind };
}

export function showShortcutSheet(): void {
  openModal(h('div', null,
    h('h1', null, 'Keyboard shortcuts'),
    h('div', { class: 'sheet' }, ...SHORTCUTS.flatMap(([k, d]) => [h('kbd', null, k), h('span', { class: 'muted' }, d)])),
    h('p', { class: 'faint small', style: 'margin-top:16px' }, 'On macOS, Cmd works in place of Ctrl for Enter, K, R, L and 1–4.'),
  ));
}
