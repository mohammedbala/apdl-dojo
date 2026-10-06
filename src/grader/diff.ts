// Grader: compare a user's model with the target model. Technique-agnostic by default
// (volume, bounding box, shape sampling, attributes, mesh counts, boundary conditions).
import type { RunResult } from '../apdl/diagnostics';
import type { BBox, ModelState, Vec3 } from '../model/types';
import { summarize } from '../model/summary';
import type { CheckResult, GradeOptions, ModelSummary, Score, Stage } from './types';
import { insideSolid } from '../geometry/inside';
import { dist } from '../geometry/vec';
import { resolveCommandName } from '../apdl/commands/registry';

const STAGES: Stage[] = ['geometry', 'attributes', 'mesh', 'bcs'];

const f = (x: number) => (Number.isInteger(x) ? String(x) : (+x.toPrecision(5)).toString());
const fb = (b: BBox | null) => (b ? `[${b.min.map(f).join(', ')}] .. [${b.max.map(f).join(', ')}]` : 'none');

function rel(a: number, b: number) {
  const d = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return Math.abs(a - b) / d;
}

function partial(err: number, tol: number) {
  if (err <= tol) return 1;
  return Math.max(0, 1 - (err - tol) / Math.max(tol * 3, 0.1));
}

function bboxErr(a: BBox | null, b: BBox | null): number {
  if (!a || !b) return Infinity;
  let e = 0;
  for (let i = 0; i < 3; i++) e = Math.max(e, Math.abs(a.min[i] - b.min[i]), Math.abs(a.max[i] - b.max[i]));
  return e;
}

/** Deterministic Halton sequence point in [0,1)^3. */
function halton(i: number, base: number) {
  let f = 1, r = 0;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}

function shapeJaccard(t: ModelState, u: ModelState, box: BBox, n = 1500): number {
  const tv = [...t.volus.values()], uv = [...u.volus.values()];
  let inter = 0, uni = 0;
  for (let i = 1; i <= n; i++) {
    const p: Vec3 = [
      box.min[0] + (box.max[0] - box.min[0]) * halton(i, 2),
      box.min[1] + (box.max[1] - box.min[1]) * halton(i, 3),
      box.min[2] + (box.max[2] - box.min[2]) * halton(i, 5),
    ];
    const a = tv.some((v) => insideSolid(v, p));
    const b = uv.some((v) => insideSolid(v, p));
    if (a || b) uni++;
    if (a && b) inter++;
  }
  return uni ? inter / uni : 1;
}

function pointSetMatch(a: Vec3[], b: Vec3[], tol: number): number {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const cell = Math.max(tol * 4, 1e-9);
  const grid = new Map<string, Vec3[]>();
  const key = (p: Vec3, d = [0, 0, 0]) => `${Math.floor(p[0] / cell) + d[0]},${Math.floor(p[1] / cell) + d[1]},${Math.floor(p[2] / cell) + d[2]}`;
  for (const p of b) { const k = key(p); (grid.get(k) ?? grid.set(k, []).get(k)!).push(p); }
  let hit = 0;
  for (const p of a) {
    let ok = false;
    for (let dx = -1; dx <= 1 && !ok; dx++) for (let dy = -1; dy <= 1 && !ok; dy++) for (let dz = -1; dz <= 1 && !ok; dz++) {
      for (const q of grid.get(key(p, [dx, dy, dz])) ?? []) if (dist(p, q) <= tol) { ok = true; break; }
    }
    if (ok) hit++;
  }
  return hit / a.length;
}

