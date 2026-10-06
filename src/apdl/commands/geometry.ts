// Bottom-up solid modelling commands: K, L, LARC, CIRCLE, A, AL, V, VA, xGEN, xSYMM, xDELE, LDIV, KFILL ...
import { reg } from './registry';
import type { Ctx } from '../context';
import type { Args } from '../args';
import { ApdlError } from '../diagnostics';
import type { Id, Line, ModelState, Vec3 } from '../../model/types';
import { nextId, selectedIds } from '../../model/state';
import {
  addArc, addKp, addLine, addPlanarArea, addStraight, addVolume, areaKps, areaLines, chainLoop, findStraight, isMeshed,
  kpXyz, linesUsingKp, areasUsingLine, sweepUnused, volumeKps, volumeLines, volumesUsingArea, polyLength,
} from '../../geometry/topo';
import { csysToGlobal, fromGlobal, getCsys, globalToCsys, toGlobal } from '../../geometry/csys';
import { add, cross, dist, dot, len, norm, rotateAbout, scale, sub } from '../../geometry/vec';
import { circleCenter } from '../../geometry/brep';
import { copyArea, copyKp, copyLine, copyVolume, moveEntities, newMaps, type CopyOpts } from '../../geometry/copy';
import { splitLineAt } from '../../geometry/imprint';
import { deleteVolumes } from '../../geometry/booleans';
import { fmt } from './session';

const PREP = ['PREP7'] as const;

// ------------------------------------------------------------------ keypoints
reg('K', (c, a) => {
  const m = c.m;
  let id = a.int(0, 0);
  const p = toGlobal(m, [a.num(1), a.num(2), a.num(3)]);
  if (id < 0) throw new ApdlError('KP_NUM', 'Keypoint number must be positive.');
  if (id === 0) id = nextId(m, 'kp');
  const ex = m.kps.get(id);
  if (ex) {
    if (linesUsingKp(m, id).length) {
      throw new ApdlError('KP_ATTACHED', `Keypoint ${id} is attached to a line and cannot be redefined.  Use KMODIF to move it.`);
    }
    ex.xyz = p;
    m.sel.kp.add(id);
    return;
  }
  addKp(m, p, id);
}, [...PREP]);

reg('KMODIF', (c, a) => {
  const m = c.m;
  const id = a.int(0);
  const k = m.kps.get(id);
  if (!k) throw new ApdlError('KP_UNDEFINED', `Keypoint ${id} is undefined.`);
  for (const l of linesUsingKp(m, id)) for (const ar of areasUsingLine(m, l.id)) if (volumesUsingArea(m, ar.id).length || ar) {
    throw new ApdlError('KP_ATTACHED', `KMODIF: keypoint ${id} is attached to areas/volumes; the trainer only supports KMODIF of keypoints attached to lines.`);
  }
  const cur = fromGlobal(m, k.xyz);
  const p = toGlobal(m, [a.isBlank(1) ? cur[0] : a.num(1), a.isBlank(2) ? cur[1] : a.num(2), a.isBlank(3) ? cur[2] : a.num(3)]);
  k.xyz = p;
  for (const l of linesUsingKp(m, id)) {
    if (l.kind !== 'straight') throw new ApdlError('KMODIF', 'KMODIF only supports keypoints of straight lines in the trainer.');
    l.pts = [[...m.kps.get(l.kps[0])!.xyz] as Vec3, [...m.kps.get(l.kps[1])!.xyz] as Vec3];
    l.length = polyLength(l.pts);
  }
}, [...PREP]);

reg('KFILL', (c, a) => {
  const m = c.m;
  const k1 = a.int(0), k2 = a.int(1);
  const nfill = a.int(2, 0) || 1;
  const p1 = kpXyz(m, k1), p2 = kpXyz(m, k2);
  const nstrt = a.int(3, 0);
  const ninc = a.int(4, 0) || 1;
  const space = a.num(5, 1) || 1;
  const q1 = fromGlobal(m, p1), q2 = fromGlobal(m, p2);
  // geometric spacing ratio between last and first spacing
  const n = nfill + 1;
  const r = n > 1 ? Math.pow(space, 1 / (n - 1)) : 1;
  const w: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) { w.push(Math.pow(r, i)); s += w[i]; }
  let acc = 0;
  for (let i = 1; i <= nfill; i++) {
    acc += w[i - 1] / s;
    const q: Vec3 = [q1[0] + (q2[0] - q1[0]) * acc, q1[1] + (q2[1] - q1[1]) * acc, q1[2] + (q2[2] - q1[2]) * acc];
    addKp(m, toGlobal(m, q), nstrt ? nstrt + (i - 1) * ninc : undefined);
  }
}, [...PREP]);

