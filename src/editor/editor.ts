// CodeMirror 6 APDL editor with run/escape callbacks, paste blocking, autocomplete and diagnostics markers.
import { EditorState, StateEffect, StateField, RangeSet, Prec, type Extension } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, Decoration,
  type DecorationSet, gutter, GutterMarker, placeholder as placeholderExt,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { autocompletion, completionKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { bracketMatching } from '@codemirror/language';
import { apdl } from './apdl-lang';
import { allCommandNames } from '../engine';
import { COMMAND_INFO } from '../content/commands';
import { argDoc } from '../content/argdocs';
import { argumentCompletion, signatureHelp } from './signature';
import { getSettings } from '../app/persist';

export interface EditorDiagnostic {
  line: number;
  severity: 'note' | 'warning' | 'error';
  text: string;
}

export interface EditorOptions {
  value?: string;
  onChange?: (value: string) => void;
  /** fires on the first user edit of each document session (for timers) */
  onKeystroke?: () => void;
  onRun?: () => void;
  onEscape?: () => void;
  blockPaste?: boolean;
  onPasteBlocked?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  /** show the argument tooltip while typing (default: the user's setting) */
  argHints?: boolean;
}

// ------------------------------------------------------------------ diagnostics state
const setDiagsEffect = StateEffect.define<EditorDiagnostic[]>();

class DiagMarker extends GutterMarker {
  constructor(readonly sev: string, readonly text: string) {
    super();
  }
  eq(o: DiagMarker) {
    return o.sev === this.sev && o.text === this.text;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = `cm-diag-mark ${this.sev}`;
    el.title = this.text;
    return el;
  }
}

interface DiagState {
  lines: DecorationSet;
  markers: RangeSet<GutterMarker>;
}

function buildDiag(state: EditorState, diags: EditorDiagnostic[]): DiagState {
  const byLine = new Map<number, EditorDiagnostic[]>();
  for (const d of diags) {
    if (d.severity === 'note') continue;
    if (d.line < 1 || d.line > state.doc.lines) continue;
    const l = byLine.get(d.line) ?? [];
    l.push(d);
    byLine.set(d.line, l);
  }
  const decos = [];
  const marks = [];
  for (const ln of [...byLine.keys()].sort((a, b) => a - b)) {
    const ds = byLine.get(ln)!;
    const sev = ds.some((d) => d.severity === 'error') ? 'error' : 'warning';
    const line = state.doc.line(ln);
    const text = ds.map((d) => d.text).join('\n');
    decos.push(Decoration.line({ class: `cm-diag-line-${sev}`, attributes: { title: text } }).range(line.from));
    marks.push(new DiagMarker(sev, text).range(line.from));
  }
  return { lines: Decoration.set(decos, true), markers: RangeSet.of(marks, true) };
}

const diagField = StateField.define<DiagState>({
  create: () => ({ lines: Decoration.none, markers: RangeSet.empty }),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setDiagsEffect)) return buildDiag(tr.state, e.value);
    if (tr.docChanged) return { lines: v.lines.map(tr.changes), markers: v.markers.map(tr.changes) };
    return v;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.lines),
});

const diagGutter = gutter({
  class: 'cm-diag-gutter',
  markers: (view) => view.state.field(diagField).markers,
});

// ------------------------------------------------------------------ autocomplete
function commandInfoDom(name: string): HTMLElement | null {
  const info = COMMAND_INFO.get(name);
  if (!info) return null;
  const root = document.createElement('div');
  root.className = 'cm-apdl-cinfo';
  const sig = document.createElement('div');
  sig.className = 'ci-sig';
  sig.textContent = info.signature.split(',').join(', ');
  const sum = document.createElement('div');
  sum.className = 'ci-sum';
  sum.textContent = info.summary + (info.abbrev ? `  (short: ${info.abbrev})` : '');
  root.append(sig, sum);
  if (info.args.length) {
    const list = document.createElement('div');
    list.className = 'ci-args';
    for (const a of info.args.slice(0, 12)) {
      const row = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = a.name;
      row.append(b, document.createTextNode(` ${argDoc(info.name, a.name)?.desc ?? ''}${a.dflt !== undefined && a.dflt !== '' ? ` (blank = ${a.dflt})` : ''}`));
      list.append(row);
    }
    if (info.args.length > 12) list.append(document.createTextNode(`… ${info.args.length - 12} more`));
    root.append(list);
  }
  return root;
}

const OPTIONS = allCommandNames().map((name) => {
  const info = COMMAND_INFO.get(name);
  return {
    label: name,
    type: 'keyword',
    detail: info ? info.signature.slice(name.length).split(',').join(', ') : '',
    info: info ? () => commandInfoDom(name) : undefined,
    boost: info ? 1 : 0,
  };
});

const OPTION_NAMES = new Set(OPTIONS.map((o) => o.label));

