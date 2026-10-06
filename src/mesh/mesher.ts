// VMESH / VSWEEP / AMESH / LMESH / KMESH implementations.
import type { Area, Element, EntityAttrs, Id, Line, ModelState, Vec3, Volume } from '../model/types';
import { ApdlError } from '../apdl/diagnostics';
import {
  addElement, addMidsides, defaultSize, divisionParams, hexToTets, lineDivisions, lineSize, meshTol, NodeMaker, pointsAlong,
  requireType, resolveAttrs, wedgeToTets,
} from './common';
import { gridMesh2D, isRectilinear, tfiMesh2D, triMesh2D, type Mesh2D } from './mesh2d';
import { areaLines, isMeshed, linePts, planeFrame, to2D, from2D, vtx, type PlaneFrame } from '../geometry/topo';
import { add, cross, dist, dot, len, norm, rotateAbout, scale, sub } from '../geometry/vec';
import { getKernel } from '../geometry/kernel';

type P2 = [number, number];

import { insideSolid } from '../geometry/inside';
export { insideSolid };

// ------------------------------------------------------------------ helpers
function axisAligned(m: ModelState, v: Volume): boolean {
  for (const aid of v.areas) {
    const a = m.areas.get(aid)!;
    if (a.surface.kind !== 'plane') return false;
    const n = a.surface.normal;
    const big = Math.max(Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2]));
    if (Math.abs(big - 1) > 1e-9) return false;
  }
  return true;
}

/** Connected groups of volumes sharing areas. */
function glueGroups(m: ModelState): Map<Id, Id[]> {
  const parent = new Map<Id, Id>();
  const find = (x: Id): Id => { while (parent.get(x) !== x) x = parent.get(x)!; return x; };
  for (const id of m.volus.keys()) parent.set(id, id);
  const areaOwner = new Map<Id, Id>();
  for (const v of m.volus.values()) for (const a of v.areas) {
    const o = areaOwner.get(a);
    if (o === undefined) areaOwner.set(a, v.id);
    else { const ra = find(o), rb = find(v.id); if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb)); }
  }
  const groups = new Map<Id, Id[]>();
  for (const id of m.volus.keys()) {
    const r = find(id);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(id);
  }
  return groups;
}