function genOffsets(c: Ctx, a: Args, base: number): (p: Vec3, i: number) => Vec3 {
  const m = c.m;
  const dx = a.num(base), dy = a.num(base + 1), dz = a.num(base + 2);
  const cs = getCsys(m, m.cur.csys);
  return (p, i) => {
    const q = globalToCsys(cs, p);
    return csysToGlobal(cs, [q[0] + dx * i, q[1] + dy * i, q[2] + dz * i]);
  };
}

/** Shared driver for KGEN/LGEN/AGEN/VGEN. */
function xgen(c: Ctx, a: Args, kind: 'kp' | 'line' | 'area' | 'volu') {
  const m = c.m;
  const itime = a.int(0, 2);
  const ids = a.entities(kind, 1);
  if (!ids.length) throw new ApdlError('GEN_NONE', `No ${kind === 'volu' ? 'volumes' : kind === 'kp' ? 'keypoints' : kind + 's'} to copy.`);
  for (const id of ids) c.ensureExists(kind, id);
  const off = genOffsets(c, a, 4);
  const kinc = a.int(7, 0);
  const imove = a.int(9, 0) === 1;
  if (imove) {
    // move in place
    const f = (p: Vec3) => off(p, 1);
    const kps = new Set<Id>(), lines = new Set<Id>(), areas = new Set<Id>(), volus = new Set<Id>();
    for (const id of ids) {
      if (kind === 'kp') kps.add(id);
      if (kind === 'line') { lines.add(id); const l = m.lines.get(id)!; kps.add(l.kps[0]); kps.add(l.kps[1]); }
      if (kind === 'area') { areas.add(id); for (const l of areaLines(m.areas.get(id)!)) lines.add(l); for (const k of areaKps(m, m.areas.get(id)!)) kps.add(k); }
      if (kind === 'volu') { volus.add(id); const v = m.volus.get(id)!; v.areas.forEach((x) => areas.add(x)); volumeLines(m, v).forEach((x) => lines.add(x)); volumeKps(m, v).forEach((x) => kps.add(x)); }
    }
    for (const k of kps) for (const l of linesUsingKp(m, k)) if (!lines.has(l.id) && kind !== 'kp') throw new ApdlError('GEN_MOVE', 'Entities to be moved are attached to entities that are not moved.');
    moveEntities(m, [...kps], [...lines], [...areas], [...volus], f);
    return;
  }
  let made = 0;
  for (let i = 1; i < itime; i++) {
    const o: CopyOpts = { f: (p) => off(p, i), kinc: kinc * i };
    const maps = newMaps();
    for (const id of ids) {
      if (kind === 'kp') copyKp(m, id, o, maps);
      else if (kind === 'line') copyLine(m, id, o, maps);
      else if (kind === 'area') copyArea(m, id, o, maps);
      else copyVolume(m, id, o, maps);
      made++;
    }
  }
  c.out(` GENERATE ${itime - 1} SETS OF ${ids.length} ${kind.toUpperCase()}S   (${made} NEW)`);
}
reg('KGEN', (c, a) => xgen(c, a, 'kp'), [...PREP]);
reg('LGEN', (c, a) => xgen(c, a, 'line'), [...PREP]);
reg('AGEN', (c, a) => xgen(c, a, 'area'), [...PREP]);
reg('VGEN', (c, a) => xgen(c, a, 'volu'), [...PREP]);

