// Selection commands (xSEL, association selects, ALLSEL) and components (CM, CMSEL, CMDELE).
import { reg } from './registry';
import type { Ctx } from '../context';
import type { Args } from '../args';
import { ApdlError } from '../diagnostics';
import type { EntityKind, Id, ModelState, Vec3 } from '../../model/types';
import { entityMap } from '../../model/state';
import { fromGlobal } from '../../geometry/csys';
import { areaKps, areaLines, vtx } from '../../geometry/topo';
import { cross, dist, dot, segDist, sub } from '../../geometry/vec';
import { ELEMENT_LIBRARY } from '../../mesh/elements';

const SEL_PROCS = ['PREP7', 'SOLU', 'POST1'] as const;

/** Apply a selection Type to a candidate set. */
export function applySel(m: ModelState, kind: EntityKind, type: string, matches: (id: Id) => boolean) {
  const map = entityMap(m, kind);
  const cur = m.sel[kind];
  switch (type) {
    case 'S': {
      const next = new Set<Id>();
      for (const id of map.keys()) if (matches(id)) next.add(id);
      m.sel[kind] = next;
      break;
    }
    case 'R': {
      const next = new Set<Id>();
      for (const id of cur) if (map.has(id) && matches(id)) next.add(id);
      m.sel[kind] = next;
      break;
    }
    case 'A':
      for (const id of map.keys()) if (matches(id)) cur.add(id);
      break;
    case 'U':
      for (const id of [...cur]) if (matches(id)) cur.delete(id);
      break;
    case 'ALL':
      m.sel[kind] = new Set(map.keys());
      break;
    case 'NONE':
      m.sel[kind] = new Set();
      break;
    case 'INVE': {
      const next = new Set<Id>();
      for (const id of map.keys()) if (!cur.has(id)) next.add(id);
      m.sel[kind] = next;
      break;
    }
    default:
      throw new ApdlError('SEL_TYPE', `Selection type ${type} is not valid (use S, R, A, U, ALL, NONE or INVE).`);
  }
}

function entityPoint(m: ModelState, kind: EntityKind, id: Id): Vec3 | undefined {
  switch (kind) {
    case 'kp': return m.kps.get(id)?.xyz;
    case 'node': return m.nodes.get(id)?.xyz;
    case 'line': {
      const l = m.lines.get(id);
      if (!l) return undefined;
      // point at half the arc length
      const half = l.length / 2;
      let acc = 0;
      for (let i = 0; i < l.pts.length - 1; i++) {
        const s = dist(l.pts[i], l.pts[i + 1]);
        if (acc + s >= half) {
          const t = s > 0 ? (half - acc) / s : 0;
          const a = l.pts[i], b = l.pts[i + 1];
          return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        }
        acc += s;
      }
      return l.pts[0];
    }
    case 'area': return m.areas.get(id)?.centroid;
    case 'volu': return m.volus.get(id)?.centroid;
    case 'elem': {
      const e = m.elems.get(id);
      if (!e) return undefined;
      const corners = e.nodes.slice(0, cornerCount(e.shape));
      const c: Vec3 = [0, 0, 0];
      let n = 0;
      for (const nid of corners) { const p = m.nodes.get(nid)?.xyz; if (p) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; n++; } }
      return n ? [c[0] / n, c[1] / n, c[2] / n] : undefined;
    }
  }
}

function cornerCount(shape: string) {
  return { hex: 8, wedge: 6, pyramid: 5, tet: 4, quad: 4, tri: 3, line: 2, point: 1 }[shape] ?? 8;
}

function rangeTest(c: Ctx, a: Args, minIdx: number): (v: number) => boolean {
  const vmin = a.num(minIdx, 0);
  const vmax = a.isBlank(minIdx + 1) ? vmin : a.num(minIdx + 1);
  const lo = Math.min(vmin, vmax), hi = Math.max(vmin, vmax);
  const user = c.m.params.get('_SELTOL');
  const tol = typeof user === 'number' && user > 0 ? user : 1e-5 * Math.max(1, Math.abs(lo), Math.abs(hi));
  return (v) => v >= lo - tol && v <= hi + tol;
}

