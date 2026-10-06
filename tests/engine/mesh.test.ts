import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initKernel, run } from './helpers';
import { grade } from '../../src/grader/diff';
import { execute } from '../../src/apdl/interpreter';

beforeAll(initKernel);

describe('meshing', () => {
  it('S1 single column: 48 hexes, 108 nodes', () => {
    const r = run('/PREP7\nET,1,SOLID185\nMP,EX,1,3E10\nBLOCK,0,2,0,3,0,8\nESIZE,1\nMSHKEY,1\nVMESH,ALL');
    expect(r.errors).toEqual([]);
    expect(r.s.elemByType).toEqual({ SOLID185: 48 });
    expect(r.s.counts.node).toBe(108);
  });
  it('S5 LESIZE divisions: 12 x 4 x 2', () => {
    const r = run('/PREP7\nET,1,SOLID185\nBLOCK,0,6,0,4,0,2\nLSEL,S,LOC,X,3 $ LESIZE,ALL,,,12\nLSEL,S,LOC,Y,2 $ LESIZE,ALL,,,4\nLSEL,S,LOC,Z,1 $ LESIZE,ALL,,,2\nALLSEL\nMSHKEY,1 $ VMESH,ALL');
    expect(r.errors).toEqual([]);
    expect(r.s.counts.elem).toBe(96);
    expect(r.s.counts.node).toBe(195);
  });
  it('glued volumes share nodes, unglued do not', () => {
    const glued = run('/PREP7\nET,1,SOLID185\nBLOCK,0,2,0,2,0,2\nBLOCK,0,2,0,2,2,4\nVGLUE,ALL\nESIZE,1\nVMESH,ALL');
    const loose = run('/PREP7\nET,1,SOLID185\nBLOCK,0,2,0,2,0,2\nBLOCK,0,2,0,2,2,4\nESIZE,1\nVMESH,ALL');
    expect(glued.s.counts.node).toBe(3 * 3 * 5);
    expect(loose.s.counts.node).toBe(2 * 3 * 3 * 3);
    const merged = run('/PREP7\nET,1,SOLID185\nBLOCK,0,2,0,2,0,2\nBLOCK,0,2,0,2,2,4\nESIZE,1\nVMESH,ALL\nNUMMRG,NODE');
    expect(merged.s.counts.node).toBe(45);
  });
  it('SOLID186 adds midside nodes', () => {
    const r = run('/PREP7\nET,1,SOLID186\nBLOCK,0,1,0,1,0,1\nESIZE,1\nVMESH,ALL');
    expect(r.s.counts.elem).toBe(1);
    expect(r.model.elems.get(1)!.nodes.length).toBe(20);
    expect(r.s.counts.node).toBe(20);
  });
  it('MSHAPE,1 gives tets', () => {
    const r = run('/PREP7\nET,1,SOLID187\nBLOCK,0,2,0,2,0,2\nESIZE,1\nMSHAPE,1,3D\nVMESH,ALL');
    expect(r.s.elemByType.SOLID187).toBe(48);
  });
  it('cylinder is swept (prism mesher), not voxelised', () => {
    const r = run('/PREP7\nET,1,SOLID185\nCYL4,0,0,1,,,,3\nESIZE,0.5\nVMESH,ALL');
    expect(r.errors).toEqual([]);
    expect(r.diagnostics.some((d) => d.text.includes('voxel'))).toBe(false);
    const shapes = new Set([...r.model.elems.values()].map((e) => e.shape));
    expect(shapes.has('wedge') || shapes.has('hex')).toBe(true);
    expect(r.s.counts.elem).toBeGreaterThan(20);
  });
  it('beam line mesh with section', () => {
    const r = run('/PREP7\nET,1,BEAM188\nMP,EX,1,2.1E11\nSECTYPE,1,BEAM,RECT\nSECDATA,0.4,0.8\nK,1 $ K,2,8\nL,1,2\nLESIZE,ALL,,,16\nLMESH,ALL');
    expect(r.errors).toEqual([]);
    expect(r.s.counts.elem).toBe(16);
    expect(r.s.counts.node).toBe(17);
  });
  it('shell plate with a hole meshes with triangles', () => {
    const r = run('/PREP7\nET,1,SHELL181\nSECTYPE,1,SHELL\nSECDATA,0.5\nRECTNG,0,12,0,8\nCYL4,6,4,1.5\nASBA,1,2\nESIZE,0.5\nAMESH,ALL');
    expect(r.errors).toEqual([]);
    expect(r.s.counts.elem).toBeGreaterThan(300);
  });
  it('wrong element type for VMESH is an error', () => {
    const r = run('/PREP7\nET,1,BEAM188\nBLOCK,0,1,0,1,0,1\nVMESH,ALL');
    expect(r.errors.some((e) => e.code === 'ETYPE_WRONG')).toBe(true);
  });
});

