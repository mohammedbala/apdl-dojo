// Loads and boundary conditions (track t9).
import type { DrillTemplate } from '../types';
import { T } from './util';

export const loadDrills: DrillTemplate[] = [
  T('d-all', 'D', 't9', 'load', () => ({ prompt: 'Fix all DOFs of the selected nodes', answer: 'D,ALL,ALL', accepted: ['D,ALL,ALL,0'] }), 'D,NODE,Lab,VALUE — ALL,ALL fixes the selection.'),
  T('d-node', 'D', 't9', 'load', (r) => {
    const n = r.int(1, 99), lab = r.pick(['UX', 'UY', 'UZ']);
    return { prompt: `Constrain ${lab} of node ${n}`, answer: `D,${n},${lab}`, accepted: [`D,${n},${lab},0`] };
  }, 'Blank VALUE = 0.'),
  T('d-sel-uz', 'D', 't9', 'load', () => ({ prompt: 'Constrain UZ of all selected nodes', answer: 'D,ALL,UZ', accepted: ['D,ALL,UZ,0'] }), 'D,ALL,UZ.'),
  T('f-node', 'F', 't9', 'load', (r) => {
    const n = r.int(1, 99), v = r.pick([1000, 5000, 10000]), lab = r.pick(['FX', 'FY', 'FZ']);
    return { prompt: `Apply a force ${lab} of -${v} N at node ${n}`, answer: `F,${n},${lab},-${v}` };
  }, 'F,NODE,Lab,VALUE.'),
  T('fk', 'FK', 't9', 'load', (r) => {
    const k = r.int(1, 20), v = r.pick([500, 2000]);
    return { prompt: `Apply FX = ${v} N at keypoint ${k}`, answer: `FK,${k},FX,${v}` };
  }, 'FK,KPOI,Lab,VALUE — transferred to the node at meshing.'),
  T('dk', 'DK', 't9', 'load', (r) => {
    const k = r.int(1, 20);
    return { prompt: `Fix all DOFs at keypoint ${k}`, answer: `DK,${k},ALL`, accepted: [`DK,${k},ALL,0`] };
  }, 'DK,KPOI,Lab.'),
  T('da', 'DA', 't9', 'load', (r) => {
    const a = r.int(1, 20);
    return { prompt: `Fix all DOFs on area ${a}`, answer: `DA,${a},ALL`, accepted: [`DA,${a},ALL,0`] };
  }, 'DA,AREA,Lab.'),
  T('sfa', 'SFA', 't9', 'load', (r) => {
    const a = r.int(1, 20), p = r.pick([5000, 10000, 25000]);
    return { prompt: `Apply a pressure of ${p} Pa on area ${a}`, answer: `SFA,${a},1,PRES,${p}`, accepted: [`SFA,${a},,PRES,${p}`] };
  }, 'SFA,AREA,LKEY,PRES,VALUE.'),
  T('acel', 'ACEL', 't9', 'load', () => ({ prompt: 'Apply gravity (9.81 m/s²) acting in -Z', answer: 'ACEL,0,0,9.81', accepted: ['ACEL,,,9.81'] }), 'ACEL is the frame acceleration: +Z ACEL = gravity in -Z.'),
];