const KIND_OF: Record<string, EntityKind> = { KSEL: 'kp', LSEL: 'line', ASEL: 'area', VSEL: 'volu', NSEL: 'node', ESEL: 'elem' };
const ITEM_KIND: Record<string, EntityKind> = { KP: 'kp', LINE: 'line', AREA: 'area', VOLU: 'volu', NODE: 'node', ELEM: 'elem' };

function xsel(c: Ctx, a: Args) {
  const m = c.m;
  const kind = KIND_OF[c.cmd];
  const type = a.lab(0, 'S');
  if (type === 'STAT') { c.selMsg(kind); return; }
  if (type === 'ALL' || type === 'NONE' || type === 'INVE') {
    applySel(m, kind, type, () => true);
    c.selMsg(kind);
    return;
  }
  const item = a.lab(1, ITEM_KIND_DEFAULT[kind]);
  const comp = a.lab(2);
  let matches: (id: Id) => boolean;
  if (item === ITEM_KIND_DEFAULT[kind] || ITEM_KIND[item] === kind) {
    // by entity number, ALL or component name in VMIN
    const v = a.raw(3).toUpperCase();
    if (v === 'ALL') matches = () => true;
    else if (m.comps.has(v)) {
      const cm = m.comps.get(v)!;
      if (cm.kind !== kind) throw new ApdlError('COMP_KIND', `Component ${v} is not a ${kind.toUpperCase()} component.`);
      const s = new Set(cm.ids);
      matches = (id) => s.has(id);
    } else {
      const lo = a.int(3, 0);
      const hi = a.isBlank(4) ? lo : a.int(4);
      const inc = Math.max(1, Math.abs(a.int(5, 1)) || 1);
      matches = (id) => id >= Math.min(lo, hi) && id <= Math.max(lo, hi) && (id - Math.min(lo, hi)) % inc === 0;
    }
  } else if (item === 'LOC') {
    const ax = 'XYZ'.indexOf(comp || 'X');
    if (ax < 0) throw new ApdlError('SEL_COMP', `${c.cmd},LOC needs component X, Y or Z.`);
    const inR = rangeTest(c, a, 3);
    matches = (id) => {
      const p = entityPoint(m, kind, id);
      return !!p && inR(fromGlobal(m, p)[ax]);
    };
  } else if (kind === 'elem' && item === 'CENT') {
    const ax = 'XYZ'.indexOf(comp || 'X');
    const inR = rangeTest(c, a, 3);
    matches = (id) => { const p = entityPoint(m, 'elem', id); return !!p && inR(fromGlobal(m, p)[ax]); };
  } else if (['TYPE', 'MAT', 'REAL', 'SEC', 'SECN', 'ESYS'].includes(item)) {
    const inR = rangeTest(c, a, 3);
    const key = ({ TYPE: 'type', MAT: 'mat', REAL: 'real', SEC: 'secnum', SECN: 'secnum', ESYS: 'esys' } as const)[item as 'TYPE'];
    if (kind === 'elem') matches = (id) => inR(m.elems.get(id)![key]);
    else if (kind === 'line' || kind === 'area' || kind === 'volu') {
      const map = entityMap(m, kind) as Map<Id, { attrs?: Record<string, number> }>;
      matches = (id) => { const at = map.get(id)?.attrs; return !!at && at[key] !== undefined && inR(at[key]); };
    } else throw new ApdlError('SEL_ITEM', `${c.cmd} item ${item} is not valid.`);
  } else if (kind === 'elem' && item === 'ENAME') {
    const num = a.int(3, 0);
    const name = a.lab(3);
    matches = (id) => {
      const et = m.etypes.get(m.elems.get(id)!.type);
      if (!et) return false;
      return et.ename === name || et.ename.replace(/\D/g, '') === String(num);
    };
  } else if (kind === 'line' && (item === 'LENGTH' || item === 'RADIUS')) {
    const inR = rangeTest(c, a, 3);
    matches = (id) => {
      const l = m.lines.get(id)!;
      return item === 'LENGTH' ? inR(l.length) : !!l.arc && inR(l.arc.radius);
    };
  } else if (kind === 'node' && (item === 'D' || item === 'F')) {
    const lab = comp || 'ALL';
    const nodes = new Set<Id>();
    for (const b of m.bcs) if (b.kind === item && (lab === 'ALL' || b.lab === lab)) nodes.add(b.target);
    matches = (id) => nodes.has(id);
  } else if (kind === 'node' && item === 'EXT') {
    const ext = exteriorNodes(m);
    matches = (id) => ext.has(id);
  } else if (kind === 'area' && item === 'EXT') {
    const use = new Map<Id, number>();
    for (const v of m.volus.values()) for (const aid of v.areas) use.set(aid, (use.get(aid) ?? 0) + 1);
    matches = (id) => (use.get(id) ?? 0) === 1;
  } else {
    throw new ApdlError('SEL_ITEM', `${c.cmd} item ${item} is not supported in the trainer.`);
  }
  applySel(m, kind, type, matches);
  c.selMsg(kind);
}