describe('direct generation, selection and loads', () => {
  it('S10 spring-mass chain', () => {
    const r = run('/PREP7\nET,1,COMBIN14 $ KEYOPT,1,2,3\nET,2,MASS21 $ KEYOPT,2,3,2\nR,1,1E9 $ R,2,2E5\nN,1,0,0,0 $ N,2,0,0,1\nNGEN,4,10,1,2,1,5,0,0\nTYPE,1 $ REAL,1 $ E,1,2\nEGEN,4,10,1\nTYPE,2 $ REAL,2 $ E,2\nEGEN,4,10,5\nNSEL,S,LOC,Z,0 $ D,ALL,ALL,0 $ ALLSEL\nACEL,0,0,9.81');
    expect(r.errors).toEqual([]);
    expect(r.s.counts.node).toBe(8);
    expect(r.s.elemByType).toEqual({ COMBIN14: 4, MASS21: 4 });
    expect(r.s.bc.dNodes).toBe(4);
  });
  it('DA transfers to nodes after meshing', () => {
    const r = run('/PREP7\nET,1,SOLID185\nBLOCK,0,2,0,2,0,2\nESIZE,1\nVMESH,ALL\nASEL,S,LOC,Z,0\nDA,ALL,ALL\nALLSEL');
    expect(r.s.bc.dNodes).toBe(9);
  });
  it('NSEL,R reselect and components', () => {
    const r = run('/PREP7\nET,1,SOLID185\nBLOCK,0,4,0,2,0,2\nESIZE,1\nVMESH,ALL\nNSEL,S,LOC,Z,0\nNSEL,R,LOC,X,0,2\nCM,BASE,NODE\nALLSEL\nCMSEL,S,BASE\nF,ALL,FZ,-10\nALLSEL');
    expect(r.errors).toEqual([]);
    expect(r.model.comps.get('BASE')!.ids.length).toBe(9);
    expect(r.s.bc.fCount).toBe(9);
    expect(r.s.bc.fSum[2]).toBeCloseTo(-90, 9);
  });
  it('SOLVE pre-checks catch missing material', () => {
    const r = run('/PREP7\nET,1,SOLID185\nBLOCK,0,1,0,1,0,1\nESIZE,1\nVMESH,ALL\nFINISH\n/SOLU\nSOLVE');
    expect(r.errors.some((e) => e.code === 'SOLVE_CHECK')).toBe(true);
  });
});

describe('grader', () => {
  const src = readFileSync('models/reference/TGF36_A.inp', 'utf8');
  it('identical models match', () => {
    const t = execute(src);
    const s = grade(t, execute(src));
    expect(s.match).toBe(true);
    expect(s.total).toBe(100);
  });
  it('techniques A, B and C all match each other', () => {
    const t = execute(src);
    for (const f of ['B', 'C']) {
      const u = execute(readFileSync(`models/reference/TGF36_${f}.inp`, 'utf8'));
      const s = grade(t, u);
      expect(s.checks.filter((c) => !c.pass).map((c) => c.id), f).toEqual([]);
    }
  });
  it('a missing column fails geometry', () => {
    const t = execute(src);
    const broken = src.replace('*DO,I,1,NCOLX', '*DO,I,1,NCOLX-1');
    const s = grade(t, execute(broken));
    expect(s.match).toBe(false);
    expect(s.stages.geometry.pass).toBe(false);
    expect(s.checks.find((c) => c.id === 'geom.volume')!.pass).toBe(false);
  });
  it('forbidden commands are enforced', () => {
    const t = execute('/PREP7\nBLOCK,0,1,0,1,0,1');
    const s = grade(t, execute('/PREP7\nBLOCK,0,1,0,1,0,1'), { forbiddenCommands: ['BLOCK'] });
    expect(s.match).toBe(false);
  });
});

describe('single-entity fields', () => {
  it('DK / FK / LESIZE with a numbered entity followed by a label or size', () => {
    const r = run('/PREP7\nK,1 $ K,2,8 $ L,1,2\nET,1,BEAM188\nSECTYPE,1,BEAM,RECT $ SECDATA,0.3,0.5\nLESIZE,1,0.5\nLMESH,1\nDK,1,ALL,0\nFK,2,FZ,-1000');
    expect(r.warnings).toEqual([]);
    expect(r.s.counts.elem).toBe(16);
    expect(r.s.bc.dNodes).toBe(1);
    expect(r.s.bc.fSum[2]).toBe(-1000);
  });
});
