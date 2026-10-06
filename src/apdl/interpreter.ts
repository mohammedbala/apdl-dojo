// APDL subset interpreter. execute(src) -> RunResult (synchronous; runs inside the worker and in tests).
import { lex, type Statement } from './lexer';
import { parse, type Block } from './parser';
import { Ctx } from './context';
import { Args } from './args';
import { ApdlError, type RunOptions, type RunResult } from './diagnostics';
import { getHandler, resolveCommandName } from './commands/registry';
import { createEmptyModel } from '../model/state';
import { finalizeLoads } from './commands/loads';
import './commands/all';

class Signal {
  constructor(public kind: 'exit' | 'cycle' | 'stop' | 'limit') {}
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function execute(src: string, opts: RunOptions = {}): RunResult {
  const t0 = now();
  const { statements } = lex(src);
  const program = parse(statements);
  const t1 = now();
  const ctx = new Ctx(createEmptyModel());
  ctx.diagnostics.push(...program.syntaxErrors);
  for (const d of program.syntaxErrors) ctx.log.push({ kind: 'error', line: d.line, text: d.text });
  const maxIter = opts.maxIterations ?? 20000;
  const maxCmds = opts.maxCommands ?? 200000;
  let commands = 0;
  let truncated = false;

  function evalCond(a: Args, base: number): boolean {
    const v1 = a.value(base);
    const op = a.lab(base + 1);
    const v2 = a.value(base + 2);
    const tol = 1e-10;
    if (typeof v1 === 'string' || typeof v2 === 'string') {
      const s1 = String(v1 ?? '').toUpperCase(), s2 = String(v2 ?? '').toUpperCase();
      if (op === 'EQ') return s1 === s2;
      if (op === 'NE') return s1 !== s2;
      throw new ApdlError('IF_OP', `*IF comparison ${op} is not valid for character values.`);
    }
    const x = (v1 as number) ?? 0, y = (v2 as number) ?? 0;
    switch (op) {
      case 'EQ': return Math.abs(x - y) <= tol;
      case 'NE': return Math.abs(x - y) > tol;
      case 'LT': return x < y;
      case 'GT': return x > y;
      case 'LE': return x <= y + tol;
      case 'GE': return x >= y - tol;
      case 'ABLT': return Math.abs(x) < Math.abs(y);
      case 'ABGT': return Math.abs(x) > Math.abs(y);
    }
    throw new ApdlError('IF_OP', `*IF operation "${op}" is not valid. Use EQ, NE, LT, GT, LE, GE, ABLT or ABGT.`);
  }

  /** Evaluate the full *IF condition (supports AND/OR/XOR chaining). Returns [result, action]. */
  function ifCondition(stmt: Statement): [boolean, string] {
    ctx.stmt = stmt;
    ctx.cmd = '*IF';
    const a = new Args(ctx, stmt);
    let r = evalCond(a, 0);
    let base = a.lab(3);
    if (base === 'AND' || base === 'OR' || base === 'XOR') {
      const r2 = evalCond(a, 4);
      r = base === 'AND' ? r && r2 : base === 'OR' ? r || r2 : r !== r2;
      base = a.lab(7);
    }
    return [r, base];
  }

  function runCmd(stmt: Statement, name: string | null) {
    if (++commands > maxCmds) {
      truncated = true;
      throw new Signal('limit');
    }
    ctx.stmt = stmt;
    ctx.cmd = name ?? stmt.name;
    ctx.log.push({ kind: 'echo', line: stmt.line, text: stmt.raw.toUpperCase() });
    if (!name) {
      ctx.warn('CMD_UNKNOWN', `${stmt.name} is not a recognized ${ctx.m.processor} command, abbreviation, or macro.  This command will be ignored.`);
      return;
    }
    if (!ctx.m.commandsUsed.includes(name)) ctx.m.commandsUsed.push(name);
    const h = getHandler(name);
    if (!h) {
      ctx.note(`${name} is accepted but has no effect in the trainer.`, 'CMD_NOOP');
      return;
    }
    if (h.proc && !h.proc.includes('ANY') && !h.proc.includes(ctx.m.processor)) {
      ctx.warn('CMD_WRONG_PROC', `${name} is not a recognized ${ctx.m.processor} command, abbreviation, or macro.  This command will be ignored.${ctx.m.processor === 'BEGIN' && h.proc.includes('PREP7') ? '  (Enter the preprocessor with /PREP7 first.)' : ''}`);
      return;
    }
    try {
      h.run(ctx, new Args(ctx, stmt));
    } catch (e) {
      if (e instanceof Signal) throw e;
      if (e instanceof ApdlError) ctx.report(e);
      else {
        ctx.error('INTERNAL', `Internal trainer error while executing ${name}: ${(e as Error).message}`);
        if (typeof console !== 'undefined') console.error(e);
      }
    }
  }

  function runBlocks(blocks: Block[]) {
    for (const b of blocks) {
      if (b.kind === 'cmd') {
        if (b.name === '*EXIT') throw new Signal('exit');
        if (b.name === '*CYCLE') throw new Signal('cycle');
        if (b.name === '*IF') {
          // one-line *IF with EXIT / CYCLE / STOP action
          let res: [boolean, string];
          try {
            res = ifCondition(b.stmt);
          } catch (e) {
            if (e instanceof ApdlError) { ctx.report(e); continue; }
            throw e;
          }
          ctx.log.push({ kind: 'echo', line: b.stmt.line, text: b.stmt.raw.toUpperCase() });
          if (!ctx.m.commandsUsed.includes('*IF')) ctx.m.commandsUsed.push('*IF');
          const [ok, action] = res;
          if (ok) {
            if (action === 'EXIT') throw new Signal('exit');
            if (action === 'CYCLE') throw new Signal('cycle');
            if (action === 'STOP') throw new Signal('stop');
            if (action.startsWith(':')) ctx.warn('IF_GOTO', '*IF branching to a :label is not supported in the trainer.');
          }
          continue;
        }
        runCmd(b.stmt, b.name);
        continue;
      }
      if (b.kind === 'if') {
        if (!ctx.m.commandsUsed.includes('*IF')) ctx.m.commandsUsed.push('*IF');
        let done = false;
        for (const br of b.branches) {
          let ok = false;
          try {
            ok = ifCondition(br.cond)[0];
          } catch (e) {
            if (e instanceof ApdlError) { ctx.report(e); done = true; break; }
            throw e;
          }
          ctx.log.push({ kind: 'echo', line: br.cond.line, text: br.cond.raw.toUpperCase() });
          if (ok) {
            runBlocks(br.body);
            done = true;
            break;
          }
        }
        if (!done && b.elseBody) runBlocks(b.elseBody);
        continue;
      }
      // *DO / *DOWHILE
      ctx.stmt = b.stmt;
      ctx.cmd = b.whileLoop ? '*DOWHILE' : '*DO';
      if (!ctx.m.commandsUsed.includes(ctx.cmd)) ctx.m.commandsUsed.push(ctx.cmd);
      ctx.log.push({ kind: 'echo', line: b.stmt.line, text: b.stmt.raw.toUpperCase() });
      const a = new Args(ctx, b.stmt);
      const par = a.lab(0);
      if (!/^[A-Z_][A-Z0-9_]*$/.test(par)) {
        ctx.error('DO_PARAM', `*DO loop parameter "${a.raw(0)}" is not a valid parameter name.`);
        continue;
      }
      let iter = 0;
      if (b.whileLoop) {
        for (;;) {
          const v = ctx.m.params.get(par);
          if (typeof v !== 'number' || v <= 0) break;
          if (++iter > maxIter) { ctx.error('LOOP_LIMIT', `*DOWHILE loop exceeded ${maxIter} iterations; execution stopped.`); truncated = true; throw new Signal('limit'); }
          try { runBlocks(b.body); } catch (e) {
            if (e instanceof Signal && e.kind === 'cycle') continue;
            if (e instanceof Signal && e.kind === 'exit') break;
            throw e;
          }
        }
      } else {
        let start: number, end: number, inc: number;
        try {
          start = a.num(1);
          end = a.num(2);
          inc = a.isBlank(3) ? 1 : a.num(3);
        } catch (e) {
          if (e instanceof ApdlError) { ctx.report(e); continue; }
          throw e;
        }
        if (inc === 0) { ctx.error('DO_INC', '*DO increment cannot be zero.'); continue; }
        for (let v = start; inc > 0 ? v <= end + 1e-10 : v >= end - 1e-10; v += inc) {
          if (++iter > maxIter) { ctx.error('LOOP_LIMIT', `*DO loop exceeded ${maxIter} iterations; execution stopped.`); truncated = true; throw new Signal('limit'); }
          ctx.m.params.set(par, v);
          try { runBlocks(b.body); } catch (e) {
            if (e instanceof Signal && e.kind === 'cycle') continue;
            if (e instanceof Signal && e.kind === 'exit') break;
            throw e;
          }
        }
      }
      ctx.m.maxLoopIterations = Math.max(ctx.m.maxLoopIterations, iter);
    }
  }

  try {
    runBlocks(program.blocks);
  } catch (e) {
    if (!(e instanceof Signal)) throw e;
    if (e.kind === 'limit') ctx.error('CMD_LIMIT', 'Execution stopped: command limit reached.');
  }
  ctx.stmt = null;
  ctx.cmd = 'END';
  try {
    finalizeLoads(ctx);
  } catch (e) {
    if (e instanceof ApdlError) ctx.report(e);
    else throw e;
  }
  const t2 = now();
  return {
    model: ctx.m,
    log: ctx.log,
    diagnostics: ctx.diagnostics,
    viewHints: ctx.hints,
    timings: { parseMs: t1 - t0, execMs: t2 - t1, commands },
    truncated: truncated || undefined,
  };
}

/** Canonical name for a raw statement name (re-exported for convenience). */
export { resolveCommandName };
