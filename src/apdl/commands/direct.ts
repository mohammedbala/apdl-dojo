// Direct generation of nodes and elements: N, NGEN, NFILL, NSYM, NDELE, NMODIF, E, EN, EGEN, ENGEN, EDELE, EMODIF.
import { reg } from './registry';
import type { Ctx } from '../context';
import type { Args } from '../args';
import { ApdlError } from '../diagnostics';
import type { ElemShape, Id, ModelState, Vec3 } from '../../model/types';
import { nextId, selectNew, selectedIds } from '../../model/state';
import { csysToGlobal, fromGlobal, getCsys, globalToCsys, toGlobal } from '../../geometry/csys';
import { dist } from '../../geometry/vec';
import { lookupElement } from '../../mesh/elements';

const PREP = ['PREP7'] as const;

function addNode(m: ModelState, id: Id, p: Vec3) {
  m.nodes.set(id, { id, xyz: p });
  m.nodeOwner.delete(id);
  selectNew(m, 'node', id);
}

reg('N', (c, a) => {
  const m = c.m;
  let id = a.int(0, 0);
  if (id < 0) throw new ApdlError('NODE_NUM', 'Node number must be positive.');
  if (id === 0) id = nextId(m, 'node');
  addNode(m, id, toGlobal(m, [a.num(1), a.num(2), a.num(3)]));
  if (!a.isBlank(4) || !a.isBlank(5) || !a.isBlank(6)) c.note('N: nodal rotation angles are ignored in the trainer.');
}, [...PREP]);

reg('NMODIF', (c, a) => {
  const m = c.m;
  const id = a.int(0);
  const n = m.nodes.get(id);
  if (!n) throw new ApdlError('NODE_UNDEFINED', `Node ${id} is undefined.`);
  const q = fromGlobal(m, n.xyz);
  n.xyz = toGlobal(m, [a.isBlank(1) ? q[0] : a.num(1), a.isBlank(2) ? q[1] : a.num(2), a.isBlank(3) ? q[2] : a.num(3)]);
}, [...PREP]);

function nodeList(c: Ctx, a: Args, i1: number): Id[] {
  const ids = a.entities('node', i1);
  return ids.filter((id) => c.m.nodes.has(id));
}

reg('NGEN', (c, a) => {
  const m = c.m;
  const itime = a.int(0, 2), inc = a.int(1, 0);
  const src = nodeList(c, a, 2);
  if (!src.length) throw new ApdlError('NGEN_NONE', 'NGEN: no existing nodes in NODE1..NODE2.');
  if (inc === 0 && itime > 1) throw new ApdlError('NGEN_INC', 'NGEN: INC must be non-zero (node number increment between sets).');
  const dx = a.num(5), dy = a.num(6), dz = a.num(7);
  const cs = getCsys(m, m.cur.csys);
  let made = 0;
  for (let i = 1; i < itime; i++) {
    for (const id of src) {
      const nid = id + inc * i;
      const q = globalToCsys(cs, m.nodes.get(id)!.xyz);
      addNode(m, nid, csysToGlobal(cs, [q[0] + dx * i, q[1] + dy * i, q[2] + dz * i]));
      made++;
    }
  }
  c.out(` GENERATE NODES  ${made} NEW NODES  (MAXIMUM NODE NUMBER ${Math.max(...m.nodes.keys())})`);
}, [...PREP]);

reg('NFILL', (c, a) => {
  const m = c.m;
  const n1 = a.int(0), n2 = a.int(1);
  const p1 = m.nodes.get(n1)?.xyz, p2 = m.nodes.get(n2)?.xyz;
  if (!p1) throw new ApdlError('NODE_UNDEFINED', `Node ${n1} is undefined.`);
  if (!p2) throw new ApdlError('NODE_UNDEFINED', `Node ${n2} is undefined.`);
  const nfill = a.isBlank(2) ? Math.abs(n2 - n1) - 1 : a.int(2);
  if (nfill <= 0) return;
  const ninc = a.isBlank(4) ? Math.trunc((n2 - n1) / (nfill + 1)) || 1 : a.int(4);
  const nstrt = a.isBlank(3) ? n1 + ninc : a.int(3);
  const itime = a.int(5, 1) || 1, inc = a.int(6, 1);
  const space = a.num(7, 1) || 1;
  const cs = getCsys(m, m.cur.csys);
  const q1 = globalToCsys(cs, p1), q2 = globalToCsys(cs, p2);
  const n = nfill + 1;
  const r = n > 1 ? Math.pow(space, 1 / (n - 1)) : 1;
  const w: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) { w.push(Math.pow(r, i)); s += w[i]; }
  for (let t = 0; t < itime; t++) {
    let acc = 0;
    for (let i = 1; i <= nfill; i++) {
      acc += w[i - 1] / s;
      const q: Vec3 = [q1[0] + (q2[0] - q1[0]) * acc, q1[1] + (q2[1] - q1[1]) * acc, q1[2] + (q2[2] - q1[2]) * acc];
      addNode(m, nstrt + (i - 1) * ninc + t * inc, csysToGlobal(cs, q));
    }
  }
}, [...PREP]);

