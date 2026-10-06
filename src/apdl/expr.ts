// APDL expression parser/evaluator (Pratt parser).
//   + - * / **   unary -   ( )   comparisons < > return 1/0
//   functions: SIN COS TAN ASIN ACOS ATAN ATAN2 SINH COSH TANH SQRT ABS SIGN EXP LOG LOG10 NINT INT MOD
//   plus model "get functions" supplied by the evaluation context (NX, KX, NODE, KP, ...).

export type Value = number | string;

export type Expr =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; name: string }
  | { t: 'call'; name: string; args: Expr[] }
  | { t: 'un'; op: '-' | '+'; e: Expr }
  | { t: 'bin'; op: string; a: Expr; b: Expr };

export interface EvalEnv {
  /** parameter lookup (upper-case name) */
  param(name: string): Value | undefined;
  /** array element lookup; return undefined if not an array */
  arrayGet?(name: string, idx: number[]): number | undefined;
  /** get-function hook (NODE(x,y,z) etc.); return undefined if unknown */
  fn?(name: string, args: number[]): number | undefined;
  deg: boolean;
  /** called for undefined parameters (value 0 is used) */
  onUndefined?(name: string): void;
}

export class ExprError extends Error {}

type Tok = { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'id'; v: string } | { k: 'op'; v: string };

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?/.exec(s.slice(i));
      if (!m) throw new ExprError(`Invalid number near "${s.slice(i)}"`);
      out.push({ k: 'num', v: parseFloat(m[0].replace(/[dD]/, 'e')) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i))!;
      out.push({ k: 'id', v: m[0].toUpperCase() });
      i += m[0].length;
      continue;
    }
    if (c === "'") {
      const j = s.indexOf("'", i + 1);
      if (j < 0) throw new ExprError('Unterminated string');
      out.push({ k: 'str', v: s.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (s.startsWith('**', i)) { out.push({ k: 'op', v: '**' }); i += 2; continue; }
    if ('+-*/(),<>'.includes(c)) { out.push({ k: 'op', v: c }); i++; continue; }
    throw new ExprError(`Unexpected character '${c}'`);
  }
  return out;
}

const BP: Record<string, number> = { '<': 5, '>': 5, '+': 10, '-': 10, '*': 20, '/': 20, '**': 40 };

export function parseExpr(src: string): Expr {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expectOp = (v: string) => {
    const t = next();
    if (!t || t.k !== 'op' || t.v !== v) throw new ExprError(`Expected '${v}'`);
  };
  function nud(): Expr {
    const t = next();
    if (!t) throw new ExprError('Unexpected end of expression');
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'str') return { t: 'str', v: t.v };
    if (t.k === 'id') {
      const n = peek();
      if (n && n.k === 'op' && n.v === '(') {
        next();
        const args: Expr[] = [];
        if (!(peek()?.k === 'op' && (peek() as { v: string }).v === ')')) {
          for (;;) {
            args.push(expr(0));
            const s = peek();
            if (s && s.k === 'op' && s.v === ',') { next(); continue; }
            break;
          }
        }
        expectOp(')');
        return { t: 'call', name: t.v, args };
      }
      return { t: 'id', name: t.v };
    }
    if (t.v === '(') {
      const e = expr(0);
      expectOp(')');
      return e;
    }
    if (t.v === '-' || t.v === '+') return { t: 'un', op: t.v, e: expr(30) };
    throw new ExprError(`Unexpected '${t.v}'`);
  }
  function expr(rbp: number): Expr {
    let left = nud();
    for (;;) {
      const t = peek();
      if (!t || t.k !== 'op' || !(t.v in BP)) break;
      const bp = BP[t.v];
      if (bp <= rbp) break;
      next();
      // ** is right associative
      const right = expr(t.v === '**' ? bp - 1 : bp);
      left = { t: 'bin', op: t.v, a: left, b: right };
    }
    return left;
  }
  const e = expr(0);
  if (p < toks.length) throw new ExprError(`Unexpected '${(toks[p] as { v: unknown }).v}'`);
  return e;
}

