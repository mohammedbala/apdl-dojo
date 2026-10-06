// B-rep topology helpers: keypoints, lines, areas, volumes and their tessellations.
import earcut from 'earcut';
import type { Area, BBox, Id, Keypoint, Line, ModelState, Surface, TriMesh, Vec3, Volume, VolumeGen } from '../model/types';
import { nextId, selectNew } from '../model/state';
import { add, addScaled, bboxAdd, cross, dist, dot, emptyBBox, len, newell, norm, rotateAbout, scale, sub } from './vec';
import { ApdlError } from '../apdl/diagnostics';
import { getKernel, hasKernel } from './kernel';

export const ARC_SEG = Math.PI / 16; // 8 segments per 90 degrees

// ------------------------------------------------------------------ keypoints
export function addKp(m: ModelState, xyz: Vec3, id?: Id): Keypoint {
  const k: Keypoint = { id: id ?? nextId(m, 'kp'), xyz: [xyz[0], xyz[1], xyz[2]] };
  m.kps.set(k.id, k);
  selectNew(m, 'kp', k.id);
  return k;
}

export function kpXyz(m: ModelState, id: Id): Vec3 {
  const k = m.kps.get(id);
  if (!k) throw new ApdlError('KP_UNDEFINED', `Keypoint ${id} is undefined.`);
  return k.xyz;
}

/** Find an existing keypoint within tol of p (optionally restricted to a candidate set). */
export function findKpAt(m: ModelState, p: Vec3, tol: number, among?: Iterable<Id>): Id | undefined {
  let best: Id | undefined;
  let bd = tol;
  const it = among ?? m.kps.keys();
  for (const id of it) {
    const k = m.kps.get(id);
    if (!k) continue;
    const d = dist(k.xyz, p);
    if (d <= bd) { bd = d; best = id; }
  }
  return best;
}

// ------------------------------------------------------------------ lines
export function polyLength(pts: Vec3[]) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

export function addLine(m: ModelState, k1: Id, k2: Id, pts: Vec3[], kind: Line['kind'], arc?: Line['arc'], id?: Id): Line {
  const l: Line = { id: id ?? nextId(m, 'line'), kps: [k1, k2], kind, pts, length: polyLength(pts) };
  if (arc) l.arc = arc;
  m.lines.set(l.id, l);
  selectNew(m, 'line', l.id);
  return l;
}

export function addStraight(m: ModelState, k1: Id, k2: Id, id?: Id): Line {
  const a = kpXyz(m, k1), b = kpXyz(m, k2);
  if (k1 === k2 || dist(a, b) < 1e-12) throw new ApdlError('LINE_DEGENERATE', `Keypoints ${k1} and ${k2} are coincident; a line cannot be created.`);
  return addLine(m, k1, k2, [[...a] as Vec3, [...b] as Vec3], 'straight', undefined, id);
}

/** Existing straight line joining k1-k2 (either direction). */
export function findStraight(m: ModelState, k1: Id, k2: Id): Line | undefined {
  for (const l of m.lines.values()) {
    if (l.kind !== 'straight') continue;
    if ((l.kps[0] === k1 && l.kps[1] === k2) || (l.kps[0] === k2 && l.kps[1] === k1)) return l;
  }
  return undefined;
}

export function getOrCreateStraight(m: ModelState, k1: Id, k2: Id): { line: Line; sign: 1 | -1 } {
  const l = findStraight(m, k1, k2) ?? addStraight(m, k1, k2);
  return { line: l, sign: l.kps[0] === k1 ? 1 : -1 };
}

/** Points along a circular arc: start point p0 rotated about (center, axis) by `ang` radians. */
export function arcPoints(p0: Vec3, center: Vec3, axis: Vec3, ang: number): Vec3[] {
  const n = Math.max(2, Math.ceil(Math.abs(ang) / ARC_SEG - 1e-9));
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) pts.push(rotateAbout(p0, center, axis, (ang * i) / n));
  return pts;
}