const ITEM_KIND_DEFAULT: Record<EntityKind, string> = { kp: 'KP', line: 'LINE', area: 'AREA', volu: 'VOLU', node: 'NODE', elem: 'ELEM' };

reg(['KSEL', 'LSEL', 'ASEL', 'VSEL', 'NSEL', 'ESEL'], xsel, [...SEL_PROCS]);

export function exteriorNodes(m: ModelState): Set<Id> {
  const faces = new Map<string, Id[]>();
  const FACES: Record<string, number[][]> = {
    hex: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]],
    wedge: [[0, 2, 1], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]],
    tet: [[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]],
    pyramid: [[0, 3, 2, 1], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]],
  };
  const out = new Set<Id>();
  for (const e of m.elems.values()) {
    const fs = FACES[e.shape];
    if (!fs) { if (e.shape === 'quad' || e.shape === 'tri' || e.shape === 'line') e.nodes.forEach((n) => out.add(n)); continue; }
    for (const f of fs) {
      const ids = f.map((i) => e.nodes[i]);
      const k = [...ids].sort((x, y) => x - y).join(',');
      if (faces.has(k)) faces.delete(k); else faces.set(k, ids);
    }
  }
  for (const ids of faces.values()) ids.forEach((n) => out.add(n));
  return out;
}

// ------------------------------------------------------------------ association selects
function nodeOnLine(m: ModelState, p: Vec3, lid: Id, tol: number) {
  const l = m.lines.get(lid)!;
  for (let i = 0; i < l.pts.length - 1; i++) if (segDist(p, l.pts[i], l.pts[i + 1]).d <= tol) return true;
  return false;
}

function pointTriDist(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const n = cross(sub(b, a), sub(c, a));
  const nl = Math.hypot(...n);
  if (nl < 1e-20) return Math.min(segDist(p, a, b).d, segDist(p, b, c).d);
  const nn: Vec3 = [n[0] / nl, n[1] / nl, n[2] / nl];
  const d = dot(sub(p, a), nn);
  const q: Vec3 = [p[0] - nn[0] * d, p[1] - nn[1] * d, p[2] - nn[2] * d];
  const inside = (u: Vec3, v: Vec3) => dot(cross(sub(v, u), sub(q, u)), nn) >= -1e-12 * nl;
  if (inside(a, b) && inside(b, c) && inside(c, a)) return Math.abs(d);
  return Math.min(segDist(p, a, b).d, segDist(p, b, c).d, segDist(p, c, a).d);
}

function nodeOnArea(m: ModelState, p: Vec3, aid: Id, tol: number) {
  const ar = m.areas.get(aid)!;
  const t = ar.tess;
  for (let i = 0; i < t.idx.length; i += 3) {
    if (pointTriDist(p, vtx(t, t.idx[i]), vtx(t, t.idx[i + 1]), vtx(t, t.idx[i + 2])) <= tol) return true;
  }
  return false;
}

