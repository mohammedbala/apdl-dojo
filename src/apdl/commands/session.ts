// Processors, session commands, parameters (*SET, *GET ...), display hints, coordinate systems.
import { reg } from './registry';
import type { Ctx } from '../context';
import { ApdlError } from '../diagnostics';
import { createEmptyModel, maxId, selectedIds } from '../../model/state';
import type { EntityKind, Vec3 } from '../../model/types';
import { fromGlobal, getCsys, rotatedAxes, toGlobal, wpOffset, wpRotate } from '../../geometry/csys';
import { norm } from '../../geometry/vec';

const ANY = ['ANY'] as const;

// ------------------------------------------------------------------ processors
reg('/PREP7', (c) => { c.m.processor = 'PREP7'; c.out(' *****  MAPDL PREPROCESSOR (PREP7)  *****'); }, [...ANY]);
reg('/SOLU', (c) => { c.m.processor = 'SOLU'; c.out(' *****  MAPDL SOLUTION ROUTINE  *****'); }, [...ANY]);
reg('/POST1', (c) => { c.m.processor = 'POST1'; c.out(' *****  MAPDL POSTPROCESSOR (POST1)  *****'); c.note('The trainer has no solver; /POST1 has nothing to post-process.'); }, [...ANY]);
reg('FINISH', (c) => {
  if (c.m.processor !== 'BEGIN') c.out(` *****  ROUTINE COMPLETED  *****  CP = 0.000`);
  c.m.processor = 'BEGIN';
}, [...ANY]);
reg('/CLEAR', (c) => {
  const fresh = createEmptyModel();
  const keepUsed = c.m.commandsUsed;
  Object.assign(c.m, fresh);
  c.m.commandsUsed = keepUsed;
  c.arrays.clear();
  c.deg = false;
  c.out(' CLEAR MAPDL DATABASE AND RESTART');
}, [...ANY]);
reg(['/TITLE', '/STITLE'], (c, a) => { c.m.title = a.raw(0); c.out(` TITLE= ${a.raw(0)}`); }, [...ANY]);
reg(['/COM', 'C***'], (c, a) => c.out(` ${a.raw(0)}`), [...ANY]);
reg(['/FILNAME', '/UNITS', '/BATCH', '/NERR', '/NOPR', '/GOPR', '/CONFIG', '/UIS', '/MENU', '/SHOW', '/GRAPHICS', 'KEYW', '/OUTPUT', 'SAVE', 'RESUME', '*CFOPEN', '*CFCLOS', '*VWRITE'], () => {}, [...ANY]);
reg('/INPUT', (c) => c.warn('INPUT_UNSUPPORTED', '/INPUT is not available in the trainer: paste the file contents into the editor instead.'), [...ANY]);
reg('/EOF', () => {}, [...ANY]);
reg('*MSG', (c, a) => c.out(` ${a.raw(0)}`), [...ANY]);

// ------------------------------------------------------------------ parameters
const RESERVED = new Set(['ALL', 'P', 'STAT']);

function setParam(c: Ctx, name: string, valueText: string) {
  const up = name.toUpperCase();
  const arr = /^([A-Z_][A-Z0-9_]*)\((.*)\)$/.exec(up);
  if (arr) {
    const a = c.arrays.get(arr[1]);
    if (!a) throw new ApdlError('ARRAY_UNDEF', `Array parameter ${arr[1]} is not dimensioned (*DIM).`);
    const idx = arr[2].split(',').map((s) => Math.trunc(Number(c.evaluate(s))));
    const [i = 1, j = 1, k = 1] = idx;
    const off = (i - 1) + (j - 1) * a.dims[0] + (k - 1) * a.dims[0] * a.dims[1];
    if (off < 0 || off >= a.data.length) throw new ApdlError('ARRAY_INDEX', `Array ${arr[1]} subscript is out of range.`);
    a.data[off] = Number(c.evaluate(valueText));
    return;
  }
  if (!/^[A-Z_][A-Z0-9_]{0,31}$/.test(up)) throw new ApdlError('PARAM_NAME', `"${name}" is not a valid parameter name (start with a letter, max 32 characters).`);
  if (RESERVED.has(up)) throw new ApdlError('PARAM_RESERVED', `${up} is a reserved label and cannot be used as a parameter name.`);
  if (valueText.trim() === '') { c.m.params.delete(up); return; }
  const v = c.evaluate(valueText);
  c.m.params.set(up, v);
  c.out(` PARAMETER ${up} = ${typeof v === 'number' ? fmt(v) : `'${v}'`}`);
}

