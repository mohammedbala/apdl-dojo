// Loads & boundary conditions (stored and drawn, never solved): D, DK, DL, DA, F, FK, SFA, SFE, SF, ACEL ...
import { reg } from './registry';
import type { Ctx } from '../context';
import type { Args } from '../args';
import { ApdlError } from '../diagnostics';
import type { BCRecord, Element, Id, ModelState, Vec3 } from '../../model/types';
import { selectedIds } from '../../model/state';
import { areaLines, vtx } from '../../geometry/topo';
import { cross, dist, dot, segDist, sub } from '../../geometry/vec';
import { lookupElement } from '../../mesh/elements';
import { modelTol } from './select';

const PREP_SOLU = ['PREP7', 'SOLU'] as const;
const DOFS = ['UX', 'UY', 'UZ', 'ROTX', 'ROTY', 'ROTZ'];
const DOF_LABELS = new Set([...DOFS, 'TEMP', 'ALL']);
const FORCE_LABELS = new Set(['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ', 'HEAT']);
const SOLID_SRC = new Set(['DK', 'DL', 'DA', 'FK', 'SFA', 'SFL']);

function hasRotDofs(m: ModelState) {
  for (const et of m.etypes.values()) if (et.category === 'beam' || et.category === 'shell') return true;
  return false;
}

function expandDofs(m: ModelState, lab: string): string[] {
  if (lab === 'ALL') return hasRotDofs(m) ? DOFS : DOFS.slice(0, 3);
  return [lab];
}

function setBC(m: ModelState, rec: BCRecord) {
  const i = m.bcs.findIndex((b) => b.kind === rec.kind && b.target === rec.target && b.lab === rec.lab && b.face === rec.face);
  if (i >= 0) m.bcs[i] = rec;
  else m.bcs.push(rec);
}

function nodeTargets(c: Ctx, a: Args, i: number, nendIdx: number): Id[] {
  const m = c.m;
  const t = a.raw(i).toUpperCase();
  let ids: Id[];
  if (t === 'ALL' || m.comps.has(t)) ids = a.entities('node', i);
  else {
    const n1 = a.int(i);
    const nend = a.isBlank(nendIdx) ? n1 : a.int(nendIdx);
    const ninc = a.isBlank(nendIdx + 1) ? 1 : Math.max(1, a.int(nendIdx + 1));
    ids = [];
    for (let n = n1; n <= nend; n += ninc) ids.push(n);
  }
  const ok = ids.filter((id) => m.nodes.has(id));
  if (ids.length && !ok.length) throw new ApdlError('NODE_UNDEFINED', `Node ${ids[0]} is undefined.`);
  if (!ids.length) c.warn('NONE_SELECTED', `${c.cmd}: no nodes selected; nothing applied.`);
  return ok;
}

reg('D', (c, a) => {
  const m = c.m;
  const labs = [a.lab(1, 'ALL')];
  for (let i = 6; i <= 10; i++) if (!a.isBlank(i)) labs.push(a.lab(i));
  for (const l of labs) if (!DOF_LABELS.has(l)) throw new ApdlError('D_LABEL', `D label ${l} is not a valid degree of freedom (UX, UY, UZ, ROTX, ROTY, ROTZ, ALL).`);
  const value = a.num(2, 0);
  const nodes = nodeTargets(c, a, 0, 4);
  let n = 0;
  for (const nid of nodes) for (const l of labs) for (const dof of expandDofs(m, l)) { setBC(m, { kind: 'D', target: nid, lab: dof, value, src: 'D' }); n++; }
  c.out(` SPECIFIED CONSTRAINT ${labs.join(',')} FOR SELECTED NODES  (${nodes.length} NODES, ${n} DOF ENTRIES)  VALUE = ${value}`);
}, [...PREP_SOLU]);

reg('DDELE', (c, a) => {
  const m = c.m;
  const lab = a.lab(1, 'ALL');
  const set = new Set(nodeTargets(c, a, 0, 2));
  m.bcs = m.bcs.filter((b) => !(b.kind === 'D' && set.has(b.target) && (lab === 'ALL' || b.lab === lab)));
}, [...PREP_SOLU]);