reg('NSYM', (c, a) => {
  const m = c.m;
  const comp = a.lab(0, 'X');
  const ax = 'XYZ'.indexOf(comp);
  if (ax < 0) throw new ApdlError('SYMM_COMP', `NSYM component ${comp} is not valid (X, Y or Z).`);
  const inc = a.int(1);
  if (!inc) throw new ApdlError('NSYM_INC', 'NSYM: INC (node number increment) must be non-zero.');
  const src = nodeList(c, a, 2);
  const cs = getCsys(m, m.cur.csys);
  for (const id of src) {
    const q = globalToCsys(cs, m.nodes.get(id)!.xyz);
    q[ax] = -q[ax];
    addNode(m, id + inc, csysToGlobal(cs, q));
  }
}, [...PREP]);

reg('NROTAT', (c) => c.note('NROTAT: nodal coordinate rotations are not modelled in the trainer.'), [...PREP]);

reg('NDELE', (c, a) => {
  const m = c.m;
  const used = new Set<Id>();
  for (const e of m.elems.values()) e.nodes.forEach((n) => used.add(n));
  let skipped = 0;
  for (const id of nodeList(c, a, 0)) {
    if (used.has(id)) { skipped++; continue; }
    m.nodes.delete(id); m.sel.node.delete(id); m.nodeOwner.delete(id);
  }
  if (skipped) c.warn('NODE_ATTACHED', `${skipped} node(s) are attached to elements and were not deleted.`);
  m.bcs = m.bcs.filter((b) => b.kind === 'SF' || m.nodes.has(b.target));
}, [...PREP]);

// ------------------------------------------------------------------ elements
function shapeFor(m: ModelState, type: Id, nodes: Id[]): { shape: ElemShape; nodes: Id[] } {
  const et = m.etypes.get(type);
  if (!et) throw new ApdlError('ETYPE_UNDEFINED', `Element type ${type} is not defined.  Use ET before E.`);
  const def = lookupElement(et.ename)!;
  const n = nodes.length;
  switch (et.category) {
    case 'mass':
      if (n < 1) break;
      return { shape: 'point', nodes: nodes.slice(0, 1) };
    case 'spring':
    case 'link':
      if (n < 2) break;
      return { shape: 'line', nodes: nodes.slice(0, 2) };
    case 'beam':
      if (n < 2) break;
      if (def.midside && n >= 3) return { shape: 'line', nodes: nodes.slice(0, 3) };
      return { shape: 'line', nodes: nodes.slice(0, 2) };
    case 'shell':
    case 'surf':
      if (n === 3 || (n === 4 && nodes[2] === nodes[3])) return { shape: 'tri', nodes: nodes.slice(0, 3) };
      if (n >= 4) return { shape: 'quad', nodes: nodes.slice(0, def.midside && n >= 8 ? 8 : 4) };
      break;
    case 'solid':
      if (n === 4) return { shape: 'tet', nodes };
      if (n === 6) return { shape: 'wedge', nodes };
      if (n >= 8) return { shape: 'hex', nodes: nodes.slice(0, def.midside && n >= 20 ? 20 : 8) };
      if (n === 5) return { shape: 'pyramid', nodes };
      break;
  }
  throw new ApdlError('E_NODES', `${n} node(s) given; element type ${type} (${et.ename}) needs ${def.nodes} nodes.`);
}

function makeElem(c: Ctx, id: Id, nodes: Id[], at: { type: Id; mat: Id; real: Id; secnum: Id; esys: Id }) {
  const m = c.m;
  for (const n of nodes) if (!m.nodes.has(n)) throw new ApdlError('NODE_UNDEFINED', `Node ${n} is undefined.  Element not created.`);
  const { shape, nodes: nn } = shapeFor(m, at.type, nodes);
  const et = m.etypes.get(at.type)!;
  if ((et.category === 'beam' || et.category === 'link') && dist(m.nodes.get(nn[0])!.xyz, m.nodes.get(nn[1])!.xyz) < 1e-12) {
    throw new ApdlError('E_ZERO_LENGTH', `Element ${id} (${et.ename}) has zero length: nodes ${nn[0]} and ${nn[1]} are coincident.`);
  }
  m.elems.set(id, { id, nodes: nn, shape, ...at });
  selectNew(m, 'elem', id);
}