function uniq(vals: number[], tol: number) {
  const s = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

interface VolMeshCtx {
  m: ModelState;
  maker: NodeMaker;
  tet: boolean;
  created: Element[];
  notes: string[];
}

function emitSolid(ctx: VolMeshCtx, nodes: Id[], shape: 'hex' | 'wedge', at: EntityAttrs, vid: Id) {
  const parent = { kind: 'volu' as const, id: vid };
  const etName = ctx.m.etypes.get(at.type)?.ename ?? '';
  const forceTet = ctx.tet || etName === 'SOLID187';
  if (forceTet) {
    const tets = shape === 'hex' ? hexToTets(nodes) : wedgeToTets(nodes);
    for (const t of tets) if (new Set(t).size === 4) ctx.created.push(addElement(ctx.m, t, 'tet', at, parent));
    return;
  }
  ctx.created.push(addElement(ctx.m, nodes, shape, at, parent));
}

// ------------------------------------------------------------------ grid hex mesher (axis-aligned glue groups)
function gridHex(ctx: VolMeshCtx, group: Volume[], toMesh: Set<Id>) {
  const m = ctx.m;
  const tol = meshTol(m) * 10;
  const kps = new Set<Id>();
  const lines = new Set<Id>();
  for (const v of group) for (const aid of v.areas) for (const lid of areaLines(m.areas.get(aid)!)) {
    lines.add(lid);
    const l = m.lines.get(lid)!;
    kps.add(l.kps[0]); kps.add(l.kps[1]);
  }
  const breaks: number[][] = [0, 1, 2].map((ax) => uniq([...kps].map((k) => m.kps.get(k)!.xyz[ax]), tol));
  // size along each interval from overlapping axis-parallel lines
  const axLines: { ax: number; lo: number; hi: number; h: number; ndivFixed?: number; len: number }[] = [];
  for (const lid of lines) {
    const l = m.lines.get(lid)!;
    if (l.kind !== 'straight') continue;
    const d = sub(l.pts[1], l.pts[0]);
    for (let ax = 0; ax < 3; ax++) {
      const o = [0, 1, 2].filter((x) => x !== ax);
      if (Math.abs(d[o[0]]) < tol && Math.abs(d[o[1]]) < tol) {
        const vsize = group.find((v) => v.esize)?.esize;
        axLines.push({ ax, lo: Math.min(l.pts[0][ax], l.pts[1][ax]), hi: Math.max(l.pts[0][ax], l.pts[1][ax]), h: lineSize(m, l, vsize), len: l.length });
      }
    }
  }
  const fallbackH = m.cur.esize > 0 ? m.cur.esize : defaultSize(m);
  const fine: number[][] = breaks.map((bk, ax) => {
    const out = [bk[0]];
    for (let i = 0; i < bk.length - 1; i++) {
      const a = bk[i], b = bk[i + 1];
      let h = Infinity;
      for (const L of axLines) if (L.ax === ax && L.lo <= a + tol && L.hi >= b - tol) h = Math.min(h, L.h);
      if (!isFinite(h)) h = fallbackH;
      const n = Math.max(1, Math.ceil((b - a) / h - 1e-6));
      for (let j = 1; j <= n; j++) out.push(a + ((b - a) * j) / n);
    }
    return out;
  });
  // coarse cell ownership
  const [BX, BY, BZ] = breaks;
  const owner = new Int32Array((BX.length - 1) * (BY.length - 1) * (BZ.length - 1));
  const cidx = (i: number, j: number, k: number) => (k * (BY.length - 1) + j) * (BX.length - 1) + i;
  for (let k = 0; k < BZ.length - 1; k++) for (let j = 0; j < BY.length - 1; j++) for (let i = 0; i < BX.length - 1; i++) {
    const p: Vec3 = [(BX[i] + BX[i + 1]) / 2, (BY[j] + BY[j + 1]) / 2, (BZ[k] + BZ[k + 1]) / 2];
    let o = 0;
    for (const v of group) if (insideSolid(v, p)) { o = v.id; break; }
    owner[cidx(i, j, k)] = o;
  }
  // map fine index -> coarse index
  const coarseOf = fine.map((F, ax) => {
    const B = breaks[ax];
    const out = new Int32Array(F.length - 1);
    let c = 0;
    for (let i = 0; i < F.length - 1; i++) {
      const mid = (F[i] + F[i + 1]) / 2;
      while (c < B.length - 2 && B[c + 1] < mid) c++;
      out[i] = c;
    }
    return out;
  });
  const [FX, FY, FZ] = fine;
  const cache = new Map<number, Id>();
  const NX = FX.length, NY = FY.length;
  const nodeAt = (i: number, j: number, k: number, vid: Id) => {
    const key = (k * NY + j) * NX + i;
    let n = cache.get(key);
    if (n === undefined) { n = ctx.maker.node([FX[i], FY[j], FZ[k]], `V${vid}`); cache.set(key, n); }
    return n;
  };
  const attrsOf = new Map<Id, EntityAttrs>();
  for (const v of group) if (toMesh.has(v.id)) attrsOf.set(v.id, resolveAttrs(m, v.attrs));
  for (let k = 0; k < FZ.length - 1; k++) for (let j = 0; j < FY.length - 1; j++) for (let i = 0; i < FX.length - 1; i++) {
    const vid = owner[cidx(coarseOf[0][i], coarseOf[1][j], coarseOf[2][k])];
    if (!vid || !toMesh.has(vid)) continue;
    const n = [
      nodeAt(i, j, k, vid), nodeAt(i + 1, j, k, vid), nodeAt(i + 1, j + 1, k, vid), nodeAt(i, j + 1, k, vid),
      nodeAt(i, j, k + 1, vid), nodeAt(i + 1, j, k + 1, vid), nodeAt(i + 1, j + 1, k + 1, vid), nodeAt(i, j + 1, k + 1, vid),
    ];
    emitSolid(ctx, n, 'hex', attrsOf.get(vid)!, vid);
  }
}

// ------------------------------------------------------------------ 2-D meshing of planar areas
interface Region2D {
  frame: PlaneFrame;
  rings: P2[][]; // boundary division points
  rawRings: P2[][]; // exact geometry polyline
  lines: Line[];
  h: number;
}

/** Boundary of a set of coplanar areas as rings of line-division points. */
function regionFor(m: ModelState, areas: Area[], hDefault: number, frame?: PlaneFrame): Region2D {
  const a0 = areas[0];
  const s = a0.surface as Extract<Area['surface'], { kind: 'plane' }>;
  const f: PlaneFrame = frame ?? { origin: s.origin, normal: s.normal, u: s.u, v: s.v };
  // boundary lines = lines used once among the areas
  const use = new Map<number, number>();
  for (const a of areas) for (const loop of a.loops) for (const sgn of loop) use.set(Math.abs(sgn), (use.get(Math.abs(sgn)) ?? 0) + 1);
  const rings: P2[][] = [];
  const rawRings: P2[][] = [];
  const lines: Line[] = [];
  for (const a of areas) for (const loop of a.loops) {
    const ring: P2[] = [];
    const raw: P2[] = [];
    let isBoundary = false;
    for (const sgn of loop) {
      const l = m.lines.get(Math.abs(sgn))!;
      if (use.get(l.id) === 1) isBoundary = true;
      lines.push(l);
      const n = lineDivisions(m, l, a.esize);
      const pts = pointsAlong(l, divisionParams(n, l.mesh?.space));
      const seq = sgn > 0 ? pts : [...pts].reverse();
      for (let i = 0; i < seq.length - 1; i++) ring.push(to2D(f, seq[i]));
      const lp = linePts(m, sgn);
      for (let i = 0; i < lp.length - 1; i++) raw.push(to2D(f, lp[i]));
    }
    if (isBoundary || areas.length === 1) { rings.push(ring); rawRings.push(raw); }
  }
  let h = Infinity;
  for (const l of lines) h = Math.min(h, lineSize(m, l, a0.esize));
  if (!isFinite(h)) h = hDefault;
  return { frame: f, rings, rawRings, lines, h };
}

function mesh2DFor(m: ModelState, reg: Region2D, area: Area | null, preferTri: boolean): Mesh2D {
  const tol = meshTol(m) * 10;
  // 1) single 4-sided area with matching opposite divisions -> mapped quads
  if (!preferTri && area && area.loops.length === 1 && area.loops[0].length === 4) {
    const seqs = area.loops[0].map((sgn) => {
      const l = m.lines.get(Math.abs(sgn))!;
      const pts = pointsAlong(l, divisionParams(lineDivisions(m, l, area.esize), l.mesh?.space)).map((p) => to2D(reg.frame, p));
      return sgn > 0 ? pts : pts.reverse();
    });
    const [s0, s1, s2, s3] = seqs;
    if (s0.length === s2.length && s1.length === s3.length) {
      const r = tfiMesh2D(s0, s1, [...s2].reverse(), [...s3].reverse());
      if (r) return r;
    }
  }
  // 2) rectilinear region -> grid
  if (!preferTri && isRectilinear(reg.rawRings, tol)) {
    return gridMesh2D(reg.rawRings, tol, (ax, a, b) => {
      let h = Infinity;
      for (const l of reg.lines) {
        if (l.kind !== 'straight') continue;
        const p0 = to2D(reg.frame, l.pts[0]), p1 = to2D(reg.frame, l.pts[1]);
        const o = 1 - ax;
        if (Math.abs(p0[o] - p1[o]) > tol) continue;
        const lo = Math.min(p0[ax], p1[ax]), hi = Math.max(p0[ax], p1[ax]);
        if (lo <= a + tol && hi >= b - tol) h = Math.min(h, lineSize(m, l, area?.esize));
      }
      return isFinite(h) ? h : reg.h;
    });
  }
  // 3) free triangles
  return triMesh2D(reg.rings, reg.h);
}

// ------------------------------------------------------------------ prism / sweep mesher
interface PrismInfo { dir: Vec3; caps: Area[]; height: number }

function detectPrism(m: ModelState, v: Volume): PrismInfo | null {
  const cands: Vec3[] = [];
  if (v.gen?.kind === 'prism') cands.push(v.gen.dir);
  for (const aid of v.areas) { const a = m.areas.get(aid)!; if (a.surface.kind === 'plane') cands.push(a.surface.normal); }
  for (const d0 of cands) {
    const d = norm(d0);
    const levels = new Map<number, Area[]>();
    let ok = true;
    for (const aid of v.areas) {
      const a = m.areas.get(aid)!;
      if (a.surface.kind === 'plane' && Math.abs(Math.abs(dot(a.surface.normal, d)) - 1) < 1e-7) {
        const lv = Math.round(dot(a.centroid, d) * 1e7) / 1e7;
        let key: number | undefined;
        for (const k of levels.keys()) if (Math.abs(k - lv) < 1e-6 * Math.max(1, Math.abs(lv))) key = k;
        if (key === undefined) levels.set(lv, [a]); else levels.get(key)!.push(a);
        continue;
      }
      // side faces: every triangle normal perpendicular to d
      const t = a.tess;
      for (let i = 0; i < t.idx.length && ok; i += 3) {
        const p0 = vtx(t, t.idx[i]), p1 = vtx(t, t.idx[i + 1]), p2 = vtx(t, t.idx[i + 2]);
        const n = cross(sub(p1, p0), sub(p2, p0));
        const l = len(n);
        if (l > 1e-14 && Math.abs(dot(n, d)) / l > 1e-6) ok = false;
      }
      if (!ok) break;
    }
    if (!ok || levels.size !== 2) continue;
    const [k0, k1] = [...levels.keys()].sort((a, b) => a - b);
    return { dir: d, caps: levels.get(k0)!, height: k1 - k0 };
  }
  return null;
}

interface SweepStage { kind: 'translate'; d: Vec3; n: number } // translation in n layers
type RotStage = { kind: 'rotate'; o: Vec3; k: Vec3; ang: number; n: number };

function sweepMesh(ctx: VolMeshCtx, v: Volume, srcAreas: Area[], stages: (SweepStage | RotStage)[], at: EntityAttrs) {
  for (const src of srcAreas) sweepMeshOne(ctx, v, src, stages, at);
}

function sweepMeshOne(ctx: VolMeshCtx, v: Volume, src: Area, stages: (SweepStage | RotStage)[], at: EntityAttrs) {
  const m = ctx.m;
  const s = src.surface as Extract<Area['surface'], { kind: 'plane' }>;
  const frame: PlaneFrame = { origin: s.origin, normal: s.normal, u: s.u, v: s.v };
  const reg = regionFor(m, [src], defaultSize(m), frame);
  const mesh = mesh2DFor(m, reg, src, false);
  const base: Vec3[] = mesh.pts.map((p) => from2D(frame, p));
  // first-stage direction decides orientation
  const st0 = stages[0];
  const dir0 = st0.kind === 'translate' ? st0.d : (() => { const c = base[0] ?? s.origin; const t = sub(c, st0.o); return cross(st0.k, t); })();
  const flip = dot(frame.normal, dir0) < 0;
  const layers: Vec3[][] = [base];
  let cur = base;
  for (const st of stages) {
    for (let i = 1; i <= st.n; i++) {
      const next = cur.map((p) => st.kind === 'translate' ? add(p, scale(st.d, i / st.n)) : rotateAbout(p, st.o, st.k, (st.ang * i) / st.n));
      layers.push(next);
    }
    cur = layers[layers.length - 1];
  }
  const owner = `V${v.id}`;
  const ids: Id[][] = layers.map((L) => L.map((p) => ctx.maker.node(p, owner)));
  for (let l = 0; l < layers.length - 1; l++) {
    const A = ids[l], B = ids[l + 1];
    for (const q of mesh.quads) {
      const qq = flip ? [q[0], q[3], q[2], q[1]] : q;
      emitSolid(ctx, [A[qq[0]], A[qq[1]], A[qq[2]], A[qq[3]], B[qq[0]], B[qq[1]], B[qq[2]], B[qq[3]]], 'hex', at, v.id);
    }
    for (const t of mesh.tris) {
      const tt = flip ? [t[0], t[2], t[1]] : t;
      emitSolid(ctx, [A[tt[0]], A[tt[1]], A[tt[2]], B[tt[0]], B[tt[1]], B[tt[2]]], 'wedge', at, v.id);
    }
  }
}

function layersFor(m: ModelState, v: Volume, length: number, dir?: Vec3): number {
  // use divisions of volume lines parallel to the sweep direction
  let best = 0;
  if (dir) {
    const seen = new Set<Id>();
    for (const aid of v.areas) for (const lid of areaLines(m.areas.get(aid)!)) {
      if (seen.has(lid)) continue;
      seen.add(lid);
      const l = m.lines.get(lid)!;
      if (l.kind !== 'straight') continue;
      const d = sub(l.pts[1], l.pts[0]);
      if (len(cross(norm(d), dir)) < 1e-7 && Math.abs(l.length - length) < 1e-6 * Math.max(1, length)) best = Math.max(best, lineDivisions(m, l, v.esize));
    }
  }
  if (best) return best;
  const h = v.esize || (m.cur.esize > 0 ? m.cur.esize : defaultSize(m));
  return Math.max(1, Math.ceil(length / h - 1e-6));
}

// ------------------------------------------------------------------ voxel fallback
function voxelMesh(ctx: VolMeshCtx, v: Volume, at: EntityAttrs) {
  const m = ctx.m;
  const h = v.esize || (m.cur.esize > 0 ? m.cur.esize : defaultSize(m));
  const b = v.bbox;
  const n = [0, 1, 2].map((i) => Math.max(1, Math.ceil((b.max[i] - b.min[i]) / h - 1e-6)));
  if (n[0] * n[1] * n[2] > 400000) throw new ApdlError('MESH_TOO_BIG', `Volume ${v.id}: element size ${h} would create too many elements for the trainer. Increase ESIZE.`);
  const step = [0, 1, 2].map((i) => (b.max[i] - b.min[i]) / n[i]);
  const cache = new Map<string, Id>();
  const node = (i: number, j: number, k: number) => {
    const key = `${i},${j},${k}`;
    let id = cache.get(key);
    if (id === undefined) { id = ctx.maker.node([b.min[0] + i * step[0], b.min[1] + j * step[1], b.min[2] + k * step[2]], `V${v.id}`); cache.set(key, id); }
    return id;
  };
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    const c: Vec3 = [b.min[0] + (i + 0.5) * step[0], b.min[1] + (j + 0.5) * step[1], b.min[2] + (k + 0.5) * step[2]];
    if (!insideSolid(v, c)) continue;
    emitSolid(ctx, [node(i, j, k), node(i + 1, j, k), node(i + 1, j + 1, k), node(i, j + 1, k), node(i, j, k + 1), node(i + 1, j, k + 1), node(i + 1, j + 1, k + 1), node(i, j + 1, k + 1)], 'hex', at, v.id);
  }
  ctx.notes.push(`Volume ${v.id} has no sweepable topology; a voxel (stair-step) mesh was used.  Element counts are approximate.`);
}