/** xSYMM,Ncomp,N1,N2,NINC,KINC,NOELEM,IMOVE  (reflection in the active coordinate system). */
function xsymm(c: Ctx, a: Args, kind: 'kp' | 'line' | 'area' | 'volu') {
  const m = c.m;
  const comp = a.lab(0, 'X');
  const ax = 'XYZ'.indexOf(comp);
  if (ax < 0) throw new ApdlError('SYMM_COMP', `Symmetry component ${comp} is not valid (X, Y or Z).`);
  const ids = a.entities(kind, 1);
  for (const id of ids) c.ensureExists(kind, id);
  const kinc = a.int(4, 0);
  const cs = getCsys(m, m.cur.csys);
  if (cs.type !== 0) throw new ApdlError('SYMM_CSYS', 'Reflections require a Cartesian active coordinate system.');
  const f = (p: Vec3): Vec3 => {
    const q = globalToCsys(cs, p);
    q[ax] = -q[ax];
    return csysToGlobal(cs, q);
  };
  const o: CopyOpts = { f, kinc, reflect: true };
  const maps = newMaps();
  for (const id of ids) {
    if (kind === 'kp') copyKp(m, id, o, maps);
    else if (kind === 'line') copyLine(m, id, o, maps);
    else if (kind === 'area') copyArea(m, id, o, maps);
    else copyVolume(m, id, o, maps);
  }
}
reg('KSYMM', (c, a) => xsymm(c, a, 'kp'), [...PREP]);
reg('LSYMM', (c, a) => xsymm(c, a, 'line'), [...PREP]);
reg('ARSYM', (c, a) => xsymm(c, a, 'area'), [...PREP]);
reg('VSYMM', (c, a) => xsymm(c, a, 'volu'), [...PREP]);

// ------------------------------------------------------------------ lines
function lineInCsys(m: ModelState, k1: Id, k2: Id, ndiv?: number): Line {
  const cs = getCsys(m, m.cur.csys);
  if (cs.type === 0) {
    const ex = findStraight(m, k1, k2);
    if (ex) throw new ApdlError('LINE_EXISTS', `A line between keypoints ${k1} and ${k2} already exists (line ${ex.id}).`);
    const l = addStraight(m, k1, k2);
    if (ndiv) l.mesh = { ndiv };
    return l;
  }
  // curved line in the active cylindrical/spherical system
  const q1 = globalToCsys(cs, kpXyz(m, k1)), q2 = globalToCsys(cs, kpXyz(m, k2));
  let dth = q2[1] - q1[1];
  if (dth > 180) dth -= 360;
  if (dth < -180) dth += 360;
  const n = Math.max(2, Math.ceil(Math.abs(dth) / 11.25));
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(csysToGlobal(cs, [q1[0] + (q2[0] - q1[0]) * t, q1[1] + dth * t, q1[2] + (q2[2] - q1[2]) * t]));
  }
  pts[0] = [...kpXyz(m, k1)] as Vec3;
  pts[n] = [...kpXyz(m, k2)] as Vec3;
  const isArc = cs.type === 1 && Math.abs(q1[0] - q2[0]) < 1e-9 * Math.max(1, q1[0]) && Math.abs(q1[2] - q2[2]) < 1e-9 && Math.abs(dth) > 1e-9;
  let l: Line;
  if (isArc) {
    const c0 = csysToGlobal(cs, [0, 0, q1[2]]);
    l = addLine(m, k1, k2, pts, 'arc', { center: c0, axis: norm(scale(cs.axes[2], Math.sign(dth))), radius: q1[0] });
  } else if (Math.abs(dth) < 1e-9) {
    l = addStraight(m, k1, k2);
  } else l = addLine(m, k1, k2, pts, 'poly');
  if (ndiv) l.mesh = { ndiv };
  return l;
}

reg('L', (c, a) => {
  const k1 = a.int(0), k2 = a.int(1);
  kpXyz(c.m, k1); kpXyz(c.m, k2);
  if (k1 === k2) throw new ApdlError('LINE_DEGENERATE', `L: both keypoints are ${k1}.`);
  lineInCsys(c.m, k1, k2, a.int(2, 0) || undefined);
}, [...PREP]);
reg('LSTR', (c, a) => {
  const k1 = a.int(0), k2 = a.int(1);
  kpXyz(c.m, k1); kpXyz(c.m, k2);
  addStraight(c.m, k1, k2);
}, [...PREP]);

