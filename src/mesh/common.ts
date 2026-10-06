// Shared meshing infrastructure: divisions, node creation with topology-aware sharing, element creation.
import type { Element, ElemShape, EntityAttrs, Id, Line, ModelState, Vec3 } from '../model/types';
import { nextId, selectNew } from '../model/state';
import { areaKps, areaLines, volumeKps, volumeLines } from '../geometry/topo';
import { dist } from '../geometry/vec';
import { ApdlError } from '../apdl/diagnostics';
import { lookupElement } from './elements';

// ------------------------------------------------------------------ sizing
export function defaultSize(m: ModelState): number {
  let lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const k of m.kps.values()) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], k.xyz[i]); hi[i] = Math.max(hi[i], k.xyz[i]); }
  const d = isFinite(lo[0]) ? dist(lo, hi) : 1;
  return d / 20 || 1;
}

/** Target element size for a line (LESIZE > area/volume ESIZE > ESIZE > default). */
export function lineSize(m: ModelState, l: Line, entitySize?: number): number {
  if (l.mesh?.ndiv) return l.length / l.mesh.ndiv;
  if (l.mesh?.size) return l.mesh.size;
  if (entitySize) return entitySize;
  if (m.cur.esizeNdiv) return l.length / m.cur.esizeNdiv;
  if (m.cur.esize > 0) return m.cur.esize;
  return defaultSize(m);
}

export function lineDivisions(m: ModelState, l: Line, entitySize?: number): number {
  if (l.mesh?.ndiv) return Math.max(1, l.mesh.ndiv);
  if (!l.mesh?.size && !entitySize && m.cur.esizeNdiv) return Math.max(1, m.cur.esizeNdiv);
  const h = lineSize(m, l, entitySize);
  let n = Math.max(1, Math.ceil(l.length / h - 1e-6));
  if (l.kind === 'arc' && !l.mesh) {
    // ANSYS caps arc element angles; keep at least one element per 45 degrees
    const ang = l.arc ? l.length / Math.max(1e-12, l.arc.radius) : 0;
    n = Math.max(n, Math.ceil(ang / (Math.PI / 4) - 1e-6));
  }
  return n;
}

/** Parameters (0..1) of division points with optional spacing ratio (last/first). */
export function divisionParams(n: number, space = 1): number[] {
  const t = [0];
  if (!space || space === 1 || n === 1) {
    for (let i = 1; i <= n; i++) t.push(i / n);
    return t;
  }
  const r = Math.pow(Math.abs(space), 1 / Math.max(1, n - 1));
  let s = 0;
  const w: number[] = [];
  for (let i = 0; i < n; i++) { w.push(Math.pow(r, i)); s += w[i]; }
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += w[i] / s; t.push(acc); }
  t[n] = 1;
  return t;
}

/** Points along a line polyline at arc-length parameters. */
export function pointsAlong(l: Line, params: number[]): Vec3[] {
  const cum = [0];
  for (let i = 1; i < l.pts.length; i++) cum.push(cum[i - 1] + dist(l.pts[i - 1], l.pts[i]));
  const L = cum[cum.length - 1];
  return params.map((t) => {
    const s = t * L;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1];
    const u = seg > 0 ? (s - cum[i - 1]) / seg : 0;
    const a = l.pts[i - 1], b = l.pts[i];
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u] as Vec3;
  });
}

// ------------------------------------------------------------------ topology closure (for node sharing)
export function closureOf(m: ModelState, key: string): Set<string> {
  const s = new Set<string>([key]);
  const kind = key[0];
  const id = Number(key.slice(1));
  if (kind === 'V') {
    const v = m.volus.get(id);
    if (v) {
      v.areas.forEach((a) => s.add(`A${a}`));
      volumeLines(m, v).forEach((l) => s.add(`L${l}`));
      volumeKps(m, v).forEach((k) => s.add(`K${k}`));
    }
  } else if (kind === 'A') {
    const a = m.areas.get(id);
    if (a) {
      areaLines(a).forEach((l) => s.add(`L${l}`));
      areaKps(m, a).forEach((k) => s.add(`K${k}`));
    }
  } else if (kind === 'L') {
    const l = m.lines.get(id);
    if (l) l.kps.forEach((k) => s.add(`K${k}`));
  }
  return s;
}

