import { describe, expect, it } from 'vitest';
import { COMMANDS, GLOSSARY, COMMAND_INFO } from '../../src/content/commands';
import { resolveCommandName, COMMAND_NAMES } from '../../src/apdl/commands/registry';

describe('command reference', () => {
  it('has unique names', () => {
    expect(new Set(COMMANDS.map((c) => c.name)).size).toBe(COMMANDS.length);
    expect(COMMANDS.length).toBeGreaterThanOrEqual(70);
  });
  for (const c of COMMANDS) {
    it(`${c.name} resolves to itself (and its abbreviation)`, () => {
      expect(COMMAND_NAMES).toContain(c.name);
      expect(resolveCommandName(c.name)).toBe(c.name);
      if (c.abbrev) expect(resolveCommandName(c.abbrev)).toBe(c.name);
      expect(c.signature.startsWith(c.name)).toBe(true);
      expect(c.summary.length).toBeGreaterThan(5);
      expect(c.trackIds.length).toBeGreaterThan(0);
    });
  }
  it('glossary entries all exist', () => {
    for (const g of GLOSSARY) expect(COMMAND_INFO.has(g)).toBe(true);
  });
  it('real ANSYS argument orders', () => {
    expect(COMMAND_INFO.get('BLC4')!.signature).toBe('BLC4,XCORNER,YCORNER,WIDTH,HEIGHT,DEPTH');
    expect(COMMAND_INFO.get('CYL4')!.signature).toBe('CYL4,XCENTER,YCENTER,RAD1,THETA1,RAD2,THETA2,DEPTH');
    expect(COMMAND_INFO.get('VEXT')!.signature).toBe('VEXT,NA1,NA2,NINC,DX,DY,DZ,RX,RY,RZ');
    expect(COMMAND_INFO.get('KGEN')!.signature).toBe('KGEN,ITIME,NP1,NP2,NINC,DX,DY,DZ,KINC,NOELEM,IMOVE');
    expect(COMMAND_INFO.get('LATT')!.signature).toBe('LATT,MAT,REAL,TYPE,ESYS,KB,KE,SECNUM');
    expect(COMMAND_INFO.get('VROTAT')!.signature).toBe('VROTAT,NA1,NA2,NA3,NA4,NA5,NA6,PAX1,PAX2,ARC,NSEG');
  });
});
