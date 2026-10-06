// APDL StreamLanguage: command names (first token of a statement), slash / star commands,
// parameter assignments, numbers, quoted strings, `!` comments and `$` separators.
import { StreamLanguage, HighlightStyle, syntaxHighlighting, type StreamParser } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

interface State {
  /** at the start of a statement (line start or after $) */
  stmt: boolean;
  /** inside a raw-line command (/TITLE, /COM): rest of line is text */
  raw: boolean;
}

const RAW = new Set(['/TITLE', '/STITLE', '/COM', '/TLABEL', '/AN3D', '/SYS', '*MSG']);
const LABELS = new Set([
  'ALL', 'S', 'R', 'A', 'U', 'NONE', 'INVE', 'LOC', 'X', 'Y', 'Z', 'UX', 'UY', 'UZ', 'ROTX', 'ROTY', 'ROTZ', 'FX', 'FY', 'FZ', 'MX', 'MY', 'MZ',
  'KP', 'LINE', 'AREA', 'VOLU', 'NODE', 'ELEM', 'TYPE', 'MAT', 'REAL', 'SEC', 'SECN', 'EX', 'PRXY', 'NUXY', 'DENS', 'BEAM', 'SHELL', 'RECT', 'CSOLID', 'HREC', 'CTUBE', 'I',
  'PRES', 'COUNT', 'NUM', 'MAX', 'MIN', 'EQ', 'NE', 'LT', 'GT', 'LE', 'GE', 'ABLT', 'ABGT', 'THEN', 'EXIT', 'CYCLE', 'KEEP', 'DELETE', 'STATIC', 'MODAL', '3D', '2D',
]);

export const apdlParser: StreamParser<State> = {
  name: 'apdl',
  startState: () => ({ stmt: true, raw: false }),
  copyState: (s) => ({ ...s }),
  token(stream, state) {
    if (stream.sol()) {
      state.stmt = true;
      state.raw = false;
    }
    if (state.raw) {
      stream.skipToEnd();
      return 'string';
    }
    if (stream.eatSpace()) return null;
    if (stream.peek() === '!') {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.eat('$')) {
      state.stmt = true;
      return 'separator';
    }
    if (state.stmt) {
      state.stmt = false;
      // assignment NAME = expr
      if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*(?=\s*(\([^)]*\))?\s*=(?!=))/)) return 'variableName.definition';
      const m = stream.match(/^[/*][A-Za-z][A-Za-z0-9_]*/) as RegExpMatchArray | null;
      if (m) {
        const name = m[0].toUpperCase();
        if (RAW.has(name)) state.raw = true;
        return name[0] === '/' ? 'meta' : 'controlKeyword';
      }
      if (stream.match(/^[A-Za-z][A-Za-z0-9_]*/)) {
        if (/^C\*\*\*/i.test(stream.current())) {
          stream.skipToEnd();
          return 'comment';
        }
        return 'keyword';
      }
    }
    if (stream.peek() === "'") {
      stream.next();
      while (!stream.eol()) if (stream.next() === "'") break;
      return 'string';
    }
    if (stream.match(/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/)) return 'number';
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const w = stream.current().toUpperCase();
      return LABELS.has(w) || /^(SOLID|BEAM|SHELL|COMBIN|MASS|LINK|SURF|MPC)\d+$/.test(w) ? 'atom' : 'variableName';
    }
    if (stream.eat(',')) return 'punctuation';
    if (stream.match(/^(\*\*|[-+*/=<>])/)) return 'operator';
    if (stream.eat(/[()]/)) return 'bracket';
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: '!' } },
};

export const apdlLanguage = StreamLanguage.define(apdlParser);

export const apdlHighlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--syn-cmd)', fontWeight: '600' },
  { tag: t.meta, color: 'var(--syn-slash)', fontWeight: '600' },
  { tag: t.controlKeyword, color: 'var(--syn-star)', fontWeight: '600' },
  { tag: t.definition(t.variableName), color: 'var(--syn-def)' },
  { tag: t.variableName, color: 'var(--syn-param)' },
  { tag: t.atom, color: 'var(--syn-label)' },
  { tag: t.number, color: 'var(--syn-num)' },
  { tag: t.string, color: 'var(--syn-str)' },
  { tag: t.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: t.separator, color: 'var(--syn-sep)', fontWeight: '700' },
  { tag: t.punctuation, color: 'var(--fg-faint)' },
  { tag: t.operator, color: 'var(--fg-dim)' },
  { tag: t.bracket, color: 'var(--fg-dim)' },
]);

export function apdl() {
  return [apdlLanguage, syntaxHighlighting(apdlHighlight)];
}
