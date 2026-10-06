// Primitives, Booleans and sweeps.
import { reg } from './registry';
import type { Ctx } from '../context';
import type { Args } from '../args';
import { ApdlError } from '../diagnostics';
import type { Id, Vec3 } from '../../model/types';
import { selectedIds } from '../../model/state';
import { block, circleArea, cone, cylinder, extrudeWp, polygonArea, rectArea, sphere } from '../../geometry/primitives';
import { vadd, vglue, vinv, voverlap, vsba, vsbv, deleteVolumes } from '../../geometry/booleans';
import { areaBoolean, conformLines, coplanar, imprintAreas } from '../../geometry/imprint';
import { sweepAreas, sweepLines, type Stage } from '../../geometry/sweep';
import { areaKps, areaLines, isMeshed, sweepUnused, volumesUsingArea, triStats, lineStartKp } from '../../geometry/topo';
import { add, cross, dist, dot, len, norm, scale, sub } from '../../geometry/vec';
import { getCsys } from '../../geometry/csys';

const PREP = ['PREP7'] as const;
const DEG = Math.PI / 180;

function report(c: Ctx, what: string, id: Id) {
  if (id) c.out(` OUTPUT ${what} = ${id}`);
}

// ------------------------------------------------------------------ primitives
reg('BLOCK', (c, a) => report(c, 'VOLUME', block(c.m, a.num(0), a.num(1), a.num(2), a.num(3), a.num(4), a.num(5))), [...PREP]);
reg('BLC4', (c, a) => {
  const xc = a.num(0), yc = a.num(1), w = a.num(2), h = a.num(3), d = a.num(4, 0);
  if (w === 0 || h === 0) throw new ApdlError('PRIM_ZERO', 'BLC4: WIDTH and HEIGHT must be non-zero.');
  if (d === 0) return report(c, 'AREA', rectArea(c.m, xc, xc + w, yc, yc + h));
  report(c, 'VOLUME', block(c.m, xc, xc + w, yc, yc + h, Math.min(0, d), Math.max(0, d)));
}, [...PREP]);
reg('BLC5', (c, a) => {
  const xc = a.num(0), yc = a.num(1), w = a.num(2), h = a.num(3), d = a.num(4, 0);
  if (w === 0 || h === 0) throw new ApdlError('PRIM_ZERO', 'BLC5: WIDTH and HEIGHT must be non-zero.');
  if (d === 0) return report(c, 'AREA', rectArea(c.m, xc - w / 2, xc + w / 2, yc - h / 2, yc + h / 2));
  report(c, 'VOLUME', block(c.m, xc - w / 2, xc + w / 2, yc - h / 2, yc + h / 2, Math.min(0, d), Math.max(0, d)));
}, [...PREP]);
reg('RECTNG', (c, a) => report(c, 'AREA', rectArea(c.m, a.num(0), a.num(1), a.num(2), a.num(3))), [...PREP]);
reg('PCIRC', (c, a) => report(c, 'AREA', circleArea(c.m, 0, 0, a.num(0), a.num(1), a.num(2, 0), a.num(3, 360))), [...PREP]);
reg('CYL4', (c, a) => {
  const xc = a.num(0), yc = a.num(1), r1 = a.num(2), t1 = a.num(3, 0), r2 = a.num(4, 0), t2 = a.isBlank(5) ? 360 : a.num(5), d = a.num(6, 0);
  const area = circleArea(c.m, xc, yc, r1, r2, t1, t2, Math.min(0, d));
  if (d === 0) return report(c, 'AREA', area);
  report(c, 'VOLUME', extrudeWp(c.m, area, Math.abs(d)));
}, [...PREP]);
reg('CYL5', (c, a) => {
  // CYL5,XEDGE1,YEDGE1,XEDGE2,YEDGE2,DEPTH : circle by diameter end points
  const x1 = a.num(0), y1 = a.num(1), x2 = a.num(2), y2 = a.num(3), d = a.num(4, 0);
  const r = Math.hypot(x2 - x1, y2 - y1) / 2;
  const area = circleArea(c.m, (x1 + x2) / 2, (y1 + y2) / 2, r, 0, 0, 360, Math.min(0, d));
  if (d === 0) return report(c, 'AREA', area);
  report(c, 'VOLUME', extrudeWp(c.m, area, Math.abs(d)));
}, [...PREP]);
reg('CYLIND', (c, a) => {
  const r1 = a.num(0), r2 = a.num(1, 0), z1 = a.num(2), z2 = a.num(3), t1 = a.num(4, 0), t2 = a.isBlank(5) ? 360 : a.num(5);
  if (z1 === z2) throw new ApdlError('PRIM_ZERO', 'CYLIND: Z1 and Z2 must differ.');
  report(c, 'VOLUME', cylinder(c.m, 0, 0, r1, r2, t1, t2, z1, z2));
}, [...PREP]);
reg('CONE', (c, a) => report(c, 'VOLUME', cone(c.m, a.num(0), a.num(1), a.num(2), a.num(3), a.num(4, 0), a.isBlank(5) ? 360 : a.num(5))), [...PREP]);
reg('CON4', (c, a) => {
  // CON4,XCENTER,YCENTER,RAD1,RAD2,DEPTH
  const xc = a.num(0), yc = a.num(1);
  const wp = c.m.wp;
  const saved = { origin: [...wp.origin] as Vec3, axes: wp.axes };
  wp.origin = add(wp.origin, add(scale(wp.axes[0], xc), scale(wp.axes[1], yc)));
  try {
    report(c, 'VOLUME', cone(c.m, a.num(2), a.num(3, 0), 0, a.num(4), 0, 360));
  } finally {
    c.m.wp = saved;
  }
}, [...PREP]);
reg('SPHERE', (c, a) => report(c, 'VOLUME', sphere(c.m, a.num(0), a.num(1, 0), a.num(2, 0), a.isBlank(3) ? 360 : a.num(3))), [...PREP]);
reg('SPH4', (c, a) => {
  const wp = c.m.wp;
  const saved = { origin: [...wp.origin] as Vec3, axes: wp.axes };
  wp.origin = add(wp.origin, add(scale(wp.axes[0], a.num(0)), scale(wp.axes[1], a.num(1))));
  try {
    report(c, 'VOLUME', sphere(c.m, a.num(2), a.num(3, 0), 0, 360));
  } finally {
    c.m.wp = saved;
  }
}, [...PREP]);
reg(['RPR4', 'POLYGON', 'RPRISM', 'PRISM'], (c, a) => {
  if (c.cmd === 'RPR4') {
    // RPR4,NSIDES,XCENTER,YCENTER,RADIUS,THETA,DEPTH
    const n = a.int(0), xc = a.num(1), yc = a.num(2), r = a.num(3), th = a.num(4, 0), d = a.num(5, 0);
    if (n < 3) throw new ApdlError('PRIM_SIDES', 'RPR4 needs at least 3 sides.');
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) { const ang = (th + (360 * i) / n) * DEG; pts.push([xc + r * Math.cos(ang), yc + r * Math.sin(ang)]); }
    const ar = polygonArea(c.m, pts, Math.min(0, d));
    if (d === 0) return report(c, 'AREA', ar);
    return report(c, 'VOLUME', extrudeWp(c.m, ar, Math.abs(d)));
  }
  if (c.cmd === 'RPRISM') {
    // RPRISM,Z1,Z2,NSIDES,LSIDE,MAJRAD,MINRAD
    const z1 = a.num(0), z2 = a.num(1), n = a.int(2);
    let r = a.num(4, 0);
    if (!r && a.num(3, 0)) r = a.num(3) / (2 * Math.sin(Math.PI / n));
    if (!r && a.num(5, 0)) r = a.num(5) / Math.cos(Math.PI / n);
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) { const ang = (360 * i / n) * DEG; pts.push([r * Math.cos(ang), r * Math.sin(ang)]); }
    const ar = polygonArea(c.m, pts, Math.min(z1, z2));
    return report(c, 'VOLUME', extrudeWp(c.m, ar, Math.abs(z2 - z1)));
  }
  // POLYGON,NPT,X1,Y1,X2,Y2...  /  PRISM,Z1,Z2 (uses the last POLYGON outline: not supported)
  if (c.cmd === 'POLYGON') {
    const pts: [number, number][] = [];
    for (let i = 1; i + 1 < a.count; i += 2) if (!a.isBlank(i)) pts.push([a.num(i), a.num(i + 1)]);
    return report(c, 'AREA', polygonArea(c.m, pts));
  }
  throw new ApdlError('UNSUPPORTED', 'PRISM (with PTXY) is not supported in the trainer; use POLYGON + VEXT or RPRISM.');
}, [...PREP]);