const cache = new Map<string, Expr>();
export function parseCached(src: string): Expr {
  let e = cache.get(src);
  if (!e) {
    e = parseExpr(src);
    if (cache.size > 5000) cache.clear();
    cache.set(src, e);
  }
  return e;
}

export const BUILTIN_FUNCS = new Set([
  'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN', 'ATAN2', 'SINH', 'COSH', 'TANH', 'SQRT', 'ABS', 'SIGN', 'EXP', 'LOG', 'LOG10', 'NINT', 'INT', 'MOD', 'MIN', 'MAX',
]);

function num(v: Value): number {
  if (typeof v === 'number') return v;
  throw new ExprError(`Character value '${v}' used in a numeric expression`);
}

export function evalExpr(e: Expr, env: EvalEnv): Value {
  switch (e.t) {
    case 'num': return e.v;
    case 'str': return e.v;
    case 'id': {
      const v = env.param(e.name);
      if (v === undefined) {
        env.onUndefined?.(e.name);
        return 0;
      }
      return v;
    }
    case 'un': {
      const v = num(evalExpr(e.e, env));
      return e.op === '-' ? -v : v;
    }
    case 'bin': {
      const a = num(evalExpr(e.a, env));
      const b = num(evalExpr(e.b, env));
      switch (e.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/':
          if (b === 0) throw new ExprError('Divide by zero');
          return a / b;
        case '**': return Math.pow(a, b);
        case '<': return a < b ? 1 : 0;
        case '>': return a > b ? 1 : 0;
      }
      throw new ExprError(`Unknown operator ${e.op}`);
    }
    case 'call': {
      const args = e.args.map((x) => evalExpr(x, env));
      const n = e.name;
      if (env.arrayGet) {
        const av = env.arrayGet(n, args.map(num));
        if (av !== undefined) return av;
      }
      const d = env.deg ? Math.PI / 180 : 1;
      const a0 = () => num(args[0] ?? 0);
      const a1 = () => num(args[1] ?? 0);
      switch (n) {
        case 'SIN': return Math.sin(a0() * d);
        case 'COS': return Math.cos(a0() * d);
        case 'TAN': return Math.tan(a0() * d);
        case 'ASIN': return Math.asin(a0()) / d;
        case 'ACOS': return Math.acos(a0()) / d;
        case 'ATAN': return Math.atan(a0()) / d;
        case 'ATAN2': return Math.atan2(a0(), a1()) / d;
        case 'SINH': return Math.sinh(a0());
        case 'COSH': return Math.cosh(a0());
        case 'TANH': return Math.tanh(a0());
        case 'SQRT':
          if (a0() < 0) throw new ExprError('SQRT of a negative number');
          return Math.sqrt(a0());
        case 'ABS': return Math.abs(a0());
        case 'SIGN': return Math.abs(a0()) * (a1() < 0 ? -1 : 1);
        case 'EXP': return Math.exp(a0());
        case 'LOG': return Math.log(a0());
        case 'LOG10': return Math.log10(a0());
        case 'NINT': return Math.sign(a0()) * Math.round(Math.abs(a0()));
        case 'INT': return Math.trunc(a0());
        case 'MOD': {
          const b = a1();
          if (b === 0) throw new ExprError('MOD by zero');
          return a0() % b;
        }
        case 'MIN': return Math.min(...args.map(num));
        case 'MAX': return Math.max(...args.map(num));
        case 'RAND': throw new ExprError('RAND is not supported in the trainer (results must be deterministic)');
      }
      const r = env.fn?.(n, args.map(num));
      if (r !== undefined) return r;
      throw new ExprError(`Unknown function or array ${n}()`);
    }
  }
}

/** True if text is a bare identifier (candidate label or parameter name). */
export function isBareIdent(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

export function isNumericLiteral(s: string): boolean {
  return /^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$/.test(s);
}
