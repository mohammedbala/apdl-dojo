// Volume Booleans (VADD, VSBV, VINV, VOVLAP, VSBA) and VGLUE.
import type { Manifold } from 'manifold-3d';
import type { Area, Id, ModelState, Vec3, Volume } from '../model/types';
import { ApdlError } from '../apdl/diagnostics';
import { nextId, selectNew } from '../model/state';
import { boolTol, rebuildFromManifold, volumeToManifold } from './brep';
import { coplanar, imprintAreas, replaceAreaInVolumes, conformLines } from './imprint';
import { areaLines, areaKps, isMeshed, sweepUnused, volumeKps, volumeLines, volumesUsingArea } from './topo';
import { bboxOverlap, dot } from './vec';

function getVol(m: ModelState, id: Id): Volume {
  const v = m.volus.get(id);
  if (!v) throw new ApdlError('VOLU_UNDEFINED', `Volume ${id} is undefined.`);
  return v;
}

function assertUnmeshed(m: ModelState, ids: Id[]) {
  for (const id of ids) if (isMeshed(m, 'volu', id)) throw new ApdlError('MESHED', `Volume ${id} is meshed.  Booleans cannot be performed on meshed entities.  Clear the mesh first (VCLEAR).`);
}

/** Delete volumes and any of their lower entities that become unused. */
export function deleteVolumes(m: ModelState, ids: Id[], sweep = true) {
  const areas = new Set<Id>(), lines = new Set<Id>(), kps = new Set<Id>();
  for (const id of ids) {
    const v = m.volus.get(id);
    if (!v) continue;
    for (const a of v.areas) areas.add(a);
    for (const l of volumeLines(m, v)) lines.add(l);
    for (const k of volumeKps(m, v)) kps.add(k);
    m.volus.delete(id);
    m.sel.volu.delete(id);
  }
  if (sweep) sweepUnused(m, { areas, lines, kps });
}

function withManifolds<T>(vols: Volume[], f: (ms: Map<Id, Manifold>) => T): T {
  const ms = new Map<Id, Manifold>();
  try {
    for (const v of vols) ms.set(v.id, volumeToManifold(v));
    return f(ms);
  } finally {
    for (const x of ms.values()) x.delete();
  }
}

export function vadd(m: ModelState, ids: Id[]): Id[] {
  if (ids.length < 2) throw new ApdlError('BOOL_COUNT', 'VADD needs at least two volumes.');
  const vols = ids.map((id) => getVol(m, id));
  assertUnmeshed(m, ids);
  const tol = boolTol(vols);
  const out = withManifolds(vols, (ms) => {
    let acc = ms.get(vols[0].id)!;
    const tmp: Manifold[] = [];
    for (let i = 1; i < vols.length; i++) { acc = acc.add(ms.get(vols[i].id)!); tmp.push(acc); }
    const r = rebuildFromManifold(m, acc, { inputs: vols, tol });
    tmp.forEach((t) => t.delete());
    return r;
  });
  deleteVolumes(m, ids);
  return out;
}

export function vsbv(m: ModelState, ids1: Id[], ids2: Id[], keep1: boolean, keep2: boolean): Id[] {
  const v1 = ids1.map((id) => getVol(m, id));
  const v2 = ids2.map((id) => getVol(m, id));
  assertUnmeshed(m, [...ids1, ...ids2]);
  const tol = boolTol([...v1, ...v2]);
  const created: Id[] = [];
  const consumed: Id[] = [];
  withManifolds([...new Map([...v1, ...v2].map((v) => [v.id, v])).values()], (ms) => {
    for (const a of v1) {
      const tools = v2.filter((b) => b.id !== a.id && bboxOverlap(a.bbox, b.bbox, tol));
      if (tools.length === 0) continue;
      let acc = ms.get(a.id)!;
      const tmp: Manifold[] = [];
      for (const b of tools) { acc = acc.subtract(ms.get(b.id)!); tmp.push(acc); }
      const vol = acc.volume();
      if (Math.abs(vol - a.volume) <= 1e-9 * Math.max(1, a.volume)) {
        tmp.forEach((t) => t.delete());
        continue; // no intersection: unchanged
      }
      const r = rebuildFromManifold(m, acc, { inputs: [a, ...tools], tol });
      tmp.forEach((t) => t.delete());
      created.push(...r);
      consumed.push(a.id);
    }
  });
  if (created.length === 0 && consumed.length === 0) {
    throw new ApdlError('BOOL_NOOP', `VSBV: the subtracted volume(s) ${ids2.join(' ')} do not intersect volume(s) ${ids1.join(' ')}.  No volumes were modified.`);
  }
  const del: Id[] = [];
  if (!keep1) del.push(...consumed);
  if (!keep2) for (const id of ids2) if (!ids1.includes(id)) del.push(id);
  deleteVolumes(m, [...new Set(del)]);
  return created;
}