export function modelTol(m: ModelState): number {
  let lo = Infinity, hi = -Infinity;
  for (const k of m.kps.values()) for (const x of k.xyz) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
  for (const n of m.nodes.values()) for (const x of n.xyz) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
  return Math.max(1e-8, 1e-6 * (isFinite(hi - lo) ? hi - lo : 1));
}

reg('NSLK', (c, a) => {
  const m = c.m;
  const tol = modelTol(m);
  const pts = [...m.sel.kp].map((k) => m.kps.get(k)?.xyz).filter(Boolean) as Vec3[];
  applySel(m, 'node', a.lab(0, 'S'), (id) => { const p = m.nodes.get(id)!.xyz; return pts.some((q) => dist(p, q) <= tol); });
  c.selMsg('node');
}, [...SEL_PROCS]);
reg('NSLL', (c, a) => {
  const m = c.m;
  const tol = modelTol(m);
  const nkey = a.int(1, 0);
  const lines = [...m.sel.line].filter((l) => m.lines.has(l));
  const kpPts = new Set<string>();
  if (nkey === 0) for (const l of lines) for (const k of m.lines.get(l)!.kps) { const p = m.kps.get(k)!.xyz; kpPts.add(p.join(',')); }
  applySel(m, 'node', a.lab(0, 'S'), (id) => {
    const p = m.nodes.get(id)!.xyz;
    if (!lines.some((l) => nodeOnLine(m, p, l, tol))) return false;
    if (nkey === 0) for (const l of lines) for (const k of m.lines.get(l)!.kps) if (dist(m.kps.get(k)!.xyz, p) <= tol) return false;
    return true;
  });
  c.selMsg('node');
}, [...SEL_PROCS]);
reg('NSLA', (c, a) => {
  const m = c.m;
  const tol = modelTol(m);
  const nkey = a.int(1, 0);
  const areas = [...m.sel.area].filter((x) => m.areas.has(x));
  const bLines = new Set<Id>();
  if (nkey === 0) for (const aid of areas) areaLines(m.areas.get(aid)!).forEach((l) => bLines.add(l));
  applySel(m, 'node', a.lab(0, 'S'), (id) => {
    const p = m.nodes.get(id)!.xyz;
    if (!areas.some((x) => nodeOnArea(m, p, x, tol))) return false;
    if (nkey === 0) for (const l of bLines) if (nodeOnLine(m, p, l, tol)) return false;
    return true;
  });
  c.selMsg('node');
}, [...SEL_PROCS]);
reg('NSLV', (c, a) => {
  const m = c.m;
  const nkey = a.int(1, 0);
  const vols = new Set([...m.sel.volu].filter((x) => m.volus.has(x)));
  const nodes = new Set<Id>();
  for (const e of m.elems.values()) if (e.parent?.kind === 'volu' && vols.has(e.parent.id)) e.nodes.forEach((n) => nodes.add(n));
  if (nkey === 0) {
    // interior only: remove nodes on the volume boundary areas
    const tol = modelTol(m);
    const areas = new Set<Id>();
    for (const v of vols) m.volus.get(v)!.areas.forEach((x) => areas.add(x));
    for (const n of [...nodes]) { const p = m.nodes.get(n)!.xyz; for (const ar of areas) if (nodeOnArea(m, p, ar, tol)) { nodes.delete(n); break; } }
  }
  applySel(m, 'node', a.lab(0, 'S'), (id) => nodes.has(id));
  c.selMsg('node');
}, [...SEL_PROCS]);
reg('NSLE', (c, a) => {
  const m = c.m;
  const nodes = new Set<Id>();
  const cornerOnly = a.lab(1, 'ALL') === 'CORNER';
  for (const id of m.sel.elem) {
    const e = m.elems.get(id);
    if (!e) continue;
    (cornerOnly ? e.nodes.slice(0, cornerCount(e.shape)) : e.nodes).forEach((n) => nodes.add(n));
  }
  applySel(m, 'node', a.lab(0, 'S'), (id) => nodes.has(id));
  c.selMsg('node');
}, [...SEL_PROCS]);
reg('ESLN', (c, a) => {
  const m = c.m;
  const ekey = a.int(1, 0);
  const sel = m.sel.node;
  applySel(m, 'elem', a.lab(0, 'S'), (id) => {
    const e = m.elems.get(id)!;
    const corners = e.nodes.slice(0, cornerCount(e.shape));
    return ekey === 1 ? corners.every((n) => sel.has(n)) : corners.some((n) => sel.has(n));
  });
  c.selMsg('elem');
}, [...SEL_PROCS]);
for (const [cmd, pk] of [['ESLV', 'volu'], ['ESLA', 'area'], ['ESLL', 'line']] as const) {
  reg(cmd, (c, a) => {
    const m = c.m;
    const s = m.sel[pk];
    applySel(m, 'elem', a.lab(0, 'S'), (id) => { const e = m.elems.get(id)!; return e.parent?.kind === pk && s.has(e.parent.id); });
    c.selMsg('elem');
  }, [...SEL_PROCS]);
}
reg('LSLA', (c, a) => {
  const m = c.m;
  const lines = new Set<Id>();
  for (const aid of m.sel.area) { const ar = m.areas.get(aid); if (ar) areaLines(ar).forEach((l) => lines.add(l)); }
  applySel(m, 'line', a.lab(0, 'S'), (id) => lines.has(id));
  c.selMsg('line');
}, [...SEL_PROCS]);
reg('LSLK', (c, a) => {
  const m = c.m;
  const all = a.int(1, 0) === 1;
  applySel(m, 'line', a.lab(0, 'S'), (id) => {
    const l = m.lines.get(id)!;
    return all ? l.kps.every((k) => m.sel.kp.has(k)) : l.kps.some((k) => m.sel.kp.has(k));
  });
  c.selMsg('line');
}, [...SEL_PROCS]);
reg('ASLL', (c, a) => {
  const m = c.m;
  const all = a.int(1, 0) === 1;
  applySel(m, 'area', a.lab(0, 'S'), (id) => {
    const ls = areaLines(m.areas.get(id)!);
    return all ? ls.every((l) => m.sel.line.has(l)) : ls.some((l) => m.sel.line.has(l));
  });
  c.selMsg('area');
}, [...SEL_PROCS]);
reg('ASLV', (c, a) => {
  const m = c.m;
  const areas = new Set<Id>();
  for (const vid of m.sel.volu) m.volus.get(vid)?.areas.forEach((x) => areas.add(x));
  applySel(m, 'area', a.lab(0, 'S'), (id) => areas.has(id));
  c.selMsg('area');
}, [...SEL_PROCS]);
reg('VSLA', (c, a) => {
  const m = c.m;
  const all = a.int(1, 0) === 1;
  applySel(m, 'volu', a.lab(0, 'S'), (id) => {
    const as = m.volus.get(id)!.areas;
    return all ? as.every((x) => m.sel.area.has(x)) : as.some((x) => m.sel.area.has(x));
  });
  c.selMsg('volu');
}, [...SEL_PROCS]);
reg('KSLL', (c, a) => {
  const m = c.m;
  const kps = new Set<Id>();
  for (const lid of m.sel.line) { const l = m.lines.get(lid); if (l) l.kps.forEach((k) => kps.add(k)); }
  applySel(m, 'kp', a.lab(0, 'S'), (id) => kps.has(id));
  c.selMsg('kp');
}, [...SEL_PROCS]);
reg('KSLN', (c, a) => {
  const m = c.m;
  const tol = modelTol(m);
  const pts = [...m.sel.node].map((n) => m.nodes.get(n)?.xyz).filter(Boolean) as Vec3[];
  applySel(m, 'kp', a.lab(0, 'S'), (id) => pts.some((p) => dist(p, m.kps.get(id)!.xyz) <= tol));
  c.selMsg('kp');
}, [...SEL_PROCS]);

