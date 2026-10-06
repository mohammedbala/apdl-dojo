// Planar arrangement operations: kp/line merging, line splitting, coplanar area imprinting.
// Used by VGLUE, AGLUE, ASBA, AADD, AOVLAP, NUMMRG.
import type { Area, Id, Line, ModelState, Vec3 } from '../model/types';
import { getKernel } from './kernel';
import { ApdlError } from '../apdl/diagnostics';
import { nextId, selectNew } from '../model/state';
import {
  addKp, addPlanarArea, areaLines, areasUsingLine, chainLoop, findKpAt, isMeshed, linesUsingKp, loopPoints, polyLength,
  refreshVolume, reverseLoop, to2D, volumesUsingArea, type PlaneFrame,
} from './topo';
import { addScaled, cross, dist, dot, len, newell, segDist, sub } from './vec';

// ---------------------------------------------------------------- kp / line merge
export function mergeKp(m: ModelState, from: Id, to: Id) {
  if (from === to) return;
  const target = m.kps.get(to)!.xyz;
  for (const l of linesUsingKp(m, from)) {
    if (l.kps[0] === from) { l.kps[0] = to; l.pts[0] = [...target] as Vec3; }
    if (l.kps[1] === from) { l.kps[1] = to; l.pts[l.pts.length - 1] = [...target] as Vec3; }
  }
  m.kps.delete(from);
  m.sel.kp.delete(from);
}

/** Replace line `from` by geometrically identical line `to` everywhere. */
export function mergeLine(m: ModelState, from: Id, to: Id) {
  if (from === to) return;
  const lf = m.lines.get(from)!, lt = m.lines.get(to)!;
  const same = lf.kps[0] === lt.kps[0];
  for (const a of m.areas.values()) {
    let changed = false;
    a.loops = a.loops.map((loop) => loop.map((s) => {
      if (Math.abs(s) !== from) return s;
      changed = true;
      return (s > 0 ? 1 : -1) * (same ? 1 : -1) * to;
    }));
    void changed;
  }
  m.lines.delete(from);
  m.sel.line.delete(from);
}

/** Lines with identical end keypoints and matching geometry. */
export function sameLineGeometry(a: Line, b: Line, tol: number): boolean {
  const ends = (a.kps[0] === b.kps[0] && a.kps[1] === b.kps[1]) || (a.kps[0] === b.kps[1] && a.kps[1] === b.kps[0]);
  if (!ends) return false;
  if (Math.abs(a.length - b.length) > 10 * tol + 1e-6 * a.length) return false;
  const pa = a.pts[Math.floor(a.pts.length / 2)];
  let best = Infinity;
  for (let i = 0; i < b.pts.length - 1; i++) best = Math.min(best, segDist(pa, b.pts[i], b.pts[i + 1]).d);
  return best <= 10 * tol;
}

