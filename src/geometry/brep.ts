// Manifold <-> B-rep conversion. Booleans run on triangle meshes tagged with area ids (faceID);
// the B-rep (areas, lines, keypoints with ANSYS numbers) is rebuilt from the tagged output.
import type { Manifold } from 'manifold-3d';
import type { Area, Id, Line, ModelState, Surface, TriMesh, Vec3, Volume } from '../model/types';
import { getKernel } from './kernel';
import { ApdlError } from '../apdl/diagnostics';
import { nextId, selectNew } from '../model/state';
import { addKp, addLine, addVolume, areaLines, polyLength, triStats, volumeKps, volumeLines } from './topo';
import { cross, dist, dot, len, norm, segDist, sub } from './vec';

// ---------------------------------------------------------------- to manifold
export function volumeToManifold(v: Volume): Manifold {
  const { Manifold: M, Mesh } = getKernel();
  const t = v.tess;
  const keyMap = new Map<string, number>();
  const verts: number[] = [];
  const remap = new Uint32Array(t.pos.length / 3);
  const f32 = new Float32Array(3);
  for (let i = 0; i < t.pos.length / 3; i++) {
    f32[0] = t.pos[3 * i]; f32[1] = t.pos[3 * i + 1]; f32[2] = t.pos[3 * i + 2];
    const k = `${f32[0]},${f32[1]},${f32[2]}`;
    let j = keyMap.get(k);
    if (j === undefined) { j = verts.length / 3; verts.push(f32[0], f32[1], f32[2]); keyMap.set(k, j); }
    remap[i] = j;
  }
  const tri: number[] = [];
  const fid: number[] = [];
  for (let i = 0; i < t.idx.length; i += 3) {
    const a = remap[t.idx[i]], b = remap[t.idx[i + 1]], c = remap[t.idx[i + 2]];
    if (a === b || b === c || a === c) continue;
    tri.push(a, b, c);
    fid.push(t.tag ? t.tag[i / 3] : 0);
  }
  const mesh = new Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tri), faceID: new Uint32Array(fid) });
  let man: Manifold;
  try {
    man = new M(mesh);
  } catch (e) {
    throw new ApdlError('BOOL_INPUT', `Volume ${v.id} is not a closed solid and cannot be used in a Boolean operation (${(e as Error).message ?? e}).`);
  }
  const st = man.status();
  if (st !== 'NoError') {
    man.delete();
    throw new ApdlError('BOOL_INPUT', `Volume ${v.id} is not a closed solid and cannot be used in a Boolean operation (${st}).`);
  }
  return man;
}

// ---------------------------------------------------------------- snapping
class PointSnap {
  private grid = new Map<string, Vec3[]>();
  constructor(private tol: number) {}
  private key(p: Vec3, dx = 0, dy = 0, dz = 0) {
    const c = this.tol * 4;
    return `${Math.floor(p[0] / c) + dx},${Math.floor(p[1] / c) + dy},${Math.floor(p[2] / c) + dz}`;
  }
  add(p: Vec3) {
    const k = this.key(p);
    const arr = this.grid.get(k);
    if (arr) arr.push(p);
    else this.grid.set(k, [p]);
  }
  snap(p: Vec3): Vec3 {
    let best: Vec3 | null = null;
    let bd = this.tol;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const arr = this.grid.get(this.key(p, dx, dy, dz));
      if (!arr) continue;
      for (const q of arr) {
        const d = dist(p, q);
        if (d <= bd) { bd = d; best = q; }
      }
    }
    return best ? [best[0], best[1], best[2]] : p;
  }
}

// ---------------------------------------------------------------- union find
class UF {
  p: Int32Array;
  constructor(n: number) { this.p = new Int32Array(n); for (let i = 0; i < n; i++) this.p[i] = i; }
  find(x: number): number { while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; } return x; }
  union(a: number, b: number) { a = this.find(a); b = this.find(b); if (a !== b) this.p[Math.max(a, b)] = Math.min(a, b); }
}