// ------------------------------------------------------------------ public: VMESH / VSWEEP
export function meshVolumes(m: ModelState, vids: Id[], opts: { sweep?: boolean } = {}): { count: number; notes: string[]; elems: number } {
  const notes: string[] = [];
  const todo = vids.filter((id) => {
    if (!m.volus.has(id)) return false;
    if (isMeshed(m, 'volu', id)) { notes.push(`Volume ${id} is already meshed.`); return false; }
    return true;
  });
  if (!todo.length) return { count: 0, notes, elems: 0 };
  for (const id of todo) {
    const v = m.volus.get(id)!;
    requireType(m, resolveAttrs(m, v.attrs).type, ['solid'], `Volume ${id}`);
  }
  const ctx: VolMeshCtx = { m, maker: new NodeMaker(m, meshTol(m)), tet: m.cur.mshape === 1 && !opts.sweep, created: [], notes };
  const groups = glueGroups(m);
  const toMesh = new Set(todo);
  const handled = new Set<Id>();
  for (const members of groups.values()) {
    const mine = members.filter((id) => toMesh.has(id));
    if (!mine.length) continue;
    const vols = members.map((id) => m.volus.get(id)!);
    if (vols.every((v) => axisAligned(m, v))) {
      gridHex(ctx, vols, new Set(mine));
      mine.forEach((id) => handled.add(id));
      continue;
    }
    for (const id of mine) {
      const v = m.volus.get(id)!;
      const at = resolveAttrs(m, v.attrs);
      if (axisAligned(m, v)) { gridHex(ctx, [v], new Set([id])); handled.add(id); continue; }
      const pr = detectPrism(m, v);
      if (pr) {
        const n = layersFor(m, v, pr.height, pr.dir);
        sweepMesh(ctx, v, pr.caps, [{ kind: 'translate', d: scale(pr.dir, pr.height), n }], at);
        handled.add(id);
        continue;
      }
      if (v.gen?.kind === 'revolve' && m.areas.has(v.gen.srcArea) && v.areas.includes(v.gen.srcArea)) {
        const src = m.areas.get(v.gen.srcArea)!;
        if (src.surface.kind === 'plane') {
          const g = v.gen;
          let rmax = 0;
          for (let i = 0; i < src.tess.pos.length; i += 3) {
            const p: Vec3 = [src.tess.pos[i], src.tess.pos[i + 1], src.tess.pos[i + 2]];
            const w = sub(p, g.axisPt);
            rmax = Math.max(rmax, len(sub(w, scale(g.axisDir, dot(w, g.axisDir)))));
          }
          const ang = (g.angleDeg * Math.PI) / 180;
          const h = v.esize || (m.cur.esize > 0 ? m.cur.esize : defaultSize(m));
          const n = Math.max(Math.ceil(Math.abs(ang) / (Math.PI / 8) - 1e-6), Math.ceil((Math.abs(ang) * rmax) / h - 1e-6));
          // the source cap must be the face at angle 0 of this volume
          sweepMesh(ctx, v, [src], [{ kind: 'rotate', o: g.axisPt, k: norm(g.axisDir), ang, n }], at);
          handled.add(id);
          continue;
        }
      }
      if (v.gen?.kind === 'drag' && m.areas.has(v.gen.srcArea)) {
        const src = m.areas.get(v.gen.srcArea)!;
        if (src.surface.kind === 'plane' && v.areas.includes(src.id)) {
          const stages = dragStages(m, v, v.gen.path, src);
          if (stages) { sweepMesh(ctx, v, [src], stages, at); handled.add(id); continue; }
        }
      }
      if (opts.sweep) throw new ApdlError('SWEEP_FAIL', `Volume ${id} cannot be swept: it has no prismatic topology (source/target faces with matching side areas).  Use VMESH with MSHAPE,1,3D.`);
      voxelMesh(ctx, v, at);
      handled.add(id);
    }
  }
  addMidsides(m, ctx.created, ctx.maker, (e) => `V${e.parent?.id ?? 0}`);
  return { count: handled.size, notes, elems: ctx.created.length };
}