// ------------------------------------------------------------------ volume booleans
function volList(c: Ctx, a: Args, start: number, max: number): Id[] {
  const first = a.raw(start).toUpperCase();
  if (first === 'ALL' || c.m.comps.has(first)) return a.entities('volu', start);
  const out: Id[] = [];
  for (let i = start; i < start + max; i++) if (!a.isBlank(i)) out.push(a.int(i));
  for (const id of out) c.ensureExists('volu', id);
  return out;
}

reg('VADD', (c, a) => {
  const ids = volList(c, a, 0, 9);
  const out = vadd(c.m, ids);
  c.out(` ADD VOLUMES ${ids.join(' ')}   OUTPUT VOLUME = ${out.join(' ')}`);
}, [...PREP]);
reg('VSBV', (c, a) => {
  const ids1 = a.entity1('volu', 0);
  let ids2 = a.entity1('volu', 1);
  if (a.lab(1) === 'ALL') ids2 = ids2.filter((x) => !ids1.includes(x));
  if (!ids1.length || !ids2.length) throw new ApdlError('VSBV_ARGS', 'VSBV needs NV1 and NV2 (volume numbers, ALL or a component).');
  for (const id of [...ids1, ...ids2]) c.ensureExists('volu', id);
  const keep1 = a.lab(3) === 'KEEP' || (a.lab(3) === '' && c.m.params.get('_BOPT_KEEP') === 1);
  const keep2 = a.lab(4) === 'KEEP';
  const out = vsbv(c.m, ids1, ids2, keep1, keep2);
  c.out(` SUBTRACT VOLUME(S) ${ids2.join(' ')} FROM ${ids1.join(' ')}   OUTPUT VOLUME(S) = ${out.join(' ')}`);
  if (!out.length) c.note('The subtraction removed the whole volume.');
}, [...PREP]);
reg('VINV', (c, a) => {
  const ids = volList(c, a, 0, 9);
  const out = vinv(c.m, ids);
  c.out(` INTERSECT VOLUMES ${ids.join(' ')}   OUTPUT VOLUME = ${out.join(' ')}`);
}, [...PREP]);
reg(['VOVLAP', 'VPTN'], (c, a) => {
  const ids = volList(c, a, 0, 9);
  const out = voverlap(c.m, ids);
  c.out(` ${c.cmd === 'VPTN' ? 'PARTITION' : 'OVERLAP'} VOLUMES ${ids.join(' ')}   OUTPUT VOLUMES = ${out.join(' ')}`);
}, [...PREP]);
reg('VGLUE', (c, a) => {
  const ids = volList(c, a, 0, 9);
  if (ids.length < 2) { c.note('VGLUE: fewer than two volumes selected; nothing to glue.'); return; }
  const before = c.m.areas.size;
  const out = vglue(c.m, ids);
  c.out(` GLUE VOLUMES ${ids.join(' ')}`);
  c.out(` OUTPUT VOLUMES = ${out.join(' ')}   (NUMBER OF AREAS ${before} -> ${c.m.areas.size})`);
}, [...PREP]);
reg('VSBA', (c, a) => {
  const vids = a.entity1('volu', 0);
  const aid = a.int(1);
  const ar = c.m.areas.get(aid);
  if (!ar) throw new ApdlError('AREA_UNDEFINED', `Area ${aid} is undefined.`);
  const out = vsba(c.m, vids, ar, a.lab(3) === 'KEEP');
  c.out(` DIVIDE VOLUME(S) ${vids.join(' ')} BY AREA ${aid}   OUTPUT VOLUMES = ${out.join(' ')}`);
}, [...PREP]);
reg('BOPTN', (c, a) => {
  const lab = a.lab(0, 'DEFA');
  if (lab === 'KEEP') c.m.params.set('_BOPT_KEEP', a.lab(1) === 'YES' ? 1 : 0);
  else if (lab === 'DEFA') c.m.params.delete('_BOPT_KEEP');
}, [...PREP]);

