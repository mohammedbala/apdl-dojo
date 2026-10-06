// 2-D meshing of planar regions: rectilinear grid, mapped (TFI) quads, or constrained-Delaunay triangles.
// Import the sweep context directly: the package entry point references Node's `global`.
import SweepContextMod from 'poly2tri/src/sweepcontext.js';

type P2 = [number, number];
const SweepContext = ((SweepContextMod as unknown as { default?: unknown }).default ?? SweepContextMod) as unknown as new (contour: object[]) => {
  addHole(h: object[]): void;
  addPoint(p: object): void;
  triangulate(): void;
  getTriangles(): { getPoint(i: number): object }[];
};

export interface Mesh2D {
  pts: P2[];
  quads: [number, number, number, number][];
  tris: [number, number, number][];
}

export function pointInRings(p: P2, rings: P2[][]): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
}

function distToRings(p: P2, rings: P2[][]): number {
  let best = Infinity;
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const ab: P2 = [b[0] - a[0], b[1] - a[1]];
    const l2 = ab[0] * ab[0] + ab[1] * ab[1];
    let t = l2 > 0 ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * ab[0], p[1] - a[1] - t * ab[1]));
  }
  return best;
}

/** True when every ring edge is parallel to the u or v axis. */
export function isRectilinear(rings: P2[][], tol: number): boolean {
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    if (Math.abs(a[0] - b[0]) > tol && Math.abs(a[1] - b[1]) > tol) return false;
  }
  return true;
}

function uniqSorted(vals: number[], tol: number): number[] {
  const s = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

/**
 * Rectilinear region grid mesh. `sizeAlong(axis, a, b)` returns the target element size for the interval [a,b]
 * along axis 0 (u) or 1 (v).
 */
export function gridMesh2D(rings: P2[][], tol: number, sizeAlong: (axis: 0 | 1, a: number, b: number) => number): Mesh2D {
  const breaks: number[][] = [0, 1].map((ax) => uniqSorted(rings.flat().map((p) => p[ax]), tol));
  const fine: number[][] = breaks.map((bk, ax) => {
    const out = [bk[0]];
    for (let i = 0; i < bk.length - 1; i++) {
      const a = bk[i], b = bk[i + 1];
      const h = sizeAlong(ax as 0 | 1, a, b);
      const n = Math.max(1, Math.ceil((b - a) / h - 1e-6));
      for (let j = 1; j <= n; j++) out.push(a + ((b - a) * j) / n);
    }
    return out;
  });
  // classify coarse cells
  const [U, V] = fine;
  const coarseU = breaks[0], coarseV = breaks[1];
  const cellIn = (u: number, v: number) => {
    // find coarse cell containing (u,v) and test its centre
    let i = 0; while (i < coarseU.length - 2 && coarseU[i + 1] < u) i++;
    let j = 0; while (j < coarseV.length - 2 && coarseV[j + 1] < v) j++;
    return pointInRings([(coarseU[i] + coarseU[i + 1]) / 2, (coarseV[j] + coarseV[j + 1]) / 2], rings);
  };
  const pts: P2[] = [];
  const idx = new Map<string, number>();
  const pid = (i: number, j: number) => {
    const k = `${i},${j}`;
    let n = idx.get(k);
    if (n === undefined) { n = pts.length; pts.push([U[i], V[j]]); idx.set(k, n); }
    return n;
  };
  const quads: [number, number, number, number][] = [];
  for (let i = 0; i < U.length - 1; i++) for (let j = 0; j < V.length - 1; j++) {
    if (!cellIn((U[i] + U[i + 1]) / 2, (V[j] + V[j + 1]) / 2)) continue;
    quads.push([pid(i, j), pid(i + 1, j), pid(i + 1, j + 1), pid(i, j + 1)]);
  }
  return { pts, quads, tris: [] };
}

/** Transfinite (Coons) quad mesh from 4 boundary point sequences (bottom, right, top, left; CCW). */
export function tfiMesh2D(bottom: P2[], right: P2[], top: P2[], left: P2[]): Mesh2D | null {
  // bottom: left->right, right: bottom->top, top: left->right, left: bottom->top
  const nu = bottom.length - 1, nv = left.length - 1;
  if (top.length - 1 !== nu || right.length - 1 !== nv || nu < 1 || nv < 1) return null;
  const pts: P2[] = [];
  const at = (i: number, j: number) => j * (nu + 1) + i;
  const c00 = bottom[0], c10 = bottom[nu], c01 = top[0], c11 = top[nu];
  const pu = (arr: P2[]) => { const L = [0]; for (let i = 1; i < arr.length; i++) L.push(L[i - 1] + Math.hypot(arr[i][0] - arr[i - 1][0], arr[i][1] - arr[i - 1][1])); return L.map((x) => x / (L[L.length - 1] || 1)); };
  const ub = pu(bottom), ut = pu(top), vl = pu(left), vr = pu(right);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = (ub[i] * (1 - (vl[j] + vr[j]) / 2) + ut[i] * ((vl[j] + vr[j]) / 2));
    const v = (vl[j] * (1 - u) + vr[j] * u);
    const x = (1 - v) * bottom[i][0] + v * top[i][0] + (1 - u) * left[j][0] + u * right[j][0]
      - ((1 - u) * (1 - v) * c00[0] + u * (1 - v) * c10[0] + (1 - u) * v * c01[0] + u * v * c11[0]);
    const y = (1 - v) * bottom[i][1] + v * top[i][1] + (1 - u) * left[j][1] + u * right[j][1]
      - ((1 - u) * (1 - v) * c00[1] + u * (1 - v) * c10[1] + (1 - u) * v * c01[1] + u * v * c11[1]);
    pts.push([x, y]);
  }
  // exact boundary
  for (let i = 0; i <= nu; i++) { pts[at(i, 0)] = bottom[i]; pts[at(i, nv)] = top[i]; }
  for (let j = 0; j <= nv; j++) { pts[at(0, j)] = left[j]; pts[at(nu, j)] = right[j]; }
  const quads: [number, number, number, number][] = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) quads.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
  return { pts, quads, tris: [] };
}