// ---------------------------------------------------------------- split a line
/** Split line `lid` at point p (which must lie on it). Returns [kp, firstLine, secondLine]. */
export function splitLineAt(m: ModelState, lid: Id, p: Vec3, tol: number, kpId?: Id): [Id, Id, Id] | null {
  const l = m.lines.get(lid)!;
  for (const a of areasUsingLine(m, lid)) {
    if (isMeshed(m, 'area', a.id)) throw new ApdlError('MESHED', `Area ${a.id} is meshed and cannot be modified.  Clear the mesh first (ACLEAR/VCLEAR).`);
  }
  // locate on polyline
  let bi = -1, bt = 0, bd = Infinity;
  for (let i = 0; i < l.pts.length - 1; i++) {
    const r = segDist(p, l.pts[i], l.pts[i + 1]);
    if (r.d < bd) { bd = r.d; bi = i; bt = r.t; }
  }
  if (bi < 0 || bd > 10 * tol) return null;
  const segLen = dist(l.pts[bi], l.pts[bi + 1]);
  let q: Vec3;
  let pts1: Vec3[], pts2: Vec3[];
  let inserted = false;
  if (bt * segLen <= tol) {
    if (bi === 0) return null; // at start
    q = l.pts[bi];
    pts1 = l.pts.slice(0, bi + 1);
    pts2 = l.pts.slice(bi);
  } else if ((1 - bt) * segLen <= tol) {
    if (bi + 1 === l.pts.length - 1) return null; // at end
    q = l.pts[bi + 1];
    pts1 = l.pts.slice(0, bi + 2);
    pts2 = l.pts.slice(bi + 1);
  } else {
    q = kpId ? m.kps.get(kpId)!.xyz : addScaled(l.pts[bi], sub(l.pts[bi + 1], l.pts[bi]), bt);
    pts1 = [...l.pts.slice(0, bi + 1), q];
    pts2 = [q, ...l.pts.slice(bi + 1)];
    inserted = true;
  }
  const k = kpId ?? findKpAt(m, q, tol) ?? addKp(m, q).id;
  const kq = m.kps.get(k)!.xyz;
  pts1[pts1.length - 1] = [...kq] as Vec3;
  pts2[0] = [...kq] as Vec3;
  const oldEnd = l.kps[1];
  const segA = l.pts[bi], segB = l.pts[bi + 1];
  l.kps = [l.kps[0], k];
  l.pts = pts1;
  l.length = polyLength(pts1);
  delete l.mesh;
  const l2: Line = { id: nextId(m, 'line'), kps: [k, oldEnd], kind: l.kind, pts: pts2, length: polyLength(pts2) };
  if (l.arc) l2.arc = { ...l.arc };
  if (l.attrs) l2.attrs = { ...l.attrs };
  m.lines.set(l2.id, l2);
  selectNew(m, 'line', l2.id);
  // update loops of areas using the line, fix T-junctions in their tessellations
  for (const a of m.areas.values()) {
    let uses = false;
    a.loops = a.loops.map((loop) => {
      const out: number[] = [];
      for (const s of loop) {
        if (s === lid) { out.push(lid, l2.id); uses = true; }
        else if (s === -lid) { out.push(-l2.id, -lid); uses = true; }
        else out.push(s);
      }
      return out;
    });
    if (uses && inserted) splitTessEdge(a, segA, segB, kq);
    if (uses) for (const v of volumesUsingArea(m, a.id)) refreshVolume(m, v);
  }
  return [k, lid, l2.id];
}

function splitTessEdge(a: Area, A: Vec3, B: Vec3, P: Vec3) {
  const t = a.tess;
  const n = t.pos.length / 3;
  const find = (q: Vec3) => {
    for (let i = 0; i < n; i++) if (t.pos[3 * i] === q[0] && t.pos[3 * i + 1] === q[1] && t.pos[3 * i + 2] === q[2]) return i;
    let bi = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(t.pos[3 * i] - q[0], t.pos[3 * i + 1] - q[1], t.pos[3 * i + 2] - q[2]);
      if (d < bd) { bd = d; bi = i; }
    }
    return bd < 1e-9 * Math.max(1, len(q)) ? bi : -1;
  };
  const ia = find(A), ib = find(B);
  if (ia < 0 || ib < 0) return;
  const pos = new Float64Array(t.pos.length + 3);
  pos.set(t.pos);
  pos[t.pos.length] = P[0]; pos[t.pos.length + 1] = P[1]; pos[t.pos.length + 2] = P[2];
  const ip = n;
  const idx: number[] = [];
  for (let i = 0; i < t.idx.length; i += 3) {
    const tri = [t.idx[i], t.idx[i + 1], t.idx[i + 2]];
    let done = false;
    for (let e = 0; e < 3 && !done; e++) {
      const u = tri[e], v = tri[(e + 1) % 3], w = tri[(e + 2) % 3];
      if ((u === ia && v === ib) || (u === ib && v === ia)) {
        idx.push(u, ip, w, ip, v, w);
        done = true;
      }
    }
    if (!done) idx.push(...tri);
  }
  a.tess = { pos, idx: new Uint32Array(idx) };
}