// ------------------------------------------------------------------ area booleans
function areaList(c: Ctx, a: Args, start: number, max: number): Id[] {
  const first = a.raw(start).toUpperCase();
  if (first === 'ALL' || c.m.comps.has(first)) return a.entities('area', start);
  const out: Id[] = [];
  for (let i = start; i < start + max; i++) if (!a.isBlank(i)) out.push(a.int(i));
  for (const id of out) c.ensureExists('area', id);
  return out;
}

function assertFreeAreas(c: Ctx, ids: Id[]) {
  for (const id of ids) {
    if (volumesUsingArea(c.m, id).length) throw new ApdlError('AREA_IN_VOLUME', `Area ${id} is attached to a volume; area Booleans on volume faces are not supported.`);
    if (isMeshed(c.m, 'area', id)) throw new ApdlError('MESHED', `Area ${id} is meshed.  Clear the mesh first (ACLEAR).`);
  }
}

function deleteAreas(c: Ctx, ids: Id[]) {
  const lines = new Set<Id>(), kps = new Set<Id>();
  for (const id of ids) {
    const ar = c.m.areas.get(id);
    if (!ar) continue;
    areaLines(ar).forEach((l) => lines.add(l));
    areaKps(c.m, ar).forEach((k) => kps.add(k));
    c.m.areas.delete(id);
    c.m.sel.area.delete(id);
  }
  sweepUnused(c.m, { lines, kps });
}