/** Create an arc line from k1 rotating about (center, axis) by ang (radians) to k2. */
export function addArc(m: ModelState, k1: Id, k2: Id, center: Vec3, axis: Vec3, ang: number, id?: Id): Line {
  const p0 = kpXyz(m, k1);
  const pts = arcPoints(p0, center, axis, ang);
  pts[pts.length - 1] = [...kpXyz(m, k2)] as Vec3;
  const radius = dist(p0, center);
  const ax = ang < 0 ? scale(axis, -1) : axis;
  return addLine(m, k1, k2, pts, 'arc', { center: [...center] as Vec3, axis: norm(ax), radius }, id);
}

/** Line points in traversal direction for a signed line id. */
export function linePts(m: ModelState, signed: number): Vec3[] {
  const l = m.lines.get(Math.abs(signed));
  if (!l) throw new ApdlError('LINE_UNDEFINED', `Line ${Math.abs(signed)} is undefined.`);
  return signed > 0 ? l.pts : [...l.pts].reverse();
}

export function lineStartKp(m: ModelState, signed: number): Id {
  const l = m.lines.get(Math.abs(signed))!;
  return signed > 0 ? l.kps[0] : l.kps[1];
}
export function lineEndKp(m: ModelState, signed: number): Id {
  const l = m.lines.get(Math.abs(signed))!;
  return signed > 0 ? l.kps[1] : l.kps[0];
}

/** Closed polyline (no repeated closing point) of a loop of signed line ids. */
export function loopPoints(m: ModelState, loop: number[]): Vec3[] {
  const out: Vec3[] = [];
  for (const s of loop) {
    const p = linePts(m, s);
    for (let i = 0; i < p.length - 1; i++) out.push(p[i]);
  }
  return out;
}

/** Order an unordered set of line ids into a closed loop with signs. Throws if not closed. */
export function chainLoop(m: ModelState, lineIds: Id[]): number[] {
  if (lineIds.length === 0) throw new ApdlError('LOOP_EMPTY', 'No lines given for the area.');
  const remaining = [...lineIds];
  const first = m.lines.get(remaining.shift()!)!;
  const loop: number[] = [first.id];
  const startKp = first.kps[0];
  let cur = first.kps[1];
  while (remaining.length) {
    const idx = remaining.findIndex((id) => {
      const l = m.lines.get(id)!;
      return l.kps[0] === cur || l.kps[1] === cur;
    });
    if (idx < 0) break;
    const l = m.lines.get(remaining.splice(idx, 1)[0])!;
    if (l.kps[0] === cur) { loop.push(l.id); cur = l.kps[1]; }
    else { loop.push(-l.id); cur = l.kps[0]; }
  }
  if (remaining.length || cur !== startKp) {
    throw new ApdlError('AREA_NOT_CLOSED', `Lines ${lineIds.join(' ')} do not form a closed loop.`);
  }
  return loop;
}

// ------------------------------------------------------------------ planar tessellation
export interface PlaneFrame { origin: Vec3; normal: Vec3; u: Vec3; v: Vec3 }

export function planeFrame(outer: Vec3[], normalHint?: Vec3): PlaneFrame {
  let n = newell(outer);
  if (len(n) < 1e-14) {
    if (!normalHint) throw new ApdlError('AREA_DEGENERATE', 'Area boundary is degenerate (zero area).');
    n = normalHint;
  }
  n = norm(n);
  // u from the longest edge for numerical stability
  let u: Vec3 = [0, 0, 0];
  let best = 0;
  for (let i = 0; i < outer.length; i++) {
    const e = sub(outer[(i + 1) % outer.length], outer[i]);
    const ee = sub(e, scale(n, dot(e, n)));
    const l = len(ee);
    if (l > best) { best = l; u = scale(ee, 1 / l); }
  }
  const v = cross(n, u);
  return { origin: outer[0], normal: n, u, v };
}

export function to2D(f: PlaneFrame, p: Vec3): [number, number] {
  const d = sub(p, f.origin);
  return [dot(d, f.u), dot(d, f.v)];
}

export function from2D(f: PlaneFrame, q: [number, number]): Vec3 {
  return add(f.origin, add(scale(f.u, q[0]), scale(f.v, q[1])));
}