function dragStages(m: ModelState, v: Volume, path: Id[], src: Area): (SweepStage | RotStage)[] | null {
  const h = v.esize || (m.cur.esize > 0 ? m.cur.esize : defaultSize(m));
  const out: (SweepStage | RotStage)[] = [];
  let at = src.centroid;
  const remaining = [...path];
  // order path lines from the source area outwards
  while (remaining.length) {
    let bi = -1, rev = false, bd = Infinity;
    remaining.forEach((lid, i) => {
      const l = m.lines.get(lid);
      if (!l) return;
      const d0 = dist(l.pts[0], at), d1 = dist(l.pts[l.pts.length - 1], at);
      if (d0 < bd) { bd = d0; bi = i; rev = false; }
      if (d1 < bd) { bd = d1; bi = i; rev = true; }
    });
    if (bi < 0) return null;
    const l = m.lines.get(remaining.splice(bi, 1)[0])!;
    const pts = rev ? [...l.pts].reverse() : l.pts;
    const n = lineDivisions(m, l, v.esize) || Math.max(1, Math.ceil(l.length / h));
    if (l.kind === 'arc' && l.arc) {
      const axis = rev ? scale(l.arc.axis, -1) : l.arc.axis;
      const v0 = sub(pts[0], l.arc.center), v1 = sub(pts[pts.length - 1], l.arc.center);
      let ang = Math.atan2(dot(cross(v0, v1), axis), dot(v0, v1));
      if (ang <= 1e-12) ang += 2 * Math.PI;
      out.push({ kind: 'rotate', o: l.arc.center, k: axis, ang, n });
    } else if (l.kind === 'straight') out.push({ kind: 'translate', d: sub(pts[pts.length - 1], pts[0]), n });
    else return null;
    at = pts[pts.length - 1];
  }
  return out;
}