reg('ALLSEL', (c, a) => {
  const m = c.m;
  const labt = a.lab(0, 'ALL');
  const ent = a.lab(1, 'ALL');
  if (labt === 'ALL') {
    for (const k of ['kp', 'line', 'area', 'volu', 'node', 'elem'] as EntityKind[]) m.sel[k] = new Set(entityMap(m, k).keys());
    return;
  }
  if (labt !== 'BELOW') throw new ApdlError('ALLSEL', `ALLSEL label ${labt} is not valid (use ALL or BELOW).`);
  const order: EntityKind[] = ['volu', 'area', 'line', 'kp'];
  const start = ent === 'ALL' ? 0 : order.indexOf(({ VOLU: 'volu', AREA: 'area', LINE: 'line', KP: 'kp' } as Record<string, EntityKind>)[ent] ?? 'volu');
  for (let i = Math.max(0, start); i < order.length; i++) {
    const k = order[i];
    if (k === 'area') for (const v of m.sel.volu) m.volus.get(v)?.areas.forEach((x) => m.sel.area.add(x));
    if (k === 'line') for (const ar of m.sel.area) { const A = m.areas.get(ar); if (A) areaLines(A).forEach((l) => m.sel.line.add(l)); }
    if (k === 'kp') for (const l of m.sel.line) m.lines.get(l)?.kps.forEach((x) => m.sel.kp.add(x));
  }
  // elements & nodes of selected solid-model entities
  for (const e of m.elems.values()) {
    if (!e.parent) continue;
    const s = m.sel[e.parent.kind];
    if (s.has(e.parent.id)) { m.sel.elem.add(e.id); e.nodes.forEach((n) => m.sel.node.add(n)); }
  }
  void areaKps;
}, [...SEL_PROCS]);

