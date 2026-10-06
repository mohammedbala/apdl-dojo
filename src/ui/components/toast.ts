// Bottom-right toasts.
import { h } from '../dom';

let host: HTMLElement | null = null;

function root(): HTMLElement {
  if (!host || !host.isConnected) {
    host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  return host;
}

export interface ToastOpts {
  kind?: 'info' | 'ach' | 'err' | 'ok';
  title?: string;
  ms?: number;
  action?: { label: string; run: () => void };
}

export function toast(text: string, opts: ToastOpts = {}): () => void {
  const el = h('div', { class: `toast ${opts.kind ?? ''}` },
    h('div', { style: 'flex:1' }, opts.title ? h('div', { class: 't-title' }, opts.title) : null, h('div', { class: opts.title ? 'muted' : '' }, text)),
  );
  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  };
  if (opts.action) {
    const a = opts.action;
    el.appendChild(h('button', { class: 'small', onclick: () => { a.run(); close(); } }, a.label));
  }
  root().appendChild(el);
  setTimeout(close, opts.ms ?? 3500);
  return close;
}

export function achievementToast(title: string, desc: string): void {
  toast(desc, { kind: 'ach', title: `Achievement · ${title}`, ms: 5000 });
}