// ------------------------------------------------------------------ AMESH
export function meshAreas(m: ModelState, aids: Id[]): { count: number; notes: string[]; elems: number } {
  const notes: string[] = [];
  const maker = new NodeMaker(m, meshTol(m));
  const created: Element[] = [];
  let count = 0;
  for (const id of aids) {
    const a = m.areas.get(id);
    if (!a) continue;
    if (isMeshed(m, 'area', id)) { notes.push(`Area ${id} is already meshed.`); continue; }
    const at = resolveAttrs(m, a.attrs);
    requireType(m, at.type, ['shell', 'surf'], `Area ${id}`);
    const owner = `A${id}`;
    const parent = { kind: 'area' as const, id };
    const preferTri = m.cur.mshape === 1;
    if (a.surface.kind === 'plane') {
      const reg = regionFor(m, [a], defaultSize(m));
      const mesh = mesh2DFor(m, reg, a, preferTri);
      const nid = mesh.pts.map((p) => maker.node(from2D(reg.frame, p), owner));
      for (const q of mesh.quads) {
        if (preferTri) {
          created.push(addElement(m, [nid[q[0]], nid[q[1]], nid[q[2]]], 'tri', at, parent));
          created.push(addElement(m, [nid[q[0]], nid[q[2]], nid[q[3]]], 'tri', at, parent));
        } else created.push(addElement(m, q.map((i) => nid[i]), 'quad', at, parent));
      }
      for (const t of mesh.tris) created.push(addElement(m, t.map((i) => nid[i]), 'tri', at, parent));
    } else if (a.loops.length === 1 && a.loops[0].length === 4) {
      // mapped mesh on a curved 4-sided area: TFI in 3-D on boundary division points
      const seqs = a.loops[0].map((sgn) => {
        const l = m.lines.get(Math.abs(sgn))!;
        const pts = pointsAlong(l, divisionParams(lineDivisions(m, l, a.esize), l.mesh?.space));
        return sgn > 0 ? pts : pts.reverse();
      });
      const [s0, s1, s2, s3] = seqs;
      if (s0.length !== s2.length || s1.length !== s3.length) {
        triFromTess(m, a, at, parent, owner, maker, created);
        notes.push(`Area ${id}: opposite sides have different divisions; the area tessellation was used as a free mesh.`);
      } else {
        const nu = s0.length - 1, nv = s1.length - 1;
        const top = [...s2].reverse(), left = [...s3].reverse();
        const grid: Id[][] = [];
        for (let j = 0; j <= nv; j++) {
          const row: Id[] = [];
          for (let i = 0; i <= nu; i++) {
            const u = i / nu, w = j / nv;
            let p: Vec3;
            if (j === 0) p = s0[i]; else if (j === nv) p = top[i]; else if (i === 0) p = left[j]; else if (i === nu) p = s1[j];
            else {
              const c = (k: number) => (1 - w) * s0[i][k] + w * top[i][k] + (1 - u) * left[j][k] + u * s1[j][k]
                - ((1 - u) * (1 - w) * s0[0][k] + u * (1 - w) * s0[nu][k] + (1 - u) * w * top[0][k] + u * w * top[nu][k]);
              p = [c(0), c(1), c(2)];
              if (a.surface.kind === 'cyl') {
                const s = a.surface;
                const r = sub(p, s.origin);
                const ax = scale(s.axis, dot(r, s.axis));
                const radial = sub(r, ax);
                const rl = len(radial);
                if (rl > 0) p = add(add(s.origin, ax), scale(radial, s.radius / rl));
              }
            }
            row.push(maker.node(p, owner));
          }
          grid.push(row);
        }
        for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
          const q = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
          if (preferTri) {
            created.push(addElement(m, [q[0], q[1], q[2]], 'tri', at, parent));
            created.push(addElement(m, [q[0], q[2], q[3]], 'tri', at, parent));
          } else created.push(addElement(m, q, 'quad', at, parent));
        }
      }
    } else {
      triFromTess(m, a, at, parent, owner, maker, created);
      notes.push(`Area ${id} is curved and not 4-sided; its tessellation was used as a coarse triangle mesh.`);
    }
    count++;
  }
  addMidsides(m, created, maker, (e) => `A${e.parent?.id ?? 0}`);
  return { count, notes, elems: created.length };
}