/** Max distance of points from the plane. */
export function planarity(f: PlaneFrame, pts: Vec3[]) {
  let mx = 0;
  for (const p of pts) mx = Math.max(mx, Math.abs(dot(sub(p, f.origin), f.normal)));
  return mx;
}

/** Triangulation of planar loops (outer + holes) oriented with frame normal (Manifold triangulator, earcut fallback). */
export function tessellatePlanar(loopsPts: Vec3[][], f: PlaneFrame): TriMesh {
  const flat: number[] = [];
  const holes: number[] = [];
  const all: Vec3[] = [];
  const polys: [number, number][][] = [];
  loopsPts.forEach((pts, li) => {
    if (li > 0) holes.push(all.length);
    const poly: [number, number][] = [];
    for (const p of pts) {
      const q = to2D(f, p);
      flat.push(q[0], q[1]);
      poly.push(q);
      all.push(p);
    }
    polys.push(poly);
  });
  let tri: number[] | null = null;
  if (hasKernel()) {
    try {
      // Manifold expects the outer loop CCW and holes CW; remember index offsets when reversing
      const offsets: number[] = [];
      let o = 0;
      const oriented = polys.map((poly, li) => {
        offsets.push(o);
        o += poly.length;
        let s = 0;
        for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; }
        const wantCCW = li === 0;
        return (s > 0) === wantCCW ? { pts: poly, rev: false } : { pts: [...poly].reverse(), rev: true };
      });
      const map: number[] = [];
      oriented.forEach((p, li) => {
        const n = p.pts.length;
        for (let i = 0; i < n; i++) map.push(offsets[li] + (p.rev ? n - 1 - i : i));
      });
      const scale = Math.max(1e-9, ...polys[0].map((q) => Math.hypot(q[0], q[1])));
      const t = getKernel().triangulate(oriented.map((p) => p.pts), 1e-9 * scale);
      tri = [];
      for (const [a, b, c] of t) tri.push(map[a], map[b], map[c]);
    } catch {
      tri = null;
    }
  }
  if (!tri) tri = earcut(flat, holes.length ? holes : undefined, 2);
  const idx = new Uint32Array(tri.length);
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t], b = tri[t + 1], c = tri[t + 2];
    const ax = flat[2 * a], ay = flat[2 * a + 1];
    const s = (flat[2 * b] - ax) * (flat[2 * c + 1] - ay) - (flat[2 * c] - ax) * (flat[2 * b + 1] - ay);
    if (s >= 0) { idx[t] = a; idx[t + 1] = b; idx[t + 2] = c; }
    else { idx[t] = a; idx[t + 1] = c; idx[t + 2] = b; }
  }
  const pos = new Float64Array(all.length * 3);
  all.forEach((p, i) => { pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2]; });
  return { pos, idx };
}

export function triStats(t: TriMesh): { area: number; centroid: Vec3; normal: Vec3 } {
  let A = 0;
  const c: Vec3 = [0, 0, 0];
  const nsum: Vec3 = [0, 0, 0];
  for (let i = 0; i < t.idx.length; i += 3) {
    const a = vtx(t, t.idx[i]), b = vtx(t, t.idx[i + 1]), d = vtx(t, t.idx[i + 2]);
    const cr = cross(sub(b, a), sub(d, a));
    const ar = len(cr) / 2;
    A += ar;
    nsum[0] += cr[0]; nsum[1] += cr[1]; nsum[2] += cr[2];
    c[0] += ((a[0] + b[0] + d[0]) / 3) * ar;
    c[1] += ((a[1] + b[1] + d[1]) / 3) * ar;
    c[2] += ((a[2] + b[2] + d[2]) / 3) * ar;
  }
  return { area: A, centroid: A > 0 ? [c[0] / A, c[1] / A, c[2] / A] : [0, 0, 0], normal: norm(nsum) };
}

export function vtx(t: TriMesh, i: number): Vec3 {
  return [t.pos[3 * i], t.pos[3 * i + 1], t.pos[3 * i + 2]];
}

