// Point-in-solid test by ray parity against a volume's closed shell tessellation.
import type { Vec3, Volume } from '../model/types';
import { vtx } from './topo';
import { cross, dot, norm, sub } from './vec';

const RAY: Vec3 = norm([1, 0.37139067635, 0.19309617811]);

export function insideSolid(v: Volume, p: Vec3): boolean {
  const b = v.bbox;
  for (let i = 0; i < 3; i++) if (p[i] < b.min[i] - 1e-9 || p[i] > b.max[i] + 1e-9) return false;
  const t = v.tess;
  let hits = 0;
  for (let i = 0; i < t.idx.length; i += 3) {
    const a = vtx(t, t.idx[i]), bb = vtx(t, t.idx[i + 1]), c = vtx(t, t.idx[i + 2]);
    // Möller–Trumbore
    const e1 = sub(bb, a), e2 = sub(c, a);
    const pv = cross(RAY, e2);
    const det = dot(e1, pv);
    if (Math.abs(det) < 1e-14) continue;
    const inv = 1 / det;
    const tv = sub(p, a);
    const u = dot(tv, pv) * inv;
    if (u < 0 || u > 1) continue;
    const qv = cross(tv, e1);
    const w = dot(RAY, qv) * inv;
    if (w < 0 || u + w > 1) continue;
    if (dot(e2, qv) * inv > 0) hits++;
  }
  return hits % 2 === 1;
}