function triFromTess(m: ModelState, a: Area, at: EntityAttrs, parent: Element['parent'], owner: string, maker: NodeMaker, out: Element[]) {
  const t = a.tess;
  const ids: Id[] = [];
  for (let i = 0; i < t.pos.length / 3; i++) ids.push(maker.node(vtx(t, i), owner));
  for (let i = 0; i < t.idx.length; i += 3) {
    const tri = [ids[t.idx[i]], ids[t.idx[i + 1]], ids[t.idx[i + 2]]];
    if (new Set(tri).size === 3) out.push(addElement(m, tri, 'tri', at, parent));
  }
}

// ------------------------------------------------------------------ LMESH / KMESH
export function meshLines(m: ModelState, lids: Id[]): { count: number; notes: string[]; elems: number } {
  const notes: string[] = [];
  const maker = new NodeMaker(m, meshTol(m));
  const created: Element[] = [];
  let count = 0;
  for (const id of lids) {
    const l = m.lines.get(id);
    if (!l) continue;
    if (isMeshed(m, 'line', id)) { notes.push(`Line ${id} is already meshed.`); continue; }
    const at = resolveAttrs(m, l.attrs);
    requireType(m, at.type, ['beam', 'link', 'spring'], `Line ${id}`);
    const n = lineDivisions(m, l);
    const pts = pointsAlong(l, divisionParams(n, l.mesh?.space));
    const nodes = pts.map((p) => maker.node(p, `L${id}`));
    for (let i = 0; i < n; i++) created.push(addElement(m, [nodes[i], nodes[i + 1]], 'line', at, { kind: 'line', id }));
    count++;
  }
  addMidsides(m, created, maker, (e) => `L${e.parent?.id ?? 0}`);
  return { count, notes, elems: created.length };
}