export interface RebuildContext {
  /** input volumes (their areas/lines/kps are reuse candidates) */
  inputs: Volume[];
  tol: number;
}

/**
 * Rebuild B-rep volumes from a Manifold result. Creates new volumes (lowest available numbers) and returns their ids.
 * Does NOT delete the inputs (caller does that after all outputs exist, like ANSYS).
 */
export function rebuildFromManifold(m: ModelState, res: Manifold, rc: RebuildContext): Id[] {
  const comps = res.decompose();
  // deterministic ordering by centroid (x, y, z)
  const items = comps.map((c) => {
    const mesh = c.getMesh();
    let cx = 0, cy = 0, cz = 0;
    const n = mesh.vertProperties.length / 3;
    for (let i = 0; i < n; i++) { cx += mesh.vertProperties[3 * i]; cy += mesh.vertProperties[3 * i + 1]; cz += mesh.vertProperties[3 * i + 2]; }
    return { c, mesh, key: [cx / n, cy / n, cz / n] as Vec3, vol: c.volume() };
  }).filter((it) => it.vol > rc.tol * rc.tol * rc.tol);
  items.sort((a, b) => (a.key[0] - b.key[0]) || (a.key[1] - b.key[1]) || (a.key[2] - b.key[2]));
  // snap candidates: input keypoints and line points
  const snap = new PointSnap(rc.tol);
  const candKps = new Set<Id>();
  const candLines = new Set<Id>();
  for (const v of rc.inputs) {
    for (const k of volumeKps(m, v)) candKps.add(k);
    for (const l of volumeLines(m, v)) candLines.add(l);
  }
  for (const k of candKps) snap.add(m.kps.get(k)!.xyz);
  for (const l of candLines) for (const p of m.lines.get(l)!.pts) snap.add(p);
  const out: Id[] = [];
  const ctxKps = new Set(candKps);
  for (const it of items) {
    out.push(rebuildComponent(m, it.mesh, rc, snap, ctxKps, candLines));
  }
  for (const c of comps) c.delete();
  return out;
}

interface HalfEdge { a: number; b: number; tri: number; comp: number; other: number }

