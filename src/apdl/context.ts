import type { Diagnostic, LogEntry, ViewHint } from './diagnostics';
import { ApdlError } from './diagnostics';
import type { EntityKind, Id, ModelState } from '../model/types';
import type { Statement } from './lexer';
import { evalExpr, parseCached, type EvalEnv, type Value } from './expr';
import { getFunctions } from './getfns';

export interface ArrayParam {
  dims: [number, number, number];
  data: Float64Array;
}

export class Ctx {
  m: ModelState;
  log: LogEntry[] = [];
  diagnostics: Diagnostic[] = [];
  hints: ViewHint[] = [];
  arrays = new Map<string, ArrayParam>();
  /** per-run scratch state (last R set, current section ...) */
  scratch = new Map<string, number>();
  deg = false;
  stmt: Statement | null = null;
  cmd = '';
  /** solid-model entities consumed by meshing etc. */
  constructor(m: ModelState) {
    this.m = m;
  }

  get line(): number {
    return this.stmt?.line ?? 0;
  }

  out(text: string) {
    this.log.push({ kind: 'output', line: this.line, text });
  }

  note(text: string, code = 'NOTE') {
    this.diagnostics.push({ severity: 'note', line: this.line, command: this.cmd, text, code });
    this.log.push({ kind: 'note', line: this.line, text });
  }

  warn(code: string, text: string) {
    this.diagnostics.push({ severity: 'warning', line: this.line, command: this.cmd, text, code });
    this.log.push({ kind: 'warning', line: this.line, text });
  }

  error(code: string, text: string) {
    this.diagnostics.push({ severity: 'error', line: this.line, command: this.cmd, text, code });
    this.log.push({ kind: 'error', line: this.line, text });
  }

  report(e: ApdlError) {
    if (e.severity === 'error') this.error(e.code, e.message);
    else if (e.severity === 'warning') this.warn(e.code, e.message);
    else this.note(e.message, e.code);
  }

  hint(h: ViewHint) {
    this.hints.push(h);
  }

  env(): EvalEnv {
    return {
      param: (name) => this.m.params.get(name),
      arrayGet: (name, idx) => {
        const a = this.arrays.get(name);
        if (!a) return undefined;
        const [i = 1, j = 1, k = 1] = idx.map((v) => Math.trunc(v));
        const [d0, d1] = a.dims;
        const off = (i - 1) + (j - 1) * d0 + (k - 1) * d0 * d1;
        if (off < 0 || off >= a.data.length) throw new ApdlError('ARRAY_INDEX', `Array ${name} subscript (${idx.join(',')}) is out of range.`);
        return a.data[off];
      },
      fn: (name, args) => getFunctions(this, name, args),
      deg: this.deg,
      onUndefined: (name) => this.warn('PARAM_UNDEF', `Parameter ${name} is not defined.  A value of zero will be used.`),
    };
  }

  /** Evaluate an expression string. */
  evaluate(text: string): Value {
    return evalExpr(parseCached(text), this.env());
  }

  /** Apply %NAME% forced substitution. */
  substitute(text: string): string {
    if (!text.includes('%')) return text;
    return text.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_, n: string) => {
      const v = this.m.params.get(n.toUpperCase());
      if (v === undefined) return '';
      if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toPrecision(10));
      return v;
    });
  }

  /** Mark a selection-producing message like ANSYS does. */
  selMsg(kind: EntityKind) {
    const names: Record<EntityKind, string> = { kp: 'KEYPOINTS', line: 'LINES', area: 'AREAS', volu: 'VOLUMES', node: 'NODES', elem: 'ELEMENTS' };
    const map = { kp: this.m.kps, line: this.m.lines, area: this.m.areas, volu: this.m.volus, node: this.m.nodes, elem: this.m.elems }[kind];
    let n = 0;
    for (const id of this.m.sel[kind]) if (map.has(id)) n++;
    this.out(` ${names[kind]} SELECTED = ${n}  OF ${map.size}`);
  }

  ensureExists(kind: EntityKind, id: Id) {
    const map = { kp: this.m.kps, line: this.m.lines, area: this.m.areas, volu: this.m.volus, node: this.m.nodes, elem: this.m.elems }[kind];
    if (!map.has(id)) {
      const label = { kp: 'Keypoint', line: 'Line', area: 'Area', volu: 'Volume', node: 'Node', elem: 'Element' }[kind];
      throw new ApdlError(`${kind.toUpperCase()}_UNDEFINED`, `${label} ${id} is undefined.`);
    }
  }
}
