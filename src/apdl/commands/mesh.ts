// Element attributes (ET, MP, R, SECTYPE ...) and meshing (ESIZE, LESIZE, VMESH, AMESH, LMESH, KMESH ...).
import { reg } from './registry';
import type { Ctx } from '../context';
import type { Args } from '../args';
import { ApdlError } from '../diagnostics';
import type { EntityAttrs, Id } from '../../model/types';
import { selectedIds } from '../../model/state';
import { ELEMENT_LIBRARY, lookupElement } from '../../mesh/elements';
import { clearMesh, meshAreas, meshKps, meshLines, meshVolumes } from '../../mesh/mesher';
import { meshSummary } from '../../mesh/common';
import { fmt } from './session';

const PREP = ['PREP7'] as const;
const PREP_SOLU = ['PREP7', 'SOLU'] as const;

// ------------------------------------------------------------------ element types
reg('ET', (c, a) => {
  const id = a.int(0);
  if (id <= 0) throw new ApdlError('ET_NUM', 'ET: element type number must be positive.');
  let name = a.lab(1);
  if (/^\d+$/.test(name)) {
    const hit = Object.keys(ELEMENT_LIBRARY).find((k) => k.replace(/\D/g, '') === name);
    if (!hit) throw new ApdlError('ET_INVALID', `Element type number ${name} is not a valid element type in the trainer.`);
    name = hit;
  }
  const def = lookupElement(name);
  if (!def) {
    throw new ApdlError('ET_INVALID', `Element type ${name || '(blank)'} is not a valid element type name.  Supported: ${Object.keys(ELEMENT_LIBRARY).join(', ')}.`);
  }
  const keyopts: Record<number, number> = {};
  for (let k = 1; k <= 6; k++) if (!a.isBlank(k + 1)) keyopts[k] = a.int(k + 1);
  c.m.etypes.set(id, { id, ename: def.ename, category: def.category, keyopts });
  c.out(` ELEMENT TYPE ${id} IS ${def.ename}   ${def.summary}`);
}, [...PREP]);
reg('ETDELE', (c, a) => {
  const i1 = a.int(0), i2 = a.isBlank(1) ? i1 : a.int(1);
  for (let id = i1; id <= i2; id++) c.m.etypes.delete(id);
}, [...PREP]);
reg('KEYOPT', (c, a) => {
  const id = a.int(0);
  const et = c.m.etypes.get(id);
  if (!et) throw new ApdlError('ETYPE_UNDEFINED', `Element type ${id} is not defined.`);
  const k = a.int(1);
  if (k < 1 || k > 18) throw new ApdlError('KEYOPT_NUM', `KEYOPT number ${k} is not valid (1-18).`);
  et.keyopts[k] = a.int(2, 0);
}, [...PREP]);

// ------------------------------------------------------------------ materials
const MP_LABELS = new Set(['EX', 'EY', 'EZ', 'PRXY', 'PRYZ', 'PRXZ', 'NUXY', 'NUYZ', 'NUXZ', 'GXY', 'GYZ', 'GXZ', 'DENS', 'ALPX', 'ALPY', 'ALPZ', 'CTEX', 'CTEY', 'CTEZ', 'KXX', 'KYY', 'KZZ', 'C', 'DAMP', 'DMPR', 'MU', 'REFT', 'EMIS', 'ENTH', 'HF', 'VISC', 'BETD', 'ALPD']);
reg('MP', (c, a) => {
  const lab = a.lab(0);
  if (!MP_LABELS.has(lab)) throw new ApdlError('MP_LABEL', `MP label ${lab || '(blank)'} is not valid.  Common labels: EX, PRXY, NUXY, DENS, GXY, ALPX.`);
  const mat = a.int(1, 1) || 1;
  const v = a.num(2, 0);
  const mt = c.m.mats.get(mat) ?? { id: mat, props: {} };
  mt.props[lab] = v;
  c.m.mats.set(mat, mt);
  c.out(` MATERIAL ${mat}     ${lab} = ${fmt(v)}`);
}, [...PREP_SOLU]);
reg('MPDATA', (c, a) => {
  const lab = a.lab(0);
  const mat = a.int(1, 1) || 1;
  const mt = c.m.mats.get(mat) ?? { id: mat, props: {} };
  mt.props[lab] = a.num(3, 0);
  c.m.mats.set(mat, mt);
}, [...PREP_SOLU]);
reg('MPTEMP', () => {}, [...PREP_SOLU]);
reg('MPDELE', (c, a) => {
  const lab = a.lab(0, 'ALL');
  const m1 = a.int(1, 1), m2 = a.isBlank(2) ? m1 : a.int(2);
  for (let i = m1; i <= m2; i++) {
    const mt = c.m.mats.get(i);
    if (!mt) continue;
    if (lab === 'ALL') c.m.mats.delete(i); else delete mt.props[lab];
  }
}, [...PREP_SOLU]);
reg(['TB', 'TBDATA'], (c) => c.note(`${c.cmd}: nonlinear material data is stored but not used (the trainer has no solver).`), [...PREP_SOLU]);

