// Extrusion / sweep / rotate (track t3).
import type { DrillTemplate } from '../types';
import { T } from './util';

export const sweepDrills: DrillTemplate[] = [
  T('vext-z', 'VEXT', 't3', 'sweep', (r) => {
    const a = r.int(1, 8), dz = r.pick([1, 3, 8, 11]);
    return { prompt: `Extrude area ${a} by ${dz} in +Z`, answer: `VEXT,${a},,,0,0,${dz}`, accepted: [`VEXT,${a},,,,,${dz}`] };
  }, 'VEXT,NA1,NA2,NINC,DX,DY,DZ — offsets, not coordinates.'),
  T('vext-all', 'VEXT', 't3', 'sweep', (r) => {
    const dx = r.pick([2, 5, 36, 38]);
    return { prompt: `Extrude all selected areas by ${dx} in X`, answer: `VEXT,ALL,,,${dx}` };
  }, 'VEXT,ALL works on the current area selection.'),
  T('voffst', 'VOFFST', 't3', 'sweep', (r) => {
    const a = r.int(1, 6), d = r.pick([1, 2, 3]);
    return { prompt: `Extrude area ${a} by ${d} along its normal`, answer: `VOFFST,${a},${d}` };
  }, 'VOFFST,NAREA,DIST — direction follows the area normal.'),
  T('vrotat', 'VROTAT', 't3', 'sweep', (r) => {
    const a = r.int(1, 3), p1 = r.int(1, 4), p2 = p1 + 4, n = r.pick([4, 8]);
    return { prompt: `Revolve area ${a} through 360° about the axis from keypoint ${p1} to ${p2}, ${n} segments`, answer: `VROTAT,${a},,,,,,${p1},${p2},360,${n}`, accepted: [`VROTAT,${a},,,,,,${p1},${p2},,${n}`] };
  }, 'VROTAT has six area slots before PAX1,PAX2,ARC,NSEG.'),
  T('vrotat-quarter', 'VROTAT', 't3', 'sweep', (r) => {
    const a = r.int(1, 3);
    return { prompt: `Revolve area ${a} by 90° about the axis through keypoints 1 and 2`, answer: `VROTAT,${a},,,,,,1,2,90` };
  }, 'ARC is the sweep angle in degrees.'),
  T('vdrag', 'VDRAG', 't3', 'sweep', (r) => {
    const a = r.int(1, 4), l = r.int(5, 20);
    return { prompt: `Drag area ${a} along line ${l}`, answer: `VDRAG,${a},,,,,,${l}` };
  }, 'VDRAG,NA1..NA6,NLP1..NLP6 — path comes after six area slots.'),
  T('adrag', 'ADRAG', 't3', 'sweep', (r) => {
    const n = r.int(1, 4), l = r.int(5, 12);
    return { prompt: `Drag line ${n} along line ${l} to make an area`, answer: `ADRAG,${n},,,,,,${l}` };
  }, 'ADRAG,NL1..NL6,NLP1..NLP6.'),
];
