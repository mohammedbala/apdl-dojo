// APDL lexer: physical lines -> statements (command name + raw fields).

export interface Field {
  text: string;
  /** 0-based column of the field start in the physical line */
  col: number;
}

export interface Statement {
  /** 1-based physical line */
  line: number;
  /** 0-based column where the statement starts */
  col: number;
  raw: string;
  /** upper-cased command name as typed (including leading / or *); '*SET' for assignments */
  name: string;
  fields: Field[];
}

/** Commands whose remainder is taken verbatim (no comment stripping, no $ splitting). */
const RAW_LINE = new Set(['/TITLE', '/STITLE', '/COM', '/TLABEL', '/AN3D', 'C***', '/SYS', '*MSG']);

/** Strip a trailing `!` comment that is outside single quotes. */
export function stripComment(line: string): string {
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'") inQ = !inQ;
    else if (c === '!' && !inQ) return line.slice(0, i);
  }
  return line;
}

/** Split a comment-free line on `$` outside quotes. Returns [text, startCol] pairs. */
export function splitDollar(line: string): [string, number][] {
  const out: [string, number][] = [];
  let inQ = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'") inQ = !inQ;
    else if (c === '$' && !inQ) {
      out.push([line.slice(start, i), start]);
      start = i + 1;
    }
  }
  out.push([line.slice(start), start]);
  return out;
}

/** Split on commas outside quotes and parentheses. */
export function splitFields(text: string, baseCol: number): Field[] {
  const out: Field[] = [];
  let depth = 0;
  let inQ = false;
  let start = 0;
  const push = (end: number) => {
    const rawSeg = text.slice(start, end);
    const lead = rawSeg.length - rawSeg.trimStart().length;
    out.push({ text: rawSeg.trim(), col: baseCol + start + lead });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'") inQ = !inQ;
    else if (inQ) continue;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) {
      push(i);
      start = i + 1;
    }
  }
  push(text.length);
  return out;
}

const ASSIGN_RE = /^\s*([A-Za-z_][A-Za-z0-9_]{0,31}(?:\s*\([^=]*\))?)\s*=(?!=)(.*)$/;

function firstToken(t: string): string {
  const m = /^\s*([^,\s]*)/.exec(t);
  return (m ? m[1] : '').toUpperCase();
}

function lexSegment(seg: string, col: number, line: number, out: Statement[]) {
  if (!seg.trim()) return;
  const trimmed = seg.trimStart();
  const lead = seg.length - trimmed.length;
  // assignment:  NAME = expr   (no comma before the '=')
  const eq = trimmed.indexOf('=');
  const comma = trimmed.indexOf(',');
  if (eq > 0 && (comma < 0 || comma > eq) && !/^[/*]/.test(trimmed)) {
    const m = ASSIGN_RE.exec(trimmed);
    if (m) {
      const target = m[1].replace(/\s+/g, '');
      const exprText = m[2];
      const exprCol = col + lead + trimmed.indexOf('=') + 1;
      out.push({
        line,
        col: col + lead,
        raw: trimmed.trim(),
        name: '*SET',
        fields: [
          { text: target, col: col + lead },
          { text: exprText.trim(), col: exprCol + (exprText.length - exprText.trimStart().length) },
        ],
      });
      return;
    }
  }
  const fields = splitFields(trimmed, col + lead);
  const nameField = fields.shift()!;
  // allow "FINISH  " or "K 1" style trailing junk in name: take first whitespace-delimited token
  const name = nameField.text.split(/\s+/)[0].toUpperCase();
  out.push({ line, col: col + lead, raw: trimmed.trim(), name, fields });
}

export interface LexResult {
  statements: Statement[];
  /** line of /EOF if present */
  eofLine?: number;
}

export function lex(src: string): LexResult {
  const statements: Statement[] = [];
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const phys = lines[i];
    const lineNo = i + 1;
    const tok = firstToken(phys);
    if (tok === '/EOF') return { statements, eofLine: lineNo };
    if (RAW_LINE.has(tok) || tok.startsWith('C***')) {
      const t = phys.trimStart();
      const lead = phys.length - t.length;
      const comma = t.indexOf(',');
      const rest = comma >= 0 ? t.slice(comma + 1) : '';
      statements.push({
        line: lineNo,
        col: lead,
        raw: t.trim(),
        name: tok.startsWith('C***') ? 'C***' : tok,
        fields: [{ text: rest.trim(), col: lead + comma + 1 }],
      });
      continue;
    }
    const code = stripComment(phys);
    for (const [seg, col] of splitDollar(code)) lexSegment(seg, col, lineNo, statements);
  }
  return { statements };
}

/** Statements of a single line (for drills / canonicalisation). */
export function splitStatements(text: string): Statement[] {
  return lex(text).statements;
}

/** Non-blank, non-comment physical lines. A `$`-joined line counts once. */
export function countScriptLines(src: string): number {
  let n = 0;
  for (const phys of src.split(/\r?\n/)) {
    const tok = firstToken(phys);
    if (RAW_LINE.has(tok)) { n++; continue; }
    if (stripComment(phys).replace(/\$/g, '').trim()) n++;
  }
  return n;
}