reg('SELTOL', (c, a) => {
  if (a.isBlank(0)) c.m.params.delete('_SELTOL');
  else c.m.params.set('_SELTOL', a.num(0));
}, [...SEL_PROCS]);

// ------------------------------------------------------------------ components
const CM_KIND: Record<string, EntityKind> = { VOLU: 'volu', AREA: 'area', LINE: 'line', KP: 'kp', ELEM: 'elem', NODE: 'node' };

reg('CM', (c, a) => {
  const name = a.lab(0);
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(name)) throw new ApdlError('CM_NAME', `Component name "${a.raw(0)}" is not valid (start with a letter, max 32 characters).`);
  if (['ALL', 'STAT', 'DEFA'].includes(name)) throw new ApdlError('CM_NAME', `${name} cannot be used as a component name.`);
  const ent = a.lab(1);
  const kind = CM_KIND[ent];
  if (!kind) throw new ApdlError('CM_ENTITY', `CM entity ${ent || '(blank)'} is not valid (use VOLU, AREA, LINE, KP, ELEM or NODE).`);
  const map = entityMap(c.m, kind);
  const ids = [...c.m.sel[kind]].filter((x) => map.has(x)).sort((x, y) => x - y);
  if (!ids.length) c.warn('CM_EMPTY', `No ${ent} entities are selected; component ${name} is empty.`);
  c.m.comps.set(name, { name, kind, ids });
  c.out(` DEFINITION OF COMPONENT = ${name}   ENTITY=${ent}   (${ids.length} ITEMS)`);
}, [...SEL_PROCS]);
reg('CMSEL', (c, a) => {
  const type = a.lab(0, 'S');
  const m = c.m;
  if (type === 'ALL' || type === 'NONE') {
    for (const cm of m.comps.values()) applySel(m, cm.kind, type === 'ALL' ? 'A' : 'U', (id) => cm.ids.includes(id));
    return;
  }
  const name = a.lab(1);
  const cm = m.comps.get(name);
  if (!cm) throw new ApdlError('CM_UNDEF', `Component ${name} is not defined.`);
  const s = new Set(cm.ids);
  applySel(m, cm.kind, type, (id) => s.has(id));
  c.selMsg(cm.kind);
}, [...SEL_PROCS]);
reg('CMDELE', (c, a) => {
  const name = a.lab(0);
  if (!c.m.comps.delete(name)) c.warn('CM_UNDEF', `Component ${name} is not defined.`);
}, [...SEL_PROCS]);

export { ELEMENT_LIBRARY };