export function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-4 || a >= 1e7)) return v.toExponential(6).toUpperCase();
  return String(+v.toPrecision(10));
}

reg('*SET', (c, a) => setParam(c, a.raw(0), a.raw(1)), [...ANY]);
reg('*AFUN', (c, a) => {
  const l = a.lab(0, 'RAD');
  if (l === 'DEG') c.deg = true;
  else if (l === 'RAD') c.deg = false;
  else throw new ApdlError('AFUN', `*AFUN label ${l} is not valid (use DEG or RAD).`);
}, [...ANY]);
reg('*STATUS', (c) => {
  c.out(' ABBREVIATION STATUS-  (none)  PARAMETER STATUS-');
  for (const [k, v] of [...c.m.params].sort()) c.out(`  ${k.padEnd(32)} ${typeof v === 'number' ? fmt(v) : `'${v}'`}`);
}, [...ANY]);
reg('*DIM', (c, a) => {
  const name = a.lab(0);
  const type = a.lab(1, 'ARRAY');
  if (type !== 'ARRAY') throw new ApdlError('DIM_TYPE', `*DIM type ${type} is not supported in the trainer (only ARRAY).`);
  const d0 = Math.max(1, a.int(2, 1)), d1 = Math.max(1, a.int(3, 1)), d2 = Math.max(1, a.int(4, 1));
  c.arrays.set(name, { dims: [d0, d1, d2], data: new Float64Array(d0 * d1 * d2) });
}, [...ANY]);

const ENT_KIND: Record<string, EntityKind> = { KP: 'kp', LINE: 'line', AREA: 'area', VOLU: 'volu', NODE: 'node', ELEM: 'elem' };