// ------------------------------------------------------------------ real constants
reg('R', (c, a) => {
  const id = a.int(0);
  if (id <= 0) throw new ApdlError('R_NUM', 'R: real constant set number must be positive.');
  const vals: number[] = [];
  for (let i = 1; i <= 6; i++) vals.push(a.num(i, 0));
  while (vals.length && vals[vals.length - 1] === 0 && vals.length > 1) vals.pop();
  c.m.reals.set(id, { id, values: vals });
  c.scratch.set('lastReal', id);
  c.out(` REAL CONSTANT SET ${id}   ITEMS 1 TO ${vals.length}   ${vals.map(fmt).join('  ')}`);
}, [...PREP_SOLU]);
reg('RMORE', (c, a) => {
  const r = c.m.reals.get(c.scratch.get('lastReal') ?? 0);
  if (!r) throw new ApdlError('RMORE', 'RMORE must follow an R command.');
  while (r.values.length < 6) r.values.push(0);
  for (let i = 0; i < 6; i++) r.values.push(a.num(i, 0));
}, [...PREP_SOLU]);

// ------------------------------------------------------------------ sections
const SEC_TYPES = new Set(['BEAM', 'SHELL', 'LINK', 'PIPE', 'TAPER', 'COMBINE', 'GENB', 'JOINT', 'CONTACT', 'AXIS', 'SOLID']);
const BEAM_SUBS = new Set(['RECT', 'QUAD', 'CSOLID', 'CTUBE', 'CHAN', 'I', 'Z', 'L', 'T', 'HATS', 'HREC', 'ASEC', 'MESH']);
reg('SECTYPE', (c, a) => {
  const id = a.int(0);
  if (id <= 0) throw new ApdlError('SEC_NUM', 'SECTYPE: section id must be positive.');
  const type = a.lab(1);
  if (!SEC_TYPES.has(type)) throw new ApdlError('SEC_TYPE', `SECTYPE type ${type || '(blank)'} is not valid (BEAM, SHELL, LINK, PIPE ...).`);
  const sub = a.lab(2, type === 'BEAM' ? 'RECT' : '');
  if (type === 'BEAM' && !BEAM_SUBS.has(sub)) throw new ApdlError('SEC_SUBTYPE', `Beam section subtype ${sub} is not valid (RECT, CSOLID, CTUBE, I, HREC, L, T, CHAN ...).`);
  c.m.secs.set(id, { id, type, subtype: sub, name: a.str(3) || undefined, data: [] });
  c.scratch.set('curSec', id);
  c.m.cur.secnum = id;
}, [...PREP]);
reg('SECDATA', (c, a) => {
  const s = c.m.secs.get(c.scratch.get('curSec') ?? 0);
  if (!s) throw new ApdlError('SECDATA', 'SECDATA must follow a SECTYPE command.');
  const vals: number[] = [];
  for (let i = 0; i < 12; i++) vals.push(a.num(i, 0));
  while (vals.length > 1 && vals[vals.length - 1] === 0) vals.pop();
  if (s.type === 'SHELL' && s.data.length) s.data[0] += vals[0]; // additional layer: total thickness
  else s.data = vals;
  if (s.type === 'BEAM' && s.subtype === 'RECT' && (vals[0] <= 0 || (vals[1] ?? 0) <= 0)) c.warn('SEC_DIM', 'RECT section needs B and H > 0 (SECDATA,B,H).');
  if (s.type === 'SHELL' && vals[0] <= 0) c.warn('SEC_DIM', 'SHELL section thickness must be > 0 (SECDATA,TK,MAT).');
}, [...PREP]);
reg('SECOFFSET', (c, a) => { const s = c.m.secs.get(c.scratch.get('curSec') ?? 0); if (s) s.offset = a.lab(0, 'CENT'); }, [...PREP]);
reg('SECNUM', (c, a) => { c.m.cur.secnum = a.int(0, 1); }, [...PREP]);
reg('TYPE', (c, a) => { c.m.cur.type = a.int(0, 1) || 1; }, [...PREP]);
reg('MAT', (c, a) => { c.m.cur.mat = a.int(0, 1) || 1; }, [...PREP]);
reg('REAL', (c, a) => { c.m.cur.real = a.int(0, 1) || 1; }, [...PREP]);
reg('ESYS', (c, a) => { c.m.cur.esys = a.int(0, 0); }, [...PREP]);

