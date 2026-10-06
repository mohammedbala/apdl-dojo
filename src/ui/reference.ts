// Searchable command reference: list renderer shared by the page and the drawer.
import { COMMANDS, FAMILIES } from '../content/commands';
import { tracks } from '../content';
import { clear, h } from './dom';

export function filterCommands(q: string) {
  const s = q.trim().toUpperCase();
  if (!s) return COMMANDS;
  return COMMANDS.filter((c) => c.name.includes(s) || c.signature.toUpperCase().includes(s) || c.summary.toUpperCase().includes(s) || c.family.toUpperCase().includes(s))
    .sort((a, b) => (a.name.startsWith(s) ? 0 : 1) - (b.name.startsWith(s) ? 0 : 1));
}

export function renderRefList(host: HTMLElement, q: string, grouped = true): void {
  clear(host);
  const list = filterCommands(q);
  if (!list.length) {
    host.appendChild(h('div', { class: 'empty' }, 'No command matches.'));
    return;
  }
  const item = (c: (typeof COMMANDS)[number]) => h('div', { class: 'ref-item' },
    h('div', { class: 'sig' }, c.signature),
    h('div', { class: 'sum' }, c.summary),
    h('div', { class: 'meta' }, [c.abbrev ? `abbrev ${c.abbrev}` : '', c.family, c.trackIds.map((t) => tracks.find((x) => x.id === t)?.title ?? t).join(', ')].filter(Boolean).join(' · ')),
  );
  if (!grouped || q.trim()) {
    for (const c of list) host.appendChild(item(c));
    return;
  }
  for (const f of FAMILIES) {
    const cs = list.filter((c) => c.family === f.id);
    if (!cs.length) continue;
    host.appendChild(h('h3', { style: 'margin-top:16px' }, f.label));
    for (const c of cs) host.appendChild(item(c));
  }
}

let drawer: { el: HTMLElement; close: () => void } | null = null;

export function referenceDrawerOpen(): boolean {
  return !!drawer;
}

/** Open (or close if open) the reference drawer. Returns true when it was opened. */
export function toggleReferenceDrawer(onOpen?: () => void): boolean {
  if (drawer) {
    drawer.close();
    return false;
  }
  const body = h('div', { class: 'drawer-body' });
  const input = h('input', { placeholder: 'Search commands…  (Esc closes)', 'aria-label': 'Search commands' }) as HTMLInputElement;
  const el = h('aside', { class: 'drawer', 'aria-label': 'Command reference' },
    h('div', { class: 'drawer-head' }, input, h('button', { class: 'ghost', onclick: () => close() }, '✕')),
    body,
  );
  const prevFocus = document.activeElement as HTMLElement | null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  const close = () => {
    el.remove();
    window.removeEventListener('keydown', onKey, true);
    drawer = null;
    prevFocus?.focus?.();
  };
  input.addEventListener('input', () => renderRefList(body, input.value, false));
  window.addEventListener('keydown', onKey, true);
  renderRefList(body, '', true);
  document.body.appendChild(el);
  input.focus();
  drawer = { el, close };
  onOpen?.();
  return true;
}

export function closeReferenceDrawer(): void {
  drawer?.close();
}