function commandCompletion(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/[/*]?[A-Za-z][A-Za-z0-9_]*/);
  if (!word) return null;
  const line = ctx.state.doc.lineAt(word.from);
  const before = line.text.slice(0, word.from - line.from);
  // only complete the first token of a statement
  if (!/(^|\$)\s*$/.test(before)) return null;
  if (word.from === word.to && !ctx.explicit) return null;
  // a complete, unambiguous command name was typed: hide the list so Enter starts a new line
  const up = word.text.toUpperCase();
  if (!ctx.explicit && OPTION_NAMES.has(up) && !OPTIONS.some((o) => o.label !== up && o.label.startsWith(up))) return null;
  return { from: word.from, options: OPTIONS };
}

const theme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-tooltip-autocomplete .cm-completionDetail': { color: 'var(--fg-muted, #7f8a9c)', fontStyle: 'normal', marginLeft: '0.6em' },
  '.cm-tooltip.cm-completionInfo': { background: 'var(--bg-2, #1a2130)', border: '1px solid var(--line-2, #33405a)', maxWidth: '420px', padding: '6px 9px' },
  '.cm-apdl-cinfo': { fontSize: '12px', lineHeight: '1.45' },
  '.cm-apdl-cinfo .ci-sig': { fontFamily: 'var(--mono, monospace)', color: 'var(--accent, #ffb000)', marginBottom: '3px' },
  '.cm-apdl-cinfo .ci-sum': { color: 'var(--fg, #d7dee9)', marginBottom: '4px' },
  '.cm-apdl-cinfo .ci-args': { color: 'var(--fg-muted, #7f8a9c)' },
  '.cm-apdl-cinfo .ci-args b': { color: 'var(--accent-2, #4cc9f0)', fontWeight: '600' },
  '.cm-content': { caretColor: 'var(--accent)', padding: '8px 0' },
  '.cm-line': { padding: '0 12px 0 6px' },
}, { dark: true });

export class ApdlEditor {
  view: EditorView;
  private opts: EditorOptions;
  private silent = false;
  private typedSinceSet = false;

  constructor(parent: HTMLElement, opts: EditorOptions = {}) {
    this.opts = opts;
    const ext: Extension[] = [
      lineNumbers(),
      diagGutter,
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      history(),
      bracketMatching(),
      apdl(),
      diagField,
      theme,
      autocompletion({ override: [commandCompletion, argumentCompletion], activateOnTyping: true, icons: false }),
      opts.argHints ?? getSettings().argHints ?? true ? signatureHelp() : [],
      Prec.highest(keymap.of([
        { key: 'Mod-Enter', run: () => { this.opts.onRun?.(); return true; } },
      ])),
      Prec.high(keymap.of([
        { key: 'Escape', run: () => { if (this.opts.onEscape) { this.opts.onEscape(); return true; } return false; } },
      ])),
      keymap.of([...completionKeymap, ...defaultKeymap.filter((b) => b.key !== 'Mod-Enter'), ...historyKeymap, indentWithTab]),
      EditorView.updateListener.of((u) => {
        if (!u.docChanged || this.silent) return;
        if (!this.typedSinceSet) {
          this.typedSinceSet = true;
          this.opts.onKeystroke?.();
        }
        this.opts.onChange?.(u.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        paste: (e) => this.blockIfNeeded(e),
        drop: (e) => this.blockIfNeeded(e),
      }),
    ];
    if (opts.readOnly) ext.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
    if (opts.placeholder) ext.push(placeholderExt(opts.placeholder));
    this.view = new EditorView({ parent, state: EditorState.create({ doc: opts.value ?? '', extensions: ext }) });
  }

  private blockIfNeeded(e: Event): boolean {
    if (!this.opts.blockPaste) return false;
    e.preventDefault();
    this.opts.onPasteBlocked?.();
    return true;
  }

  setBlockPaste(on: boolean): void {
    this.opts.blockPaste = on;
  }

  getValue(): string {
    return this.view.state.doc.toString();
  }

  /** Replace the document without firing onChange / onKeystroke. Resets the keystroke latch. */
  setValue(text: string, resetKeystroke = true): void {
    this.silent = true;
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } });
    this.silent = false;
    if (resetKeystroke) this.typedSinceSet = false;
  }

  focus(): void {
    this.view.focus();
  }

  setDiagnostics(diags: EditorDiagnostic[]): void {
    this.view.dispatch({ effects: setDiagsEffect.of(diags) });
  }

  gotoLine(line: number): void {
    const l = this.view.state.doc.line(Math.max(1, Math.min(this.view.state.doc.lines, line)));
    this.view.dispatch({ selection: { anchor: l.from }, scrollIntoView: true });
    this.view.focus();
  }

  destroy(): void {
    this.view.destroy();
  }
}