// ------------------------------------------------------------------ areas
/** Create a planar area from signed-line loops (loops[0] outer). Orientation: right-hand rule of loops[0]. */
export function addPlanarArea(m: ModelState, loops: number[][], id?: Id, normalHint?: Vec3): Area {
  const loopsPts = loops.map((l) => loopPoints(m, l));
  const f = planeFrame(loopsPts[0], normalHint);
  const diag = Math.max(1e-9, ...loopsPts[0].map((p) => dist(p, loopsPts[0][0])));
  if (planarity(f, loopsPts.flat()) > 1e-6 * Math.max(1, diag)) {
    throw new ApdlError('AREA_NONPLANAR', 'The lines/keypoints do not lie in a plane. Only planar areas can be created from lines in the trainer.');
  }
  // holes must run opposite to the outer loop for consistent topology
  const fixed = loops.map((l, i) => {
    if (i === 0) return l;
    const s = dot(newell(loopsPts[i]), f.normal);
    return s > 0 ? reverseLoop(l) : l;
  });
  const tess = tessellatePlanar(fixed.map((l) => loopPoints(m, l)), f);
  return addAreaWithTess(m, fixed, { kind: 'plane', origin: f.origin, normal: f.normal, u: f.u, v: f.v }, tess, id);
}

export function reverseLoop(loop: number[]): number[] {
  return [...loop].reverse().map((s) => -s);
}

export function addAreaWithTess(m: ModelState, loops: number[][], surface: Surface, tess: TriMesh, id?: Id): Area {
  const st = triStats(tess);
  const a: Area = { id: id ?? nextId(m, 'area'), loops, surface, tess, area: st.area, centroid: st.centroid };
  m.areas.set(a.id, a);
  selectNew(m, 'area', a.id);
  return a;
}

/** Re-tessellate a planar area from its loops (after line splits). */
export function retessellatePlanar(m: ModelState, a: Area) {
  if (a.surface.kind !== 'plane') return;
  const s = a.surface;
  const f: PlaneFrame = { origin: s.origin, normal: s.normal, u: s.u, v: s.v };
  a.tess = tessellatePlanar(a.loops.map((l) => loopPoints(m, l)), f);
  const st = triStats(a.tess);
  a.area = st.area;
  a.centroid = st.centroid;
}

export function areaNormalAt(a: Area): Vec3 {
  if (a.surface.kind === 'plane') return a.surface.normal;
  return triStats(a.tess).normal;
}

// ------------------------------------------------------------------ volumes
export function areaLineSigns(a: Area): Map<Id, number> {
  const mp = new Map<Id, number>();
  for (const loop of a.loops) for (const s of loop) mp.set(Math.abs(s), (mp.get(Math.abs(s)) ?? 0) + Math.sign(s));
  return mp;
}

/** Orientation propagation so the shell is consistent; returns flips (true = area normal points inward). */
export function orientShell(m: ModelState, areaIds: Id[]): { flips: boolean[]; closed: boolean } {
  const signs = areaIds.map((id) => areaLineSigns(m.areas.get(id)!));
  const lineUse = new Map<Id, number[]>();
  signs.forEach((mp, i) => {
    for (const lid of mp.keys()) {
      const arr = lineUse.get(lid) ?? [];
      arr.push(i);
      lineUse.set(lid, arr);
    }
  });
  let closed = true;
  for (const [, arr] of lineUse) if (arr.length !== 2) closed = false;
  const flips: (boolean | undefined)[] = areaIds.map(() => undefined);
  for (let seed = 0; seed < areaIds.length; seed++) {
    if (flips[seed] !== undefined) continue;
    flips[seed] = false;
    const q = [seed];
    while (q.length) {
      const i = q.pop()!;
      for (const [lid, s] of signs[i]) {
        const si = s * (flips[i] ? -1 : 1);
        for (const j of lineUse.get(lid)!) {
          if (j === i || flips[j] !== undefined) continue;
          const sj = signs[j].get(lid)!;
          // consistent when traversal directions are opposite
          flips[j] = sj === si ? true : false;
          q.push(j);
        }
      }
    }
  }
  return { flips: flips.map((f) => !!f), closed };
}