reg('F', (c, a) => {
  const m = c.m;
  const lab = a.lab(1);
  if (!FORCE_LABELS.has(lab)) throw new ApdlError('F_LABEL', `F label ${lab || '(blank)'} is not valid (FX, FY, FZ, MX, MY, MZ).`);
  const value = a.num(2, 0);
  const nodes = nodeTargets(c, a, 0, 4);
  for (const nid of nodes) setBC(m, { kind: 'F', target: nid, lab, value, src: 'F' });
  c.out(` SPECIFIED NODAL LOAD ${lab} FOR SELECTED NODES  (${nodes.length} NODES)  VALUE = ${value}`);
}, [...PREP_SOLU]);

reg('FDELE', (c, a) => {
  const m = c.m;
  const lab = a.lab(1, 'ALL');
  const set = new Set(nodeTargets(c, a, 0, 2));
  m.bcs = m.bcs.filter((b) => !(b.kind === 'F' && set.has(b.target) && (lab === 'ALL' || b.lab === lab)));
}, [...PREP_SOLU]);

// ------------------------------------------------------------------ solid-model loads
function solidLoad(c: Ctx, a: Args, cmd: 'DK' | 'DL' | 'DA' | 'FK', kind: 'kp' | 'line' | 'area', labIdx: number, valIdx: number) {
  const m = c.m;
  const ids = a.entity1(kind, 0);
  for (const id of ids) c.ensureExists(kind, id);
  const lab = a.lab(labIdx, cmd === 'FK' ? '' : 'ALL');
  if (cmd === 'FK' ? !FORCE_LABELS.has(lab) : !DOF_LABELS.has(lab) && lab !== 'SYMM' && lab !== 'ASYM') {
    throw new ApdlError('LOAD_LABEL', `${cmd} label ${lab || '(blank)'} is not valid.`);
  }
  if (lab === 'SYMM' || lab === 'ASYM') c.note(`${cmd},${lab}: symmetry conditions are approximated as constraints normal to the entity.`);
  const value = a.num(valIdx, 0);
  for (const id of ids) m.solidLoads.push({ cmd, entity: id, lab, value, line: c.line });
  c.out(` ${cmd === 'FK' ? 'FORCE' : 'CONSTRAINT'} ${lab} ON ${ids.length} ${kind.toUpperCase()}(S)  VALUE = ${value}  (transferred to nodes after meshing)`);
}
reg('DK', (c, a) => solidLoad(c, a, 'DK', 'kp', 1, 2), [...PREP_SOLU]);
reg('DL', (c, a) => solidLoad(c, a, 'DL', 'line', 2, 3), [...PREP_SOLU]);
reg('DA', (c, a) => solidLoad(c, a, 'DA', 'area', 1, 2), [...PREP_SOLU]);
reg('FK', (c, a) => solidLoad(c, a, 'FK', 'kp', 1, 2), [...PREP_SOLU]);

reg('SFA', (c, a) => {
  const m = c.m;
  const ids = a.entity1('area', 0);
  for (const id of ids) c.ensureExists('area', id);
  const lab = a.lab(2, 'PRES');
  if (lab !== 'PRES') throw new ApdlError('SF_LABEL', `SFA label ${lab} is not supported (use PRES).`);
  const value = a.num(3, 0);
  for (const id of ids) m.solidLoads.push({ cmd: 'SFA', entity: id, lab, value, line: c.line });
}, [...PREP_SOLU]);
reg('SFL', (c, a) => {
  const ids = a.entity1('line', 0);
  for (const id of ids) c.ensureExists('line', id);
  for (const id of ids) c.m.solidLoads.push({ cmd: 'SFL', entity: id, lab: a.lab(1, 'PRES'), value: a.num(2, 0), line: c.line });
}, [...PREP_SOLU]);
reg('SFE', (c, a) => {
  const m = c.m;
  const ids = a.entity1('elem', 0).filter((id) => m.elems.has(id));
  const face = a.int(1, 1) || 1;
  const lab = a.lab(2, 'PRES');
  const value = a.num(4, 0);
  for (const id of ids) setBC(m, { kind: 'SF', target: id, lab, value, face, src: 'SFE' });
}, [...PREP_SOLU]);
reg('SF', (c, a) => {
  const m = c.m;
  const nodes = new Set(nodeTargets(c, a, 0, 99));
  const lab = a.lab(1, 'PRES');
  const value = a.num(2, 0);
  let n = 0;
  for (const e of m.elems.values()) {
    const faces = faceTable(e);
    faces.forEach((f, i) => {
      if (f.every((k) => nodes.has(e.nodes[k]))) { setBC(m, { kind: 'SF', target: e.id, lab, value, face: i + 1, src: 'SF' }); n++; }
    });
  }
  c.out(` SPECIFIED SURFACE LOAD ${lab} ON ${n} ELEMENT FACES  VALUE = ${value}`);
}, [...PREP_SOLU]);