function matchMaterials(t: ModelSummary, u: ModelSummary): { pass: boolean; actual: string; expected: string } {
  const keys = ['EX', 'PRXY', 'NUXY', 'DENS'];
  const sig = (p: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const k of keys) if (p[k] !== undefined) out[k === 'NUXY' ? 'PRXY' : k] = p[k];
    return out;
  };
  const tm = t.materials.map((x) => sig(x.props)).filter((x) => Object.keys(x).length);
  const um = u.materials.map((x) => sig(x.props));
  const missing: string[] = [];
  for (const m of tm) {
    const ok = um.some((x) => Object.keys(m).every((k) => x[k] !== undefined && rel(x[k], m[k]) <= 1e-6));
    if (!ok) missing.push(Object.entries(m).map(([k, v]) => `${k}=${f(v)}`).join(' '));
  }
  const fmtList = (l: Record<string, number>[]) => l.map((m) => Object.entries(m).map(([k, v]) => `${k}=${f(v)}`).join(' ')).join(' | ') || 'none';
  return { pass: missing.length === 0, expected: fmtList(tm), actual: missing.length ? `missing: ${missing.join(' | ')}` : fmtList(um) };
}

function multisetKey(vals: number[]) {
  return vals.map((v) => (+v.toPrecision(6)).toString()).join(',');
}

