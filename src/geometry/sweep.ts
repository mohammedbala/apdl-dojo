// Generic sweep of areas (-> volumes) or lines (-> areas) through a sequence of stage maps.
// Used by VEXT, VOFFST, VROTAT, VDRAG, AROTAT, ADRAG and the primitives (BLOCK, CYL4, CONE, SPHERE ...).
import type { Area, Id, Line, ModelState, Surface, TriMesh, Vec3 } from '../model/types';
import { ApdlError } from '../apdl/diagnostics';
import {
  addAreaWithTess, addKp, addLine, addVolume, areaLines, arcPoints, kpXyz, mapTess, planeFrame, planarity, polyLength,
} from './topo';
import { cross, dist, dot, len, norm, rotateAbout, sub } from './vec';

export type Stage =
  | { kind: 'translate'; d: Vec3 }
  | { kind: 'rotate'; o: Vec3; k: Vec3; ang: number } // radians
  | { kind: 'affine'; f: (p: Vec3) => Vec3 }; // linear interpolation between p and f(p)

function applyStage(s: Stage, p: Vec3, t = 1): Vec3 {
  if (s.kind === 'translate') return [p[0] + s.d[0] * t, p[1] + s.d[1] * t, p[2] + s.d[2] * t];
  if (s.kind === 'rotate') return rotateAbout(p, s.o, s.k, s.ang * t);
  const q = s.f(p);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
}

function onAxis(s: Stage, p: Vec3, tol: number) {
  if (s.kind !== 'rotate') return false;
  const v = sub(p, s.o);
  return len(cross(v, s.k)) <= tol;
}

interface StageMaps {
  kp: Map<Id, Id>;
  line: Map<Id, number>; // orig line id -> signed line id at this stage (0 = degenerate)
  area: Map<Id, Id>;
}

export interface SweepResult {
  volumes: Id[];
  sideAreas: Id[];
  capAreas: Id[];
}

export interface SweepOpts {
  /** last stage coincides with stage 0 (full 360 revolution) */
  closed?: boolean;
  /** build one volume from all pieces instead of one volume per area per stage */
  singleVolume?: boolean;
  /** meshing hint for generated volumes */
  gen?: (areaId: Id) => import('../model/types').VolumeGen | undefined;
  tol?: number;
}

