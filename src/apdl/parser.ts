// Builds a block tree (*DO / *DOWHILE / *IF) from lexed statements.
import type { Diagnostic } from './diagnostics';
import type { Statement } from './lexer';
import { resolveCommandName } from './commands/registry';

export type Block =
  | { kind: 'cmd'; stmt: Statement; name: string | null }
  | { kind: 'do'; stmt: Statement; body: Block[]; whileLoop: boolean }
  | { kind: 'if'; branches: { cond: Statement; body: Block[] }[]; elseBody?: Block[] };

export interface Program {
  blocks: Block[];
  syntaxErrors: Diagnostic[];
}

function canon(stmt: Statement): string | null {
  return resolveCommandName(stmt.name);
}

export function parse(statements: Statement[]): Program {
  const syntaxErrors: Diagnostic[] = [];
  let i = 0;

  function parseBlocks(stop: Set<string>): { blocks: Block[]; end?: Statement; endName?: string } {
    const blocks: Block[] = [];
    while (i < statements.length) {
      const s = statements[i];
      const name = canon(s);
      if (name && stop.has(name)) return { blocks, end: s, endName: name };
      i++;
      if (name === '*DO' || name === '*DOWHILE') {
        const r = parseBlocks(new Set(['*ENDDO']));
        if (!r.end) {
          syntaxErrors.push({ severity: 'error', line: s.line, command: name, code: 'DO_UNTERMINATED', text: `${name} on line ${s.line} has no matching *ENDDO.` });
        } else i++;
        blocks.push({ kind: 'do', stmt: s, body: r.blocks, whileLoop: name === '*DOWHILE' });
        continue;
      }
      if (name === '*IF') {
        // block IF only when the action field (5th) is THEN
        const action = (s.fields[3]?.text ?? '').toUpperCase();
        if (action === 'THEN') {
          const branches: { cond: Statement; body: Block[] }[] = [];
          let elseBody: Block[] | undefined;
          let cond = s;
          for (;;) {
            const r = parseBlocks(new Set(['*ELSEIF', '*ELSE', '*ENDIF']));
            if (!r.end) {
              syntaxErrors.push({ severity: 'error', line: s.line, command: '*IF', code: 'IF_UNTERMINATED', text: `*IF on line ${s.line} has no matching *ENDIF.` });
              branches.push({ cond, body: r.blocks });
              break;
            }
            i++;
            if (r.endName === '*ELSEIF') {
              branches.push({ cond, body: r.blocks });
              cond = r.end;
              continue;
            }
            if (r.endName === '*ELSE') {
              branches.push({ cond, body: r.blocks });
              const r2 = parseBlocks(new Set(['*ENDIF']));
              if (!r2.end) syntaxErrors.push({ severity: 'error', line: s.line, command: '*IF', code: 'IF_UNTERMINATED', text: `*IF on line ${s.line} has no matching *ENDIF.` });
              else i++;
              elseBody = r2.blocks;
              break;
            }
            branches.push({ cond, body: r.blocks });
            break;
          }
          blocks.push({ kind: 'if', branches, elseBody });
          continue;
        }
      }
      if (name === '*ENDDO' || name === '*ENDIF' || name === '*ELSE' || name === '*ELSEIF') {
        syntaxErrors.push({ severity: 'error', line: s.line, command: name, code: 'UNMATCHED', text: `${name} on line ${s.line} has no matching ${name === '*ENDDO' ? '*DO' : '*IF'}.` });
        continue;
      }
      blocks.push({ kind: 'cmd', stmt: s, name });
    }
    return { blocks };
  }

  const blocks: Block[] = [];
  while (i < statements.length) {
    const r = parseBlocks(new Set());
    blocks.push(...r.blocks);
    if (i < statements.length) i++; // defensive
  }
  return { blocks, syntaxErrors };
}