reg('LARC', (c, a) => {
  const m = c.m;
  const k1 = a.int(0), k2 = a.int(1), kc = a.int(2);
  const p1 = kpXyz(m, k1), p2 = kpXyz(m, k2), pc = kpXyz(m, kc);
  const rad = a.num(3, 0);
  let center: Vec3, axis: Vec3, ang: number;
  if (rad === 0) {
    const cc = circleCenter(p1, pc, p2);
    if (!cc) throw new ApdlError('LARC_COLLINEAR', 'LARC: keypoints are collinear; an arc cannot be fitted.');
    center = cc.center;
    axis = cc.axis; // orientation P1 -> PC -> P2
    const v1 = sub(p1, center), v2 = sub(p2, center);
    ang = Math.atan2(dot(cross(v1, v2), axis), dot(v1, v2));
    if (ang <= 0) ang += 2 * Math.PI;
  } else {
    const chord = sub(p2, p1);
    const h = len(chord) / 2;
    const R = Math.abs(rad);
    if (R < h - 1e-12) throw new ApdlError('LARC_RADIUS', `LARC: radius ${fmt(R)} is smaller than half the chord (${fmt(h)}).`);
    const mid: Vec3 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2];
    const n = cross(chord, sub(pc, p1));
    if (len(n) < 1e-14) throw new ApdlError('LARC_COLLINEAR', 'LARC: PC lies on the line P1-P2; it cannot define the arc plane.');
    const nn = norm(n);
    let side = norm(cross(nn, chord)); // in plane, perpendicular to chord
    if (dot(side, sub(pc, mid)) < 0) side = scale(side, -1);
    if (rad < 0) side = scale(side, -1);
    const d = Math.sqrt(Math.max(0, R * R - h * h));
    center = add(mid, scale(side, d));
    const v1 = sub(p1, center), v2 = sub(p2, center);
    axis = norm(cross(v1, v2));
    if (len(cross(v1, v2)) < 1e-14) axis = nn;
    ang = Math.atan2(len(cross(v1, v2)), dot(v1, v2));
  }
  addArc(m, k1, k2, center, axis, ang);
}, [...PREP]);

reg('CIRCLE', (c, a) => {
  const m = c.m;
  const kc = a.int(0);
  const pc = kpXyz(m, kc);
  let axis: Vec3 = m.wp.axes[2];
  if (!a.isBlank(2) && a.int(2)) axis = norm(sub(kpXyz(m, a.int(2)), pc));
  let ref: Vec3 = m.wp.axes[0];
  let rad = a.num(1, 0);
  if (!a.isBlank(3) && a.int(3)) {
    const pz = kpXyz(m, a.int(3));
    const v = sub(pz, pc);
    ref = norm(sub(v, scale(axis, dot(v, axis))));
    if (!rad) rad = len(sub(v, scale(axis, dot(v, axis))));
  } else ref = norm(sub(ref, scale(axis, dot(ref, axis))));
  if (rad <= 0) throw new ApdlError('CIRCLE_RAD', 'CIRCLE: radius must be positive.');
  const arcDeg = a.num(4, 360) || 360;
  const nseg = a.int(5, 0) || Math.max(1, Math.ceil(Math.abs(arcDeg) / 90 - 1e-9));
  const full = Math.abs(Math.abs(arcDeg) - 360) < 1e-9;
  const kps: Id[] = [];
  const cnt = full ? nseg : nseg + 1;
  for (let i = 0; i < cnt; i++) {
    const p = rotateAbout(add(pc, scale(ref, rad)), pc, axis, ((arcDeg * i) / nseg) * Math.PI / 180);
    kps.push(addKp(m, p).id);
  }
  for (let i = 0; i < nseg; i++) addArc(m, kps[i], full ? kps[(i + 1) % nseg] : kps[i + 1], pc, axis, ((arcDeg / nseg) * Math.PI) / 180);
}, [...PREP]);

