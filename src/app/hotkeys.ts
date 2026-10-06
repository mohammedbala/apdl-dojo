// Keyboard shortcuts. Handlers registered later take precedence (pages over global).
// Combos: 'mod+enter', 'ctrl+h', 'mod+1', '?', 'escape', 'f6'. 'mod' = Ctrl or Cmd.
export interface HotkeyOpts {
  /** fire even when focus is in an input/textarea/editor (default true for combos with a modifier) */
  inInputs?: boolean;
  description?: string;
}

interface Binding {
  combo: string;
  handler: (e: KeyboardEvent) => boolean | void;
  opts: HotkeyOpts;
}

const stack: Binding[] = [];
let installed = false;

function norm(combo: string): string {
  return combo.toLowerCase().split('+').map((s) => s.trim()).sort((a, b) => {
    const order = ['mod', 'ctrl', 'meta', 'alt', 'shift'];
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
  }).join('+');
}

function keyName(e: KeyboardEvent): string {
  const k = e.key.toLowerCase();
  if (k === ' ') return 'space';
  if (k === 'esc') return 'escape';
  return k;
}

function matches(b: Binding, e: KeyboardEvent): boolean {
  const parts = norm(b.combo).split('+');
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  const k = keyName(e);
  // digits: compare by code so Shift/layout does not matter
  const digit = /^digit(\d)$/i.exec(e.code)?.[1];
  const keyOk = k === key || (digit !== undefined && digit === key) || (key === '?' && k === '?');
  if (!keyOk) return false;
  const wantMod = mods.has('mod');
  const wantCtrl = mods.has('ctrl');
  const wantMeta = mods.has('meta');
  if (wantMod && !(e.ctrlKey || e.metaKey)) return false;
  if (wantCtrl && !e.ctrlKey) return false;
  if (wantMeta && !e.metaKey) return false;
  if (!wantMod && !wantCtrl && !wantMeta && (e.ctrlKey || e.metaKey)) return false;
  if (mods.has('alt') !== e.altKey) return false;
  if (key !== '?' && mods.has('shift') !== e.shiftKey) return false;
  return true;
}

function inInput(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || !!t.closest?.('.cm-editor');
}

function onKey(e: KeyboardEvent) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const b = stack[i];
    if (!matches(b, e)) continue;
    const hasMod = /(^|\+)(mod|ctrl|meta|alt)\+/.test(norm(b.combo));
    const allowInput = b.opts.inInputs ?? hasMod;
    if (!allowInput && inInput(e)) continue;
    const r = b.handler(e);
    if (r === false) continue;
    e.preventDefault();
    e.stopPropagation();
    return;
  }
}

export function installHotkeys(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', onKey, true);
}

/** Register a shortcut. Returns an unregister function. Return false from the handler to pass through. */
export function hotkey(combo: string, handler: (e: KeyboardEvent) => boolean | void, opts: HotkeyOpts = {}): () => void {
  const b: Binding = { combo, handler, opts };
  stack.push(b);
  return () => {
    const i = stack.indexOf(b);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function hotkeys(map: Record<string, (e: KeyboardEvent) => boolean | void>, opts: HotkeyOpts = {}): () => void {
  const offs = Object.entries(map).map(([k, f]) => hotkey(k, f, opts));
  return () => offs.forEach((f) => f());
}

export const SHORTCUTS: [string, string][] = [
  ['Ctrl+Enter', 'Run script now'],
  ['Esc', 'Reset attempt (3 s undo)'],
  ['Ctrl+1 … 4', 'Viewport: Target / Yours / Split / Overlay'],
  ['Ctrl+H', 'Next hint (costs XP)'],
  ['Ctrl+L', 'Toggle log panel'],
  ['Ctrl+R', 'Reference drawer (counts as a peek when timed)'],
  ['F6', 'Focus viewport, then 1–6 views, F fit'],
  ['Ctrl+K', 'Command palette'],
  ['?', 'This sheet'],
  ['Drills: Enter / Tab / Esc', 'Submit / restart / end session'],
];
