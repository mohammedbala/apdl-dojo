import type { Diagnostic } from '../apdl/diagnostics';
import type { ModelSummary } from '../grader/types';
import type { BBox, EntityKind, ModelState, Vec3 } from './types';
import { bboxAdd, bboxValid, emptyBBox } from '../geometry/vec';

function finish(b: BBox): BBox | null {
  return bboxValid(b) ? b : null;
}

export function summarize(m: ModelState, diagnostics: Diagnostic[] = []): ModelSummary {
  const counts: Record<EntityKind, number> = { kp: m.kps.size, line: m.lines.size, area: m.areas.size, volu: m.volus.size, node: m.nodes.size, elem: m.elems.size };
  const geom = emptyBBox();
  for (const k of m.kps.values()) bboxAdd(geom, k.xyz);
  const nb = emptyBBox();
  for (const n of m.nodes.values()) bboxAdd(nb, n.xyz);
  const all = emptyBBox();
  if (bboxValid(geom)) { bboxAdd(all, geom.min); bboxAdd(all, geom.max); }
  if (bboxValid(nb)) { bboxAdd(all, nb.min); bboxAdd(all, nb.max); }
  let totalVolume = 0;
  const volumes = [...m.volus.values()].map((v) => { totalVolume += v.volume; return { id: v.id, volume: v.volume, bbox: v.bbox, centroid: v.centroid }; });
  let totalArea = 0;
  for (const a of m.areas.values()) totalArea += a.area;
  let totalLineLength = 0;
  for (const l of m.lines.values()) totalLineLength += l.length;
  const elemByType: Record<string, number> = {};
  const used = new Set<string>();
  for (const e of m.elems.values()) {
    const name = m.etypes.get(e.type)?.ename ?? `TYPE${e.type}`;
    elemByType[name] = (elemByType[name] ?? 0) + 1;
    used.add(name);
  }
  const dNodes = new Set<number>();
  let dCount = 0, fCount = 0, sfCount = 0;
  const dB = emptyBBox(), fB = emptyBBox();
  const fSum: Vec3 = [0, 0, 0];
  for (const b of m.bcs) {
    if (b.kind === 'D') {
      dCount++;
      if (!dNodes.has(b.target)) { dNodes.add(b.target); const p = m.nodes.get(b.target)?.xyz; if (p) bboxAdd(dB, p); }
    } else if (b.kind === 'F') {
      fCount++;
      const p = m.nodes.get(b.target)?.xyz;
      if (p) bboxAdd(fB, p);
      const i = ['FX', 'FY', 'FZ'].indexOf(b.lab);
      if (i >= 0) fSum[i] += b.value;
    } else sfCount++;
  }
  const masses: { xyz: Vec3; m: number }[] = [];
  for (const e of m.elems.values()) {
    if (m.etypes.get(e.type)?.category !== 'mass') continue;
    const p = m.nodes.get(e.nodes[0])?.xyz;
    if (p) masses.push({ xyz: p, m: m.reals.get(e.real)?.values[0] ?? 0 });
  }
  return {
    counts,
    bbox: finish(all),
    geomBBox: finish(geom),
    nodeBBox: finish(nb),
    totalVolume,
    totalArea,
    totalLineLength,
    volumes,
    elemByType,
    etypesDefined: [...new Set([...m.etypes.values()].map((e) => e.ename))].sort(),
    etypesUsed: [...used].sort(),
    materials: [...m.mats.values()].map((x) => ({ id: x.id, props: { ...x.props } })),
    sections: [...m.secs.values()].map((s) => ({ id: s.id, type: s.type, subtype: s.subtype, data: [...s.data] })),
    reals: [...m.reals.values()].map((r) => ({ id: r.id, values: [...r.values] })),
    bc: { dNodes: dNodes.size, dCount, dBBox: finish(dB), fCount, fBBox: finish(fB), fSum, sfCount, acel: m.acel ? [...m.acel] as Vec3 : null },
    masses,
    components: [...m.comps.values()].map((c) => ({ name: c.name, kind: c.kind, count: c.ids.length })),
    commandsUsed: [...m.commandsUsed],
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
  };
}