reg('*GET', (c, a) => {
  const par = a.lab(0);
  const ent = a.lab(1);
  const entnum = a.isBlank(2) ? 0 : a.int(2);
  const item1 = a.lab(3);
  const it1 = a.lab(4);
  let val: number | string = 0;
  const m = c.m;
  const kind = ENT_KIND[ent];
  if (kind) {
    const map = { kp: m.kps, line: m.lines, area: m.areas, volu: m.volus, node: m.nodes, elem: m.elems }[kind] as Map<number, unknown>;
    if (entnum === 0) {
      const sel = selectedIds(m, kind);
      if (item1 === 'COUNT') val = sel.length;
      else if (item1 === 'NUM') {
        if (it1 === 'MAX') val = sel.length ? sel[sel.length - 1] : 0;
        else if (it1 === 'MIN') val = sel.length ? sel[0] : 0;
        else if (it1 === 'MAXD') val = maxId(m, kind);
        else if (it1 === 'MIND') val = map.size ? Math.min(...map.keys()) : 0;
        else throw new ApdlError('GET_ITEM', `*GET item NUM,${it1} is not valid (use MAX, MIN, MAXD or MIND).`);
      } else throw new ApdlError('GET_ITEM', `*GET item ${item1} is not valid for ${ent},0 (use COUNT or NUM).`);
    } else {
      if (!map.has(entnum) && item1 !== 'NXTH' && item1 !== 'NXTL') throw new ApdlError('GET_ENT', `*GET: ${ent} ${entnum} is not defined.`);
      const comp = 'XYZ'.indexOf(it1) as 0 | 1 | 2;
      if (item1 === 'LOC') {
        if (comp < 0) throw new ApdlError('GET_ITEM', `*GET ${ent},${entnum},LOC needs X, Y or Z.`);
        let p: Vec3 | undefined;
        if (kind === 'kp') p = m.kps.get(entnum)!.xyz;
        else if (kind === 'node') p = m.nodes.get(entnum)!.xyz;
        else if (kind === 'line') { const l = m.lines.get(entnum)!; p = l.pts[Math.floor(l.pts.length / 2)]; }
        else if (kind === 'area') p = m.areas.get(entnum)!.centroid;
        else if (kind === 'volu') p = m.volus.get(entnum)!.centroid;
        else if (kind === 'elem') {
          const e = m.elems.get(entnum)!;
          const s: Vec3 = [0, 0, 0];
          for (const n of e.nodes) { const x = m.nodes.get(n)?.xyz; if (x) { s[0] += x[0]; s[1] += x[1]; s[2] += x[2]; } }
          p = [s[0] / e.nodes.length, s[1] / e.nodes.length, s[2] / e.nodes.length];
        }
        val = p ? fromGlobal(m, p)[comp] : 0;
      } else if (item1 === 'LENG' && kind === 'line') val = m.lines.get(entnum)!.length;
      else if (item1 === 'AREA' && kind === 'area') val = m.areas.get(entnum)!.area;
      else if (item1 === 'VOLU' && kind === 'volu') val = m.volus.get(entnum)!.volume;
      else if (item1 === 'ATTR' && kind === 'elem') {
        const e = m.elems.get(entnum)!;
        const k = { TYPE: e.type, MAT: e.mat, REAL: e.real, SECN: e.secnum, ESYS: e.esys }[it1];
        if (k === undefined) throw new ApdlError('GET_ITEM', `*GET ELEM,n,ATTR,${it1} is not valid.`);
        val = k;
      } else if (item1 === 'NODE' && kind === 'elem') val = m.elems.get(entnum)!.nodes[Math.max(0, a.int(4, 1) - 1)] ?? 0;
      else if (item1 === 'NXTH' || item1 === 'NXTL') {
        const sel = selectedIds(m, kind);
        val = item1 === 'NXTH' ? (sel.find((x) => x > entnum) ?? 0) : ([...sel].reverse().find((x) => x < entnum) ?? 0);
      } else if (item1 === 'ATTR' && (kind === 'volu' || kind === 'area' || kind === 'line')) {
        const e = { volu: m.volus, area: m.areas, line: m.lines }[kind].get(entnum) as { attrs?: Record<string, number> };
        val = e.attrs?.[{ TYPE: 'type', MAT: 'mat', REAL: 'real', SECN: 'secnum', ESYS: 'esys' }[it1] ?? ''] ?? 0;
      } else throw new ApdlError('GET_ITEM', `*GET item ${item1} is not supported for ${ent} in the trainer.`);
    }
  } else if (ent === 'ACTIVE') {
    if (item1 === 'CSYS') val = m.cur.csys;
    else if (item1 === 'TYPE') val = m.cur.type;
    else if (item1 === 'MAT') val = m.cur.mat;
    else if (item1 === 'REAL') val = m.cur.real;
    else if (item1 === 'SECN') val = m.cur.secnum;
    else if (item1 === 'ROUT') val = { BEGIN: 0, PREP7: 17, SOLU: 21, POST1: 31 }[m.processor];
    else throw new ApdlError('GET_ITEM', `*GET ACTIVE item ${item1} is not supported in the trainer.`);
  } else if (ent === 'PARM') {
    val = m.params.has(it1 || item1) ? 1 : 0;
  } else throw new ApdlError('GET_ENTITY', `*GET entity ${ent} is not supported in the trainer (use KP, LINE, AREA, VOLU, NODE, ELEM or ACTIVE).`);
  m.params.set(par, val);
  c.out(` *GET  ${par}  FROM  ${ent}  ITEM=${item1} ${it1}  VALUE= ${typeof val === 'number' ? fmt(val) : val}`);
}, [...ANY]);

// ------------------------------------------------------------------ display / listing (view hints)
const PNUM_LABELS = new Set(['KP', 'LINE', 'AREA', 'VOLU', 'NODE', 'ELEM', 'TYPE', 'MAT', 'REAL', 'SEC', 'ESYS', 'TABN', 'SVAL', 'DOMA', 'LOC', 'STAT', 'DEFA']);
reg('/PNUM', (c, a) => {
  const lab = a.lab(0, 'DEFA');
  if (!PNUM_LABELS.has(lab)) c.warn('PNUM_LABEL', `/PNUM label ${lab} is not valid.`);
  c.hint({ kind: 'pnum', what: lab, on: a.int(1, 0) !== 0 });
}, [...ANY]);
reg('/NUMBER', (c, a) => c.hint({ kind: 'number', mode: a.int(0, 0) }), [...ANY]);
reg('/VIEW', (c, a) => {
  const d: Vec3 = [a.num(1, 0), a.num(2, 0), a.num(3, 1)];
  if (Math.hypot(...d) === 0) d[2] = 1;
  c.hint({ kind: 'view', dir: norm(d) });
}, [...ANY]);
reg(['/AUTO', '/REPLOT', '/DIST', '/FOCUS', '/ANGLE', '/ZOOM', '/USER', '/VUP', '/DEVICE', '/GLINE', '/COLOR', '/TYPE', '/EDGE', '/TRIAD', '/PSF', '/PBC', '/RGB', '/PLOPTS', 'WPSTYL'], (c, a) => {
  if (c.cmd === '/AUTO') c.hint({ kind: 'auto' });
  void a;
}, [...ANY]);
reg('/ESHAPE', (c, a) => c.hint({ kind: 'eshape', on: a.num(0, 0) !== 0 }), [...ANY]);
const PLOTS: Record<string, 'kp' | 'line' | 'area' | 'volu' | 'node' | 'elem' | 'all'> = { KPLOT: 'kp', LPLOT: 'line', APLOT: 'area', VPLOT: 'volu', NPLOT: 'node', EPLOT: 'elem', GPLOT: 'all' };
reg(Object.keys(PLOTS), (c) => c.hint({ kind: 'plot', what: PLOTS[c.cmd] }), [...ANY]);