function attrsFrom(a: Args, idx: { mat: number; real: number; type: number; esys: number; sec?: number }): Partial<EntityAttrs> {
  const o: Partial<EntityAttrs> = {};
  if (!a.isBlank(idx.mat)) o.mat = a.int(idx.mat);
  if (!a.isBlank(idx.real)) o.real = a.int(idx.real);
  if (!a.isBlank(idx.type)) o.type = a.int(idx.type);
  if (!a.isBlank(idx.esys)) o.esys = a.int(idx.esys);
  if (idx.sec !== undefined && !a.isBlank(idx.sec)) o.secnum = a.int(idx.sec);
  return o;
}
reg('LATT', (c, a) => {
  const at = attrsFrom(a, { mat: 0, real: 1, type: 2, esys: 3, sec: 6 });
  const ids = selectedIds(c.m, 'line');
  if (!ids.length) c.warn('NONE_SELECTED', 'LATT: no lines are selected.');
  for (const id of ids) {
    const l = c.m.lines.get(id)!;
    l.attrs = { ...(l.attrs ?? {}), ...at };
    if (!a.isBlank(4)) l.attrs.kb = a.int(4);
    if (!a.isBlank(5)) l.attrs.ke = a.int(5);
  }
}, [...PREP]);
reg('AATT', (c, a) => {
  const at = attrsFrom(a, { mat: 0, real: 1, type: 2, esys: 3, sec: 4 });
  const ids = selectedIds(c.m, 'area');
  if (!ids.length) c.warn('NONE_SELECTED', 'AATT: no areas are selected.');
  for (const id of ids) { const ar = c.m.areas.get(id)!; ar.attrs = { ...(ar.attrs ?? {}), ...at }; }
}, [...PREP]);
reg('VATT', (c, a) => {
  const at = attrsFrom(a, { mat: 0, real: 1, type: 2, esys: 3, sec: 4 });
  const ids = selectedIds(c.m, 'volu');
  if (!ids.length) c.warn('NONE_SELECTED', 'VATT: no volumes are selected.');
  for (const id of ids) { const v = c.m.volus.get(id)!; v.attrs = { ...(v.attrs ?? {}), ...at }; }
}, [...PREP]);
reg('KATT', (c, a) => {
  const at = attrsFrom(a, { mat: 0, real: 1, type: 2, esys: 3 });
  for (const id of selectedIds(c.m, 'kp')) { const k = c.m.kps.get(id)!; k.attrs = { ...(k.attrs ?? {}), ...at }; }
}, [...PREP]);