// ---------------------------------------------------------------- topology preparation between line sets
/**
 * Make two sets of lines topologically consistent: merge coincident keypoints, split lines at keypoints that lie
 * on them and at mutual crossings, then merge duplicate lines. Returns true if anything changed.
 */
export function conformLines(m: ModelState, getLines: () => Id[], tol: number): boolean {
  let changed = false;
  // 1. keypoint merge
  for (let pass = 0; pass < 3; pass++) {
    const lines = getLines().map((id) => m.lines.get(id)!).filter(Boolean);
    const kps = [...new Set(lines.flatMap((l) => l.kps))].sort((a, b) => a - b);
    let merged = false;
    for (let i = 0; i < kps.length; i++) for (let j = i + 1; j < kps.length; j++) {
      const a = m.kps.get(kps[i]), b = m.kps.get(kps[j]);
      if (!a || !b) continue;
      if (dist(a.xyz, b.xyz) <= tol) { mergeKp(m, b.id, a.id); merged = true; changed = true; }
    }
    if (!merged) break;
  }
  // 2. split lines at keypoints lying on them (T-junctions)
  for (let guard = 0; guard < 500; guard++) {
    const lines = getLines().map((id) => m.lines.get(id)!).filter(Boolean);
    const kps = [...new Set(lines.flatMap((l) => l.kps))];
    let did = false;
    outer: for (const l of lines) {
      for (const k of kps) {
        if (k === l.kps[0] || k === l.kps[1]) continue;
        const p = m.kps.get(k)!.xyz;
        let bd = Infinity;
        for (let i = 0; i < l.pts.length - 1; i++) bd = Math.min(bd, segDist(p, l.pts[i], l.pts[i + 1]).d);
        if (bd <= tol) {
          if (splitLineAt(m, l.id, p, tol, k)) { did = true; changed = true; break outer; }
        }
      }
    }
    if (!did) break;
  }
  // 3. proper crossings between straight segments
  for (let guard = 0; guard < 200; guard++) {
    const lines = getLines().map((id) => m.lines.get(id)!).filter(Boolean);
    let did = false;
    outer2: for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const A = lines[i], B = lines[j];
      if (A.kps.some((k) => B.kps.includes(k))) continue;
      for (let s = 0; s < A.pts.length - 1; s++) for (let t = 0; t < B.pts.length - 1; t++) {
        const x = segSegIntersect(A.pts[s], A.pts[s + 1], B.pts[t], B.pts[t + 1], tol);
        if (!x) continue;
        const r = splitLineAt(m, A.id, x, tol);
        if (r) splitLineAt(m, B.id, m.kps.get(r[0])!.xyz, tol, r[0]);
        did = true; changed = true;
        break outer2;
      }
    }
    if (!did) break;
  }
  // 4. duplicate lines
  const lines = getLines().map((id) => m.lines.get(id)!).filter(Boolean).sort((a, b) => a.id - b.id);
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i], b = lines[j];
    if (!m.lines.has(a.id) || !m.lines.has(b.id)) continue;
    if (sameLineGeometry(a, b, tol)) { mergeLine(m, b.id, a.id); changed = true; }
  }
  return changed;
}

/** Interior crossing point of two 3-D segments (null if none / touching at ends / parallel). */
function segSegIntersect(a: Vec3, b: Vec3, c: Vec3, d: Vec3, tol: number): Vec3 | null {
  const u = sub(b, a), v = sub(d, c), w = sub(a, c);
  const A = dot(u, u), B = dot(u, v), C = dot(v, v), D = dot(u, w), E = dot(v, w);
  const den = A * C - B * B;
  if (den <= 1e-14 * A * C) return null;
  const s = (B * E - C * D) / den;
  const t = (A * E - B * D) / den;
  const la = Math.sqrt(A), lc = Math.sqrt(C);
  if (s * la <= tol || (1 - s) * la <= tol || t * lc <= tol || (1 - t) * lc <= tol) return null;
  const p = addScaled(a, u, s), q = addScaled(c, v, t);
  if (dist(p, q) > tol) return null;
  return p;
}