reg(['KLIST', 'LLIST', 'ALIST', 'VLIST', 'NLIST', 'ELIST'], (c) => {
  const kind = ({ KLIST: 'kp', LLIST: 'line', ALIST: 'area', VLIST: 'volu', NLIST: 'node', ELIST: 'elem' } as Record<string, EntityKind>)[c.cmd];
  const ids = selectedIds(c.m, kind);
  c.out(` LIST ALL SELECTED ${kind.toUpperCase()}S  (${ids.length})`);
  const m = c.m;
  for (const id of ids.slice(0, 200)) {
    if (kind === 'kp') { const p = fromGlobal(m, m.kps.get(id)!.xyz); c.out(`  ${String(id).padStart(6)}  ${p.map((x) => fmt(x).padStart(12)).join(' ')}`); }
    else if (kind === 'node') { const p = fromGlobal(m, m.nodes.get(id)!.xyz); c.out(`  ${String(id).padStart(6)}  ${p.map((x) => fmt(x).padStart(12)).join(' ')}`); }
    else if (kind === 'line') { const l = m.lines.get(id)!; c.out(`  ${String(id).padStart(6)}  KP ${l.kps[0]} ${l.kps[1]}  LENGTH ${fmt(l.length)}  ${l.kind.toUpperCase()}`); }
    else if (kind === 'area') { const ar = m.areas.get(id)!; c.out(`  ${String(id).padStart(6)}  LINES ${ar.loops.flat().map(Math.abs).join(' ')}  AREA ${fmt(ar.area)}`); }
    else if (kind === 'volu') { const v = m.volus.get(id)!; c.out(`  ${String(id).padStart(6)}  AREAS ${v.areas.join(' ')}  VOLUME ${fmt(v.volume)}`); }
    else { const e = m.elems.get(id)!; c.out(`  ${String(id).padStart(6)}  MAT ${e.mat} TYPE ${e.type} REAL ${e.real} SEC ${e.secnum}  NODES ${e.nodes.join(' ')}`); }
  }
  if (ids.length > 200) c.out('  ... (listing truncated at 200 entries)');
}, [...ANY]);
reg(['ETLIST', 'MPLIST', 'RLIST', 'SLIST', 'DLIST', 'FLIST', 'CHECK', 'SECPLOT', 'CMLIST'], (c) => {
  const m = c.m;
  if (c.cmd === 'ETLIST') for (const e of m.etypes.values()) c.out(`  ELEMENT TYPE ${e.id} IS ${e.ename}   KEYOPT ${JSON.stringify(e.keyopts)}`);
  else if (c.cmd === 'MPLIST') for (const mt of m.mats.values()) c.out(`  MATERIAL ${mt.id}  ${Object.entries(mt.props).map(([k, v]) => `${k}=${fmt(v)}`).join('  ')}`);
  else if (c.cmd === 'RLIST') for (const r of m.reals.values()) c.out(`  REAL CONSTANT SET ${r.id}  ${r.values.map(fmt).join(' ')}`);
  else if (c.cmd === 'SLIST') for (const s of m.secs.values()) c.out(`  SECTION ${s.id}  ${s.type} ${s.subtype}  DATA ${s.data.map(fmt).join(' ')}`);
  else if (c.cmd === 'CMLIST') for (const cm of m.comps.values()) c.out(`  COMPONENT ${cm.name}  ${cm.kind.toUpperCase()}  ${cm.ids.length} ITEMS`);
  else if (c.cmd === 'DLIST') c.out(`  ${m.bcs.filter((b) => b.kind === 'D').length} CONSTRAINTS DEFINED`);
  else if (c.cmd === 'FLIST') c.out(`  ${m.bcs.filter((b) => b.kind === 'F').length} NODAL FORCES DEFINED`);
}, [...ANY]);
reg(['LSUM', 'ASUM', 'VSUM', 'GSUM'], (c) => {
  const m = c.m;
  if (c.cmd === 'VSUM' || c.cmd === 'GSUM') {
    let V = 0;
    for (const id of selectedIds(m, 'volu')) V += m.volus.get(id)!.volume;
    c.out(` TOTAL VOLUME OF SELECTED VOLUMES = ${fmt(V)}`);
  }
  if (c.cmd === 'ASUM' || c.cmd === 'GSUM') {
    let A = 0;
    for (const id of selectedIds(m, 'area')) A += m.areas.get(id)!.area;
    c.out(` TOTAL SURFACE AREA OF SELECTED AREAS = ${fmt(A)}`);
  }
  if (c.cmd === 'LSUM' || c.cmd === 'GSUM') {
    let L = 0;
    for (const id of selectedIds(m, 'line')) L += m.lines.get(id)!.length;
    c.out(` TOTAL LENGTH OF SELECTED LINES = ${fmt(L)}`);
  }
}, [...ANY]);

