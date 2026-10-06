import { beforeAll, describe, expect, it } from 'vitest';
import { initKernel, run } from './helpers';
import { lex, countScriptLines } from '../../src/apdl/lexer';
import { parseExpr, evalExpr } from '../../src/apdl/expr';
import { resolveCommandName } from '../../src/apdl/commands/registry';

beforeAll(initKernel);

describe('lexer', () => {
  it('splits $, strips comments, detects assignments', () => {
    const { statements } = lex("K,1,0,0,0 $ K,2,1 ! comment\nA = 2*3\n/TITLE, my $ title ! keep");
    expect(statements.map((s) => s.name)).toEqual(['K', 'K', '*SET', '/TITLE']);
    expect(statements[1].fields.map((f) => f.text)).toEqual(['2', '1']);
    expect(statements[2].fields.map((f) => f.text)).toEqual(['A', '2*3']);
    expect(statements[3].fields[0].text).toBe('my $ title ! keep');
  });
  it('counts lines with $ joined as one', () => {
    expect(countScriptLines('! c\nK,1 $ K,2\n\nL,1,2')).toBe(2);
  });
});

describe('expressions', () => {
  const env = { param: (n: string) => ({ A: 2, B: 3 } as Record<string, number>)[n], deg: false };
  it('precedence and power', () => {
    expect(evalExpr(parseExpr('A+B*2'), env)).toBe(8);
    expect(evalExpr(parseExpr('2**3**2'), env)).toBe(512);
    expect(evalExpr(parseExpr('-A**2'), env)).toBe(-4);
    expect(evalExpr(parseExpr('NINT(2.5)'), env)).toBe(3);
    expect(evalExpr(parseExpr('MOD(7,3)'), env)).toBe(1);
  });
});

describe('command names', () => {
  it('applies the 4-character rule', () => {
    expect(resolveCommandName('VMES')).toBe('VMESH');
    expect(resolveCommandName('esiz')).toBe('ESIZE');
    expect(resolveCommandName('ALLS')).toBe('ALLSEL');
    expect(resolveCommandName('/SOL')).toBe('/SOLU');
    expect(resolveCommandName('K')).toBe('K');
    expect(resolveCommandName('KGN')).toBeNull();
  });
});

describe('interpreter basics', () => {
  it('warns when /PREP7 is missing', () => {
    const r = run('K,1,0,0,0');
    expect(r.warnings.some((w) => w.code === 'CMD_WRONG_PROC')).toBe(true);
    expect(r.s.counts.kp).toBe(0);
  });
  it('keypoints, *DO loops and *GET', () => {
    const r = run('/PREP7\n*DO,I,1,5\nK,I,I*2,0,0\n*ENDDO\n*GET,NK,KP,0,COUNT\n*GET,MX,KP,0,NUM,MAX');
    expect(r.errors).toEqual([]);
    expect(r.s.counts.kp).toBe(5);
    expect(r.model.params.get('NK')).toBe(5);
    expect(r.model.params.get('MX')).toBe(5);
    expect(r.model.kps.get(5)!.xyz).toEqual([10, 0, 0]);
    expect(r.model.maxLoopIterations).toBe(5);
  });
  it('*IF / *ELSE', () => {
    const r = run('/PREP7\nX=3\n*IF,X,GT,2,THEN\nY=1\n*ELSE\nY=2\n*ENDIF');
    expect(r.model.params.get('Y')).toBe(1);
  });
  it('undefined parameter gives warning and zero', () => {
    const r = run('/PREP7\nK,1,XX+1,0,0');
    expect(r.warnings.some((w) => w.code === 'PARAM_UNDEF')).toBe(true);
    expect(r.model.kps.get(1)!.xyz).toEqual([1, 0, 0]);
  });
  it('KGEN grid', () => {
    const r = run('/PREP7\nK,1,0,0,0\nKGEN,5,1,1,1,10,0,0,1\nKGEN,3,1,5,1,0,6,0,10');
    expect(r.errors).toEqual([]);
    expect(r.s.counts.kp).toBe(15);
    expect(r.model.kps.get(25)!.xyz).toEqual([40, 12, 0]);
  });
});