const tolFor = (c: Ctx, ids: Id[]) => {
  let d = 0;
  for (const id of ids) {
    const ar = c.m.areas.get(id)!;
    for (let i = 0; i < ar.tess.pos.length; i += 3) d = Math.max(d, Math.hypot(ar.tess.pos[i] - ar.centroid[0], ar.tess.pos[i + 1] - ar.centroid[1], ar.tess.pos[i + 2] - ar.centroid[2]));
  }
  return Math.max(1e-7, 4e-6 * d);
};

reg('ASBA', (c, a) => {
  const ids1 = a.entity1('area', 0);
  let ids2 = a.entity1('area', 1);
  if (a.lab(1) === 'ALL') ids2 = ids2.filter((x) => !ids1.includes(x));
  for (const id of [...ids1, ...ids2]) c.ensureExists('area', id);
  assertFreeAreas(c, [...ids1, ...ids2]);
  const tol = tolFor(c, [...ids1, ...ids2]);
  const out: Id[] = [];
  const consumed: Id[] = [];
  for (const id of ids1) {
    const A = c.m.areas.get(id)!;
    const tools = ids2.filter((b) => b !== id).map((b) => c.m.areas.get(b)!).filter((B) => coplanar(A, B, tol));
    if (!tools.length) continue;
    out.push(...areaBoolean(c.m, A, tools, 'sub', tol));
    consumed.push(id);
  }
  if (!consumed.length) throw new ApdlError('ASBA_NOOP', 'ASBA: the areas are not coplanar or do not overlap.');
  const del = [...consumed];
  if (a.lab(4) !== 'KEEP') del.push(...ids2.filter((x) => !ids1.includes(x)));
  deleteAreas(c, del);
  c.out(` SUBTRACT AREA(S) ${ids2.join(' ')} FROM ${ids1.join(' ')}   OUTPUT AREA(S) = ${out.join(' ')}`);
}, [...PREP]);
reg('AADD', (c, a) => {
  const ids = areaList(c, a, 0, 9);
  if (ids.length < 2) throw new ApdlError('BOOL_COUNT', 'AADD needs at least two areas.');
  assertFreeAreas(c, ids);
  const tol = tolFor(c, ids);
  const A = c.m.areas.get(ids[0])!;
  const out = areaBoolean(c.m, A, ids.slice(1).map((x) => c.m.areas.get(x)!), 'add', tol);
  deleteAreas(c, ids);
  c.out(` ADD AREAS ${ids.join(' ')}   OUTPUT AREA = ${out.join(' ')}`);
}, [...PREP]);
reg(['AGLUE', 'AOVLAP', 'APTN'], (c, a) => {
  const ids = areaList(c, a, 0, 9);
  if (ids.length < 2) { c.note(`${c.cmd}: fewer than two areas; nothing to do.`); return; }
  for (const id of ids) if (isMeshed(c.m, 'area', id)) throw new ApdlError('MESHED', `Area ${id} is meshed.  Clear the mesh first (ACLEAR).`);
  const tol = tolFor(c, ids);
  const live = new Set(ids);
  // overlapping coplanar pairs -> imprint
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    const list = [...live].sort((x, y) => x - y);
    outer: for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = c.m.areas.get(list[i]), B = c.m.areas.get(list[j]);
      if (!A || !B || !coplanar(A, B, tol)) continue;
      if (volumesUsingArea(c.m, A.id).length || volumesUsingArea(c.m, B.id).length) continue;
      const r = imprintAreas(c.m, A, B, tol);
      if (!r) continue;
      live.delete(A.id); live.delete(B.id);
      deleteAreas(c, [A.id, B.id]);
      for (const x of [...r.shared, ...r.onlyA, ...r.onlyB]) live.add(x);
      changed = true;
      break outer;
    }
  }
  // edge contacts: share keypoints and lines
  conformLines(c.m, () => [...live].flatMap((x) => (c.m.areas.get(x) ? areaLines(c.m.areas.get(x)!) : [])), tol);
  c.out(` ${c.cmd === 'AGLUE' ? 'GLUE' : 'OVERLAP'} AREAS ${ids.join(' ')}   OUTPUT AREAS = ${[...live].sort((x, y) => x - y).join(' ')}`);
}, [...PREP]);
reg('AINA', (c) => { throw new ApdlError('UNSUPPORTED', `${c.cmd} is not supported by the trainer yet; use AOVLAP.`); }, [...PREP]);

