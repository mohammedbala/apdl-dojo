import { describe, expect, it } from 'vitest';
import { contextAt, scriptParams } from '../../src/editor/signature';
import { COMMANDS } from '../../src/content/commands';
import { argDoc } from '../../src/content/argdocs';

describe('signature context', () => {
  it('finds the command and argument index', () => {
    expect(contextAt('BLOCK,0,10,', 11)).toMatchObject({ typed: 'BLOCK', argIndex: 2 });
    expect(contextAt('BLOCK', 5)).toMatchObject({ typed: 'BLOCK', argIndex: -1 });
    expect(contextAt('K,1,0,0,0 $ NSEL,S,LOC,', 23)).toMatchObject({ typed: 'NSEL', argIndex: 2 });
    expect(contextAt('K,1,SIN(A,B),', 13)).toMatchObject({ typed: 'K', argIndex: 2 });
  });
  it('ignores comments and assignments', () => {
    expect(contextAt('K,1 ! BLOCK,', 12)).toBeNull();
    expect(contextAt('H = 3', 5)).toBeNull();
  });
  it('collects script parameters', () => {
    expect(scriptParams('H=8\nLEN = 36 $ W=12\n*DO,I,1,4\n*GET,VMAX,VOLU,0,NUM,MAX\n! X=1')).toEqual(['H', 'I', 'LEN', 'VMAX', 'W']);
  });
});

describe('argument docs coverage', () => {
  it('every documented command argument has a description', () => {
    const missing: string[] = [];
    for (const c of COMMANDS) for (const a of c.args) if (!argDoc(c.name, a.name)) missing.push(`${c.name}.${a.name}`);
    expect(missing).toEqual([]);
  });
});
