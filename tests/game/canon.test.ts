import { describe, expect, it } from 'vitest';
import { canonEqual, canonString, commandsIn, usesOnlyAbbrev, abbrevStats, maxDollarChain, strictEqual, countFamily } from '../../src/game/canon';

describe('canon', () => {
  it('blank means zero on coordinate slots', () => {
    expect(canonEqual('K,5,2,,3', 'K,5,2,0,3')).toBe(true);
    expect(canonEqual('K,5,2', 'K,5,2,0,0')).toBe(true);
    expect(canonString('K,5,2,,3')).toBe('K,5,2,0,3');
  });
  it('case, whitespace, comments and number formats', () => {
    expect(canonEqual('block, 0,2, 0,3,0,8  ! column', 'BLOCK,0,2,0,3,0,8')).toBe(true);
    expect(canonEqual('MP,EX,1,30E9', 'mp,ex,1,3e10')).toBe(true);
    expect(canonEqual('ESIZE,0.50', 'ESIZE,.5')).toBe(true);
    expect(canonEqual('K,1,1', 'K,1,1.0000000000001')).toBe(true);
    expect(canonEqual('K,1,1', 'K,1,1.001')).toBe(false);
  });
  it('expands abbreviations', () => {
    expect(canonEqual('BLOC,0,1,0,1,0,1', 'BLOCK,0,1,0,1,0,1')).toBe(true);
    expect(canonEqual('VSWE,1', 'VSWEEP,1')).toBe(true);
    expect(canonEqual('FINI', 'FINISH')).toBe(true);
    expect(canonEqual('/PREP', '/PREP7')).toBe(true);
    expect(canonEqual('ALLS', 'ALLSEL')).toBe(true);
  });
  it('defaults: NINC=1, THETA2=360, Item label', () => {
    expect(canonEqual('KGEN,3,1,4,,10', 'KGEN,3,1,4,1,10,0,0')).toBe(true);
    expect(canonEqual('CYL4,0,0,1,,,,2', 'CYL4,0,0,1,0,0,360,2')).toBe(true);
    expect(canonEqual('VSEL,S,,,1,4', 'VSEL,S,VOLU,,1,4')).toBe(true);
    expect(canonEqual('D,ALL,ALL', 'D,ALL,ALL,0')).toBe(true);
    expect(canonEqual('MSHAPE,0,3D', 'MSHAPE')).toBe(true);
  });
  it('assignments and *SET', () => {
    expect(canonEqual('W = 2.5', '*SET,W,2.5')).toBe(true);
    expect(canonString('w=2.5')).toBe('W=2.5');
  });
  it('different commands differ', () => {
    expect(canonEqual('VSBV,1,2', 'VSBV,2,1')).toBe(false);
    expect(canonEqual('', '')).toBe(false);
  });
  it('multi-statement', () => {
    expect(canonEqual('TYPE,2 $ MAT,2', 'TYPE,2\nMAT,2')).toBe(true);
    expect(maxDollarChain('A $ B $ C $ D\nK,1')).toBe(4);
  });
  it('commandsIn and abbreviation stats', () => {
    expect(commandsIn('/PREP7\nBLOC,0,1,0,1,0,1\nVMES,ALL\nX=1')).toEqual(['/PREP7', 'BLOCK', 'VMESH', '*SET']);
    expect(usesOnlyAbbrev('BLOC,0,1,0,1,0,1\nVMES,ALL\nK,1')).toBe(true);
    expect(usesOnlyAbbrev('BLOCK,0,1,0,1,0,1\nVMES,ALL')).toBe(false);
    expect(usesOnlyAbbrev('K,1\nL,1,2')).toBe(false);
    expect(abbrevStats('ESIZ,1 $ VMESH,ALL')).toEqual({ longCommands: 2, abbreviated: 1 });
  });
  it('strict and family count', () => {
    expect(strictEqual('k, 1, 2', 'K,1,2')).toBe(true);
    expect(strictEqual('K,1,2,0', 'K,1,2')).toBe(false);
    expect(countFamily('NSEL,S,LOC,Z,0\nNSEL,R,LOC,X,0\nD,ALL,ALL\nALLS', 'select')).toBe(3);
  });
});