// ------------------------------------------------------------------ sweeps
function sweepSources(c: Ctx, a: Args, start: number, count: number): Id[] {
  const first = a.raw(start).toUpperCase();
  let ids: Id[];
  if (first === 'ALL' || c.m.comps.has(first)) ids = a.entities('area', start);
  else if (count === 3) ids = a.entities('area', start); // NA1,NA2,NINC
  else { ids = []; for (let i = start; i < start + count; i++) if (!a.isBlank(i)) ids.push(a.int(i)); }
  for (const id of ids) c.ensureExists('area', id);
  if (!ids.length) throw new ApdlError('SWEEP_NONE', `${c.cmd}: no areas given.`);
  return ids;
}

reg('VEXT', (c, a) => {
  const ids = sweepSources(c, a, 0, 3);
  const cs = getCsys(c.m, c.m.cur.csys);
  const dl: Vec3 = [a.num(3), a.num(4), a.num(5)];
  const d: Vec3 = [
    cs.axes[0][0] * dl[0] + cs.axes[1][0] * dl[1] + cs.axes[2][0] * dl[2],
    cs.axes[0][1] * dl[0] + cs.axes[1][1] * dl[1] + cs.axes[2][1] * dl[2],
    cs.axes[0][2] * dl[0] + cs.axes[1][2] * dl[1] + cs.axes[2][2] * dl[2],
  ];
  if (cs.type !== 0) c.note('VEXT offsets are applied as Cartesian offsets along the active system axes.');
  if (len(d) === 0) throw new ApdlError('VEXT_ZERO', 'VEXT: DX, DY and DZ are all zero.');
  if (!a.isBlank(6) || !a.isBlank(7) || !a.isBlank(8)) c.note('VEXT scaling factors (RX,RY,RZ) are ignored in the trainer.');
  const r = sweepAreas(c.m, ids, [{ kind: 'translate', d }], { gen: () => ({ kind: 'prism', dir: norm(d) }) });
  c.out(` EXTRUDE AREAS ${ids.join(' ')}   OUTPUT VOLUMES = ${r.volumes.join(' ')}`);
}, [...PREP]);

