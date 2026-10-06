// Primitive builders in working-plane coordinates.
import type { Id, ModelState, Vec3 } from '../model/types';
import { ApdlError } from '../apdl/diagnostics';
import { wpToGlobal } from './csys';
import { addArc, addKp, addPlanarArea, addStraight, sweepUnused, areaLines, findKpAt } from './topo';
import { sweepAreas, type Stage } from './sweep';
import { scale } from './vec';

const DEG = Math.PI / 180;

function wpPt(m: ModelState, x: number, y: number, z: number): Vec3 {
  return wpToGlobal(m.wp, [x, y, z]);
}

/** Rectangle area in the WP plane at height z. */
export function rectArea(m: ModelState, x1: number, x2: number, y1: number, y2: number, z = 0): Id {
  if (Math.abs(x2 - x1) < 1e-12 || Math.abs(y2 - y1) < 1e-12) throw new ApdlError('PRIM_ZERO', 'Rectangle has zero width or height.');
  const [xa, xb] = x1 < x2 ? [x1, x2] : [x2, x1];
  const [ya, yb] = y1 < y2 ? [y1, y2] : [y2, y1];
  const k = [
    addKp(m, wpPt(m, xa, ya, z)).id, addKp(m, wpPt(m, xb, ya, z)).id,
    addKp(m, wpPt(m, xb, yb, z)).id, addKp(m, wpPt(m, xa, yb, z)).id,
  ];
  const l = [addStraight(m, k[0], k[1]).id, addStraight(m, k[1], k[2]).id, addStraight(m, k[2], k[3]).id, addStraight(m, k[3], k[0]).id];
  return addPlanarArea(m, [l], undefined, m.wp.axes[2]).id;
}

/** Circular / annular sector area in the WP plane centred at (xc,yc) at height z. Angles in degrees. */
export function circleArea(m: ModelState, xc: number, yc: number, r1: number, r2: number, th1: number, th2: number, z = 0): Id {
  let ri = Math.min(Math.abs(r1), Math.abs(r2));
  const ro = Math.max(Math.abs(r1), Math.abs(r2));
  if (ro <= 0) throw new ApdlError('PRIM_ZERO', 'Circle radius must be greater than zero.');
  if (Math.abs(ri - ro) < 1e-12) ri = 0;
  let a1 = th1, a2 = th2;
  if (a2 < a1) [a1, a2] = [a2, a1];
  let span = a2 - a1;
  if (span <= 1e-9 || span > 360) { a1 = 0; a2 = 360; span = 360; }
  const full = Math.abs(span - 360) < 1e-9;
  const nseg = Math.max(1, Math.ceil(span / 90 - 1e-9));
  const axis = m.wp.axes[2];
  const center = wpPt(m, xc, yc, z);
  const ring = (r: number) => {
    const ks: Id[] = [];
    const count = full ? nseg : nseg + 1;
    for (let i = 0; i < count; i++) {
      const a = (a1 + (span * i) / nseg) * DEG;
      ks.push(addKp(m, wpPt(m, xc + r * Math.cos(a), yc + r * Math.sin(a), z)).id);
    }
    const ls: Id[] = [];
    for (let i = 0; i < nseg; i++) {
      const ka = ks[i], kb = full ? ks[(i + 1) % nseg] : ks[i + 1];
      ls.push(addArc(m, ka, kb, center, axis, (span / nseg) * DEG).id);
    }
    return { ks, ls };
  };
  const outer = ring(ro);
  if (full) {
    if (ri <= 0) return addPlanarArea(m, [outer.ls], undefined, axis).id;
    const inner = ring(ri);
    return addPlanarArea(m, [outer.ls, inner.ls], undefined, axis).id;
  }
  if (ri <= 0) {
    const kc = addKp(m, center).id;
    const r1l = addStraight(m, kc, outer.ks[0]).id;
    const r2l = addStraight(m, outer.ks[outer.ks.length - 1], kc).id;
    return addPlanarArea(m, [[r1l, ...outer.ls, r2l]], undefined, axis).id;
  }
  const inner = ring(ri);
  const s1 = addStraight(m, inner.ks[0], outer.ks[0]).id;
  const s2 = addStraight(m, outer.ks[outer.ks.length - 1], inner.ks[inner.ks.length - 1]).id;
  return addPlanarArea(m, [[s1, ...outer.ls, s2, ...inner.ls.slice().reverse().map((x) => -x)]], undefined, axis).id;
}

/** Regular polygon area (RPR4 / PRISM helper) given WP 2-D vertex list at height z. */
export function polygonArea(m: ModelState, pts2: [number, number][], z = 0): Id {
  const ks = pts2.map(([x, y]) => addKp(m, wpPt(m, x, y, z)).id);
  const ls = ks.map((k, i) => addStraight(m, k, ks[(i + 1) % ks.length]).id);
  return addPlanarArea(m, [ls], undefined, m.wp.axes[2]).id;
}