export function meshKps(m: ModelState, kids: Id[]): { count: number; notes: string[]; elems: number } {
  const notes: string[] = [];
  const maker = new NodeMaker(m, meshTol(m));
  let count = 0;
  for (const id of kids) {
    const k = m.kps.get(id);
    if (!k) continue;
    if (isMeshed(m, 'kp', id)) { notes.push(`Keypoint ${id} is already meshed.`); continue; }
    const at = resolveAttrs(m, (k as { attrs?: Partial<EntityAttrs> }).attrs);
    requireType(m, at.type, ['mass'], `Keypoint ${id}`);
    const n = maker.node(k.xyz, `K${id}`);
    addElement(m, [n], 'point', at, { kind: 'kp', id });
    count++;
  }
  return { count, notes, elems: count };
}

/** Delete elements meshed on the given entities and nodes no longer used. */
export function clearMesh(m: ModelState, kind: 'volu' | 'area' | 'line' | 'kp', ids: Id[]) {
  const set = new Set(ids);
  for (const e of [...m.elems.values()]) if (e.parent?.kind === kind && set.has(e.parent.id)) { m.elems.delete(e.id); m.sel.elem.delete(e.id); }
  const used = new Set<Id>();
  for (const e of m.elems.values()) e.nodes.forEach((n) => used.add(n));
  const prefix = { volu: 'V', area: 'A', line: 'L', kp: 'K' }[kind];
  for (const [nid, owner] of [...m.nodeOwner]) {
    if (used.has(nid)) continue;
    if (owner[0] !== prefix && !owner.startsWith(prefix)) continue;
    m.nodes.delete(nid); m.sel.node.delete(nid); m.nodeOwner.delete(nid);
  }
  m.bcs = m.bcs.filter((b) => (b.kind === 'SF' ? m.elems.has(b.target) : m.nodes.has(b.target)));
}

export { getKernel };
