// Selection and components (track t7).
import type { DrillTemplate } from '../types';
import { T, axis } from './util';

export const selectDrills: DrillTemplate[] = [
  T('nsel-loc', 'NSEL', 't7', 'select', (r) => {
    const ax = axis(r), v = r.pick([0, 3, 11, 14]);
    return { prompt: `Select nodes at ${ax} = ${v}`, answer: `NSEL,S,LOC,${ax},${v}` };
  }, 'NSEL,S,LOC,Comp,VMIN,VMAX.'),
  T('nsel-range', 'NSEL', 't7', 'select', (r) => {
    const a = r.int(0, 10), b = a + r.int(1, 10);
    return { prompt: `Select nodes with X between ${a} and ${b}`, answer: `NSEL,S,LOC,X,${a},${b}` };
  }, 'VMIN,VMAX give a range.'),
  T('nsel-reselect', 'NSEL', 't7', 'select', (r) => {
    const v = r.pick([0, 7, 14]);
    return { prompt: `From the current node set, reselect those at Y = ${v}`, answer: `NSEL,R,LOC,Y,${v}` };
  }, 'Type R reselects within the current set.'),
  T('nsel-add', 'NSEL', 't7', 'select', (r) => {
    const v = r.pick([0, 38]);
    return { prompt: `Add the nodes at X = ${v} to the current selection`, answer: `NSEL,A,LOC,X,${v}` };
  }, 'Type A adds to the set.'),
  T('nsel-all', 'NSEL', 't7', 'select', () => ({ prompt: 'Select all nodes', answer: 'NSEL,ALL' }), 'NSEL,ALL.'),
  T('ksel-loc', 'KSEL', 't7', 'select', (r) => {
    const v = r.pick([0, 2, 10]);
    return { prompt: `Select keypoints at X = ${v}`, answer: `KSEL,S,LOC,X,${v}` };
  }, 'KSEL,S,LOC tests the keypoint position.'),
  T('lsel-loc', 'LSEL', 't7', 'select', (r) => {
    const v = r.pick([0, 3, 11]);
    return { prompt: `Select lines whose centroid is at Z = ${v}`, answer: `LSEL,S,LOC,Z,${v}` };
  }, 'For lines/areas/volumes LOC tests the centroid.'),
  T('asel-loc', 'ASEL', 't7', 'select', (r) => {
    const v = r.pick([0, 3, 14]);
    return { prompt: `Select areas at Z = ${v}`, answer: `ASEL,S,LOC,Z,${v}` };
  }, 'ASEL,S,LOC,Z,value.'),
  T('vsel-num', 'VSEL', 't7', 'select', (r) => {
    const a = r.int(1, 4), b = a + r.int(1, 6);
    return { prompt: `Select volumes ${a} to ${b}`, answer: `VSEL,S,VOLU,,${a},${b}`, accepted: [`VSEL,S,,,${a},${b}`] };
  }, 'Blank Item means entity number.'),
  T('vsel-loc', 'VSEL', 't7', 'select', (r) => {
    const a = r.pick([3, 11]), b = a + r.pick([3, 8]);
    return { prompt: `Select volumes with centroid Z between ${a} and ${b}`, answer: `VSEL,S,LOC,Z,${a},${b}` };
  }, 'VSEL,S,LOC,Z,VMIN,VMAX.'),
  T('esel-type', 'ESEL', 't7', 'select', (r) => {
    const n = r.int(1, 4);
    return { prompt: `Select elements of type ${n}`, answer: `ESEL,S,TYPE,,${n}` };
  }, 'ESEL,S,TYPE,,ITYPE.'),
  T('nsla', 'NSLA', 't7', 'select', () => ({ prompt: 'Select all nodes on the selected areas (including interior nodes)', answer: 'NSLA,S,1' }), 'NSLA,Type,NKEY — NKEY=1 includes interior.'),
  T('nslv', 'NSLV', 't7', 'select', () => ({ prompt: 'Select all nodes of the selected volumes', answer: 'NSLV,S,1' }), 'NSLV,S,1.'),
  T('nsll', 'NSLL', 't7', 'select', () => ({ prompt: 'Select all nodes on the selected lines (including interior nodes)', answer: 'NSLL,S,1' }), 'NSLL,S,1.'),
  T('nslk', 'NSLK', 't7', 'select', () => ({ prompt: 'Select the nodes at the selected keypoints', answer: 'NSLK,S', accepted: ['NSLK'] }), 'NSLK,Type.'),
  T('allsel', 'ALLSEL', 't7', 'select', () => ({ prompt: 'Select everything again', answer: 'ALLSEL', accepted: ['ALLSEL,ALL'] }), 'ALLSEL resets all selections.'),
  T('cm', 'CM', 't7', 'select', (r) => {
    const name = r.pick(['BASE', 'TOPNODES', 'GROUND', 'COLS', 'DECK']), ent = r.pick(['NODE', 'VOLU', 'ELEM', 'AREA']);
    return { prompt: `Store the selected ${ent.toLowerCase()}s as component ${name}`, answer: `CM,${name},${ent}` };
  }, 'CM,Cname,Entity.'),
  T('cmsel', 'CMSEL', 't7', 'select', (r) => {
    const name = r.pick(['BASE', 'GROUND', 'COLS']);
    return { prompt: `Select component ${name}`, answer: `CMSEL,S,${name}` };
  }, 'CMSEL,Type,Name.'),
];