reg('ACEL', (c, a) => {
  c.m.acel = [a.num(0, 0), a.num(1, 0), a.num(2, 0)];
  c.out(` ACEL  ACELX= ${a.num(0, 0)}  ACELY= ${a.num(1, 0)}  ACELZ= ${a.num(2, 0)}`);
}, [...PREP_SOLU]);
reg('OMEGA', (c) => c.note('OMEGA (rotational velocity) is stored as an analysis setting only.'), [...PREP_SOLU]);

// ------------------------------------------------------------------ analysis (no solver)
reg(['ANTYPE', 'MODOPT', 'MXPAND', 'NSUBST', 'TIME', 'OUTRES', 'LSWRITE', 'LSSOLVE', 'ALPHAD', 'BETAD', 'DMPRAT', 'NLGEOM', 'AUTOTS', 'KBC'], (c) => {
  c.out(` ${c.cmd} accepted (analysis option).`);
}, ['SOLU']);
reg(['SET', 'PLNSOL', 'PRNSOL'], (c) => c.note(`${c.cmd}: there are no results — the trainer builds models only.`), ['POST1']);

reg('SOLVE', (c) => {
  const m = c.m;
  finalizeLoads(c);
  const problems: string[] = [];
  if (!m.elems.size) problems.push('There are no elements in the model.  Mesh the geometry (VMESH/AMESH/LMESH) or create elements with E.');
  const used = new Map<Id, Element>();
  for (const e of m.elems.values()) if (!used.has(e.type)) used.set(e.type, e);
  for (const [t, e] of used) {
    const et = m.etypes.get(t);
    if (!et) { problems.push(`Element type ${t} (used by element ${e.id}) is not defined.`); continue; }
    const def = lookupElement(et.ename)!;
    if (def.needs.includes('mat')) {
      const mt = m.mats.get(e.mat);
      if (!mt || mt.props.EX === undefined) problems.push(`Material number ${e.mat} (used by element ${e.id}, ${et.ename}) has no EX defined.`);
      if (m.acel && mt && mt.props.DENS === undefined) c.warn('NO_DENS', `Material ${e.mat} has no DENS: ACEL (gravity) will produce no load on ${et.ename} elements.`);
    }
    if (def.needs.includes('sec') && !m.secs.has(e.secnum)) problems.push(`Section ${e.secnum} (used by element ${e.id}, ${et.ename}) is not defined.  Use SECTYPE/SECDATA.`);
    if (def.needs.includes('real') && !m.reals.has(e.real)) problems.push(`Real constant set ${e.real} (used by element ${e.id}, ${et.ename}) is not defined.`);
  }
  if (!m.bcs.some((b) => b.kind === 'D')) problems.push('No displacement constraints are defined: the model would have rigid-body motion.');
  for (const p of problems) c.error('SOLVE_CHECK', p);
  if (!problems.length) c.note('Model check passed.  The trainer has no solver: SOLVE stops here — your model is ready for a real MAPDL run.', 'SOLVE_OK');
}, ['SOLU']);

// ------------------------------------------------------------------ transfer of solid-model loads
const FACES: Record<string, number[][]> = {
  // ANSYS SOLID185 face numbering: 1 J-I-L-K, 2 I-J-N-M, 3 J-K-O-N, 4 K-L-P-O, 5 L-I-M-P, 6 M-N-O-P
  hex: [[1, 0, 3, 2], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]],
  wedge: [[1, 0, 2], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5], [3, 4, 5]],
  tet: [[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]],
  pyramid: [[0, 3, 2, 1], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]],
  quad: [[0, 1, 2, 3]],
  tri: [[0, 1, 2]],
};
function faceTable(e: Element): number[][] {
  return FACES[e.shape] ?? [];
}