reg('VOFFST', (c, a) => {
  const aid = a.int(0);
  const ar = c.m.areas.get(aid);
  if (!ar) throw new ApdlError('AREA_UNDEFINED', `Area ${aid} is undefined.`);
  const dd = a.num(1);
  if (dd === 0) throw new ApdlError('VOFFST_ZERO', 'VOFFST: DIST must be non-zero.');
  const n = ar.surface.kind === 'plane' ? ar.surface.normal : triStats(ar.tess).normal;
  const d = scale(n, dd);
  const r = sweepAreas(c.m, [aid], [{ kind: 'translate', d }], { gen: () => ({ kind: 'prism', dir: norm(d) }) });
  c.out(` OFFSET AREA ${aid} BY ${dd}   OUTPUT VOLUME = ${r.volumes.join(' ')}`);
}, [...PREP]);

function rotateStages(o: Vec3, k: Vec3, arcDeg: number, nseg: number): Stage[] {
  const st: Stage[] = [];
  for (let i = 0; i < nseg; i++) st.push({ kind: 'rotate', o, k, ang: (arcDeg / nseg) * DEG });
  return st;
}

reg('VROTAT', (c, a) => {
  const ids = sweepSources(c, a, 0, 6);
  const p1 = c.m.kps.get(a.int(6)), p2 = c.m.kps.get(a.int(7));
  if (!p1 || !p2) throw new ApdlError('VROTAT_AXIS', 'VROTAT: axis keypoints PAX1 and PAX2 must be defined.');
  const arc = a.isBlank(8) ? 360 : a.num(8);
  const nseg = a.int(9, 0) || Math.max(1, Math.ceil(Math.abs(arc) / 90 - 1e-9));
  const k = norm(sub(p2.xyz, p1.xyz));
  if (len(k) === 0) throw new ApdlError('VROTAT_AXIS', 'VROTAT: axis keypoints are coincident.');
  const closed = Math.abs(Math.abs(arc) - 360) < 1e-9;
  const r = sweepAreas(c.m, ids, rotateStages(p1.xyz, k, arc, nseg), {
    closed,
    gen: (aid) => ({ kind: 'revolve', axisPt: p1.xyz, axisDir: k, angleDeg: arc / nseg, srcArea: aid }),
  });
  c.out(` ROTATE AREAS ${ids.join(' ')} ABOUT AXIS ${a.int(6)}-${a.int(7)} BY ${arc} DEG   OUTPUT VOLUMES = ${r.volumes.join(' ')}`);
}, [...PREP]);

/** Build stages along a chain of path lines starting nearest to `from`. */
function pathStages(c: Ctx, pathIds: Id[], from: Vec3): Stage[] {
  const m = c.m;
  const lines = pathIds.map((id) => { const l = m.lines.get(id); if (!l) throw new ApdlError('LINE_UNDEFINED', `Line ${id} is undefined.`); return l; });
  // orient first line so its start is nearest to the profile
  let cur: number = dist(m.kps.get(lines[0].kps[0])!.xyz, from) <= dist(m.kps.get(lines[0].kps[1])!.xyz, from) ? lines[0].id : -lines[0].id;
  const ordered: number[] = [cur];
  const rest = lines.slice(1).map((l) => l.id);
  let endKp = cur > 0 ? lines[0].kps[1] : lines[0].kps[0];
  while (rest.length) {
    const i = rest.findIndex((id) => m.lines.get(id)!.kps.includes(endKp));
    if (i < 0) throw new ApdlError('DRAG_PATH', 'Drag path lines must be connected end to end.');
    const l = m.lines.get(rest.splice(i, 1)[0])!;
    cur = l.kps[0] === endKp ? l.id : -l.id;
    ordered.push(cur);
    endKp = cur > 0 ? l.kps[1] : l.kps[0];
  }
  const stages: Stage[] = [];
  for (const s of ordered) {
    const l = m.lines.get(Math.abs(s))!;
    const pts = s > 0 ? l.pts : [...l.pts].reverse();
    const p0 = pts[0], p1 = pts[pts.length - 1];
    if (l.kind === 'arc' && l.arc) {
      const axis = s > 0 ? l.arc.axis : scale(l.arc.axis, -1);
      const v0 = sub(p0, l.arc.center), v1 = sub(p1, l.arc.center);
      let ang = Math.atan2(dot(cross(v0, v1), axis), dot(v0, v1));
      if (ang <= 1e-12) ang += 2 * Math.PI;
      const nseg = Math.max(1, Math.ceil(ang / (Math.PI / 2) - 1e-9));
      for (let i = 0; i < nseg; i++) stages.push({ kind: 'rotate', o: l.arc.center, k: axis, ang: ang / nseg });
    } else if (l.kind === 'straight') {
      stages.push({ kind: 'translate', d: sub(p1, p0) });
    } else {
      // general curve: piecewise translation along polyline segments
      for (let i = 0; i < pts.length - 1; i++) stages.push({ kind: 'translate', d: sub(pts[i + 1], pts[i]) });
    }
  }
  void lineStartKp;
  return stages;
}