// ------------------------------------------------------------------ mesh controls
reg('ESIZE', (c, a) => {
  const size = a.num(0, 0);
  const ndiv = a.int(1, 0);
  if (size < 0) throw new ApdlError('ESIZE', 'ESIZE: SIZE must be positive.');
  c.m.cur.esize = size;
  c.m.cur.esizeNdiv = size > 0 ? 0 : ndiv;
}, [...PREP]);
reg('LESIZE', (c, a) => {
  const ids = a.entity1('line', 0);
  if (!ids.length) throw new ApdlError('LESIZE', 'LESIZE: NL1 must be a line number, ALL, or a component.');
  const size = a.num(1, 0), ndiv = a.int(3, 0), space = a.num(4, 0);
  const kforc = a.int(5, 1);
  for (const id of ids) {
    c.ensureExists('line', id);
    const l = c.m.lines.get(id)!;
    if (kforc === 0 && l.mesh && (l.mesh.ndiv || l.mesh.size)) continue;
    l.mesh = {};
    if (ndiv > 0) l.mesh.ndiv = ndiv;
    else if (size > 0) l.mesh.size = size;
    else if (a.num(2, 0) > 0 && l.arc) l.mesh.ndiv = Math.max(1, Math.ceil((l.length / l.arc.radius) * 180 / Math.PI / a.num(2) - 1e-6));
    if (space) l.mesh.space = space;
    if (!l.mesh.ndiv && !l.mesh.size && !l.mesh.space) delete l.mesh;
  }
}, [...PREP]);
reg('AESIZE', (c, a) => {
  const size = a.num(1, 0);
  for (const id of a.entity1('area', 0)) { const ar = c.m.areas.get(id); if (ar) ar.esize = size || undefined; }
}, [...PREP]);
reg(['KESIZE', 'SMRTSIZE', 'DESIZE', 'MOPT', 'EXTOPT'], (c) => c.note(`${c.cmd} is accepted; the trainer mesher uses ESIZE/LESIZE only.`), [...PREP]);
reg('MSHAPE', (c, a) => {
  const k = a.int(0, 0);
  if (k !== 0 && k !== 1) throw new ApdlError('MSHAPE', 'MSHAPE KEY must be 0 (quad/hex) or 1 (tri/tet).');
  c.m.cur.mshape = k as 0 | 1;
  c.m.cur.mshape3d = a.lab(1, '3D') !== '2D';
}, [...PREP]);
reg('MSHKEY', (c, a) => {
  const k = a.int(0, 0);
  if (k < 0 || k > 2) throw new ApdlError('MSHKEY', 'MSHKEY must be 0 (free), 1 (mapped) or 2 (mapped if possible).');
  c.m.cur.mshkey = k as 0 | 1 | 2;
}, [...PREP]);

// ------------------------------------------------------------------ meshing
function listOrSelected(c: Ctx, a: Args, kind: 'volu' | 'area' | 'line' | 'kp'): Id[] {
  const ids = a.entities(kind, 0, 'all');
  for (const id of ids) c.ensureExists(kind, id);
  return ids;
}

function afterMesh(c: Ctx, what: string, r: { count: number; notes: string[]; elems: number }) {
  for (const n of r.notes) c.note(n);
  if (r.count && !c.m.cur.esize && !c.m.cur.esizeNdiv && ![...c.m.lines.values()].some((l) => l.mesh) && ![...c.m.areas.values()].some((x) => x.esize) && ![...c.m.volus.values()].some((x) => x.esize)) {
    c.note('No ESIZE or LESIZE was set: a default element size (1/20 of the model size) was used.  Set ESIZE before meshing to control the element count.', 'MESH_DEFAULT_SIZE');
  }
  c.out(meshSummary(c.m, what, r.count));
  if (r.count && !r.elems) c.warn('MESH_EMPTY', `No elements were generated for the selected ${what.toLowerCase()}.`);
}

reg('VMESH', (c, a) => {
  if (c.m.cur.mshape === 0 && c.m.cur.mshkey === 0) {
    // ANSYS default free meshing of volumes with hex shape is not possible; mirror the common note
  }
  afterMesh(c, 'VOLUMES', meshVolumes(c.m, listOrSelected(c, a, 'volu')));
}, [...PREP]);
reg('VSWEEP', (c, a) => {
  afterMesh(c, 'VOLUMES', meshVolumes(c.m, listOrSelected(c, a, 'volu'), { sweep: true }));
}, [...PREP]);
reg('AMESH', (c, a) => afterMesh(c, 'AREAS', meshAreas(c.m, listOrSelected(c, a, 'area'))), [...PREP]);
reg('LMESH', (c, a) => afterMesh(c, 'LINES', meshLines(c.m, listOrSelected(c, a, 'line'))), [...PREP]);
reg('KMESH', (c, a) => afterMesh(c, 'KEYPOINTS', meshKps(c.m, listOrSelected(c, a, 'kp'))), [...PREP]);
reg('VCLEAR', (c, a) => clearMesh(c.m, 'volu', listOrSelected(c, a, 'volu')), [...PREP]);
reg('ACLEAR', (c, a) => clearMesh(c.m, 'area', listOrSelected(c, a, 'area')), [...PREP]);
reg('LCLEAR', (c, a) => clearMesh(c.m, 'line', listOrSelected(c, a, 'line')), [...PREP]);
reg('KCLEAR', (c, a) => clearMesh(c.m, 'kp', listOrSelected(c, a, 'kp')), [...PREP]);
