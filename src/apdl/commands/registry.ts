// Command registry: canonical names, ANSYS abbreviation rules, handler dispatch table.
import type { Ctx } from '../context';
import type { Args } from '../args';

/** Every command the trainer recognises (handlers are attached by the command modules). */
export const COMMAND_NAMES: readonly string[] = [
  // session / processors
  '/PREP7', '/SOLU', '/POST1', 'FINISH', '/CLEAR', '/TITLE', '/STITLE', '/COM', 'C***', '/FILNAME', '/UNITS', '/BATCH', '/NERR', '/NOPR', '/GOPR', '/OUTPUT', '/INPUT', '/EOF', '/CONFIG', '/UIS', '/MENU', '/SHOW', '/GRAPHICS', 'KEYW',
  // parameters / control
  '*SET', '*GET', '*DO', '*ENDDO', '*IF', '*ELSEIF', '*ELSE', '*ENDIF', '*EXIT', '*CYCLE', '*AFUN', '*STATUS', '*DIM', '*MSG', '*VWRITE', '*CFOPEN', '*CFCLOS',
  // csys / working plane
  'CSYS', 'LOCAL', 'CLOCAL', 'CSDELE', 'WPOFFS', 'WPROTA', 'WPCSYS', 'WPAVE', 'KWPAVE', 'WPSTYL',
  // keypoints / lines / areas / volumes
  'K', 'KFILL', 'KGEN', 'KDELE', 'KMODIF', 'L', 'LSTR', 'LARC', 'CIRCLE', 'LGEN', 'LDELE', 'LDIV', 'LFILLT', 'LCOMB',
  'A', 'AL', 'AGEN', 'ADELE', 'ASKIN', 'ARSYM', 'V', 'VA', 'VGEN', 'VDELE', 'VSYMM', 'KSYMM', 'LSYMM',
  // primitives
  'BLOCK', 'BLC4', 'BLC5', 'CYLIND', 'CYL4', 'CYL5', 'CONE', 'CON4', 'SPHERE', 'SPH4', 'PRISM', 'RPRISM', 'RECTNG', 'RPR4', 'PCIRC', 'POLYGON',
  // booleans
  'VADD', 'VSBV', 'VGLUE', 'VOVLAP', 'VPTN', 'VINV', 'VSBA', 'AADD', 'ASBA', 'AGLUE', 'AOVLAP', 'APTN', 'AINA', 'BOPTN',
  // sweeps
  'VEXT', 'VOFFST', 'VDRAG', 'VROTAT', 'AROTAT', 'ADRAG', 'LROTAT', 'LDRAG',
  // selection / components
  'KSEL', 'LSEL', 'ASEL', 'VSEL', 'NSEL', 'ESEL', 'ALLSEL', 'NSLK', 'NSLL', 'NSLA', 'NSLV', 'NSLE', 'ESLN', 'ESLV', 'ESLA', 'ESLL', 'LSLA', 'LSLK', 'ASLL', 'ASLV', 'KSLL', 'KSLN', 'VSLA', 'SELTOL',
  'CM', 'CMSEL', 'CMDELE', 'CMLIST',
  // attributes
  'ET', 'ETDELE', 'KEYOPT', 'MP', 'MPDATA', 'MPTEMP', 'MPDELE', 'TB', 'TBDATA', 'R', 'RMORE', 'SECTYPE', 'SECDATA', 'SECOFFSET', 'SECNUM', 'TYPE', 'MAT', 'REAL', 'ESYS',
  'LATT', 'AATT', 'VATT', 'KATT',
  // meshing
  'ESIZE', 'LESIZE', 'AESIZE', 'KESIZE', 'SMRTSIZE', 'DESIZE', 'MSHAPE', 'MSHKEY', 'MOPT', 'VMESH', 'AMESH', 'LMESH', 'KMESH', 'VSWEEP', 'EXTOPT', 'VCLEAR', 'ACLEAR', 'LCLEAR', 'KCLEAR', 'MSHAPE',
  // direct generation
  'N', 'NGEN', 'NFILL', 'NSYM', 'NROTAT', 'NDELE', 'NMODIF', 'E', 'EN', 'EGEN', 'ENGEN', 'EDELE', 'EMODIF', 'EINTF', 'ESURF',
  // numbering
  'NUMMRG', 'NUMCMP', 'NUMSTR', 'NUMOFF',
  // loads
  'D', 'DDELE', 'DK', 'DL', 'DA', 'F', 'FDELE', 'FK', 'SFA', 'SFL', 'SFE', 'SF', 'ACEL', 'OMEGA', 'ANTYPE', 'MODOPT', 'MXPAND', 'NSUBST', 'TIME', 'OUTRES', 'SOLVE', 'LSWRITE', 'LSSOLVE', 'ALPHAD', 'BETAD', 'DMPRAT', 'NLGEOM', 'AUTOTS', 'KBC', 'SET', 'PLNSOL', 'PRNSOL',
  // display (no-ops / view hints)
  '/PNUM', '/NUMBER', '/VIEW', '/ANGLE', '/AUTO', '/DIST', '/FOCUS', '/REPLOT', '/ESHAPE', '/COLOR', '/TYPE', '/EDGE', '/TRIAD', '/PSF', '/PBC', '/RGB', '/PLOPTS', '/VUP', '/ZOOM', '/USER', '/DEVICE', '/GLINE',
  'KPLOT', 'LPLOT', 'APLOT', 'VPLOT', 'NPLOT', 'EPLOT', 'GPLOT', 'KLIST', 'LLIST', 'ALIST', 'VLIST', 'NLIST', 'ELIST', 'ETLIST', 'MPLIST', 'RLIST', 'SLIST', 'DLIST', 'FLIST', 'CHECK', 'SAVE', 'RESUME', 'SECPLOT', 'LSUM', 'ASUM', 'VSUM', 'GSUM',
];