// ---------------------------------------------------------------- coplanar imprint
export function frameOf(a: Area): PlaneFrame | null {
  if (a.surface.kind !== 'plane') return null;
  return { origin: a.surface.origin, normal: a.surface.normal, u: a.surface.u, v: a.surface.v };
}

export function coplanar(a: Area, b: Area, tol: number): boolean {
  const fa = frameOf(a), fb = frameOf(b);
  if (!fa || !fb) return false;
  if (Math.abs(Math.abs(dot(fa.normal, fb.normal)) - 1) > 1e-6) return false;
  return Math.abs(dot(sub(fb.origin, fa.origin), fa.normal)) <= tol;
}

type Poly2 = [number, number][][];

function areaPolys(m: ModelState, a: Area, f: PlaneFrame): Poly2 {
  return a.loops.map((loop) => loopPoints(m, loop).map((p) => to2D(f, p)));
}

function makeCS(polys: Poly2) {
  const { CrossSection } = getKernel();
  return new CrossSection(polys, 'EvenOdd');
}

function ringOnPolyline(m: ModelState, line: Line, ring: [number, number][], f: PlaneFrame, tol: number): boolean {
  const probe: Vec3[] = [];
  for (let i = 0; i < line.pts.length; i++) {
    probe.push(line.pts[i]);
    if (i + 1 < line.pts.length) {
      const a = line.pts[i], b = line.pts[i + 1];
      probe.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    }
  }
  // the line must also lie in the plane
  for (const p of probe) if (Math.abs(dot(sub(p, f.origin), f.normal)) > 20 * tol) return false;
  for (const p of probe) {
    const q = to2D(f, p);
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const ab: [number, number] = [b[0] - a[0], b[1] - a[1]];
      const l2 = ab[0] * ab[0] + ab[1] * ab[1];
      let t = l2 > 0 ? ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1]) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(q[0] - a[0] - t * ab[0], q[1] - a[1] - t * ab[1]));
    }
    if (best > 20 * tol) return false;
  }
  return true;
}

/** Build planar areas for CrossSection pieces using existing lines. normal = desired area normal. */
function areasForPieces(m: ModelState, pieces: Poly2[], lineCands: Id[], f: PlaneFrame, normal: Vec3, tol: number): Id[] {
  const out: Id[] = [];
  for (const rings of pieces) {
    const loops: { loop: number[]; s: number }[] = [];
    for (const ring of rings) {
      const ls = lineCands.filter((id) => { const l = m.lines.get(id); return !!l && ringOnPolyline(m, l, ring, f, tol); });
      if (ls.length === 0) throw new ApdlError('IMPRINT', 'Area imprint failed: boundary lines not found.');
      const loop = chainLoop(m, ls);
      loops.push({ loop, s: dot(newell(loopPoints(m, loop)), normal) });
    }
    // order: outer (largest |area|) first, oriented CCW about normal; holes CW
    const withArea = loops.map((x) => ({ ...x, abs: Math.abs(x.s) }));
    withArea.sort((a, b) => b.abs - a.abs);
    const final = withArea.map((x, i) => {
      const ccw = x.s > 0;
      if (i === 0) return ccw ? x.loop : reverseLoop(x.loop);
      return ccw ? reverseLoop(x.loop) : x.loop;
    });
    out.push(addPlanarArea(m, final, undefined, normal).id);
  }
  return out;
}

function csPieces(cs: { decompose(): { toPolygons(): [number, number][][]; area(): number; delete(): void }[] }, minArea: number): Poly2[] {
  const parts = cs.decompose();
  const out: Poly2[] = [];
  for (const p of parts) {
    if (p.area() > minArea) out.push(p.toPolygons() as unknown as Poly2);
    p.delete();
  }
  return out;
}

export interface ImprintResult {
  shared: Id[];
  onlyA: Id[];
  onlyB: Id[];
}

/**
 * Imprint two coplanar planar areas. Returns null if they do not overlap. The inputs are NOT deleted.
 * Pieces of A keep A's normal; shared pieces take A's normal; pieces of B keep B's normal.
 */