function rebuildComponent(
  m: ModelState,
  mesh: { vertProperties: Float32Array; triVerts: Uint32Array; faceID: Uint32Array; numProp: number },
  rc: RebuildContext,
  snap: PointSnap,
  candKps: Set<Id>,
  candLines: Set<Id>,
): Id {
  const np = mesh.numProp;
  const nv = mesh.vertProperties.length / np;
  // merge vertices that are identical after snapping
  const P: Vec3[] = [];
  const vmap = new Int32Array(nv);
  const keyMap = new Map<string, number>();
  for (let i = 0; i < nv; i++) {
    const raw: Vec3 = [mesh.vertProperties[np * i], mesh.vertProperties[np * i + 1], mesh.vertProperties[np * i + 2]];
    const s = snap.snap(raw);
    const k = `${s[0]},${s[1]},${s[2]}`;
    let j = keyMap.get(k);
    if (j === undefined) { j = P.length; P.push(s); keyMap.set(k, j); }
    vmap[i] = j;
  }
  const T: [number, number, number][] = [];
  const F: number[] = [];
  for (let t = 0; t < mesh.triVerts.length / 3; t++) {
    const a = vmap[mesh.triVerts[3 * t]], b = vmap[mesh.triVerts[3 * t + 1]], c = vmap[mesh.triVerts[3 * t + 2]];
    if (a === b || b === c || a === c) continue;
    T.push([a, b, c]);
    F.push(mesh.faceID[t]);
  }
  // edge -> triangles
  const ek = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const edgeTris = new Map<number, number[]>();
  T.forEach((tr, t) => {
    for (let e = 0; e < 3; e++) {
      const k = ek(tr[e], tr[(e + 1) % 3]);
      const arr = edgeTris.get(k);
      if (arr) arr.push(t); else edgeTris.set(k, [t]);
    }
  });
  // face components: same faceID and edge-connected
  const uf = new UF(T.length);
  for (const arr of edgeTris.values()) {
    if (arr.length === 2 && F[arr[0]] === F[arr[1]]) uf.union(arr[0], arr[1]);
  }
  const compOfTri = new Int32Array(T.length);
  const compIndex = new Map<number, number>();
  const compTris: number[][] = [];
  T.forEach((_, t) => {
    const r = uf.find(t);
    let ci = compIndex.get(r);
    if (ci === undefined) { ci = compTris.length; compIndex.set(r, ci); compTris.push([]); }
    compTris[ci].push(t);
    compOfTri[t] = ci;
  });
  // boundary half-edges
  const hes: HalfEdge[] = [];
  T.forEach((tr, t) => {
    for (let e = 0; e < 3; e++) {
      const a = tr[e], b = tr[(e + 1) % 3];
      const arr = edgeTris.get(ek(a, b))!;
      const other = arr.find((x) => x !== t);
      const oc = other === undefined ? -1 : compOfTri[other];
      if (oc !== compOfTri[t]) hes.push({ a, b, tri: t, comp: compOfTri[t], other: oc });
    }
  });
  // vertex -> incident components
  const vComps = new Map<number, Set<number>>();
  T.forEach((tr, t) => {
    for (const v of tr) {
      let s = vComps.get(v);
      if (!s) { s = new Set(); vComps.set(v, s); }
      s.add(compOfTri[t]);
    }
  });
  const kpAt = new Map<number, Id>(); // vertex -> existing kp
  for (const k of candKps) {
    const kp = m.kps.get(k);
    if (!kp) continue;
    const key = `${kp.xyz[0]},${kp.xyz[1]},${kp.xyz[2]}`;
    const j = keyMap.get(key);
    if (j !== undefined) kpAt.set(j, k);
  }
  const isCorner = (v: number) => (vComps.get(v)?.size ?? 0) >= 3 || kpAt.has(v);
  // undirected boundary edges grouped by component pair
  const pairEdges = new Map<string, [number, number][]>();
  const seen = new Set<number>();
  for (const h of hes) {
    const k = ek(h.a, h.b);
    if (seen.has(k)) continue;
    seen.add(k);
    const pk = h.comp < h.other ? `${h.comp}|${h.other}` : `${h.other}|${h.comp}`;
    const arr = pairEdges.get(pk);
    if (arr) arr.push([h.a, h.b]); else pairEdges.set(pk, [[h.a, h.b]]);
  }
  const compPlanar = compTris.map((tris) => {
    const n0 = triNormal(P, T[tris[0]]);
    return tris.every((t) => Math.abs(dot(triNormal(P, T[t]), n0) - 1) < 1e-6);
  });
  // chains -> lines
  const edgeLine = new Map<number, { line: Id; fwd: Map<number, number> }>(); // edge key -> line, and vertex order index
  const newKps = new Set<Id>();
  const kpForVertex = (v: number): Id => {
    let k = kpAt.get(v);
    if (k === undefined) {
      k = addKp(m, P[v]).id;
      kpAt.set(v, k);
      newKps.add(k);
      candKps.add(k);
    }
    return k;
  };
  for (const [pk, edges] of pairEdges) {
    const [c1, c2] = pk.split('|').map(Number);
    const planarPair = c1 >= 0 && c2 >= 0 && compPlanar[c1] && compPlanar[c2];
    const adj = new Map<number, number[]>();
    for (const [a, b] of edges) {
      (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
      (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    }
    const used = new Set<number>();
    const breakAt = (prev: number, v: number, nxt: number) => {
      if (isCorner(v) || breakVerts.has(v)) return true;
      if ((adj.get(v)?.length ?? 0) !== 2) return true;
      if (planarPair) {
        const d1 = norm(sub(P[v], P[prev])), d2 = norm(sub(P[nxt], P[v]));
        if (dot(d1, d2) < 1 - 1e-8) return true;
      }
      return false;
    };
    const walk = (start: number, first: number): number[] => {
      const chain = [start, first];
      used.add(ek(start, first));
      let prev = start, cur = first;
      for (;;) {
        const nb = (adj.get(cur) ?? []).filter((x) => !used.has(ek(cur, x)));
        if (nb.length === 0) break;
        const nxt = nb[0];
        if (breakAt(prev, cur, nxt)) break;
        used.add(ek(cur, nxt));
        chain.push(nxt);
        prev = cur;
        cur = nxt;
      }
      return chain;
    };
    const chains: number[][] = [];
    // open chains start at corner/endpoint vertices; every chain end becomes a new start
    const breakVerts = new Set([...adj.keys()].filter((v) => isCorner(v) || adj.get(v)!.length !== 2));
    for (;;) {
      let progressed = false;
      for (const s of [...breakVerts].sort((a, b) => a - b)) {
        for (const nb of adj.get(s)!) {
          if (used.has(ek(s, nb))) continue;
          const ch = walk(s, nb);
          chains.push(ch);
          breakVerts.add(ch[ch.length - 1]);
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    // what remains are closed loops without any corner
    for (const [a, b] of edges) {
      if (used.has(ek(a, b))) continue;
      // closed loop: collect full cycle then split into <= 90 degree pieces
      const cyc = [a, b];
      used.add(ek(a, b));
      let prev = a, cur = b;
      for (;;) {
        const nb = (adj.get(cur) ?? []).filter((x) => !used.has(ek(cur, x)));
        if (nb.length === 0) break;
        used.add(ek(cur, nb[0]));
        cyc.push(nb[0]);
        prev = cur;
        cur = nb[0];
        void prev;
      }
      // cyc ends at a (closed)
      const ring = cyc[cyc.length - 1] === cyc[0] ? cyc.slice(0, -1) : cyc;
      // split points: prefer direction breaks for planar pairs, else 4 equal pieces
      const brk: number[] = [];
      if (planarPair) {
        for (let i = 0; i < ring.length; i++) {
          const p0 = P[ring[(i - 1 + ring.length) % ring.length]], p1 = P[ring[i]], p2 = P[ring[(i + 1) % ring.length]];
          if (dot(norm(sub(p1, p0)), norm(sub(p2, p1))) < 1 - 1e-8) brk.push(i);
        }
      }
      if (brk.length < 2) {
        brk.length = 0;
        const nPieces = Math.min(4, ring.length);
        for (let i = 0; i < nPieces; i++) brk.push(Math.round((i * ring.length) / nPieces) % ring.length);
      }
      const uniq = [...new Set(brk)].sort((x, y) => x - y);
      for (let i = 0; i < uniq.length; i++) {
        const s = uniq[i], e = uniq[(i + 1) % uniq.length];
        const piece: number[] = [];
        for (let j = s; ; j = (j + 1) % ring.length) {
          piece.push(ring[j]);
          if (j === e && piece.length > 1) break;
        }
        chains.push(piece);
      }
    }
    // split open chains further at plane-plane direction changes (walk already breaks), create lines
    for (const ch of chains) {
      if (ch.length < 2) continue;
      const k0 = kpForVertex(ch[0]);
      const k1 = kpForVertex(ch[ch.length - 1]);
      const pts = ch.map((v) => P[v]);
      const line = findReusableLine(m, candLines, k0, k1, pts, rc.tol) ?? createLine(m, k0, k1, pts, rc.tol);
      const fwdIdx = new Map<number, number>();
      // orientation: line kps[0] corresponds to ch[0] ?
      const forward = line.kps[0] === k0 && (k0 !== k1);
      ch.forEach((v, i) => fwdIdx.set(v, forward ? i : ch.length - 1 - i));
      for (let i = 0; i < ch.length - 1; i++) edgeLine.set(ek(ch[i], ch[i + 1]), { line: line.id, fwd: fwdIdx });
      candLines.add(line.id);
    }
  }
  // areas
  const areaIds: Id[] = [];
  const flips: boolean[] = [];
  const inputAreas = new Set<Id>();
  for (const v of rc.inputs) for (const a of v.areas) inputAreas.add(a);
  compTris.forEach((tris, ci) => {
    const myHes = hes.filter((h) => h.comp === ci);
    // follow half-edge cycles
    const outMap = new Map<number, HalfEdge[]>();
    for (const h of myHes) (outMap.get(h.a) ?? outMap.set(h.a, []).get(h.a)!).push(h);
    const usedHe = new Set<HalfEdge>();
    const loops: number[][] = [];
    for (const h0 of myHes) {
      if (usedHe.has(h0)) continue;
      const cyc: HalfEdge[] = [];
      let h: HalfEdge | undefined = h0;
      while (h && !usedHe.has(h)) {
        usedHe.add(h);
        cyc.push(h);
        const cands: HalfEdge[] = (outMap.get(h.b) ?? []).filter((x) => !usedHe.has(x));
        h = cands[0];
      }
      // to signed lines
      const loop: number[] = [];
      for (const e of cyc) {
        const info = edgeLine.get(ek(e.a, e.b));
        if (!info) continue;
        const ia = info.fwd.get(e.a)!, ib = info.fwd.get(e.b)!;
        const s = ib > ia ? info.line : -info.line;
        if (loop.length && loop[loop.length - 1] === s) continue;
        loop.push(s);
      }
      while (loop.length > 1 && loop[0] === loop[loop.length - 1]) loop.pop();
      if (loop.length) loops.push(loop);
    }
    // outer loop first (largest enclosed area w.r.t. face normal)
    const tess = compTess(P, T, tris);
    const st = triStats(tess);
    if (loops.length > 1) {
      const sc = loops.map((lp) => Math.abs(loopArea(m, lp, st.normal)));
      const iMax = sc.indexOf(Math.max(...sc));
      const [outer] = loops.splice(iMax, 1);
      loops.unshift(outer);
    }
    const src = F[tris[0]];
    const srcArea = m.areas.get(src);
    const lineSet = new Set(loops.flat().map(Math.abs));
    // reuse?
    if (srcArea && inputAreas.has(src)) {
      const old = new Set(areaLines(srcArea));
      if (old.size === lineSet.size && [...old].every((l) => lineSet.has(l)) && Math.abs(srcArea.area - st.area) <= 1e-6 * Math.max(1, st.area)) {
        const oldN = triStats(srcArea.tess).normal;
        areaIds.push(src);
        flips.push(dot(oldN, st.normal) < 0);
        return;
      }
    }
    const surface = surfaceFor(srcArea?.surface, st.normal, P[T[tris[0]][0]]);
    const a: Area = { id: nextId(m, 'area'), loops, surface, tess, area: st.area, centroid: st.centroid };
    if (srcArea?.attrs) a.attrs = { ...srcArea.attrs };
    m.areas.set(a.id, a);
    selectNew(m, 'area', a.id);
    areaIds.push(a.id);
    flips.push(false);
  });
  const v = addVolume(m, areaIds, { flips, requireClosed: false });
  return v.id;
}

function triNormal(P: Vec3[], t: [number, number, number]): Vec3 {
  return norm(cross(sub(P[t[1]], P[t[0]]), sub(P[t[2]], P[t[0]])));
}

function compTess(P: Vec3[], T: [number, number, number][], tris: number[]): TriMesh {
  const local = new Map<number, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  for (const t of tris) for (const v of T[t]) {
    let j = local.get(v);
    if (j === undefined) { j = pos.length / 3; local.set(v, j); pos.push(P[v][0], P[v][1], P[v][2]); }
    idx.push(j);
  }
  return { pos: new Float64Array(pos), idx: new Uint32Array(idx) };
}

function loopArea(m: ModelState, loop: number[], n: Vec3): number {
  const pts: Vec3[] = [];
  for (const s of loop) {
    const l = m.lines.get(Math.abs(s))!;
    const p = s > 0 ? l.pts : [...l.pts].reverse();
    for (let i = 0; i < p.length - 1; i++) pts.push(p[i]);
  }
  let a: Vec3 = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const c = cross(pts[i], pts[(i + 1) % pts.length]);
    a = [a[0] + c[0], a[1] + c[1], a[2] + c[2]];
  }
  return dot(a, n) / 2;
}

function surfaceFor(src: Surface | undefined, normal: Vec3, p0: Vec3): Surface {
  if (src?.kind === 'plane') {
    const n = dot(src.normal, normal) < 0 ? [-src.normal[0], -src.normal[1], -src.normal[2]] as Vec3 : src.normal;
    return { kind: 'plane', origin: p0, normal: n, u: src.u, v: cross(n, src.u) };
  }
  if (src?.kind === 'cyl' || src?.kind === 'sphere') return src;
  return { kind: 'free' };
}

function findReusableLine(m: ModelState, cand: Set<Id>, k0: Id, k1: Id, pts: Vec3[], tol: number): Line | undefined {
  const L = polyLength(pts);
  for (const id of cand) {
    const l = m.lines.get(id);
    if (!l) continue;
    if (!((l.kps[0] === k0 && l.kps[1] === k1) || (l.kps[0] === k1 && l.kps[1] === k0))) continue;
    if (Math.abs(l.length - L) > 10 * tol + 1e-6 * L) continue;
    // every chain point must lie on the line polyline
    let ok = true;
    for (const p of pts) {
      let best = Infinity;
      for (let i = 0; i < l.pts.length - 1; i++) best = Math.min(best, segDist(p, l.pts[i], l.pts[i + 1]).d);
      if (best > 10 * tol) { ok = false; break; }
    }
    if (ok) return l;
  }
  return undefined;
}

function createLine(m: ModelState, k0: Id, k1: Id, pts: Vec3[], tol: number): Line {
  const a = pts[0], b = pts[pts.length - 1];
  const straight = pts.every((p) => segDist(p, a, b).d <= 10 * tol);
  if (straight) return addLine(m, k0, k1, [[...a] as Vec3, [...b] as Vec3], 'straight');
  // circle fit through first / middle / last
  const c = circleCenter(a, pts[Math.floor(pts.length / 2)], b);
  if (c) {
    const r = dist(a, c.center);
    if (pts.every((p) => Math.abs(dist(p, c.center) - r) <= 100 * tol)) {
      return addLine(m, k0, k1, pts.map((p) => [...p] as Vec3), 'arc', { center: c.center, axis: c.axis, radius: r });
    }
  }
  return addLine(m, k0, k1, pts.map((p) => [...p] as Vec3), 'poly');
}

export function circleCenter(a: Vec3, b: Vec3, c: Vec3): { center: Vec3; axis: Vec3 } | null {
  const ab = sub(b, a), ac = sub(c, a);
  const n = cross(ab, ac);
  const n2 = dot(n, n);
  if (n2 < 1e-20) return null;
  const t1 = cross(n, ab), t2 = cross(ac, n);
  const s1 = dot(ac, ac) / (2 * n2), s2 = dot(ab, ab) / (2 * n2);
  const center: Vec3 = [a[0] + t1[0] * s1 + t2[0] * s2, a[1] + t1[1] * s1 + t2[1] * s2, a[2] + t1[2] * s1 + t2[2] * s2];
  return { center, axis: norm(n) };
}

/** Length unit tolerance for a set of volumes. */
export function boolTol(vols: Volume[]): number {
  let d = 0;
  for (const v of vols) d = Math.max(d, dist(v.bbox.min, v.bbox.max));
  return Math.max(1e-7, 2e-6 * d);
}

export { len };