const NAME_SET = new Set(COMMAND_NAMES);

/** Commonly used short forms that do not follow the plain 4-character rule. */
const ALIASES: Record<string, string> = {
  '/SOL': '/SOLU',
  '/PRE': '/PREP7',
  '/PREP': '/PREP7',
  '/POST': '/POST1',
  '/POS': '/POST1',
  FINI: 'FINISH',
  FIN: 'FINISH',
  ALLS: 'ALLSEL',
  '*END': '*ENDDO',
  '*ENDD': '*ENDDO',
  '*ENDI': '*ENDIF',
  '*ELSE': '*ELSE',
  '*ELSEIF': '*ELSEIF',
};

/**
 * Resolve a typed command name to its canonical full name using the ANSYS rule that a command may be
 * abbreviated to its first four characters (the leading / or * does not count).
 * Returns null when the name is unknown or ambiguous.
 */
export function resolveCommandName(typed: string): string | null {
  const t = typed.trim().toUpperCase();
  if (!t) return null;
  if (NAME_SET.has(t)) return t;
  if (ALIASES[t]) return ALIASES[t];
  const prefix = t[0] === '/' || t[0] === '*' ? t[0] : '';
  const body = t.slice(prefix.length);
  if (body.length < 4 && !(prefix && body.length >= 3)) return null;
  const cands = COMMAND_NAMES.filter((n) => n.startsWith(t));
  if (cands.length === 0) return null;
  const uniq = [...new Set(cands)].sort((a, b) => a.length - b.length);
  if (uniq.length > 1 && uniq[0].length === uniq[1].length) return null;
  return uniq[0];
}

export function allCommandNames(): string[] {
  return [...NAME_SET].sort();
}

/** True when the canonical name is longer than 4 significant characters and was typed abbreviated. */
export function isAbbreviated(typed: string, canonical: string): boolean {
  return typed.trim().toUpperCase() !== canonical;
}

// ---------------------------------------------------------------- handler table
export type Processor = 'BEGIN' | 'PREP7' | 'SOLU' | 'POST1' | 'ANY';

export interface CommandSpec {
  name: string;
  /** processors in which the command is valid (default: PREP7 only for modelling commands) */
  proc?: Processor[];
  run(ctx: Ctx, a: Args): void;
}

const HANDLERS = new Map<string, CommandSpec>();

export function registerCommand(spec: CommandSpec) {
  if (!NAME_SET.has(spec.name)) throw new Error(`registerCommand: ${spec.name} missing from COMMAND_NAMES`);
  HANDLERS.set(spec.name, spec);
}

export function reg(names: string | string[], run: CommandSpec['run'], proc?: Processor[]) {
  for (const n of Array.isArray(names) ? names : [names]) registerCommand({ name: n, run, proc });
}

export function getHandler(name: string): CommandSpec | undefined {
  return HANDLERS.get(name);
}

export function registeredNames(): string[] {
  return [...HANDLERS.keys()];
}
