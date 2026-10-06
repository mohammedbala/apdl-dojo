// Modal dialogs.
import { h } from '../dom';

export interface ModalHandle {
  el: HTMLElement;
  close: () => void;
}

let openCount = 0;
export function modalOpen(): boolean {
  return openCount > 0;
}

export function openModal(content: Node, opts: { wide?: boolean; onClose?: () => void; dismissable?: boolean; className?: string } = {}): ModalHandle {
  const box = h('div', { class: `modal ${opts.wide ? 'wide' : ''} ${opts.className ?? ''}`, role: 'dialog', 'aria-modal': 'true' }, content);
  const back = h('div', { class: 'modal-back' }, box);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    openCount--;
    back.remove();
    window.removeEventListener('keydown', onKey, true);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.dismissable !== false) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  back.addEventListener('mousedown', (e) => {
    if (e.target === back && opts.dismissable !== false) close();
  });
  window.addEventListener('keydown', onKey, true);
  document.body.appendChild(back);
  openCount++;
  return { el: box, close };
}

export function confirmModal(title: string, text: string, okLabel = 'Confirm', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const ok = h('button', { class: danger ? 'danger' : 'primary', onclick: () => { result = true; m.close(); } }, okLabel);
    const m = openModal(h('div', null,
      h('h1', null, title), h('p', { class: 'muted' }, text),
      h('div', { class: 'actions' }, h('button', { onclick: () => m.close() }, 'Cancel'), ok),
    ), { onClose: () => resolve(result) });
    ok.focus();
  });
}

export function choiceModal<T extends string>(title: string, text: string, choices: { id: T; label: string; primary?: boolean }[]): Promise<T | null> {
  return new Promise((resolve) => {
    let result: T | null = null;
    const m = openModal(h('div', null,
      h('h1', null, title), h('p', { class: 'muted' }, text),
      h('div', { class: 'actions' }, h('button', { onclick: () => m.close() }, 'Cancel'),
        ...choices.map((c) => h('button', { class: c.primary ? 'primary' : '', onclick: () => { result = c.id; m.close(); } }, c.label))),
    ), { onClose: () => resolve(result) });
  });
}