export function concatTess(m: ModelState, areaIds: Id[], flips: boolean[]): TriMesh {
  let nv = 0, nt = 0;
  for (const id of areaIds) {
    const a = m.areas.get(id)!;
    nv += a.tess.pos.length / 3;
    nt += a.tess.idx.length / 3;
  }
  const pos = new Float64Array(nv * 3);
  const idx = new Uint32Array(nt * 3);
  const tag = new Uint32Array(nt);
  let vo = 0, to = 0;
  areaIds.forEach((id, k) => {
    const a = m.areas.get(id)!;
    pos.set(a.tess.pos, vo * 3);
    const f = flips[k];
    for (let i = 0; i < a.tess.idx.length; i += 3) {
      const A = a.tess.idx[i] + vo, B = a.tess.idx[i + 1] + vo, C = a.tess.idx[i + 2] + vo;
      idx[to * 3] = A;
      idx[to * 3 + 1] = f ? C : B;
      idx[to * 3 + 2] = f ? B : C;
      tag[to] = id;
      to++;
    }
    vo += a.tess.pos.length / 3;
  });
  return { pos, idx, tag };
}

export function shellProps(t: TriMesh): { volume: number; centroid: Vec3; bbox: BBox } {
  let V = 0;
  const c: Vec3 = [0, 0, 0];
  const bbox = emptyBBox();
  for (let i = 0; i < t.pos.length; i += 3) bboxAdd(bbox, [t.pos[i], t.pos[i + 1], t.pos[i + 2]]);
  for (let i = 0; i < t.idx.length; i += 3) {
    const a = vtx(t, t.idx[i]), b = vtx(t, t.idx[i + 1]), d = vtx(t, t.idx[i + 2]);
    const v = dot(a, cross(b, d)) / 6;
    V += v;
    c[0] += v * (a[0] + b[0] + d[0]) / 4;
    c[1] += v * (a[1] + b[1] + d[1]) / 4;
    c[2] += v * (a[2] + b[2] + d[2]) / 4;
  }
  return { volume: V, centroid: Math.abs(V) > 1e-15 ? [c[0] / V, c[1] / V, c[2] / V] : [...bbox.min] as Vec3, bbox };
}

/** Recompute a volume's shell tessellation and properties from its areas (keeps flips). */
export function refreshVolume(m: ModelState, v: Volume) {
  v.tess = concatTess(m, v.areas, v.areaFlip);
  const p = shellProps(v.tess);
  v.volume = Math.abs(p.volume);
  v.centroid = p.centroid;
  v.bbox = p.bbox;
}

export function addVolume(m: ModelState, areaIds: Id[], opts: { id?: Id; gen?: VolumeGen; flips?: boolean[]; requireClosed?: boolean } = {}): Volume {
  let flips = opts.flips;
  if (!flips) {
    const o = orientShell(m, areaIds);
    if (!o.closed && opts.requireClosed !== false) {
      throw new ApdlError('VOLU_OPEN', `Areas ${areaIds.join(' ')} do not form a closed volume.`);
    }
    flips = o.flips;
  }
  let tess = concatTess(m, areaIds, flips);
  let p = shellProps(tess);
  if (p.volume < 0) {
    flips = flips.map((f) => !f);
    tess = concatTess(m, areaIds, flips);
    p = shellProps(tess);
  }
  const v: Volume = {
    id: opts.id ?? nextId(m, 'volu'),
    areas: [...areaIds],
    areaFlip: flips,
    tess,
    volume: Math.abs(p.volume),
    bbox: p.bbox,
    centroid: p.centroid,
  };
  if (opts.gen) v.gen = opts.gen;
  if (m.volus.has(v.id)) throw new ApdlError('VOLU_EXISTS', `Volume ${v.id} already exists.`);
  m.volus.set(v.id, v);
  selectNew(m, 'volu', v.id);
  return v;
}

// ------------------------------------------------------------------ reference queries
export function areasUsingLine(m: ModelState, lid: Id): Area[] {
  const out: Area[] = [];
  for (const a of m.areas.values()) if (a.loops.some((l) => l.some((s) => Math.abs(s) === lid))) out.push(a);
  return out;
}