reg('VDRAG', (c, a) => {
  const ids = sweepSources(c, a, 0, 6);
  const path: Id[] = [];
  for (let i = 6; i < 12; i++) if (!a.isBlank(i)) path.push(a.int(i));
  if (!path.length) throw new ApdlError('DRAG_PATH', 'VDRAG needs at least one path line (field 8).');
  const cen = c.m.areas.get(ids[0])!.centroid;
  const stages = pathStages(c, path, cen);
  const r = sweepAreas(c.m, ids, stages, { gen: (aid) => ({ kind: 'drag', srcArea: aid, path }) });
  c.out(` DRAG AREAS ${ids.join(' ')} ALONG LINES ${path.join(' ')}   OUTPUT VOLUMES = ${r.volumes.join(' ')}`);
}, [...PREP]);

reg('AROTAT', (c, a) => {
  const ids: Id[] = [];
  for (let i = 0; i < 6; i++) if (!a.isBlank(i)) ids.push(...a.entities('line', i).slice(0, a.lab(i) === 'ALL' ? undefined : 1));
  for (const id of ids) c.ensureExists('line', id);
  const p1 = c.m.kps.get(a.int(6)), p2 = c.m.kps.get(a.int(7));
  if (!p1 || !p2) throw new ApdlError('AROTAT_AXIS', 'AROTAT: axis keypoints PAX1 and PAX2 must be defined.');
  const arc = a.isBlank(8) ? 360 : a.num(8);
  const nseg = a.int(9, 0) || Math.max(1, Math.ceil(Math.abs(arc) / 90 - 1e-9));
  const out = sweepLines(c.m, [...new Set(ids)], rotateStages(p1.xyz, norm(sub(p2.xyz, p1.xyz)), arc, nseg), Math.abs(Math.abs(arc) - 360) < 1e-9);
  c.out(` ROTATE LINES ${ids.join(' ')}   OUTPUT AREAS = ${out.join(' ')}`);
}, [...PREP]);

reg('ADRAG', (c, a) => {
  const ids: Id[] = [];
  for (let i = 0; i < 6; i++) if (!a.isBlank(i)) ids.push(...a.entities('line', i).slice(0, a.lab(i) === 'ALL' ? undefined : 1));
  for (const id of ids) c.ensureExists('line', id);
  const path: Id[] = [];
  for (let i = 6; i < 12; i++) if (!a.isBlank(i)) path.push(a.int(i));
  if (!path.length) throw new ApdlError('DRAG_PATH', 'ADRAG needs at least one path line (field 8).');
  const l0 = c.m.lines.get(ids[0])!;
  const stages = pathStages(c, path, c.m.kps.get(l0.kps[0])!.xyz);
  const out = sweepLines(c.m, [...new Set(ids)], stages);
  c.out(` DRAG LINES ${ids.join(' ')}   OUTPUT AREAS = ${out.join(' ')}`);
}, [...PREP]);

reg(['LROTAT', 'LDRAG'], (c) => { throw new ApdlError('UNSUPPORTED', `${c.cmd} is not supported by the trainer yet.`); }, [...PREP]);

export { deleteVolumes, selectedIds };
