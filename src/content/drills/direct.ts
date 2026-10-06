// Direct generation and numbering (track t4).
import type { DrillTemplate } from '../types';
import { T, coord } from './util';

export const directDrills: DrillTemplate[] = [
  T('n-basic', 'N', 't4', 'direct', (r) => {
    const n = r.int(1, 200), x = coord(r), y = coord(r), z = coord(r);
    return { prompt: `Create node ${n} at (${x}, ${y}, ${z})`, answer: `N,${n},${x},${y},${z}` };
  }, 'N,NODE,X,Y,Z in the active CSYS.'),
  T('ngen', 'NGEN', 't4', 'direct', (r) => {
    const n = r.int(2, 6), inc = r.pick([10, 100]), b = r.pick([4, 9]), dz = r.pick([0.5, 1, 2]);
    return { prompt: `Generate ${n} sets of nodes 1-${b} in total (original included), node increment ${inc}, spaced ${dz} in Z`, answer: `NGEN,${n},${inc},1,${b},1,0,0,${dz}`, accepted: [`NGEN,${n},${inc},1,${b},,,,${dz}`] };
  }, 'NGEN,ITIME,INC,NODE1,NODE2,NINC,DX,DY,DZ.'),
  T('nfill', 'NFILL', 't4', 'direct', (r) => {
    const a = 1, b = r.pick([11, 21, 41]), k = b - 2;
    return { prompt: `Fill ${k} nodes evenly between nodes ${a} and ${b}`, answer: `NFILL,${a},${b},${k}`, accepted: [`NFILL,${a},${b}`] };
  }, 'NFILL,NODE1,NODE2,NFILL (blank = fill all numbers between).'),
  T('e-hex', 'E', 't4', 'direct', () => ({ prompt: 'Create a hex element on nodes 1-8', answer: 'E,1,2,3,4,5,6,7,8' }), 'E,I,J,K,L,M,N,O,P uses the active TYPE/MAT/REAL/SECNUM.'),
  T('e-line', 'E', 't4', 'direct', (r) => {
    const a = r.int(1, 50), b = a + r.pick([1, 10, 100]);
    return { prompt: `Create a 2-node element between nodes ${a} and ${b}`, answer: `E,${a},${b}` };
  }, 'Beams, springs and links take two nodes.'),
  T('e-mass', 'E', 't4', 'direct', (r) => {
    const a = r.int(1, 500);
    return { prompt: `Create a point (mass) element on node ${a}`, answer: `E,${a}` };
  }, 'MASS21 needs a single node.'),
  T('egen', 'EGEN', 't4', 'direct', (r) => {
    const n = r.int(3, 20), ninc = r.pick([1, 2, 10]);
    return { prompt: `Copy element 1 to make ${n} elements in total, node increment ${ninc}`, answer: `EGEN,${n},${ninc},1` };
  }, 'EGEN,ITIME,NINC,IEL1,IEL2,IEINC — offsets node numbers.'),
  T('egen-range', 'EGEN', 't4', 'direct', (r) => {
    const n = r.int(2, 8), ninc = r.pick([10, 100]), e2 = r.int(2, 9);
    return { prompt: `Copy elements 1-${e2} to make ${n} sets in total with node increment ${ninc}`, answer: `EGEN,${n},${ninc},1,${e2}` };
  }, 'EGEN,ITIME,NINC,IEL1,IEL2.'),
  T('nummrg-node', 'NUMMRG', 't4', 'direct', () => ({ prompt: 'Merge coincident nodes', answer: 'NUMMRG,NODE' }), 'NUMMRG keeps the lower numbers.'),
  T('nummrg-all', 'NUMMRG', 't4', 'direct', () => ({ prompt: 'Merge all coincident items (nodes, keypoints, elements ...)', answer: 'NUMMRG,ALL' }), 'NUMMRG,ALL merges every item type.'),
  T('numcmp', 'NUMCMP', 't4', 'direct', () => ({ prompt: 'Compress the numbering of all entities to remove gaps', answer: 'NUMCMP,ALL' }), 'NUMCMP,Label renumbers without gaps.'),
];
