// Canonical form of typed APDL commands: used for drill grading, Four-char Fiend, technique tags.
//
//   - comments stripped, `$` splits statements, names uppercased + abbreviations expanded
//   - fields uppercased (outside quotes), whitespace removed
//   - numeric fields compared with relative tolerance 1e-9
//   - blank fields replaced by the per-command default (blank-means-zero slots from content/commands.ts)
//   - trailing blank / default-valued fields dropped:  K,5,2,,3 == K,5,2,0,3 ; K,5,2 == K,5,2,0,0
import { splitStatements, stripComment } from '../apdl/lexer';
import { resolveCommandName } from '../apdl/commands/registry';
import { getCommandInfo } from '../content/commands';

export type CanonArg = number | string;

export interface CanonCmd {
  /** canonical command name ('*SET' for assignments) */
  name: string;
  /** name exactly as typed (upper-cased) */
  typed: string;
  args: CanonArg[];
}

const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)(E[+-]?\d+)?$/;

function normField(t: string): string {
  let out = '';
  let inQ = false;
  for (const c of t) {
    if (c === "'") { inQ = !inQ; out += c; continue; }
    if (inQ) { out += c; continue; }
    if (/\s/.test(c)) continue;
    out += c.toUpperCase();
  }
  return out;
}

function parseField(t: string): CanonArg {
  const f = normField(t);
  if (NUM_RE.test(f)) {
    const n = Number(f);
    if (Number.isFinite(n)) return n === 0 ? 0 : n; // drop -0
  }
  return f;
}

export function argsEqual(a: CanonArg, b: CanonArg): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return true;
    const scale = Math.max(Math.abs(a), Math.abs(b));
    return Math.abs(a - b) <= 1e-9 * scale + 1e-12;
  }
  return a === b;
}

/** Canonicalise every statement in a snippet (one physical line or several). */
export function canonicalize(src: string): CanonCmd[] {
  const out: CanonCmd[] = [];
  const text = src.split(/\r?\n/).map((l) => stripComment(l)).join('\n');
  for (const st of splitStatements(text)) {
    const typed = st.name.toUpperCase();
    const name = typed === '*SET' ? '*SET' : (resolveCommandName(typed) ?? typed);
    const info = getCommandInfo(name);
    const raw = st.fields.map((f) => f.text);
    const args: CanonArg[] = raw.map((t, i) => {
      if (t.trim() === '') {
        const d = info?.args[i]?.dflt;
        if (d !== undefined) return typeof d === 'string' ? d.toUpperCase() : d;
        if (info?.args[i]?.blankIsZero) return 0;
        return '';
      }
      return parseField(t);
    });
    // drop trailing blanks and default-valued slots
    while (args.length) {
      const i = args.length - 1;
      const a = args[i];
      const spec = info?.args[i];
      const d = spec?.dflt ?? (spec?.blankIsZero ? 0 : undefined);
      if (a === '' || (d !== undefined && argsEqual(a, typeof d === 'string' ? d.toUpperCase() : d))) args.pop();
      else break;
    }
    out.push({ name, typed, args });
  }
  return out;
}

function fmtArg(a: CanonArg): string {
  if (typeof a === 'number') return String(Number(a.toPrecision(12)));
  return a;
}

export function cmdToString(c: CanonCmd): string {
  if (c.name === '*SET' && c.args.length === 2 && typeof c.args[0] === 'string' && /^[A-Z_][A-Z0-9_]*(\(.*\))?$/.test(c.args[0])) {
    return `${c.args[0]}=${fmtArg(c.args[1])}`;
  }
  return [c.name, ...c.args.map(fmtArg)].join(',');
}

/** Canonical string of a snippet; statements joined with ' $ '. */
export function canonString(src: string): string {
  return canonicalize(src).map(cmdToString).join(' $ ');
}

export function cmdEqual(a: CanonCmd, b: CanonCmd): boolean {
  if (a.name !== b.name || a.args.length !== b.args.length) return false;
  for (let i = 0; i < a.args.length; i++) if (!argsEqual(a.args[i], b.args[i])) return false;
  return true;
}

/** Two snippets are equivalent when every statement matches canonically, in order. */
export function canonEqual(a: string, b: string): boolean {
  const ca = canonicalize(a);
  const cb = canonicalize(b);
  if (ca.length === 0 || ca.length !== cb.length) return false;
  return ca.every((c, i) => cmdEqual(c, cb[i]));
}

/** Canonical command names in first-use order. */
export function commandsIn(src: string): string[] {
  const seen = new Set<string>();
  for (const c of canonicalize(src)) seen.add(c.name);
  return [...seen];
}

/** Number of significant characters of a command name (leading / or * not counted). */
function sigLen(name: string): number {
  return name[0] === '/' || name[0] === '*' ? name.length - 1 : name.length;
}

export interface AbbrevStats {
  /** statements whose canonical command has more than 4 significant characters */
  longCommands: number;
  /** ... of those, typed abbreviated */
  abbreviated: number;
}

export function abbrevStats(src: string): AbbrevStats {
  let longCommands = 0;
  let abbreviated = 0;
  for (const c of canonicalize(src)) {
    if (c.name === '*SET' || sigLen(c.name) <= 4) continue;
    longCommands++;
    if (c.typed !== c.name && sigLen(c.typed) <= 4) abbreviated++;
  }
  return { longCommands, abbreviated };
}

/** True when every command longer than 4 characters was typed as its 4-char abbreviation (and there is at least one). */
export function usesOnlyAbbrev(src: string): boolean {
  const s = abbrevStats(src);
  return s.longCommands > 0 && s.abbreviated === s.longCommands;
}

/** Largest number of statements joined by `$` on one physical line. */
export function maxDollarChain(src: string): number {
  let best = 0;
  for (const line of src.split(/\r?\n/)) {
    const n = splitStatements(stripComment(line)).length;
    if (n > best) best = n;
  }
  return best;
}

/** Number of statements of a family (e.g. 'select') in a script. */
export function countFamily(src: string, family: string): number {
  return canonicalize(src).filter((c) => getCommandInfo(c.name)?.family === family).length;
}

/** Strict-mode comparison: text equal after removing whitespace + uppercasing (no abbreviation / blank tricks). */
export function strictEqual(typed: string, expected: string): boolean {
  const n = (s: string) => normField(stripComment(s));
  return n(typed) === n(expected);
}