function onSegments(p: Vec3, pts: Vec3[], tol: number) {
  for (let i = 0; i < pts.length - 1; i++) if (segDist(p, pts[i], pts[i + 1]).d <= tol) return true;
  return false;
}

function onTess(m: ModelState, p: Vec3, aid: Id, tol: number) {
  const ar = m.areas.get(aid)!;
  const t = ar.tess;
  for (let i = 0; i < t.idx.length; i += 3) {
    const a = vtx(t, t.idx[i]), b = vtx(t, t.idx[i + 1]), c = vtx(t, t.idx[i + 2]);
    const n = cross(sub(b, a), sub(c, a));
    const nl = Math.hypot(...n);
    if (nl < 1e-20) continue;
    const nn: Vec3 = [n[0] / nl, n[1] / nl, n[2] / nl];
    const d = dot(sub(p, a), nn);
    if (Math.abs(d) > tol) continue;
    const q: Vec3 = [p[0] - nn[0] * d, p[1] - nn[1] * d, p[2] - nn[2] * d];
    const inside = (u: Vec3, v: Vec3) => dot(cross(sub(v, u), sub(q, u)), nn) >= -tol * nl;
    if (inside(a, b) && inside(b, c) && inside(c, a)) return true;
  }
  return onSegments(p, [], tol);
}

/** Transfer solid-model loads onto nodes/elements. Idempotent: replaces previously transferred records. */
export function finalizeLoads(c: Ctx) {
  const m = c.m;
  if (!m.solidLoads.length) return;
  m.bcs = m.bcs.filter((b) => !SOLID_SRC.has(b.src));
  if (!m.nodes.size) return;
  const tol = modelTol(m) * 10;
  const nodes = [...m.nodes.values()];
  const untransferred: string[] = [];
  for (const s of m.solidLoads) {
    let targets: Id[] = [];
    if (s.cmd === 'DK' || s.cmd === 'FK') {
      const k = m.kps.get(s.entity);
      if (k) targets = nodes.filter((n) => dist(n.xyz, k.xyz) <= tol).map((n) => n.id);
    } else if (s.cmd === 'DL' || s.cmd === 'SFL') {
      const l = m.lines.get(s.entity);
      if (l) targets = nodes.filter((n) => onSegments(n.xyz, l.pts, tol)).map((n) => n.id);
    } else if (s.cmd === 'DA' || s.cmd === 'SFA') {
      const ar = m.areas.get(s.entity);
      if (ar) {
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < ar.tess.pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], ar.tess.pos[i]); hi[i % 3] = Math.max(hi[i % 3], ar.tess.pos[i]); }
        targets = nodes.filter((n) => n.xyz.every((x, i) => x >= lo[i] - tol && x <= hi[i] + tol) && onTess(m, n.xyz, ar.id, tol)).map((n) => n.id);
        void areaLines;
      }
    }
    if (!targets.length) { untransferred.push(`${s.cmd} on ${s.cmd === 'DK' || s.cmd === 'FK' ? 'keypoint' : s.cmd === 'DL' ? 'line' : 'area'} ${s.entity}`); continue; }
    if (s.cmd === 'DK' || s.cmd === 'DL' || s.cmd === 'DA') {
      for (const n of targets) for (const dof of expandDofs(m, s.lab === 'SYMM' || s.lab === 'ASYM' ? 'ALL' : s.lab)) setBC(m, { kind: 'D', target: n, lab: dof, value: s.value, src: s.cmd });
    } else if (s.cmd === 'FK') {
      for (const n of targets) setBC(m, { kind: 'F', target: n, lab: s.lab, value: s.value, src: s.cmd });
    } else if (s.cmd === 'SFA') {
      const set = new Set(targets);
      for (const e of m.elems.values()) {
        faceTable(e).forEach((f, i) => {
          if (f.every((k) => set.has(e.nodes[k]))) setBC(m, { kind: 'SF', target: e.id, lab: 'PRES', value: s.value, face: i + 1, src: 'SFA' });
        });
      }
    }
  }
  if (untransferred.length && m.elems.size) c.warn('LOAD_NOT_TRANSFERRED', `Solid-model loads could not be transferred (entity not meshed): ${untransferred.slice(0, 5).join('; ')}${untransferred.length > 5 ? ' ...' : ''}`);
}

export { selectedIds };
