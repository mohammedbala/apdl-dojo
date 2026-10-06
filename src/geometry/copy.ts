// Copy / move / reflect solid-model entities with sharing preserved (KGEN, LGEN, AGEN, VGEN, xSYMM).
import type { Area, Id, ModelState, Surface, Vec3 } from '../model/types';
import { ApdlError } from '../apdl/diagnostics';
import { nextId, selectNew } from '../model/state';
import { addAreaWithTess, addKp, addLine, addVolume, areaLines, mapTess, planeFrame, loopPoints, refreshVolume, triStats } from './topo';
import { circleCenter } from './brep';
import { cross, dot, norm } from './vec';

export interface CopyMaps {
  kp: Map<Id, Id>;
  line: Map<Id, Id>;
  area: Map<Id, Id>;
  volu: Map<Id, Id>;
}

export interface CopyOpts {
  f: (p: Vec3) => Vec3;
  /** numbering increment (KINC); 0 = next available */
  kinc?: number;
  /** the transform is a reflection */
  reflect?: boolean;
}

function idFor(m: ModelState, kind: 'kp' | 'line' | 'area' | 'volu', old: Id, kinc: number): Id {
  if (kinc > 0) {
    const id = old + kinc;
    const map = { kp: m.kps, line: m.lines, area: m.areas, volu: m.volus }[kind] as Map<Id, unknown>;
    if (map.has(id)) throw new ApdlError('GEN_EXISTS', `${kind.toUpperCase()} ${id} already exists; choose a larger KINC.`);
    return id;
  }
  return nextId(m, kind);
}

export function copyKp(m: ModelState, id: Id, o: CopyOpts, maps: CopyMaps): Id {
  const ex = maps.kp.get(id);
  if (ex) return ex;
  const k = m.kps.get(id);
  if (!k) throw new ApdlError('KP_UNDEFINED', `Keypoint ${id} is undefined.`);
  const n = addKp(m, o.f(k.xyz), idFor(m, 'kp', id, o.kinc ?? 0));
  maps.kp.set(id, n.id);
  return n.id;
}

export function copyLine(m: ModelState, id: Id, o: CopyOpts, maps: CopyMaps): Id {
  const ex = maps.line.get(id);
  if (ex) return ex;
  const l = m.lines.get(id);
  if (!l) throw new ApdlError('LINE_UNDEFINED', `Line ${id} is undefined.`);
  const k0 = copyKp(m, l.kps[0], o, maps), k1 = copyKp(m, l.kps[1], o, maps);
  const pts = l.pts.map((p) => o.f(p));
  pts[0] = [...m.kps.get(k0)!.xyz] as Vec3;
  pts[pts.length - 1] = [...m.kps.get(k1)!.xyz] as Vec3;
  let arc = undefined as undefined | { center: Vec3; axis: Vec3; radius: number };
  if (l.kind === 'arc') {
    const cc = circleCenter(pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]);
    if (cc) arc = { center: cc.center, axis: cc.axis, radius: l.arc?.radius ?? 0 };
  }
  const nl = addLine(m, k0, k1, pts, l.kind, arc, idFor(m, 'line', id, o.kinc ?? 0));
  if (l.mesh) nl.mesh = { ...l.mesh };
  if (l.attrs) nl.attrs = { ...l.attrs };
  maps.line.set(id, nl.id);
  return nl.id;
}