export function imprintAreas(m: ModelState, A: Area, B: Area, tol: number): ImprintResult | null {
  const f = frameOf(A)!;
  const csA = makeCS(areaPolys(m, A, f));
  const csB = makeCS(areaPolys(m, B, f));
  const inter = csA.intersect(csB);
  const minArea = Math.max(tol * tol * 100, 1e-9 * Math.max(csA.area(), csB.area()));
  if (inter.area() <= minArea) { csA.delete(); csB.delete(); inter.delete(); return null; }
  // topology
  const lineSet = () => [...new Set([...areaLines(m.areas.get(A.id)!), ...areaLines(m.areas.get(B.id)!)])];
  conformLines(m, lineSet, tol);
  const cands = lineSet();
  const dA = csA.subtract(csB);
  const dB = csB.subtract(csA);
  const nA = f.normal;
  const nB = (B.surface as { normal: Vec3 }).normal;
  const res: ImprintResult = {
    shared: areasForPieces(m, csPieces(inter, minArea), cands, f, nA, tol),
    onlyA: areasForPieces(m, csPieces(dA, minArea), cands, f, nA, tol),
    onlyB: areasForPieces(m, csPieces(dB, minArea), cands, f, nB, tol),
  };
  const attrsA = A.attrs, attrsB = B.attrs;
  for (const id of [...res.shared, ...res.onlyA]) if (attrsA) m.areas.get(id)!.attrs = { ...attrsA };
  for (const id of res.onlyB) if (attrsB) m.areas.get(id)!.attrs = { ...attrsB };
  csA.delete(); csB.delete(); inter.delete(); dA.delete(); dB.delete();
  return res;
}

/** 2-D Boolean of coplanar areas: union (AADD) or A minus Bs (ASBA). Inputs NOT deleted. */
export function areaBoolean(m: ModelState, A: Area, Bs: Area[], op: 'add' | 'sub', tol: number): Id[] {
  const f = frameOf(A);
  if (!f) throw new ApdlError('AREA_NONPLANAR', `Area ${A.id} is not planar; only planar areas are supported for area Booleans in the trainer.`);
  for (const B of Bs) if (!coplanar(A, B, tol)) throw new ApdlError('AREA_NOT_COPLANAR', `Areas ${A.id} and ${B.id} are not coplanar.`);
  let cs = makeCS(areaPolys(m, A, f));
  for (const B of Bs) {
    const b = makeCS(areaPolys(m, B, f));
    const r = op === 'add' ? cs.add(b) : cs.subtract(b);
    cs.delete(); b.delete();
    cs = r;
  }
  const lineSet = () => [...new Set([A, ...Bs].flatMap((x) => (m.areas.get(x.id) ? areaLines(m.areas.get(x.id)!) : [])))];
  conformLines(m, lineSet, tol);
  const minArea = tol * tol * 100;
  const pieces = csPieces(cs, minArea);
  cs.delete();
  const out = areasForPieces(m, pieces, lineSet(), f, f.normal, tol);
  for (const id of out) if (A.attrs) m.areas.get(id)!.attrs = { ...A.attrs };
  return out;
}

/** Replace area `old` by `pieces` in every volume that uses it. sharedFlipInvert: invert flip for those pieces. */
export function replaceAreaInVolumes(m: ModelState, old: Id, pieces: { id: Id; invert: boolean }[]) {
  for (const v of volumesUsingArea(m, old)) {
    const i = v.areas.indexOf(old);
    const f = v.areaFlip[i];
    v.areas.splice(i, 1);
    v.areaFlip.splice(i, 1);
    for (const p of pieces) {
      if (v.areas.includes(p.id)) continue;
      v.areas.push(p.id);
      v.areaFlip.push(p.invert ? !f : f);
    }
    refreshVolume(m, v);
  }
}

export function normalOf(a: Area): Vec3 {
  return a.surface.kind === 'plane' ? a.surface.normal : [0, 0, 1];
}

export { cross };