reg('LDIV', (c, a) => {
  const m = c.m;
  const lid = a.int(0);
  const l = m.lines.get(lid);
  if (!l) throw new ApdlError('LINE_UNDEFINED', `Line ${lid} is undefined.`);
  const ndiv = a.int(3, 2) || 2;
  const ratio = a.isBlank(1) ? 0.5 : a.num(1);
  const tol = 1e-9 * Math.max(1, l.length);
  const fractions = ndiv === 2 ? [ratio] : Array.from({ length: ndiv - 1 }, (_, i) => (i + 1) / ndiv);
  let cur = lid;
  let consumed = 0;
  for (const fr of fractions) {
    const L = m.lines.get(cur)!;
    const target = (fr - consumed) / (1 - consumed) * L.length;
    // point at arc-length `target`
    let acc = 0;
    let p: Vec3 = L.pts[0];
    for (let i = 0; i < L.pts.length - 1; i++) {
      const s = dist(L.pts[i], L.pts[i + 1]);
      if (acc + s >= target) {
        const t = (target - acc) / s;
        p = [L.pts[i][0] + (L.pts[i + 1][0] - L.pts[i][0]) * t, L.pts[i][1] + (L.pts[i + 1][1] - L.pts[i][1]) * t, L.pts[i][2] + (L.pts[i + 1][2] - L.pts[i][2]) * t];
        break;
      }
      acc += s;
    }
    const r = splitLineAt(m, cur, p, tol);
    if (!r) break;
    cur = r[2];
    consumed = fr;
  }
}, [...PREP]);

reg(['LFILLT', 'LCOMB', 'ASKIN'], (c) => {
  throw new ApdlError('UNSUPPORTED', `${c.cmd} is not supported by the trainer's geometry kernel yet.`);
}, [...PREP]);

// ------------------------------------------------------------------ areas
/** Any existing line (straight or curved) joining two keypoints. */
function lineBetween(m: ModelState, k1: Id, k2: Id): number | undefined {
  for (const l of m.lines.values()) {
    if (l.kps[0] === k1 && l.kps[1] === k2) return l.id;
    if (l.kps[0] === k2 && l.kps[1] === k1) return -l.id;
  }
  return undefined;
}

function areaFromKps(m: ModelState, kps: Id[]): Id {
  // drop consecutive duplicates (degenerate faces)
  const ks: Id[] = [];
  for (const k of kps) if (ks[ks.length - 1] !== k) ks.push(k);
  while (ks.length > 1 && ks[0] === ks[ks.length - 1]) ks.pop();
  if (ks.length < 3) throw new ApdlError('AREA_KPS', 'An area needs at least three distinct keypoints.');
  for (const k of ks) kpXyz(m, k);
  // reuse an existing area with the same keypoint set
  const key = [...ks].sort((x, y) => x - y).join(',');
  for (const ar of m.areas.values()) {
    if (areaKps(m, ar).sort((x, y) => x - y).join(',') === key && ar.loops.length === 1 && ar.loops[0].length === ks.length) return ar.id;
  }
  const loop: number[] = [];
  for (let i = 0; i < ks.length; i++) {
    const a = ks[i], b = ks[(i + 1) % ks.length];
    let s = lineBetween(m, a, b);
    if (s === undefined) s = addStraight(m, a, b).id;
    loop.push(s);
  }
  return addPlanarArea(m, [loop]).id;
}

reg('A', (c, a) => {
  const kps: Id[] = [];
  for (let i = 0; i < 18; i++) if (!a.isBlank(i)) kps.push(a.int(i));
  areaFromKps(c.m, kps);
}, [...PREP]);

reg('AL', (c, a) => {
  const m = c.m;
  let lines: Id[] = [];
  if (a.lab(0) === 'ALL' || m.comps.has(a.lab(0))) lines = a.entities('line', 0);
  else for (let i = 0; i < 10; i++) if (!a.isBlank(i)) lines.push(a.int(i));
  for (const l of lines) c.ensureExists('line', l);
  // separate into connected loops: the loop containing the first line is the outer one
  const loops: number[][] = [];
  const rest = [...lines];
  while (rest.length) {
    const comp: Id[] = [rest.shift()!];
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = rest.length - 1; i >= 0; i--) {
        const l = m.lines.get(rest[i])!;
        if (comp.some((x) => { const q = m.lines.get(x)!; return q.kps.includes(l.kps[0]) || q.kps.includes(l.kps[1]); })) {
          comp.push(rest.splice(i, 1)[0]);
          grew = true;
        }
      }
    }
    loops.push(chainLoop(m, comp));
  }
  addPlanarArea(m, loops);
}, [...PREP]);