function mapSurface(s: Surface, o: CopyOpts, loopsPts: Vec3[], tessNormal: Vec3): Surface {
  if (s.kind === 'plane') {
    try {
      const f = planeFrame(loopsPts);
      const n = dot(f.normal, tessNormal) < 0 ? [-f.normal[0], -f.normal[1], -f.normal[2]] as Vec3 : f.normal;
      return { kind: 'plane', origin: f.origin, normal: n, u: f.u, v: cross(n, f.u) };
    } catch {
      return { kind: 'free' };
    }
  }
  if (s.kind === 'cyl') {
    const o0 = o.f(s.origin);
    const o1 = o.f([s.origin[0] + s.axis[0], s.origin[1] + s.axis[1], s.origin[2] + s.axis[2]]);
    const r1 = o.f([s.origin[0] + s.ref[0], s.origin[1] + s.ref[1], s.origin[2] + s.ref[2]]);
    return { kind: 'cyl', origin: o0, axis: norm([o1[0] - o0[0], o1[1] - o0[1], o1[2] - o0[2]]), radius: s.radius, ref: norm([r1[0] - o0[0], r1[1] - o0[1], r1[2] - o0[2]]) };
  }
  if (s.kind === 'sphere') return { kind: 'sphere', center: o.f(s.center), radius: s.radius };
  return { kind: 'free' };
}

export function copyArea(m: ModelState, id: Id, o: CopyOpts, maps: CopyMaps): Id {
  const ex = maps.area.get(id);
  if (ex) return ex;
  const a = m.areas.get(id);
  if (!a) throw new ApdlError('AREA_UNDEFINED', `Area ${id} is undefined.`);
  for (const lid of areaLines(a)) copyLine(m, lid, o, maps);
  const loops = a.loops.map((loop) => loop.map((s) => Math.sign(s) * maps.line.get(Math.abs(s))!));
  const tess = mapTess(a.tess, o.f);
  const tn = triStats(tess).normal;
  const surface = mapSurface(a.surface, o, loopPoints(m, loops[0]), tn);
  const na: Area = addAreaWithTess(m, loops, surface, tess, idFor(m, 'area', id, o.kinc ?? 0));
  if (a.attrs) na.attrs = { ...a.attrs };
  if (a.esize) na.esize = a.esize;
  maps.area.set(id, na.id);
  return na.id;
}

export function copyVolume(m: ModelState, id: Id, o: CopyOpts, maps: CopyMaps): Id {
  const ex = maps.volu.get(id);
  if (ex) return ex;
  const v = m.volus.get(id);
  if (!v) throw new ApdlError('VOLU_UNDEFINED', `Volume ${id} is undefined.`);
  const areas = v.areas.map((aid) => copyArea(m, aid, o, maps));
  const nv = addVolume(m, areas, { id: idFor(m, 'volu', id, o.kinc ?? 0), requireClosed: false });
  if (v.gen && v.gen.kind === 'prism' && !o.reflect) {
    const p0 = o.f([0, 0, 0]), p1 = o.f(v.gen.dir);
    nv.gen = { kind: 'prism', dir: norm([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]) };
  }
  if (v.attrs) nv.attrs = { ...v.attrs };
  if (v.esize) nv.esize = v.esize;
  maps.volu.set(id, nv.id);
  return nv.id;
}

export function newMaps(): CopyMaps {
  return { kp: new Map(), line: new Map(), area: new Map(), volu: new Map() };
}

/** Move entities in place (IMOVE=1): transform kps, line pts, area tess, refresh volumes. */
export function moveEntities(m: ModelState, kps: Id[], lines: Id[], areas: Id[], volus: Id[], f: (p: Vec3) => Vec3) {
  for (const k of kps) { const kp = m.kps.get(k); if (kp) kp.xyz = f(kp.xyz); }
  for (const l of lines) {
    const ln = m.lines.get(l);
    if (!ln) continue;
    ln.pts = ln.pts.map(f);
    if (ln.arc) ln.arc = { ...ln.arc, center: f(ln.arc.center) };
  }
  for (const a of areas) {
    const ar = m.areas.get(a);
    if (!ar) continue;
    ar.tess = mapTess(ar.tess, f);
    const st = triStats(ar.tess);
    ar.centroid = st.centroid;
    if (ar.surface.kind === 'plane') ar.surface = { ...ar.surface, origin: f(ar.surface.origin) };
  }
  for (const v of volus) {
    const vol = m.volus.get(v);
    if (vol) refreshVolume(m, vol);
  }
  void selectNew;
}
