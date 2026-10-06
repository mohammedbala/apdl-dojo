// NUMMRG, NUMCMP, NUMSTR, NUMOFF.
import { reg } from './registry';
import type { Ctx } from '../context';
import { ApdlError } from '../diagnostics';
import type { EntityKind, Id, ModelState } from '../../model/types';
import { mergeKp, mergeLine, sameLineGeometry } from '../../geometry/imprint';
import { areaLines, refreshVolume, triStats } from '../../geometry/topo';
import { dist, dot } from '../../geometry/vec';

const PREP = ['PREP7'] as const;

function mergeNodes(m: ModelState, tol: number): number {
  const ids = [...m.sel.node].filter((id) => m.nodes.has(id)).sort((a, b) => a - b);
  const cell = Math.max(tol * 4, 1e-12);
  const grid = new Map<string, Id[]>();
  const key = (p: number[], d: number[] = [0, 0, 0]) => `${Math.floor(p[0] / cell) + d[0]},${Math.floor(p[1] / cell) + d[1]},${Math.floor(p[2] / cell) + d[2]}`;
  const remap = new Map<Id, Id>();
  for (const id of ids) {
    const p = m.nodes.get(id)!.xyz;
    let target: Id | undefined;
    for (let dx = -1; dx <= 1 && target === undefined; dx++) for (let dy = -1; dy <= 1 && target === undefined; dy++) for (let dz = -1; dz <= 1 && target === undefined; dz++) {
      for (const o of grid.get(key(p, [dx, dy, dz])) ?? []) if (dist(m.nodes.get(o)!.xyz, p) <= tol) { target = o; break; }
    }
    if (target !== undefined) { remap.set(id, target); continue; }
    const k = key(p);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(id);
  }
  if (!remap.size) return 0;
  for (const e of m.elems.values()) e.nodes = e.nodes.map((n) => remap.get(n) ?? n);
  for (const b of m.bcs) if (b.kind !== 'SF') b.target = remap.get(b.target) ?? b.target;
  for (const c of m.comps.values()) if (c.kind === 'node') c.ids = [...new Set(c.ids.map((n) => remap.get(n) ?? n))];
  // de-duplicate BC entries
  const seen = new Set<string>();
  m.bcs = m.bcs.filter((b) => { const k = `${b.kind}|${b.target}|${b.lab}|${b.face ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true; });
  for (const id of remap.keys()) { m.nodes.delete(id); m.sel.node.delete(id); m.nodeOwner.delete(id); }
  return remap.size;
}

function mergeKeypoints(m: ModelState, tol: number): number {
  const ids = [...m.sel.kp].filter((id) => m.kps.has(id)).sort((a, b) => a - b);
  let n = 0;
  for (let i = 0; i < ids.length; i++) {
    const a = m.kps.get(ids[i]);
    if (!a) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const b = m.kps.get(ids[j]);
      if (!b) continue;
      if (dist(a.xyz, b.xyz) <= tol) { mergeKp(m, b.id, a.id); n++; }
    }
  }
  // lines with identical geometry
  const lines = [...m.lines.values()].sort((a, b) => a.id - b.id);
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i], b = lines[j];
    if (!m.lines.has(a.id) || !m.lines.has(b.id)) continue;
    if (sameLineGeometry(a, b, tol)) mergeLine(m, b.id, a.id);
  }
  // areas with identical line sets
  const areas = [...m.areas.values()].sort((a, b) => a.id - b.id);
  for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++) {
    const A = areas[i], B = areas[j];
    if (!m.areas.has(A.id) || !m.areas.has(B.id)) continue;
    const la = areaLines(A).sort((x, y) => x - y).join(','), lb = areaLines(B).sort((x, y) => x - y).join(',');
    if (la !== lb) continue;
    const opposite = dot(triStats(A.tess).normal, triStats(B.tess).normal) < 0;
    for (const v of m.volus.values()) {
      const k = v.areas.indexOf(B.id);
      if (k < 0) continue;
      v.areas[k] = A.id;
      if (opposite) v.areaFlip[k] = !v.areaFlip[k];
      refreshVolume(m, v);
    }
    m.areas.delete(B.id);
    m.sel.area.delete(B.id);
  }
  return n;
}

function mergeElems(m: ModelState): number {
  const seen = new Map<string, Id>();
  let n = 0;
  for (const e of [...m.elems.values()].sort((a, b) => a.id - b.id)) {
    const k = `${e.type}|${[...e.nodes].sort((a, b) => a - b).join(',')}`;
    if (seen.has(k)) { m.elems.delete(e.id); m.sel.elem.delete(e.id); n++; }
    else seen.set(k, e.id);
  }
  return n;
}

reg('NUMMRG', (c, a) => {
  const m = c.m;
  const lab = a.lab(0, 'ALL');
  const tol = a.num(1, 0) || 1e-4;
  if (lab === 'NODE' || lab === 'ALL') c.out(` MERGE COINCIDENT NODES   ${mergeNodes(m, tol)} NODES MERGED`);
  if (lab === 'KP' || lab === 'ALL') c.out(` MERGE COINCIDENT KEYPOINTS   ${mergeKeypoints(m, tol)} KEYPOINTS MERGED`);
  if (lab === 'ELEM' || lab === 'ALL') c.out(` MERGE DUPLICATE ELEMENTS   ${mergeElems(m)} ELEMENTS REMOVED`);
  if (!['NODE', 'KP', 'ELEM', 'ALL', 'MAT', 'TYPE', 'REAL', 'CP', 'CE', 'SECN'].includes(lab)) throw new ApdlError('NUMMRG', `NUMMRG label ${lab} is not valid.`);
}, [...PREP]);

function compress(m: ModelState, kind: EntityKind) {
  const map = { kp: m.kps, line: m.lines, area: m.areas, volu: m.volus, node: m.nodes, elem: m.elems }[kind] as Map<Id, { id: Id }>;
  const old = [...map.keys()].sort((a, b) => a - b);
  const remap = new Map<Id, Id>();
  old.forEach((id, i) => remap.set(id, i + 1));
  if (old.every((id, i) => id === i + 1)) return;
  const entries = old.map((id) => map.get(id)!);
  map.clear();
  for (const e of entries) { e.id = remap.get(e.id)!; map.set(e.id, e); }
  const r = (x: Id) => remap.get(x) ?? x;
  m.sel[kind] = new Set([...m.sel[kind]].map(r));
  for (const cm of m.comps.values()) if (cm.kind === kind) cm.ids = cm.ids.map(r);
  if (kind === 'kp') {
    for (const l of m.lines.values()) l.kps = [r(l.kps[0]), r(l.kps[1])];
    for (const s of m.solidLoads) if (s.cmd === 'DK' || s.cmd === 'FK') s.entity = r(s.entity);
  } else if (kind === 'line') {
    for (const a of m.areas.values()) a.loops = a.loops.map((lp) => lp.map((s) => Math.sign(s) * r(Math.abs(s))));
    for (const s of m.solidLoads) if (s.cmd === 'DL' || s.cmd === 'SFL') s.entity = r(s.entity);
  } else if (kind === 'area') {
    for (const v of m.volus.values()) { v.areas = v.areas.map(r); if (v.tess.tag) v.tess.tag = v.tess.tag.map(r); }
    for (const s of m.solidLoads) if (s.cmd === 'DA' || s.cmd === 'SFA') s.entity = r(s.entity);
  } else if (kind === 'node') {
    for (const e of m.elems.values()) e.nodes = e.nodes.map(r);
    for (const b of m.bcs) if (b.kind !== 'SF') b.target = r(b.target);
    m.nodeOwner = new Map([...m.nodeOwner].map(([k, v]) => [r(k), v]));
  } else if (kind === 'elem') {
    for (const b of m.bcs) if (b.kind === 'SF') b.target = r(b.target);
  }
  // element parents
  const pk = ({ kp: 'kp', line: 'line', area: 'area', volu: 'volu' } as Record<string, string>)[kind];
  if (pk) {
    for (const e of m.elems.values()) if (e.parent?.kind === pk) e.parent = { kind: e.parent.kind, id: r(e.parent.id) };
    const prefix = { kp: 'K', line: 'L', area: 'A', volu: 'V' }[kind as 'kp'];
    m.nodeOwner = new Map([...m.nodeOwner].map(([k, v]) => [k, v[0] === prefix ? `${prefix}${r(Number(v.slice(1)))}` : v]));
  }
}

reg('NUMCMP', (c, a) => {
  const lab = a.lab(0, 'ALL');
  const kinds: Record<string, EntityKind[]> = { NODE: ['node'], ELEM: ['elem'], KP: ['kp'], LINE: ['line'], AREA: ['area'], VOLU: ['volu'], ALL: ['kp', 'line', 'area', 'volu', 'node', 'elem'] };
  const ks = kinds[lab];
  if (!ks) throw new ApdlError('NUMCMP', `NUMCMP label ${lab} is not valid (NODE, ELEM, KP, LINE, AREA, VOLU or ALL).`);
  for (const k of ks) compress(c.m, k);
}, [...PREP]);

reg('NUMSTR', (c, a) => {
  const lab = a.lab(0);
  const kind = ({ NODE: 'node', ELEM: 'elem', KP: 'kp', LINE: 'line', AREA: 'area', VOLU: 'volu' } as Record<string, EntityKind>)[lab];
  if (lab === 'DEFA') { c.m.numstr = {}; return; }
  if (!kind) throw new ApdlError('NUMSTR', `NUMSTR label ${lab} is not valid.`);
  c.m.numstr[kind] = Math.max(1, a.int(1, 1));
}, [...PREP]);

reg('NUMOFF', (c: Ctx) => c.note('NUMOFF is not supported in the trainer; numbering unchanged.'), [...PREP]);