describe('solid modelling', () => {
  it('BLOCK creates 8 kp / 12 lines / 6 areas / 1 volume', () => {
    const r = run('/PREP7\nBLOCK,0,2,0,3,0,8');
    expect(r.errors).toEqual([]);
    expect(r.s.counts).toMatchObject({ kp: 8, line: 12, area: 6, volu: 1 });
    expect(r.s.totalVolume).toBeCloseTo(48, 9);
  });
  it('bottom-up V from 8 keypoints', () => {
    const r = run('/PREP7\nK,1 $ K,2,4 $ K,3,4,2 $ K,4,,2\nK,5,,,3 $ K,6,4,,3 $ K,7,4,2,3 $ K,8,,2,3\nV,1,2,3,4,5,6,7,8');
    expect(r.errors).toEqual([]);
    expect(r.s.counts).toMatchObject({ kp: 8, line: 12, area: 6, volu: 1 });
    expect(r.s.totalVolume).toBeCloseTo(24, 9);
  });
  it('VSBV slab with a through opening', () => {
    const r = run('/PREP7\nBLOCK,0,12,0,6,0,2\nBLOCK,4,8,2,4,-1,3\nVSBV,1,2');
    expect(r.errors).toEqual([]);
    expect(r.s.counts.volu).toBe(1);
    expect(r.s.totalVolume).toBeCloseTo(144 - 16, 6);
    expect([...r.model.volus.keys()]).toEqual([3]);
    expect(r.s.counts.area).toBe(10);
  });
  it('CYL4 hole via VSBV', () => {
    const r = run('/PREP7\nBLOCK,0,10,0,8,0,1\nWPOFFS,0,0,-0.5\nCYL4,5,4,1.5,,,,2\nWPOFFS,0,0,0.5\nVSBV,1,2');
    expect(r.errors).toEqual([]);
    expect(r.s.counts.volu).toBe(1);
    expect(r.s.totalVolume).toBeCloseTo(80 - Math.PI * 1.5 * 1.5, 0);
  });
  it('VGLUE column on mat shares an area and renumbers', () => {
    const r = run('/PREP7\nBLOCK,-2,4,-2,5,0,1.5\nBLOCK,0,2,0,3,1.5,9.5\nVGLUE,ALL');
    expect(r.errors).toEqual([]);
    expect(r.s.counts.volu).toBe(2);
    expect([...r.model.volus.keys()].sort()).toEqual([3, 4]);
    expect(r.s.counts.area).toBe(12);
    expect(r.s.totalVolume).toBeCloseTo(63 + 48, 6);
  });
  it('VGLUE overlapping volumes is an error', () => {
    const r = run('/PREP7\nBLOCK,0,2,0,2,0,2\nBLOCK,1,3,0,2,0,2\nVGLUE,ALL');
    expect(r.errors.some((e) => e.code === 'VOL_OVERLAP')).toBe(true);
  });
  it('VADD stacked blocks', () => {
    const r = run('/PREP7\nBLOCK,0,2,0,2,0,2\nBLOCK,0,2,0,2,2,4\nVADD,1,2');
    expect(r.errors).toEqual([]);
    expect(r.s.counts.volu).toBe(1);
    expect(r.s.totalVolume).toBeCloseTo(16, 6);
  });
  it('VEXT of RECTNG areas', () => {
    const r = run('/PREP7\nRECTNG,0,2,0,3\nRECTNG,5,7,0,3\nVEXT,ALL,,,0,0,8');
    expect(r.errors).toEqual([]);
    expect(r.s.counts.volu).toBe(2);
    expect(r.s.totalVolume).toBeCloseTo(96, 9);
  });
  it('VROTAT drum', () => {
    const r = run('/PREP7\nRECTNG,1.0,1.5,0,2\nK,11,0,0,0 $ K,12,0,1,0\nVROTAT,1,,,,,,11,12,360,4');
    expect(r.errors).toEqual([]);
    expect(r.s.counts.volu).toBe(4);
    expect(Math.abs(r.s.totalVolume / (Math.PI * (1.5 ** 2 - 1) * 2) - 1)).toBeLessThan(0.01);
  });
  it('VDRAG along an arc', () => {
    const r = run('/PREP7\nR0=10 $ B=1 $ H=1.5\nK,1,R0,0,0 $ K,2,0,R0,0 $ K,3,0,0,0\nLARC,1,2,3,R0\nK,11,R0-B/2,0,-H/2 $ K,12,R0+B/2,0,-H/2 $ K,13,R0+B/2,0,H/2 $ K,14,R0-B/2,0,H/2\nA,11,12,13,14\nVDRAG,1,,,,,,1');
    expect(r.errors).toEqual([]);
    expect(r.s.totalVolume).toBeCloseTo(1 * 1.5 * (Math.PI / 2) * 10, 0);
  });
  it('ASBA plate with a hole', () => {
    const r = run('/PREP7\nRECTNG,0,12,0,8\nCYL4,6,4,1.5\nASBA,1,2');
    expect(r.errors).toEqual([]);
    expect(r.s.counts.area).toBe(1);
    expect(r.s.totalArea).toBeCloseTo(96 - Math.PI * 2.25, 0);
  });
});