// ------------------------------------------------------------------ volumes
reg('V', (c, a) => {
  const m = c.m;
  const p: Id[] = [];
  for (let i = 0; i < 8; i++) p.push(a.isBlank(i) ? 0 : a.int(i));
  const used = p.filter((x) => x);
  if (used.length < 4) throw new ApdlError('V_KPS', 'V needs at least 4 keypoints.');
  for (const k of used) kpXyz(m, k);
  let faces: Id[][];
  if (used.length === 4) faces = [[p[0], p[1], p[2]], [p[0], p[1], p[3]], [p[1], p[2], p[3]], [p[2], p[0], p[3]]];
  else {
    const P = p.map((x, i) => x || p[i - 4] || p[i - 1]);
    faces = [[P[0], P[1], P[2], P[3]], [P[4], P[5], P[6], P[7]], [P[0], P[1], P[5], P[4]], [P[1], P[2], P[6], P[5]], [P[2], P[3], P[7], P[6]], [P[3], P[0], P[4], P[7]]];
  }
  const areaIds: Id[] = [];
  for (const f of faces) {
    const ks: Id[] = [];
    for (const k of f) if (ks[ks.length - 1] !== k) ks.push(k);
    while (ks.length > 1 && ks[0] === ks[ks.length - 1]) ks.pop();
    if (new Set(ks).size < 3) continue;
    const id = areaFromKps(m, ks);
    if (!areaIds.includes(id)) areaIds.push(id);
  }
  addVolume(m, areaIds);
}, [...PREP]);

reg('VA', (c, a) => {
  const m = c.m;
  let ids: Id[] = [];
  if (a.lab(0) === 'ALL' || m.comps.has(a.lab(0))) ids = a.entities('area', 0);
  else for (let i = 0; i < 10; i++) if (!a.isBlank(i)) ids.push(a.int(i));
  for (const id of ids) c.ensureExists('area', id);
  addVolume(m, ids);
}, [...PREP]);

// ------------------------------------------------------------------ deletes
reg('KDELE', (c, a) => {
  const m = c.m;
  for (const id of a.entities('kp', 0)) {
    if (!m.kps.has(id)) continue;
    if (linesUsingKp(m, id).length) { c.warn('KP_ATTACHED', `Keypoint ${id} is attached to a line and cannot be deleted.`); continue; }
    if (isMeshed(m, 'kp', id)) { c.warn('MESHED', `Keypoint ${id} is meshed and cannot be deleted.`); continue; }
    m.kps.delete(id); m.sel.kp.delete(id);
  }
}, [...PREP]);
reg('LDELE', (c, a) => {
  const m = c.m;
  const kswp = a.int(3, 0) === 1;
  for (const id of a.entities('line', 0)) {
    const l = m.lines.get(id);
    if (!l) continue;
    if (areasUsingLine(m, id).length) { c.warn('LINE_ATTACHED', `Line ${id} is attached to an area and cannot be deleted.`); continue; }
    if (isMeshed(m, 'line', id)) { c.warn('MESHED', `Line ${id} is meshed and cannot be deleted.  Use LCLEAR first.`); continue; }
    m.lines.delete(id); m.sel.line.delete(id);
    if (kswp) sweepUnused(m, { kps: l.kps });
  }
}, [...PREP]);
reg('ADELE', (c, a) => {
  const m = c.m;
  const kswp = a.int(3, 0) === 1;
  for (const id of a.entities('area', 0)) {
    const ar = m.areas.get(id);
    if (!ar) continue;
    if (volumesUsingArea(m, id).length) { c.warn('AREA_ATTACHED', `Area ${id} is attached to a volume and cannot be deleted.`); continue; }
    if (isMeshed(m, 'area', id)) { c.warn('MESHED', `Area ${id} is meshed and cannot be deleted.  Use ACLEAR first.`); continue; }
    const lines = areaLines(ar), kps = areaKps(m, ar);
    m.areas.delete(id); m.sel.area.delete(id);
    if (kswp) sweepUnused(m, { lines, kps });
  }
}, [...PREP]);
reg('VDELE', (c, a) => {
  const m = c.m;
  const kswp = a.int(3, 0) === 1;
  const ids = a.entities('volu', 0).filter((id) => m.volus.has(id));
  for (const id of ids) if (isMeshed(m, 'volu', id)) throw new ApdlError('MESHED', `Volume ${id} is meshed and cannot be deleted.  Use VCLEAR first.`);
  deleteVolumes(m, ids, kswp);
}, [...PREP]);

export { selectedIds };