export function vinv(m: ModelState, ids: Id[]): Id[] {
  if (ids.length < 2) throw new ApdlError('BOOL_COUNT', 'VINV needs at least two volumes.');
  const vols = ids.map((id) => getVol(m, id));
  assertUnmeshed(m, ids);
  const tol = boolTol(vols);
  const out = withManifolds(vols, (ms) => {
    let acc = ms.get(vols[0].id)!;
    const tmp: Manifold[] = [];
    for (let i = 1; i < vols.length; i++) { acc = acc.intersect(ms.get(vols[i].id)!); tmp.push(acc); }
    if (acc.volume() <= tol * tol * tol) { tmp.forEach((t) => t.delete()); throw new ApdlError('BOOL_EMPTY', 'VINV: the volumes do not intersect.'); }
    const r = rebuildFromManifold(m, acc, { inputs: vols, tol });
    tmp.forEach((t) => t.delete());
    return r;
  });
  deleteVolumes(m, ids);
  return out;
}

/** VOVLAP / VPTN: split overlapping volumes into non-overlapping pieces that share faces. */
export function voverlap(m: ModelState, ids: Id[]): Id[] {
  if (ids.length < 2) throw new ApdlError('BOOL_COUNT', 'VOVLAP needs at least two volumes.');
  const vols = ids.map((id) => getVol(m, id));
  assertUnmeshed(m, ids);
  const tol = boolTol(vols);
  const minV = tol * tol * tol * 1000;
  const pieces = withManifolds(vols, (ms) => {
    let cur: Manifold[] = [ms.get(vols[0].id)!];
    const owned: Manifold[] = [];
    for (let i = 1; i < vols.length; i++) {
      const B = ms.get(vols[i].id)!;
      const next: Manifold[] = [];
      let rest = B;
      for (const P of cur) {
        const ip = P.intersect(B); owned.push(ip);
        const dp = P.subtract(B); owned.push(dp);
        if (ip.volume() > minV) next.push(ip);
        if (dp.volume() > minV) next.push(dp);
        const r = rest.subtract(P); owned.push(r);
        rest = r;
      }
      if (rest.volume() > minV) next.push(rest);
      cur = next;
    }
    const out: Id[] = [];
    for (const P of cur) out.push(...rebuildFromManifold(m, P, { inputs: vols, tol }));
    owned.forEach((x) => x.delete());
    return out;
  });
  deleteVolumes(m, ids);
  if (pieces.length > 1) return vglue(m, pieces);
  return pieces;
}

/** VSBA: split volume(s) by the (infinite) plane of a planar area. */
export function vsba(m: ModelState, vids: Id[], area: Area, keepV: boolean): Id[] {
  if (area.surface.kind !== 'plane') throw new ApdlError('AREA_NONPLANAR', `VSBA: area ${area.id} is not planar (only planar cutting areas are supported).`);
  const n = area.surface.normal;
  const off = dot(n, area.surface.origin);
  const vols = vids.map((id) => getVol(m, id));
  assertUnmeshed(m, vids);
  const tol = boolTol(vols);
  const out: Id[] = [];
  const consumed: Id[] = [];
  withManifolds(vols, (ms) => {
    for (const v of vols) {
      const [a, b] = ms.get(v.id)!.splitByPlane(n as [number, number, number], off);
      const va = a.volume(), vb = b.volume();
      if (va > tol ** 3 && vb > tol ** 3) {
        out.push(...rebuildFromManifold(m, a, { inputs: [v], tol }));
        out.push(...rebuildFromManifold(m, b, { inputs: [v], tol }));
        consumed.push(v.id);
      }
      a.delete(); b.delete();
    }
  });
  if (!keepV) deleteVolumes(m, consumed);
  if (out.length > 1) return vglue(m, out);
  return out;
}