// ------------------------------------------------------------------ coordinate systems & working plane
const PREP = ['PREP7', 'SOLU', 'POST1'] as const;
reg('CSYS', (c, a) => {
  const k = a.int(0, 0);
  if (![0, 1, 2, 4, 5, 6].includes(k) && !c.m.csyss.has(k)) throw new ApdlError('CSYS_UNDEF', `Coordinate system ${k} is not defined.`);
  c.m.cur.csys = k;
}, [...PREP]);
function defineLocal(c: Ctx, kcn: number, kcs: number, origin: Vec3, th: [number, number, number], base: [Vec3, Vec3, Vec3]) {
  if (kcn < 11) throw new ApdlError('LOCAL_NUM', 'Local coordinate system numbers must be 11 or greater.');
  const type = ([0, 1, 2].includes(kcs) ? kcs : 0) as 0 | 1 | 2;
  c.m.csyss.set(kcn, { id: kcn, type, origin, axes: rotatedAxes(base, ...th) });
  c.m.cur.csys = kcn;
}
reg('LOCAL', (c, a) => {
  defineLocal(c, a.int(0), a.int(1, 0), [a.num(2), a.num(3), a.num(4)], [a.num(5), a.num(6), a.num(7)], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
}, [...PREP]);
reg('CLOCAL', (c, a) => {
  const cur = getCsys(c.m, c.m.cur.csys);
  const o = toGlobal(c.m, [a.num(2), a.num(3), a.num(4)]);
  defineLocal(c, a.int(0), a.int(1, 0), o, [a.num(5), a.num(6), a.num(7)], cur.axes);
}, [...PREP]);
reg('CSDELE', (c, a) => { for (let k = a.int(0); k <= a.int(1, a.int(0)); k++) c.m.csyss.delete(k); }, [...PREP]);
reg('WPOFFS', (c, a) => wpOffset(c.m.wp, [a.num(0), a.num(1), a.num(2)]), [...PREP]);
reg('WPROTA', (c, a) => wpRotate(c.m.wp, a.num(0), a.num(1), a.num(2)), [...PREP]);
reg('WPCSYS', (c, a) => {
  const k = a.isBlank(1) ? c.m.cur.csys : a.int(1);
  const cs = getCsys(c.m, k);
  c.m.wp = { origin: [...cs.origin] as Vec3, axes: cs.axes.map((x) => [...x] as Vec3) as [Vec3, Vec3, Vec3] };
}, [...PREP]);
reg('WPAVE', (c, a) => {
  const pts: Vec3[] = [];
  for (let i = 0; i < 9; i += 3) if (!a.isBlank(i)) pts.push(toGlobal(c.m, [a.num(i), a.num(i + 1), a.num(i + 2)]));
  if (!pts.length) pts.push([0, 0, 0]);
  c.m.wp.origin = [0, 1, 2].map((j) => pts.reduce((s, p) => s + p[j], 0) / pts.length) as Vec3;
}, [...PREP]);
reg('KWPAVE', (c, a) => {
  const pts: Vec3[] = [];
  for (let i = 0; i < 9; i++) {
    if (a.isBlank(i)) continue;
    const k = c.m.kps.get(a.int(i));
    if (!k) throw new ApdlError('KP_UNDEFINED', `Keypoint ${a.int(i)} is undefined.`);
    pts.push(k.xyz);
  }
  if (!pts.length) throw new ApdlError('KWPAVE', 'KWPAVE needs at least one keypoint.');
  c.m.wp.origin = [0, 1, 2].map((j) => pts.reduce((s, p) => s + p[j], 0) / pts.length) as Vec3;
}, [...PREP]);