/** Sweep a set of areas into volumes. Returns created volume ids. */
export function sweepAreas(m: ModelState, areaIds: Id[], stages: Stage[], opts: SweepOpts = {}): SweepResult {
  const tol = opts.tol ?? 1e-9;
  const areas = areaIds.map((id) => {
    const a = m.areas.get(id);
    if (!a) throw new ApdlError('AREA_UNDEFINED', `Area ${id} is undefined.`);
    return a;
  });
  const lineSet = new Set<Id>();
  for (const a of areas) for (const l of areaLines(a)) lineSet.add(l);
  const kpSet = new Set<Id>();
  for (const lid of lineSet) { const l = m.lines.get(lid)!; kpSet.add(l.kps[0]); kpSet.add(l.kps[1]); }

  const maps: StageMaps[] = [{ kp: new Map([...kpSet].map((k) => [k, k])), line: new Map([...lineSet].map((l) => [l, l])), area: new Map(areaIds.map((a) => [a, a])) }];
  const sideAreas: Id[] = [];
  const capAreas: Id[] = [];
  const volumes: Id[] = [];
  const pieces: Id[][] = []; // per (stage, area) the side areas
  const nst = stages.length;

  for (let s = 0; s < nst; s++) {
    const st = stages[s];
    const prev = maps[s];
    const last = s === nst - 1 && opts.closed;
    const next: StageMaps = last ? maps[0] : { kp: new Map(), line: new Map(), area: new Map() };
    // --- keypoints
    if (!last) {
      for (const k of kpSet) {
        const pk = prev.kp.get(k)!;
        const p = kpXyz(m, pk);
        if (onAxis(st, p, 1e-9 * Math.max(1, len(p)))) { next.kp.set(k, pk); continue; }
        const q = applyStage(st, p);
        // collapse onto an already-created copy at the same location (cone apex)
        let found: Id | undefined;
        for (const v of next.kp.values()) if (dist(kpXyz(m, v), q) <= tol * Math.max(1, len(q))) { found = v; break; }
        if (found === undefined && dist(p, q) <= tol) found = pk;
        next.kp.set(k, found ?? addKp(m, q).id);
      }
    }
    // --- connectors (per original kp): straight or arc from prev to next
    const conn = new Map<Id, number>(); // signed line id from prev->next, 0 = none
    for (const k of kpSet) {
      const a = prev.kp.get(k)!, b = next.kp.get(k)!;
      if (a === b) { conn.set(k, 0); continue; }
      const pa = kpXyz(m, a);
      let line: Line;
      if (st.kind === 'rotate') {
        const pts = arcPoints(pa, st.o, st.k, st.ang);
        pts[pts.length - 1] = [...kpXyz(m, b)] as Vec3;
        // centre = projection of pa onto the axis
        const t = dot(sub(pa, st.o), st.k);
        const c: Vec3 = [st.o[0] + st.k[0] * t, st.o[1] + st.k[1] * t, st.o[2] + st.k[2] * t];
        line = addLine(m, a, b, pts, 'arc', { center: c, axis: st.ang < 0 ? [-st.k[0], -st.k[1], -st.k[2]] : st.k, radius: dist(pa, c) });
      } else {
        line = addLine(m, a, b, [[...pa] as Vec3, [...kpXyz(m, b)] as Vec3], 'straight');
      }
      conn.set(k, line.id);
    }
    // --- line copies
    if (!last) {
      for (const lid of lineSet) {
        const pl = prev.line.get(lid)!;
        if (pl === 0) { next.line.set(lid, 0); continue; }
        const src = m.lines.get(Math.abs(pl))!;
        const orig = m.lines.get(lid)!;
        const k0 = next.kp.get(orig.kps[0])!, k1 = next.kp.get(orig.kps[1])!;
        const srcPts = pl > 0 ? src.pts : [...src.pts].reverse();
        if (k0 === k1) { next.line.set(lid, 0); continue; }
        const sameAsPrev = k0 === prev.kp.get(orig.kps[0]) && k1 === prev.kp.get(orig.kps[1]);
        if (sameAsPrev) { next.line.set(lid, pl); continue; } // line on the rotation axis
        const pts = srcPts.map((p) => applyStage(st, p));
        pts[0] = [...kpXyz(m, k0)] as Vec3;
        pts[pts.length - 1] = [...kpXyz(m, k1)] as Vec3;
        if (polyLength(pts) <= tol) { next.line.set(lid, 0); continue; }
        let arc = src.arc;
        if (arc) {
          const c = applyStage(st, arc.center);
          const ax = st.kind === 'rotate' ? rotateAbout(arc.axis, [0, 0, 0], st.k, st.ang) : arc.axis;
          arc = { center: c, axis: norm(ax), radius: dist(pts[0], c) };
          if (pl < 0) arc = { ...arc, axis: [-arc.axis[0], -arc.axis[1], -arc.axis[2]] };
        }
        const nl = addLine(m, k0, k1, pts, src.kind, arc);
        next.line.set(lid, nl.id);
      }
    }
    // --- side areas (one per original line)
    const sideOf = new Map<Id, Id | 0>();
    for (const lid of lineSet) {
      const orig = m.lines.get(lid)!;
      const lA = prev.line.get(lid)!; // signed, oriented like orig
      const lB = next.line.get(lid)!;
      if (lA === 0 && lB === 0) { sideOf.set(lid, 0); continue; }
      if (lA === lB) { sideOf.set(lid, 0); continue; } // on axis: no side surface
      const c0 = conn.get(orig.kps[0])!, c1 = conn.get(orig.kps[1])!;
      const id = buildSide(m, st, lA, lB, c0, c1);
      sideOf.set(lid, id);
      if (id) sideAreas.push(id);
    }
    // --- caps at next stage
    if (!last) {
      for (const a of areas) {
        const srcId = prev.area.get(a.id)!;
        const src = m.areas.get(srcId)!;
        const loops = src.loops.map((loop) => loop.map((sgn) => {
          // map via original line id
          const origLid = origOfStageLine(prev, Math.abs(sgn));
          const nl = next.line.get(origLid)!;
          return nl === 0 ? 0 : Math.sign(sgn) * Math.sign(prev.line.get(origLid)!) * nl;
        }).filter((x) => x !== 0));
        if (loops[0].length < 2) { next.area.set(a.id, 0 as unknown as Id); continue; }
        const tess = mapTess(src.tess, (p) => applyStage(st, p));
        let surf: Surface = { kind: 'free' };
        if (src.surface.kind === 'plane') {
          const pts: Vec3[] = [];
          for (let i = 0; i < tess.pos.length; i += 3) pts.push([tess.pos[i], tess.pos[i + 1], tess.pos[i + 2]]);
          try {
            const f = planeFrame(pts.length >= 3 ? pts : [[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
            const nrm = transformDir(st, src.surface.normal);
            const n = dot(nrm, f.normal) < 0 ? [-f.normal[0], -f.normal[1], -f.normal[2]] as Vec3 : f.normal;
            surf = { kind: 'plane', origin: f.origin, normal: n, u: f.u, v: cross(n, f.u) };
          } catch { surf = { kind: 'free' }; }
        }
        const na = addAreaWithTess(m, loops, surf, tess);
        if (na.area <= 1e-12) { m.areas.delete(na.id); m.sel.area.delete(na.id); next.area.set(a.id, 0 as unknown as Id); continue; }
        next.area.set(a.id, na.id);
        capAreas.push(na.id);
      }
    }
    // --- volumes
    for (const a of areas) {
      const bottom = prev.area.get(a.id)!;
      const top = next.area.get(a.id)!;
      const sides: Id[] = [];
      for (const lid of areaLines(a)) { const sId = sideOf.get(lid); if (sId) sides.push(sId); }
      const ids = [bottom, top, ...sides].filter((x) => x);
      if (opts.singleVolume) { pieces.push(ids); continue; }
      const v = addVolume(m, ids, { gen: opts.gen?.(a.id) });
      volumes.push(v.id);
    }
    if (!last) maps.push(next);
  }

  if (opts.singleVolume) {
    // all side areas + first & last caps (interior caps are removed)
    const first = areaIds;
    const lastCaps = opts.closed ? [] : areaIds.map((a) => maps[maps.length - 1].area.get(a)!).filter((x) => x);
    const interior = new Set<Id>();
    for (let s = 1; s < maps.length - (opts.closed ? 0 : 1); s++) for (const a of areaIds) { const id = maps[s].area.get(a); if (id) interior.add(id); }
    const ids = [...new Set([...(opts.closed ? [] : first), ...sideAreas, ...lastCaps])].filter((x) => !interior.has(x));
    for (const id of interior) { m.areas.delete(id); m.sel.area.delete(id); }
    const v = addVolume(m, ids, { gen: opts.gen?.(areaIds[0]) });
    volumes.push(v.id);
  }
  return { volumes, sideAreas, capAreas };
}

function origOfStageLine(st: StageMaps, lid: Id): Id {
  for (const [o, s] of st.line) if (Math.abs(s) === lid) return o;
  return lid;
}

function transformDir(st: Stage, d: Vec3): Vec3 {
  if (st.kind === 'rotate') return rotateAbout(d, [0, 0, 0], st.k, st.ang);
  return d;
}

/**
 * Build the swept side area of line lA (prev stage) to lB (next stage) with connectors c0 (at lA start)
 * and c1 (at lA end). Loop: lA, c1, -lB, -c0 (connectors may be 0 when degenerate).
 */
function buildSide(m: ModelState, st: Stage, lA: number, lB: number, c0: number, c1: number): Id | 0 {
  const ptsA = lineSigned(m, lA);
  const ptsB = lB ? lineSigned(m, lB) : null;
  const colStart = c0 ? m.lines.get(c0)!.pts : null; // from prev to next at lA start
  const colEnd = c1 ? m.lines.get(c1)!.pts : null;
  const nrow = st.kind === 'rotate' ? (colStart?.length ?? colEnd?.length ?? 2) : 2;
  const ncol = ptsA.length;
  // grid[j][i]
  const grid: Vec3[][] = [];
  for (let j = 0; j < nrow; j++) {
    const t = j / (nrow - 1);
    const row: Vec3[] = [];
    for (let i = 0; i < ncol; i++) row.push(applyStage(st, ptsA[i], t));
    grid.push(row);
  }
  grid[0] = ptsA.map((p) => [...p] as Vec3);
  if (ptsB && ptsB.length === ncol) grid[nrow - 1] = ptsB.map((p) => [...p] as Vec3);
  else if (!ptsB) {
    const apex = grid[nrow - 1][0];
    grid[nrow - 1] = grid[nrow - 1].map(() => apex);
  }
  if (colStart && colStart.length === nrow) for (let j = 0; j < nrow; j++) grid[j][0] = [...colStart[j]] as Vec3;
  if (colEnd && colEnd.length === nrow) for (let j = 0; j < nrow; j++) grid[j][ncol - 1] = [...colEnd[j]] as Vec3;
  // triangulate, skipping degenerate triangles; share identical vertices
  const posArr: number[] = [];
  const idxArr: number[] = [];
  const keyOf = (p: Vec3) => `${p[0]},${p[1]},${p[2]}`;
  const vmap = new Map<string, number>();
  const vi = (p: Vec3) => {
    const k = keyOf(p);
    let i = vmap.get(k);
    if (i === undefined) { i = posArr.length / 3; posArr.push(p[0], p[1], p[2]); vmap.set(k, i); }
    return i;
  };
  const triArea = (a: Vec3, b: Vec3, c: Vec3) => len(cross(sub(b, a), sub(c, a)));
  const pushTri = (a: Vec3, b: Vec3, c: Vec3) => {
    if (triArea(a, b, c) <= 1e-14) return;
    idxArr.push(vi(a), vi(b), vi(c));
  };
  for (let j = 0; j < nrow - 1; j++) {
    for (let i = 0; i < ncol - 1; i++) {
      const p00 = grid[j][i], p10 = grid[j][i + 1], p11 = grid[j + 1][i + 1], p01 = grid[j + 1][i];
      pushTri(p00, p10, p11);
      pushTri(p00, p11, p01);
    }
  }
  if (idxArr.length === 0) return 0;
  const tess: TriMesh = { pos: new Float64Array(posArr), idx: new Uint32Array(idxArr) };
  const loop = [lA, c1, lB ? -lB : 0, c0 ? -c0 : 0].filter((x) => x !== 0);
  // surface type
  const all = grid.flat();
  let surface: Surface = { kind: 'free' };
  try {
    const f = planeFrame([grid[0][0], grid[0][ncol - 1], grid[nrow - 1][ncol - 1], grid[nrow - 1][0]]);
    const scaleL = Math.max(1, ...all.map((p) => dist(p, all[0])));
    if (planarity(f, all) <= 1e-7 * scaleL) {
      // orient normal with tessellation
      const t0 = [tess.idx[0], tess.idx[1], tess.idx[2]].map((k) => [tess.pos[3 * k], tess.pos[3 * k + 1], tess.pos[3 * k + 2]] as Vec3);
      const tn = cross(sub(t0[1], t0[0]), sub(t0[2], t0[0]));
      const n = dot(tn, f.normal) < 0 ? [-f.normal[0], -f.normal[1], -f.normal[2]] as Vec3 : f.normal;
      surface = { kind: 'plane', origin: f.origin, normal: n, u: f.u, v: cross(n, f.u) };
    } else if (st.kind === 'translate') {
      const la = m.lines.get(Math.abs(lA))!;
      if (la.arc) surface = { kind: 'cyl', origin: la.arc.center, axis: norm(st.d), radius: la.arc.radius, ref: norm(sub(ptsA[0], la.arc.center)) };
    }
  } catch {
    surface = { kind: 'free' };
  }
  const a: Area = addAreaWithTess(m, [loop], surface, tess);
  return a.id;
}

function lineSigned(m: ModelState, s: number): Vec3[] {
  const l = m.lines.get(Math.abs(s))!;
  return s > 0 ? l.pts : [...l.pts].reverse();
}

/** Sweep lines into areas (AROTAT / ADRAG). Returns the created area ids. */
export function sweepLines(m: ModelState, lineIds: Id[], stages: Stage[], closed = false): Id[] {
  // Implemented by sweeping a pseudo "area set": reuse sweepAreas machinery would require areas; do it directly.
  const kpSet = new Set<Id>();
  for (const lid of lineIds) {
    const l = m.lines.get(lid);
    if (!l) throw new ApdlError('LINE_UNDEFINED', `Line ${lid} is undefined.`);
    kpSet.add(l.kps[0]); kpSet.add(l.kps[1]);
  }
  let prevKp = new Map([...kpSet].map((k) => [k, k]));
  let prevLine = new Map(lineIds.map((l) => [l, l as number]));
  const firstKp = prevKp, firstLine = prevLine;
  const out: Id[] = [];
  stages.forEach((st, s) => {
    const last = closed && s === stages.length - 1;
    const nextKp = last ? firstKp : new Map<Id, Id>();
    if (!last) for (const k of kpSet) {
      const p = kpXyz(m, prevKp.get(k)!);
      if (onAxis(st, p, 1e-9 * Math.max(1, len(p)))) { nextKp.set(k, prevKp.get(k)!); continue; }
      nextKp.set(k, addKp(m, applyStage(st, p)).id);
    }
    const conn = new Map<Id, number>();
    for (const k of kpSet) {
      const a = prevKp.get(k)!, b = nextKp.get(k)!;
      if (a === b) { conn.set(k, 0); continue; }
      const pa = kpXyz(m, a);
      if (st.kind === 'rotate') {
        const pts = arcPoints(pa, st.o, st.k, st.ang);
        pts[pts.length - 1] = [...kpXyz(m, b)] as Vec3;
        const t = dot(sub(pa, st.o), st.k);
        const c: Vec3 = [st.o[0] + st.k[0] * t, st.o[1] + st.k[1] * t, st.o[2] + st.k[2] * t];
        conn.set(k, addLine(m, a, b, pts, 'arc', { center: c, axis: st.ang < 0 ? [-st.k[0], -st.k[1], -st.k[2]] : st.k, radius: dist(pa, c) }).id);
      } else conn.set(k, addLine(m, a, b, [[...pa] as Vec3, [...kpXyz(m, b)] as Vec3], 'straight').id);
    }
    const nextLine = last ? firstLine : new Map<Id, number>();
    if (!last) for (const lid of lineIds) {
      const orig = m.lines.get(lid)!;
      const src = m.lines.get(Math.abs(prevLine.get(lid)!))!;
      const k0 = nextKp.get(orig.kps[0])!, k1 = nextKp.get(orig.kps[1])!;
      if (k0 === prevKp.get(orig.kps[0]) && k1 === prevKp.get(orig.kps[1])) { nextLine.set(lid, prevLine.get(lid)!); continue; }
      const pts = src.pts.map((p) => applyStage(st, p));
      pts[0] = [...kpXyz(m, k0)] as Vec3;
      pts[pts.length - 1] = [...kpXyz(m, k1)] as Vec3;
      nextLine.set(lid, addLine(m, k0, k1, pts, src.kind, src.arc ? { ...src.arc, center: applyStage(st, src.arc.center) } : undefined).id);
    }
    for (const lid of lineIds) {
      const orig = m.lines.get(lid)!;
      const lA = prevLine.get(lid)!, lB = nextLine.get(lid)!;
      if (lA === lB) continue;
      const id = buildSide(m, st, lA, lB, conn.get(orig.kps[0])!, conn.get(orig.kps[1])!);
      if (id) out.push(id);
    }
    prevKp = nextKp;
    prevLine = nextLine;
  });
  return out;
}