/** Extrude a WP area by depth along WP z into a volume. */
export function extrudeWp(m: ModelState, areaId: Id, depth: number): Id {
  if (Math.abs(depth) < 1e-12) return 0;
  const d = scale(m.wp.axes[2], depth);
  const r = sweepAreas(m, [areaId], [{ kind: 'translate', d }], { gen: () => ({ kind: 'prism', dir: m.wp.axes[2] }) });
  return r.volumes[0];
}

export function block(m: ModelState, x1: number, x2: number, y1: number, y2: number, z1: number, z2: number): Id {
  if (Math.abs(z2 - z1) < 1e-12) throw new ApdlError('PRIM_ZERO', 'BLOCK has zero depth (Z1 = Z2).');
  const a = rectArea(m, x1, x2, y1, y2, Math.min(z1, z2));
  return extrudeWp(m, a, Math.abs(z2 - z1));
}

export function cylinder(m: ModelState, xc: number, yc: number, r1: number, r2: number, th1: number, th2: number, z1: number, z2: number): Id {
  const a = circleArea(m, xc, yc, r1, r2, th1, th2, Math.min(z1, z2));
  if (Math.abs(z2 - z1) < 1e-12) return 0;
  return extrudeWp(m, a, Math.abs(z2 - z1));
}

/** Solid of revolution about WP z of a profile given in WP (r, z) coordinates (single volume). */
export function revolveProfile(m: ModelState, prof: [number, number][], th1: number, th2: number): Id {
  let a1 = th1, a2 = th2;
  if (a2 < a1) [a1, a2] = [a2, a1];
  let span = a2 - a1;
  if (span <= 1e-9 || span > 360) { a1 = 0; span = 360; }
  const full = Math.abs(span - 360) < 1e-9;
  const c = Math.cos(a1 * DEG), s = Math.sin(a1 * DEG);
  // profile in the plane at angle a1 (WP coordinates)
  const ks = prof.map(([r, z]) => {
    const p = wpPt(m, r * c, r * s, z);
    return findKpAt(m, p, 1e-12) ?? addKp(m, p).id;
  });
  const ls = ks.map((k, i) => addStraight(m, k, ks[(i + 1) % ks.length]).id);
  const area = addPlanarArea(m, [ls]).id;
  const nseg = Math.max(1, Math.ceil(span / 90 - 1e-9));
  const stages: Stage[] = [];
  for (let i = 0; i < nseg; i++) stages.push({ kind: 'rotate', o: m.wp.origin, k: m.wp.axes[2], ang: (span / nseg) * DEG });
  const r = sweepAreas(m, [area], stages, { closed: full, singleVolume: true, gen: () => ({ kind: 'revolve', axisPt: m.wp.origin, axisDir: m.wp.axes[2], angleDeg: span, srcArea: area }) });
  if (full) {
    const lines = areaLines(m.areas.get(area)!);
    sweepUnused(m, { areas: [area], lines, kps: ks });
  }
  return r.volumes[0];
}

export function cone(m: ModelState, rbot: number, rtop: number, z1: number, z2: number, th1: number, th2: number): Id {
  if (Math.abs(z2 - z1) < 1e-12) throw new ApdlError('PRIM_ZERO', 'CONE has zero height.');
  if (rbot <= 0 && rtop <= 0) throw new ApdlError('PRIM_ZERO', 'CONE needs a non-zero radius.');
  const prof: [number, number][] = [];
  prof.push([0, z1]);
  if (rbot > 0) prof.push([rbot, z1]);
  if (rtop > 0) prof.push([rtop, z2]);
  prof.push([0, z2]);
  return revolveProfile(m, prof, th1, th2);
}

export function sphere(m: ModelState, r1: number, r2: number, th1: number, th2: number): Id {
  const ro = Math.max(Math.abs(r1), Math.abs(r2));
  const ri = Math.min(Math.abs(r1), Math.abs(r2));
  if (ro <= 0) throw new ApdlError('PRIM_ZERO', 'SPHERE radius must be greater than zero.');
  const n = 16;
  const prof: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    prof.push([ro * Math.cos(a), ro * Math.sin(a)]);
  }
  if (ri > 0) for (let i = n; i >= 0; i--) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    prof.push([ri * Math.cos(a), ri * Math.sin(a)]);
  }
  // clean tiny radii on the axis
  for (const p of prof) if (Math.abs(p[0]) < 1e-12) p[0] = 0;
  return revolveProfile(m, prof, th1, th2);
}