function curAttrs(m: ModelState) {
  const c = m.cur;
  return { type: c.type, mat: c.mat, real: c.real, secnum: c.secnum, esys: c.esys };
}

reg('E', (c, a) => {
  const nodes: Id[] = [];
  for (let i = 0; i < 20; i++) if (!a.isBlank(i)) nodes.push(a.int(i));
  if (!nodes.length) throw new ApdlError('E_NODES', 'E: no nodes given.');
  makeElem(c, nextId(c.m, 'elem'), nodes, curAttrs(c.m));
}, [...PREP]);
reg('EN', (c, a) => {
  const id = a.int(0);
  const nodes: Id[] = [];
  for (let i = 1; i < 21; i++) if (!a.isBlank(i)) nodes.push(a.int(i));
  makeElem(c, id || nextId(c.m, 'elem'), nodes, curAttrs(c.m));
}, [...PREP]);

function genElems(c: Ctx, a: Args, mode: 'EGEN' | 'ENGEN') {
  const m = c.m;
  const off = mode === 'ENGEN' ? 1 : 0;
  const iinc = mode === 'ENGEN' ? a.int(0) : 0;
  const itime = a.int(off + 0, 2), ninc = a.int(off + 1, 0);
  const src = a.entities('elem', off + 2).filter((id) => m.elems.has(id));
  if (!src.length) throw new ApdlError('EGEN_NONE', `${mode}: no existing elements in IEL1..IEL2.`);
  const minc = a.int(off + 5, 0), tinc = a.int(off + 6, 0), rinc = a.int(off + 7, 0), cinc = a.int(off + 8, 0), sinc = a.int(off + 9, 0);
  const dx = a.num(off + 10), dy = a.num(off + 11), dz = a.num(off + 12);
  const gen = dx !== 0 || dy !== 0 || dz !== 0;
  let made = 0, missing = 0;
  for (let i = 1; i < itime; i++) {
    for (const eid of src) {
      const e = m.elems.get(eid)!;
      const nodes = e.nodes.map((n) => n + ninc * i);
      let ok = true;
      for (let k = 0; k < nodes.length; k++) {
        if (m.nodes.has(nodes[k])) continue;
        if (gen) {
          const p = m.nodes.get(e.nodes[k])!.xyz;
          addNode(m, nodes[k], [p[0] + dx * i, p[1] + dy * i, p[2] + dz * i]);
        } else { ok = false; break; }
      }
      if (!ok) { missing++; continue; }
      const id = mode === 'ENGEN' && iinc ? eid + iinc * i : nextId(m, 'elem');
      m.elems.set(id, { id, nodes, shape: e.shape, type: e.type + tinc * i, mat: e.mat + minc * i, real: e.real + rinc * i, secnum: e.secnum + sinc * i, esys: e.esys + cinc * i });
      selectNew(m, 'elem', id);
      made++;
    }
  }
  if (missing) c.warn('EGEN_NODES', `${missing} element(s) were not generated because their nodes (offset by NINC=${ninc}) do not exist.`);
  c.out(` GENERATE ELEMENTS   ${made} NEW ELEMENTS   (MAXIMUM ELEMENT NUMBER ${m.elems.size ? Math.max(...m.elems.keys()) : 0})`);
}
reg('EGEN', (c, a) => genElems(c, a, 'EGEN'), [...PREP]);
reg('ENGEN', (c, a) => genElems(c, a, 'ENGEN'), [...PREP]);

reg('EDELE', (c, a) => {
  const m = c.m;
  for (const id of a.entities('elem', 0)) { m.elems.delete(id); m.sel.elem.delete(id); }
  m.bcs = m.bcs.filter((b) => b.kind !== 'SF' || m.elems.has(b.target));
}, [...PREP]);

reg('EMODIF', (c, a) => {
  const m = c.m;
  const ids = a.entities('elem', 0).filter((id) => m.elems.has(id));
  const what = a.lab(1);
  const key = ({ MAT: 'mat', TYPE: 'type', REAL: 'real', SECN: 'secnum', ESYS: 'esys' } as const)[what as 'MAT'];
  if (!key) throw new ApdlError('EMODIF', 'EMODIF: only MAT, TYPE, REAL, SECN and ESYS modifications are supported in the trainer.');
  for (const id of ids) m.elems.get(id)![key] = a.int(2, 1);
}, [...PREP]);

reg(['EINTF', 'ESURF'], (c) => c.note(`${c.cmd} is not supported by the trainer yet; no elements were created.`), [...PREP]);

export { selectedIds };