/** Constrained Delaunay triangulation of rings (outer first) with interior Steiner points at spacing h. */
export function triMesh2D(rings: P2[][], h: number): Mesh2D {
  // dedupe consecutive / duplicate points (poly2tri rejects duplicates)
  const seen = new Set<string>();
  const key = (p: P2) => `${p[0].toFixed(9)},${p[1].toFixed(9)}`;
  const cleanRings = rings.map((r) => r.filter((p) => { const k = key(p); if (seen.has(k)) return false; seen.add(k); return true; })).filter((r) => r.length >= 3);
  type PP = { x: number; y: number; _i?: number };
  const all: PP[] = [];
  const mk = (p: P2): PP => { const o: PP = { x: p[0], y: p[1], _i: all.length }; all.push(o); return o; };
  const contour = cleanRings[0].map(mk);
  const sw = new SweepContext(contour);
  for (const r of cleanRings.slice(1)) sw.addHole(r.map(mk));
  // Steiner points
  let lo: P2 = [Infinity, Infinity], hi: P2 = [-Infinity, -Infinity];
  for (const p of cleanRings[0]) { lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1])]; hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1])]; }
  const nx = Math.ceil((hi[0] - lo[0]) / h), ny = Math.ceil((hi[1] - lo[1]) / (h * 0.866));
  if (nx * ny < 200000) {
    for (let j = 1; j < ny; j++) for (let i = 0; i <= nx; i++) {
      const q: P2 = [lo[0] + (i + (j % 2 ? 0.5 : 0)) * h, lo[1] + j * h * 0.866];
      if (!pointInRings(q, cleanRings)) continue;
      if (distToRings(q, cleanRings) < 0.45 * h) continue;
      const k = key(q);
      if (seen.has(k)) continue;
      seen.add(k);
      sw.addPoint(mk(q));
    }
  }
  sw.triangulate();
  const tris: [number, number, number][] = [];
  for (const t of sw.getTriangles()) {
    const a = (t.getPoint(0) as unknown as PP)._i!, b = (t.getPoint(1) as unknown as PP)._i!, c = (t.getPoint(2) as unknown as PP)._i!;
    const pa = all[a], pb = all[b], pc = all[c];
    const s = (pb.x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (pb.y - pa.y);
    tris.push(s >= 0 ? [a, b, c] : [a, c, b]);
  }
  return { pts: all.map((p) => [p.x, p.y] as P2), quads: [], tris };
}
