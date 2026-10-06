import type { BBox, Vec3 } from '../model/types';

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];
export const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

export function norm(a: Vec3): Vec3 {
  const l = len(a);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

export function addScaled(a: Vec3, b: Vec3, s: number): Vec3 {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}

/** Rotate point p about an axis through `o` with unit direction `k` by angle (radians). Rodrigues. */
export function rotateAbout(p: Vec3, o: Vec3, k: Vec3, ang: number): Vec3 {
  const v = sub(p, o);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const kv = cross(k, v);
  const kd = dot(k, v);
  return [
    o[0] + v[0] * c + kv[0] * s + k[0] * kd * (1 - c),
    o[1] + v[1] * c + kv[1] * s + k[1] * kd * (1 - c),
    o[2] + v[2] * c + kv[2] * s + k[2] * kd * (1 - c),
  ];
}

/** Any unit vector perpendicular to n. */
export function perp(n: Vec3): Vec3 {
  const a: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return norm(cross(n, a));
}

export function emptyBBox(): BBox {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

export function bboxAdd(b: BBox, p: Vec3) {
  for (let i = 0; i < 3; i++) {
    if (p[i] < b.min[i]) b.min[i] = p[i];
    if (p[i] > b.max[i]) b.max[i] = p[i];
  }
}

export function bboxValid(b: BBox) {
  return b.min[0] <= b.max[0];
}

export function bboxUnion(a: BBox, b: BBox): BBox {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  };
}

export function bboxDiag(b: BBox) {
  return bboxValid(b) ? dist(b.min, b.max) : 0;
}

export function bboxOverlap(a: BBox, b: BBox, tol: number) {
  for (let i = 0; i < 3; i++) if (a.max[i] < b.min[i] - tol || b.max[i] < a.min[i] - tol) return false;
  return true;
}

/** Newell normal (unnormalised, magnitude = 2*area) of a closed polygon. */
export function newell(pts: Vec3[]): Vec3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}

export function v3eq(a: Vec3, b: Vec3, tol: number) {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
}

/** Distance from point p to segment ab, and parameter t in [0,1]. */
export function segDist(p: Vec3, a: Vec3, b: Vec3): { d: number; t: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  let t = l2 > 0 ? dot(sub(p, a), ab) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { d: dist(p, addScaled(a, ab, t)), t };
}

/** Absolute geometric tolerance used across the kernel (model units). */
export const GEO_TOL = 1e-6;
