// Signature help and argument-value completion for APDL commands.
//  - While the cursor is inside a command's fields, a tooltip shows the full signature with the current
//    argument highlighted, what that argument means, its default, and its allowed values.
//  - Label arguments offer their allowed values as completions; numeric arguments offer parameter names
//    defined in the script.
import { StateField, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, showTooltip, type Tooltip } from '@codemirror/view';
import { completionStatus, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { resolveCommandName } from '../apdl/commands/registry';
import { COMMAND_INFO, type CommandInfoX } from '../content/commands';
import { argDoc } from '../content/argdocs';

export interface StatementContext {
  /** canonical command name */
  name: string;
  /** what the user typed for the command name */
  typed: string;
  info: CommandInfoX;
  /** -1 while still on the command name, else the 0-based argument index */
  argIndex: number;
  /** document offset where the current field starts */
  fieldFrom: number;
}

/** Locate the command and argument index at a cursor position within one line of text. */
export function contextAt(lineText: string, col: number): { typed: string; argIndex: number; fieldStart: number } | null {
  let inQ = false;
  let segStart = 0;
  for (let i = 0; i < col; i++) {
    const ch = lineText[i];
    if (ch === "'") inQ = !inQ;
    else if (!inQ && ch === '!') return null; // inside a comment
    else if (!inQ && ch === '$') segStart = i + 1;
  }
  const seg = lineText.slice(segStart, col);
  const lead = seg.length - seg.trimStart().length;
  const body = seg.slice(lead);
  if (!body) return null;
  // assignments are not commands
  const eq = body.indexOf('=');
  const comma0 = body.indexOf(',');
  if (eq > 0 && (comma0 < 0 || eq < comma0) && !/^[/*]/.test(body)) return null;
  let depth = 0;
  inQ = false;
  let commas = 0;
  let lastComma = -1;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'") inQ = !inQ;
    else if (inQ) continue;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) { commas++; lastComma = i; }
  }
  const typed = (comma0 < 0 ? body : body.slice(0, comma0)).trim().split(/\s+/)[0];
  if (!typed) return null;
  return { typed, argIndex: commas - 1, fieldStart: segStart + lead + lastComma + 1 };
}

export function statementAt(state: EditorState, pos: number): StatementContext | null {
  const line = state.doc.lineAt(pos);
  const c = contextAt(line.text, pos - line.from);
  if (!c) return null;
  const name = resolveCommandName(c.typed);
  if (!name) return null;
  const info = COMMAND_INFO.get(name);
  if (!info) return null;
  return { name, typed: c.typed, info, argIndex: c.argIndex, fieldFrom: line.from + c.fieldStart };
}

// ------------------------------------------------------------------ tooltip
function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function renderSignature(ctx: StatementContext): HTMLElement {
  const { info, argIndex } = ctx;
  const root = el('div', 'cm-apdl-sig');
  const sig = el('div', 'sig-line');
  const nameEl = el('span', 'sig-name', info.name);
  sig.append(nameEl);
  info.args.forEach((a, i) => {
    sig.append(document.createTextNode(','));
    sig.append(el('span', i === argIndex ? 'sig-arg on' : 'sig-arg', a.name));
  });
  root.append(sig);
  if (ctx.typed.toUpperCase() !== info.name) {
    root.append(el('div', 'sig-note', `${ctx.typed.toUpperCase()} = ${info.name}`));
  }
  if (argIndex >= 0 && argIndex < info.args.length) {
    const a = info.args[argIndex];
    const doc = argDoc(info.name, a.name);
    const row = el('div', 'sig-desc');
    row.append(el('b', '', `${a.name}: `));
    row.append(document.createTextNode(doc?.desc ?? 'Argument'));
    if (a.dflt !== undefined && a.dflt !== '') row.append(el('span', 'sig-dflt', `  blank = ${a.dflt}`));
    root.append(row);
    if (doc?.choices?.length) {
      const ch = el('div', 'sig-choices');
      for (const c of doc.choices.slice(0, 10)) {
        const item = el('span', 'sig-choice');
        item.append(el('code', '', c.v), document.createTextNode(` ${c.d}`));
        ch.append(item);
      }
      root.append(ch);
    }
  } else if (argIndex >= info.args.length) {
    root.append(el('div', 'sig-desc', `${info.name} takes ${info.args.length} field${info.args.length === 1 ? '' : 's'}; extra fields are ignored.`));
  }
  root.append(el('div', 'sig-sum', info.summary));
  return root;
}

function sigTooltip(state: EditorState): readonly Tooltip[] {
  const sel = state.selection.main;
  if (!sel.empty) return [];
  const ctx = statementAt(state, sel.head);
  if (!ctx) return [];
  // on the command name itself only show once the name is complete (completion list covers the rest)
  if (ctx.argIndex < 0 && ctx.typed.toUpperCase() !== ctx.info.name && ctx.typed.length < 4) return [];
  // the completion list already shows the command's info while choosing a name
  if (ctx.argIndex < 0 && completionStatus(state) !== null) return [];
  return [{
    pos: sel.head,
    above: true,
    strictSide: false,
    arrow: false,
    create: () => ({ dom: renderSignature(ctx) }),
  }];
}

const sigField = StateField.define<readonly Tooltip[]>({
  create: sigTooltip,
  update(tips, tr) {
    const next = sigTooltip(tr.state);
    // keep the same tooltip object when nothing visible changed (avoids flicker)
    if (!tr.docChanged && !tr.selection && next.length === tips.length && (next.length === 0 || next[0].pos === tips[0].pos)) return tips;
    return next;
  },
  provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
});

const sigTheme = EditorView.baseTheme({
  '.cm-tooltip:has(> .cm-apdl-sig)': { background: 'transparent', border: 'none' },
  '.cm-apdl-sig': {
    background: 'var(--bg-2, #1a2130)',
    border: '1px solid var(--line-2, #33405a)',
    borderRadius: '4px',
    padding: '6px 9px',
    maxWidth: '560px',
    fontSize: '12px',
    lineHeight: '1.45',
    color: 'var(--fg, #d7dee9)',
    boxShadow: 'none',
  },
  '.cm-apdl-sig .sig-line': { fontFamily: 'var(--mono, monospace)', whiteSpace: 'normal', wordBreak: 'break-word' },
  '.cm-apdl-sig .sig-name': { color: 'var(--accent, #ffb000)', fontWeight: '700' },
  '.cm-apdl-sig .sig-arg': { color: 'var(--fg-muted, #7f8a9c)', padding: '0 1px' },
  '.cm-apdl-sig .sig-arg.on': { color: 'var(--bg, #0b0e14)', background: 'var(--accent-2, #4cc9f0)', borderRadius: '2px', fontWeight: '700' },
  '.cm-apdl-sig .sig-note': { color: 'var(--fg-muted, #7f8a9c)', fontSize: '11px' },
  '.cm-apdl-sig .sig-desc': { marginTop: '3px' },
  '.cm-apdl-sig .sig-dflt': { color: 'var(--fg-muted, #7f8a9c)' },
  '.cm-apdl-sig .sig-choices': { marginTop: '3px', display: 'flex', flexWrap: 'wrap', gap: '2px 10px', color: 'var(--fg-muted, #7f8a9c)' },
  '.cm-apdl-sig .sig-choice code': { color: 'var(--ok, #3ddc97)', fontWeight: '600' },
  '.cm-apdl-sig .sig-sum': { marginTop: '3px', color: 'var(--fg-muted, #7f8a9c)', fontStyle: 'italic' },
});

export function signatureHelp(): Extension {
  return [sigField, sigTheme];
}

// ------------------------------------------------------------------ argument completion
/** Parameter names defined in the script (NAME =, *SET, *DO, *GET, *DIM). */
export function scriptParams(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/!.*$/, '');
    for (const seg of line.split('$')) {
      const s = seg.trim();
      const m = /^([A-Za-z_][A-Za-z0-9_]{0,31})\s*=/.exec(s);
      if (m) out.add(m[1].toUpperCase());
      const m2 = /^\*(SET|DO|GET|DIM)\w*\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/i.exec(s);
      if (m2) out.add(m2[2].toUpperCase());
    }
  }
  return [...out].sort();
}

export function argumentCompletion(ctx: CompletionContext): CompletionResult | null {
  const st = statementAt(ctx.state, ctx.pos);
  if (!st || st.argIndex < 0) return null;
  const word = ctx.matchBefore(/[A-Za-z_0-9]*/);
  if (!word) return null;
  // only when the word is the whole field so far (no expressions in progress)
  const fieldText = ctx.state.sliceDoc(st.fieldFrom, ctx.pos);
  if (fieldText.trim() !== word.text) return null;
  const arg = st.info.args[st.argIndex];
  const doc = arg ? argDoc(st.info.name, arg.name) : undefined;
  const options: { label: string; detail?: string; type?: string; boost?: number }[] = [];
  // a complete value was typed: hide the list so Enter starts a new line
  if (doc?.choices?.some((c) => c.v.toUpperCase() === word.text.toUpperCase())) return null;
  if (doc?.choices) doc.choices.forEach((c, i) => options.push({ label: c.v, detail: c.d, type: 'enum', boost: 99 - i }));
  if (/^[A-Za-z_]/.test(word.text) || (ctx.explicit && !doc?.choices)) {
    const comps = new Set<string>();
    for (const m of ctx.state.doc.toString().matchAll(/^\s*CM\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/gim)) comps.add(m[1].toUpperCase());
    for (const p of scriptParams(ctx.state.doc.toString())) options.push({ label: p, detail: 'parameter', type: 'variable' });
    for (const c of comps) options.push({ label: c, detail: 'component', type: 'class' });
  }
  if (!options.length) return null;
  if (!word.text && !ctx.explicit && !doc?.choices) return null;
  return { from: word.from, options };
}
