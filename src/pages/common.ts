// Shared bits for pages.
import { h } from '../ui/dom';

export function comingSoon(root: HTMLElement, title: string, text: string, back?: { href: string; label: string }): void {
  root.appendChild(h('div', { class: 'page-head' }, h('div', null, h('h1', null, title))));
  root.appendChild(h('div', { class: 'empty' },
    h('div', { style: 'font-size:16px;color:var(--fg-dim);margin-bottom:8px' }, 'Coming soon'),
    h('div', null, text),
    back ? h('div', { style: 'margin-top:16px' }, h('a', { class: 'btn', href: back.href }, back.label)) : null,
  ));
}

export function pageHead(title: string, sub?: string, right?: Node | null): HTMLElement {
  return h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), sub ? h('p', null, sub) : null), right ?? null);
}

/** Wrap a non-full page container in a padded inner page (for full-width routes that show a landing). */
export function padded(root: HTMLElement): HTMLElement {
  const inner = h('div', { class: 'page' });
  root.appendChild(inner);
  return inner;
}
