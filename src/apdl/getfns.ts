// APDL "get functions" usable inside expressions: NX(n), KX(k), NODE(x,y,z), KP(x,y,z), NSEL(n) ...
import type { Ctx } from './context';
import type { EntityKind, Vec3 } from '../model/types';
import { dist } from '../geometry/vec';
import { fromGlobal, toGlobal } from '../geometry/csys';

function nearest(ctx: Ctx, kind: 'node' | 'kp', x: number, y: number, z: number): number {
  const m = ctx.m;
  const p = toGlobal(m, [x, y, z]);
  let best = 0;
  let bd = Infinity;
  if (kind === 'node') {
    for (const id of m.sel.node) {
      const n = m.nodes.get(id);
      if (!n) continue;
      const d = dist(n.xyz, p);
      if (d < bd - 1e-12 || (Math.abs(d - bd) <= 1e-12 && id < best)) { bd = d; best = id; }
    }
  } else {
    for (const id of m.sel.kp) {
      const k = m.kps.get(id);
      if (!k) continue;
      const d = dist(k.xyz, p);
      if (d < bd - 1e-12 || (Math.abs(d - bd) <= 1e-12 && id < best)) { bd = d; best = id; }
    }
  }
  return best;
}

function coord(ctx: Ctx, p: Vec3 | undefined, i: number): number {
  if (!p) return 0;
  return fromGlobal(ctx.m, p)[i];
}

function selStatus(ctx: Ctx, kind: EntityKind, id: number): number {
  const map = { kp: ctx.m.kps, line: ctx.m.lines, area: ctx.m.areas, volu: ctx.m.volus, node: ctx.m.nodes, elem: ctx.m.elems }[kind];
  if (!map.has(id)) return 0;
  return ctx.m.sel[kind].has(id) ? 1 : -1;
}

function nextSel(ctx: Ctx, kind: EntityKind, id: number): number {
  let best = 0;
  for (const k of ctx.m.sel[kind]) if (k > id && (best === 0 || k < best)) best = k;
  return best;
}

export function getFunctions(ctx: Ctx, name: string, a: number[]): number | undefined {
  const m = ctx.m;
  const i0 = Math.trunc(a[0] ?? 0);
  switch (name) {
    case 'NX': return coord(ctx, m.nodes.get(i0)?.xyz, 0);
    case 'NY': return coord(ctx, m.nodes.get(i0)?.xyz, 1);
    case 'NZ': return coord(ctx, m.nodes.get(i0)?.xyz, 2);
    case 'KX': return coord(ctx, m.kps.get(i0)?.xyz, 0);
    case 'KY': return coord(ctx, m.kps.get(i0)?.xyz, 1);
    case 'KZ': return coord(ctx, m.kps.get(i0)?.xyz, 2);
    case 'NODE': return nearest(ctx, 'node', a[0] ?? 0, a[1] ?? 0, a[2] ?? 0);
    case 'KP': return nearest(ctx, 'kp', a[0] ?? 0, a[1] ?? 0, a[2] ?? 0);
    case 'DISTND': {
      const p = m.nodes.get(i0)?.xyz, q = m.nodes.get(Math.trunc(a[1] ?? 0))?.xyz;
      return p && q ? dist(p, q) : 0;
    }
    case 'DISTKP': {
      const p = m.kps.get(i0)?.xyz, q = m.kps.get(Math.trunc(a[1] ?? 0))?.xyz;
      return p && q ? dist(p, q) : 0;
    }
    case 'NSEL': return selStatus(ctx, 'node', i0);
    case 'KSEL': return selStatus(ctx, 'kp', i0);
    case 'LSEL': return selStatus(ctx, 'line', i0);
    case 'ASEL': return selStatus(ctx, 'area', i0);
    case 'VSEL': return selStatus(ctx, 'volu', i0);
    case 'ESEL': return selStatus(ctx, 'elem', i0);
    case 'NDNEXT': return nextSel(ctx, 'node', i0);
    case 'KPNEXT': return nextSel(ctx, 'kp', i0);
    case 'LSNEXT': return nextSel(ctx, 'line', i0);
    case 'ARNEXT': return nextSel(ctx, 'area', i0);
    case 'VLNEXT': return nextSel(ctx, 'volu', i0);
    case 'ELNEXT': return nextSel(ctx, 'elem', i0);
    case 'CENTRX':
    case 'CENTRY':
    case 'CENTRZ': {
      const e = m.elems.get(i0);
      if (!e) return 0;
      const c: Vec3 = [0, 0, 0];
      let n = 0;
      for (const nid of e.nodes) {
        const nd = m.nodes.get(nid);
        if (!nd) continue;
        c[0] += nd.xyz[0]; c[1] += nd.xyz[1]; c[2] += nd.xyz[2]; n++;
      }
      if (!n) return 0;
      return c['XYZ'.indexOf(name[5])] / n;
    }
    case 'LX': case 'LY': case 'LZ': {
      const l = m.lines.get(i0);
      if (!l) return 0;
      const t = Math.max(0, Math.min(1, a[1] ?? 0));
      const pts = l.pts;
      const idx = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
      return pts[idx]['XYZ'.indexOf(name[1]) as 0 | 1 | 2];
    }
  }
  return undefined;
}
