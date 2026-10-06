// Coordinate systems and working plane.
import type { CoordSys, ModelState, Vec3, WorkingPlane } from '../model/types';
import { add, cross, norm, rotateAbout, scale } from './vec';

const DEG = Math.PI / 180;

/** Resolve a coordinate system id (0,1,2,4,5,6 or user >= 11) to a CoordSys. */
export function getCsys(m: ModelState, id: number): CoordSys {
  const I: [Vec3, Vec3, Vec3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  switch (id) {
    case 0: return { id: 0, type: 0, origin: [0, 0, 0], axes: I };
    case 1: return { id: 1, type: 1, origin: [0, 0, 0], axes: I };
    case 2: return { id: 2, type: 2, origin: [0, 0, 0], axes: I };
    case 4: return { id: 4, type: 0, origin: m.wp.origin, axes: m.wp.axes };
    case 5: // global cylindrical about Y: local z = global Y, local x = global Z? (theta measured from Z toward X)
      return { id: 5, type: 1, origin: [0, 0, 0], axes: [[0, 0, 1], [1, 0, 0], [0, 1, 0]] };
    case 6: // global cylindrical about X
      return { id: 6, type: 1, origin: [0, 0, 0], axes: [[0, 1, 0], [0, 0, 1], [1, 0, 0]] };
  }
  const c = m.csyss.get(id);
  if (c) return c;
  return { id: 0, type: 0, origin: [0, 0, 0], axes: I };
}

/** Convert coordinates given in csys `c` to global cartesian. */
export function csysToGlobal(c: CoordSys, p: Vec3): Vec3 {
  let x = p[0], y = p[1], z = p[2];
  if (c.type === 1) {
    const r = p[0], th = p[1] * DEG;
    x = r * Math.cos(th); y = r * Math.sin(th); z = p[2];
  } else if (c.type === 2) {
    const r = p[0], th = p[1] * DEG, ph = p[2] * DEG;
    x = r * Math.cos(ph) * Math.cos(th); y = r * Math.cos(ph) * Math.sin(th); z = r * Math.sin(ph);
  }
  const [ax, ay, az] = c.axes;
  return [
    c.origin[0] + ax[0] * x + ay[0] * y + az[0] * z,
    c.origin[1] + ax[1] * x + ay[1] * y + az[1] * z,
    c.origin[2] + ax[2] * x + ay[2] * y + az[2] * z,
  ];
}

/** Convert a global point into coordinates of csys `c`. */
export function globalToCsys(c: CoordSys, g: Vec3): Vec3 {
  const d: Vec3 = [g[0] - c.origin[0], g[1] - c.origin[1], g[2] - c.origin[2]];
  const [ax, ay, az] = c.axes;
  const x = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2];
  const y = d[0] * ay[0] + d[1] * ay[1] + d[2] * ay[2];
  const z = d[0] * az[0] + d[1] * az[1] + d[2] * az[2];
  if (c.type === 1) {
    const r = Math.hypot(x, y);
    let th = Math.atan2(y, x) / DEG;
    if (Math.abs(th) < 1e-12) th = 0;
    return [r, th, z];
  }
  if (c.type === 2) {
    const r = Math.hypot(x, y, z);
    return [r, Math.atan2(y, x) / DEG, r > 0 ? Math.asin(z / r) / DEG : 0];
  }
  return [x, y, z];
}

/** Active csys -> global. */
export function toGlobal(m: ModelState, p: Vec3): Vec3 {
  return csysToGlobal(getCsys(m, m.cur.csys), p);
}

/** Global -> active csys. */
export function fromGlobal(m: ModelState, g: Vec3): Vec3 {
  return globalToCsys(getCsys(m, m.cur.csys), g);
}

/** Working plane coordinates -> global. */
export function wpToGlobal(wp: WorkingPlane, p: Vec3): Vec3 {
  const [ax, ay, az] = wp.axes;
  return [
    wp.origin[0] + ax[0] * p[0] + ay[0] * p[1] + az[0] * p[2],
    wp.origin[1] + ax[1] * p[0] + ay[1] * p[1] + az[1] * p[2],
    wp.origin[2] + ax[2] * p[0] + ay[2] * p[1] + az[2] * p[2],
  ];
}

export function wpOffset(wp: WorkingPlane, d: Vec3) {
  wp.origin = add(wp.origin, add(add(scale(wp.axes[0], d[0]), scale(wp.axes[1], d[1])), scale(wp.axes[2], d[2])));
}

/** WPROTA,THXY,THYZ,THZX (degrees): about WP z, then new x, then new y. */
export function wpRotate(wp: WorkingPlane, thxy: number, thyz: number, thzx: number) {
  const rot = (axis: Vec3, ang: number) => {
    const o: Vec3 = [0, 0, 0];
    wp.axes = wp.axes.map((a) => norm(rotateAbout(a, o, axis, ang * DEG))) as [Vec3, Vec3, Vec3];
  };
  if (thxy) rot(wp.axes[2], thxy);
  if (thyz) rot(wp.axes[0], thyz);
  if (thzx) rot(wp.axes[1], thzx);
}

/** Build axes for LOCAL / CLOCAL rotations. */
export function rotatedAxes(base: [Vec3, Vec3, Vec3], thxy: number, thyz: number, thzx: number): [Vec3, Vec3, Vec3] {
  const wp: WorkingPlane = { origin: [0, 0, 0], axes: base.map((a) => [...a] as Vec3) as [Vec3, Vec3, Vec3] };
  wpRotate(wp, thxy, thyz, thzx);
  // re-orthonormalise
  const x = norm(wp.axes[0]);
  const z = norm(cross(x, wp.axes[1]));
  const y = cross(z, x);
  return [x, y, z];
}