/** Creates nodes for one meshing operation, reusing coincident nodes of topologically connected entities. */
export class NodeMaker {
  private grid = new Map<string, Id[]>();
  private closureCache = new Map<string, Set<string>>();
  readonly created: Id[] = [];
  constructor(private m: ModelState, private tol: number) {
    for (const n of m.nodes.values()) this.index(n.id, n.xyz);
  }
  private key(p: Vec3, dx = 0, dy = 0, dz = 0) {
    const c = this.tol * 8;
    return `${Math.floor(p[0] / c) + dx},${Math.floor(p[1] / c) + dy},${Math.floor(p[2] / c) + dz}`;
  }
  private index(id: Id, p: Vec3) {
    const k = this.key(p);
    const arr = this.grid.get(k);
    if (arr) arr.push(id); else this.grid.set(k, [id]);
  }
  private closure(k: string) {
    let c = this.closureCache.get(k);
    if (!c) { c = closureOf(this.m, k); this.closureCache.set(k, c); }
    return c;
  }
  private connected(a: string, b: string) {
    if (a === b) return true;
    const ca = this.closure(a), cb = this.closure(b);
    for (const x of ca) if (cb.has(x)) return true;
    return false;
  }
  /** Node at p owned by entity `owner` ("V3", "A2", "L5", "K1"). */
  node(p: Vec3, owner: string): Id {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const arr = this.grid.get(this.key(p, dx, dy, dz));
      if (!arr) continue;
      for (const id of arr) {
        const n = this.m.nodes.get(id);
        if (!n || dist(n.xyz, p) > this.tol) continue;
        const o = this.m.nodeOwner.get(id);
        if (o && this.connected(o, owner)) return id;
      }
    }
    const id = nextId(this.m, 'node');
    this.m.nodes.set(id, { id, xyz: [p[0], p[1], p[2]] });
    this.m.nodeOwner.set(id, owner);
    selectNew(this.m, 'node', id);
    this.index(id, p);
    this.created.push(id);
    return id;
  }
}

export function meshTol(m: ModelState): number {
  return Math.max(1e-7, defaultSize(m) * 20 * 1e-6);
}

// ------------------------------------------------------------------ elements
export function resolveAttrs(m: ModelState, ent?: Partial<EntityAttrs>): EntityAttrs {
  return {
    type: ent?.type ?? m.cur.type,
    mat: ent?.mat ?? m.cur.mat,
    real: ent?.real ?? m.cur.real,
    secnum: ent?.secnum ?? m.cur.secnum,
    esys: ent?.esys ?? m.cur.esys,
  };
}

export function requireType(m: ModelState, type: Id, cats: string[], what: string) {
  const et = m.etypes.get(type);
  if (!et) throw new ApdlError('ETYPE_UNDEFINED', `Element type ${type} is not defined.  Define it with ET before meshing ${what}.`);
  if (!cats.includes(et.category)) {
    const need = cats.includes('solid') ? 'a 3-D solid element' : cats.includes('shell') ? 'an area (shell/plane) element' : cats.includes('beam') ? 'a line element (beam/link/spring)' : 'a point element';
    throw new ApdlError('ETYPE_WRONG', `Element type ${type} (${et.ename}) is not ${need}.  ${what} not meshed.  Check TYPE / xATT.`);
  }
  return et;
}

export function addElement(m: ModelState, nodes: Id[], shape: ElemShape, at: EntityAttrs, parent?: Element['parent']): Element {
  const e: Element = { id: nextId(m, 'elem'), nodes, shape, type: at.type, mat: at.mat, real: at.real, secnum: at.secnum, esys: at.esys };
  if (parent) e.parent = parent;
  m.elems.set(e.id, e);
  selectNew(m, 'elem', e.id);
  return e;
}

/** Element edges (corner index pairs) per shape for midside node generation. */
export const EDGES: Record<string, [number, number][]> = {
  hex: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]],
  wedge: [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3], [0, 3], [1, 4], [2, 5]],
  tet: [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]],
  pyramid: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]],
  quad: [[0, 1], [1, 2], [2, 3], [3, 0]],
  tri: [[0, 1], [1, 2], [2, 0]],
  line: [[0, 1]],
};

/** Append midside nodes to quadratic elements created in this operation. */
export function addMidsides(m: ModelState, elems: Element[], maker: NodeMaker, owner: (e: Element) => string) {
  for (const e of elems) {
    const et = m.etypes.get(e.type);
    const def = et && lookupElement(et.ename);
    if (!def?.midside) continue;
    const edges = EDGES[e.shape];
    if (!edges) continue;
    const extra: Id[] = [];
    for (const [i, j] of edges) {
      const a = m.nodes.get(e.nodes[i])!.xyz, b = m.nodes.get(e.nodes[j])!.xyz;
      extra.push(maker.node([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], owner(e)));
    }
    e.nodes = [...e.nodes, ...extra];
  }
}

/** Split a hex (8 corner ids) into 6 tets (Kuhn subdivision, conforming on shared faces of a structured grid). */
export function hexToTets(h: Id[]): Id[][] {
  const [n0, n1, n2, n3, n4, n5, n6, n7] = h;
  return [
    [n0, n1, n2, n6], [n0, n2, n3, n6], [n0, n3, n7, n6],
    [n0, n7, n4, n6], [n0, n4, n5, n6], [n0, n5, n1, n6],
  ];
}

/** Split a wedge [b0,b1,b2,t0,t1,t2] into 3 tets. */
export function wedgeToTets(w: Id[]): Id[][] {
  const [a, b, c, d, e, f] = w;
  return [[a, b, c, f], [a, b, f, e], [a, e, f, d]];
}

export function meshSummary(m: ModelState, what: string, count: number): string {
  let mn = 0, me = 0;
  for (const k of m.nodes.keys()) mn = Math.max(mn, k);
  for (const k of m.elems.keys()) me = Math.max(me, k);
  return ` NUMBER OF ${what} MESHED     =  ${count}\n MAXIMUM NODE NUMBER          =  ${mn}\n MAXIMUM ELEMENT NUMBER       =  ${me}`;
}