/** VGLUE: make touching volumes share coincident planar faces. Returns final ids of modified volumes. */
export function vglue(m: ModelState, ids: Id[]): Id[] {
  const vols = ids.map((id) => getVol(m, id));
  assertUnmeshed(m, ids);
  if (vols.length < 2) return ids;
  const tol = boolTol(vols);
  // overlap check
  withManifolds(vols, (ms) => {
    for (let i = 0; i < vols.length; i++) for (let j = i + 1; j < vols.length; j++) {
      const a = vols[i], b = vols[j];
      if (!bboxOverlap(a.bbox, b.bbox, -tol)) continue;
      const x = ms.get(a.id)!.intersect(ms.get(b.id)!);
      const vol = x.volume();
      x.delete();
      if (vol > Math.max(tol ** 3 * 1000, 1e-9 * Math.min(a.volume, b.volume))) {
        throw new ApdlError('VOL_OVERLAP', `Volumes ${a.id} and ${b.id} overlap.  Use VOVLAP or VPTN instead of VGLUE.`);
      }
    }
  });
  const modified = new Set<Id>();
  const idSet = new Set(ids);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    for (let guard = 0; guard < 200; guard++) {
      const A = m.volus.get(ids[i]), B = m.volus.get(ids[j]);
      if (!A || !B || !bboxOverlap(A.bbox, B.bbox, tol)) break;
      let did = false;
      outer: for (const fa of A.areas) {
        const a = m.areas.get(fa)!;
        if (a.surface.kind !== 'plane') continue;
        for (const fb of B.areas) {
          if (fa === fb) continue;
          const b = m.areas.get(fb)!;
          if (b.surface.kind !== 'plane') continue;
          if (!coplanar(a, b, tol)) continue;
          const nA = a.surface.normal, nB = (b.surface as { normal: Vec3 }).normal;
          // outward normals must face each other
          const outA = A.areaFlip[A.areas.indexOf(fa)] ? -1 : 1;
          const outB = B.areaFlip[B.areas.indexOf(fb)] ? -1 : 1;
          if (dot(nA, nB) * outA * outB > 0) continue;
          const r = imprintAreas(m, a, b, tol);
          if (!r) continue;
          for (const v of volumesUsingArea(m, fa)) modified.add(v.id);
          for (const v of volumesUsingArea(m, fb)) modified.add(v.id);
          const invertShared = dot(nA, nB) < 0;
          replaceAreaInVolumes(m, fa, [...r.shared.map((id) => ({ id, invert: false })), ...r.onlyA.map((id) => ({ id, invert: false }))]);
          replaceAreaInVolumes(m, fb, [...r.shared.map((id) => ({ id, invert: invertShared })), ...r.onlyB.map((id) => ({ id, invert: false }))]);
          const oldLines = [...areaLines(a), ...areaLines(b)];
          const oldKps = [...areaKps(m, a), ...areaKps(m, b)];
          sweepUnused(m, { areas: [fa, fb], lines: oldLines, kps: oldKps });
          did = true;
          break outer;
        }
      }
      if (!did) break;
    }
  }
  // edge-only contacts: make lines/keypoints shared where volumes touch along edges
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const A = m.volus.get(ids[i]), B = m.volus.get(ids[j]);
    if (!A || !B || !bboxOverlap(A.bbox, B.bbox, tol)) continue;
    const ch = conformLines(m, () => [...volumeLines(m, m.volus.get(ids[i])!), ...volumeLines(m, m.volus.get(ids[j])!)], tol);
    if (ch) { modified.add(A.id); modified.add(B.id); }
  }
  // ANSYS renumbers the glued volumes
  const result: Id[] = [];
  const mods = [...modified].filter((id) => idSet.has(id) || m.volus.has(id)).sort((a, b) => a - b);
  const remap = new Map<Id, Id>();
  for (const old of mods) {
    const v = m.volus.get(old);
    if (!v) continue;
    const nid = nextId(m, 'volu');
    remap.set(old, nid);
    m.volus.set(nid, { ...v, id: nid });
    selectNew(m, 'volu', nid);
  }
  for (const old of remap.keys()) { m.volus.delete(old); m.sel.volu.delete(old); }
  for (const id of ids) result.push(remap.get(id) ?? id);
  for (const c of m.comps.values()) if (c.kind === 'volu') c.ids = c.ids.map((x) => remap.get(x) ?? x);
  return result;
}