export function grade(target: RunResult, user: RunResult, opts: GradeOptions = {}): Score {
  const T = summarize(target.model, target.diagnostics);
  const U = summarize(user.model, user.diagnostics);
  const ignore = opts.ignore ?? [];
  const skip = (id: string) => ignore.some((p) => id.startsWith(p));
  const checks: CheckResult[] = [];
  const add = (c: CheckResult) => { if (!skip(c.id)) checks.push(c); };
  const diag = T.bbox ? dist(T.bbox.min, T.bbox.max) : 1;
  const btol = opts.bboxTolerance ?? Math.max(1e-6, 1e-3 * diag);
  const vtol = opts.volumeTolerance ?? 0.01;
  const etol = opts.elemTolerance ?? 0.15;
  const ntol = opts.nodeTolerance ?? 0.2;

  // ---------------------------------------------------------------- geometry
  const solidTarget = T.counts.volu > 0;
  const areaTarget = !solidTarget && T.counts.area > 0;
  const lineTarget = !solidTarget && !areaTarget && T.counts.line > 0;
  if (T.geomBBox) {
    const e = bboxErr(T.geomBBox, U.geomBBox ?? U.nodeBBox);
    add({ id: 'geom.bbox', label: 'Overall extents (bounding box)', stage: 'geometry', pass: e <= btol, score: partial(e / Math.max(diag, 1e-9), btol / Math.max(diag, 1e-9)), expected: fb(T.geomBBox), actual: fb(U.geomBBox ?? U.nodeBBox), hint: 'Check dimensions and the origin / working-plane offsets.' });
  } else if (T.nodeBBox) {
    const e = bboxErr(T.nodeBBox, U.nodeBBox);
    add({ id: 'geom.bbox', label: 'Overall extents (node bounding box)', stage: 'geometry', pass: e <= btol, score: partial(e / Math.max(diag, 1e-9), btol / Math.max(diag, 1e-9)), expected: fb(T.nodeBBox), actual: fb(U.nodeBBox) });
  }
  if (solidTarget) {
    const e = rel(T.totalVolume, U.totalVolume);
    add({ id: 'geom.volume', label: 'Total solid volume', stage: 'geometry', pass: e <= vtol, score: partial(e, vtol), expected: f(T.totalVolume), actual: f(U.totalVolume), hint: U.totalVolume > T.totalVolume ? 'Too much material: missing a cut-out (VSBV) or overlapping volumes?' : 'Too little material: a missing block or an extra subtraction?' });
    if (T.bbox && U.counts.volu > 0) {
      const box = T.bbox;
      const j = shapeJaccard(target.model, user.model, box);
      add({ id: 'geom.shape', label: 'Shape match (sampled points)', stage: 'geometry', pass: j >= 0.985, score: partial(1 - j, 0.015), expected: '100%', actual: `${(j * 100).toFixed(1)}%`, hint: 'Material is in the wrong place: compare Target and Yours in Ghost view.' });
    } else add({ id: 'geom.shape', label: 'Shape match (sampled points)', stage: 'geometry', pass: false, score: 0, expected: '100%', actual: 'no volumes' });
    add({ id: 'counts.volu', label: 'Number of volumes', stage: 'geometry', pass: T.counts.volu === U.counts.volu, score: T.counts.volu === U.counts.volu ? 1 : 0.5, expected: String(T.counts.volu), actual: String(U.counts.volu), hint: 'VGLUE keeps volumes separate; VADD merges them into one.' });
  } else if (areaTarget) {
    const e = rel(T.totalArea, U.totalArea);
    add({ id: 'geom.area', label: 'Total area', stage: 'geometry', pass: e <= vtol, score: partial(e, vtol), expected: f(T.totalArea), actual: f(U.totalArea) });
    add({ id: 'counts.area', label: 'Number of areas', stage: 'geometry', pass: T.counts.area === U.counts.area, score: T.counts.area === U.counts.area ? 1 : 0.5, expected: String(T.counts.area), actual: String(U.counts.area) });
  } else if (lineTarget) {
    const e = rel(T.totalLineLength, U.totalLineLength);
    add({ id: 'geom.length', label: 'Total line length', stage: 'geometry', pass: e <= vtol, score: partial(e, vtol), expected: f(T.totalLineLength), actual: f(U.totalLineLength) });
    add({ id: 'counts.line', label: 'Number of lines', stage: 'geometry', pass: T.counts.line === U.counts.line, score: T.counts.line === U.counts.line ? 1 : 0.5, expected: String(T.counts.line), actual: String(U.counts.line) });
  } else if (T.counts.kp > 0) {
    const r = pointSetMatch([...target.model.kps.values()].map((k) => k.xyz), [...user.model.kps.values()].map((k) => k.xyz), btol);
    const r2 = pointSetMatch([...user.model.kps.values()].map((k) => k.xyz), [...target.model.kps.values()].map((k) => k.xyz), btol);
    add({ id: 'geom.kps', label: 'Keypoint locations', stage: 'geometry', pass: r === 1 && r2 === 1, score: Math.min(r, r2), expected: `${T.counts.kp} keypoints`, actual: `${U.counts.kp} keypoints, ${(Math.min(r, r2) * 100).toFixed(0)}% matching` });
  }
  if (!solidTarget && !areaTarget && T.counts.node > 0 && T.counts.kp === 0) {
    const tn = [...target.model.nodes.values()].map((n) => n.xyz), un = [...user.model.nodes.values()].map((n) => n.xyz);
    const r = Math.min(pointSetMatch(tn, un, btol), pointSetMatch(un, tn, btol));
    add({ id: 'geom.nodes', label: 'Node locations', stage: 'geometry', pass: r >= 0.999, score: r, expected: `${T.counts.node} nodes`, actual: `${U.counts.node} nodes, ${(r * 100).toFixed(0)}% matching`, hint: 'Check N / NGEN increments and offsets.' });
  }
  // rules
  for (const req of opts.requiredCommands ?? []) {
    const name = resolveCommandName(req) ?? req.toUpperCase();
    const ok = U.commandsUsed.includes(name);
    add({ id: `rule.require.${name}`, label: `Uses ${name}`, stage: 'geometry', pass: ok, score: ok ? 1 : 0, expected: 'used', actual: ok ? 'used' : 'not used', hint: `This challenge trains ${name}: your script must use it.` });
  }
  for (const fbd of opts.forbiddenCommands ?? []) {
    const name = resolveCommandName(fbd) ?? fbd.toUpperCase();
    const used = U.commandsUsed.includes(name);
    add({ id: `rule.forbid.${name}`, label: `Does not use ${name}`, stage: 'geometry', pass: !used, score: used ? 0 : 1, expected: 'not used', actual: used ? 'used' : 'not used', hint: `${name} is off-limits here: build it with this track's technique.` });
  }
  if (opts.requireNoErrors) {
    add({ id: 'rule.noerrors', label: 'No errors', stage: 'geometry', pass: U.errors === 0, score: U.errors === 0 ? 1 : 0, expected: '0', actual: String(U.errors) });
  }

  // ---------------------------------------------------------------- attributes
  const tTypes = T.etypesUsed.length ? T.etypesUsed : T.etypesDefined;
  if (tTypes.length) {
    const uTypes = T.etypesUsed.length ? U.etypesUsed : U.etypesDefined;
    const ok = tTypes.length === uTypes.length && tTypes.every((x) => uTypes.includes(x));
    add({ id: 'attr.etypes', label: 'Element types', stage: 'attributes', pass: ok, score: ok ? 1 : tTypes.filter((x) => uTypes.includes(x)).length / Math.max(tTypes.length, uTypes.length), expected: tTypes.join(', '), actual: uTypes.join(', ') || 'none', hint: 'ET,ITYPE,Ename — e.g. ET,1,SOLID185' });
  }
  if (T.materials.length) {
    const r = matchMaterials(T, U);
    add({ id: 'attr.materials', label: 'Material properties', stage: 'attributes', pass: r.pass, score: r.pass ? 1 : 0, expected: r.expected, actual: r.actual, hint: 'MP,EX,1,... MP,PRXY,1,... MP,DENS,1,...' });
  }
  if (T.sections.length) {
    const key = (s: { type: string; subtype: string; data: number[] }) => `${s.type}/${s.subtype}/${multisetKey(s.data.slice(0, 4))}`;
    const tk = T.sections.map(key).sort(), uk = U.sections.map(key).sort();
    const ok = tk.every((k) => uk.includes(k));
    add({ id: 'attr.sections', label: 'Sections', stage: 'attributes', pass: ok, score: ok ? 1 : tk.filter((k) => uk.includes(k)).length / tk.length, expected: tk.join(' | '), actual: uk.join(' | ') || 'none', hint: 'SECTYPE,ID,BEAM,RECT then SECDATA,B,H  /  SECTYPE,ID,SHELL then SECDATA,T' });
  }
  if (T.reals.length) {
    const tk = T.reals.map((r) => multisetKey(r.values)).sort(), uk = U.reals.map((r) => multisetKey(r.values));
    const ok = tk.every((k) => uk.includes(k));
    add({ id: 'attr.reals', label: 'Real constants', stage: 'attributes', pass: ok, score: ok ? 1 : tk.filter((k) => uk.includes(k)).length / tk.length, expected: tk.join(' | '), actual: uk.join(' | ') || 'none' });
  }

  // ---------------------------------------------------------------- mesh
  if (T.counts.elem > 0) {
    for (const [name, n] of Object.entries(T.elemByType)) {
      const cat = target.model.etypes.get([...target.model.etypes.values()].find((e) => e.ename === name)?.id ?? -1)?.category;
      const exact = cat === 'mass' || cat === 'spring' || cat === 'beam' || cat === 'link';
      const tol = exact ? 0 : etol;
      const un = U.elemByType[name] ?? 0;
      const e = rel(n, un);
      add({ id: `mesh.elem.${name}`, label: `${name} elements`, stage: 'mesh', pass: e <= tol + 1e-12, score: partial(e, tol || 0.02), expected: exact ? String(n) : `${n} (±${Math.round(tol * 100)}%)`, actual: String(un), hint: un === 0 ? 'Mesh it: ESIZE then VMESH / AMESH / LMESH, or create elements with E.' : un > n ? 'Mesh is too fine: increase ESIZE / LESIZE.' : 'Mesh is too coarse: decrease ESIZE / LESIZE.' });
    }
    const e = rel(T.counts.node, U.counts.node);
    add({ id: 'mesh.nodes', label: 'Node count', stage: 'mesh', pass: e <= ntol, score: partial(e, ntol), expected: `${T.counts.node} (±${Math.round(ntol * 100)}%)`, actual: String(U.counts.node), hint: 'Unglued volumes or missing NUMMRG produce duplicate nodes.' });
    if (T.masses.length) {
      let hit = 0;
      for (const tm of T.masses) if (U.masses.some((um) => dist(um.xyz, tm.xyz) <= Math.max(0.6, btol) && rel(um.m, tm.m) <= 1e-6)) hit++;
      add({ id: 'mesh.masses', label: 'Point masses (location & value)', stage: 'mesh', pass: hit === T.masses.length && U.masses.length === T.masses.length, score: hit / T.masses.length, expected: `${T.masses.length} masses`, actual: `${hit}/${T.masses.length} matched (${U.masses.length} defined)`, hint: 'MASS21 with R,set,M (KEYOPT,ITYPE,3,2) at the bearing nodes: TYPE / REAL / E,NODE(x,y,z).' });
    }
  }

  // ---------------------------------------------------------------- loads
  if (T.bc.dCount > 0) {
    const e = rel(T.bc.dNodes, U.bc.dNodes);
    const be = bboxErr(T.bc.dBBox, U.bc.dBBox);
    const ok = e <= Math.max(ntol, 0.05) && be <= btol;
    add({ id: 'bc.d', label: 'Displacement constraints (D)', stage: 'bcs', pass: ok, score: ok ? 1 : U.bc.dNodes ? 0.5 : 0, expected: `${T.bc.dNodes} nodes in ${fb(T.bc.dBBox)}`, actual: U.bc.dNodes ? `${U.bc.dNodes} nodes in ${fb(U.bc.dBBox)}` : 'none', hint: 'Select the support nodes (NSEL,S,LOC,...) then D,ALL,ALL — and ALLSEL afterwards.' });
  }
  if (T.bc.fCount > 0) {
    const e = Math.max(...[0, 1, 2].map((i) => Math.abs(T.bc.fSum[i] - U.bc.fSum[i]) / Math.max(1e-9, Math.abs(T.bc.fSum[0]) + Math.abs(T.bc.fSum[1]) + Math.abs(T.bc.fSum[2]))));
    const be = bboxErr(T.bc.fBBox, U.bc.fBBox);
    const ok = e <= 0.01 && be <= btol;
    add({ id: 'bc.f', label: 'Nodal forces (F)', stage: 'bcs', pass: ok, score: ok ? 1 : U.bc.fCount ? 0.5 : 0, expected: `sum [${T.bc.fSum.map(f).join(', ')}]`, actual: U.bc.fCount ? `sum [${U.bc.fSum.map(f).join(', ')}]` : 'none' });
  }
  if (T.bc.sfCount > 0) {
    const e = rel(T.bc.sfCount, U.bc.sfCount);
    add({ id: 'bc.sf', label: 'Surface loads (SF)', stage: 'bcs', pass: e <= etol, score: partial(e, etol), expected: `${T.bc.sfCount} faces`, actual: `${U.bc.sfCount} faces` });
  }
  if (T.bc.acel) {
    const ok = !!U.bc.acel && T.bc.acel.every((v, i) => Math.abs(v - U.bc.acel![i]) <= 1e-6 * Math.max(1, Math.abs(v)));
    add({ id: 'bc.acel', label: 'Gravity / acceleration (ACEL)', stage: 'bcs', pass: ok, score: ok ? 1 : 0, expected: T.bc.acel.map(f).join(', '), actual: U.bc.acel ? U.bc.acel.map(f).join(', ') : 'none', hint: 'ACEL,0,0,9.81 makes gravity act in -Z.' });
  }

  // ---------------------------------------------------------------- aggregate
  const stages = {} as Score['stages'];
  for (const s of STAGES) {
    const cs = checks.filter((c) => c.stage === s);
    stages[s] = { present: cs.length > 0, pass: cs.every((c) => c.pass), score: cs.length ? cs.reduce((a, c) => a + c.score, 0) / cs.length : 1 };
  }
  const total = checks.length ? (100 * checks.reduce((a, c) => a + c.score, 0)) / checks.length : 0;
  const match = checks.length > 0 && checks.every((c) => c.pass);
  return { match, total: Math.round(total * 10) / 10, stages, checks };
}