export function volumesUsingArea(m: ModelState, aid: Id): Volume[] {
  const out: Volume[] = [];
  for (const v of m.volus.values()) if (v.areas.includes(aid)) out.push(v);
  return out;
}

export function linesUsingKp(m: ModelState, kid: Id): Line[] {
  const out: Line[] = [];
  for (const l of m.lines.values()) if (l.kps[0] === kid || l.kps[1] === kid) out.push(l);
  return out;
}

export function areaLines(a: Area): Id[] {
  const s = new Set<Id>();
  for (const loop of a.loops) for (const x of loop) s.add(Math.abs(x));
  return [...s];
}

export function areaKps(m: ModelState, a: Area): Id[] {
  const s = new Set<Id>();
  for (const lid of areaLines(a)) {
    const l = m.lines.get(lid);
    if (l) { s.add(l.kps[0]); s.add(l.kps[1]); }
  }
  return [...s];
}

export function volumeLines(m: ModelState, v: Volume): Id[] {
  const s = new Set<Id>();
  for (const aid of v.areas) {
    const a = m.areas.get(aid);
    if (a) for (const lid of areaLines(a)) s.add(lid);
  }
  return [...s];
}

export function volumeKps(m: ModelState, v: Volume): Id[] {
  const s = new Set<Id>();
  for (const lid of volumeLines(m, v)) {
    const l = m.lines.get(lid);
    if (l) { s.add(l.kps[0]); s.add(l.kps[1]); }
  }
  return [...s];
}

/** Delete entities that are no longer referenced by higher-order entities (optionally only among candidates). */
export function sweepUnused(m: ModelState, cand?: { areas?: Iterable<Id>; lines?: Iterable<Id>; kps?: Iterable<Id> }) {
  const usedAreas = new Set<Id>();
  for (const v of m.volus.values()) for (const a of v.areas) usedAreas.add(a);
  const areas = cand?.areas ? [...cand.areas] : [];
  for (const a of areas) if (!usedAreas.has(a)) { m.areas.delete(a); m.sel.area.delete(a); }
  const usedLines = new Set<Id>();
  for (const a of m.areas.values()) for (const lid of areaLines(a)) usedLines.add(lid);
  const lines = cand?.lines ? [...cand.lines] : [];
  for (const l of lines) if (!usedLines.has(l)) { m.lines.delete(l); m.sel.line.delete(l); }
  const usedKps = new Set<Id>();
  for (const l of m.lines.values()) { usedKps.add(l.kps[0]); usedKps.add(l.kps[1]); }
  const kps = cand?.kps ? [...cand.kps] : [];
  for (const k of kps) if (!usedKps.has(k)) { m.kps.delete(k); m.sel.kp.delete(k); }
}

/** Check whether an area/line/kp has meshed elements attached (for delete protection). */
export function isMeshed(m: ModelState, kind: 'volu' | 'area' | 'line' | 'kp', id: Id) {
  for (const e of m.elems.values()) if (e.parent && e.parent.kind === kind && e.parent.id === id) return true;
  return false;
}

export function translateTess(t: TriMesh, d: Vec3): TriMesh {
  const pos = new Float64Array(t.pos.length);
  for (let i = 0; i < t.pos.length; i += 3) { pos[i] = t.pos[i] + d[0]; pos[i + 1] = t.pos[i + 1] + d[1]; pos[i + 2] = t.pos[i + 2] + d[2]; }
  return { pos, idx: t.idx.slice() };
}

export function mapTess(t: TriMesh, f: (p: Vec3) => Vec3, flip = false): TriMesh {
  const pos = new Float64Array(t.pos.length);
  for (let i = 0; i < t.pos.length; i += 3) {
    const q = f([t.pos[i], t.pos[i + 1], t.pos[i + 2]]);
    pos[i] = q[0]; pos[i + 1] = q[1]; pos[i + 2] = q[2];
  }
  const idx = t.idx.slice();
  if (flip) for (let i = 0; i < idx.length; i += 3) { const b = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = b; }
  return { pos, idx };
}

export { addScaled };
