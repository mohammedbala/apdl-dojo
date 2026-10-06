// Meshing controls (track t6).
import type { DrillTemplate } from '../types';
import { T, size } from './util';

export const meshDrills: DrillTemplate[] = [
  T('esize', 'ESIZE', 't6', 'mesh', (r) => {
    const s = size(r);
    return { prompt: `Set the global element size to ${s}`, answer: `ESIZE,${s}` };
  }, 'ESIZE,SIZE — rounds to whole divisions per line.'),
  T('esize-ndiv', 'ESIZE', 't6', 'mesh', (r) => {
    const n = r.int(2, 10);
    return { prompt: `Use ${n} divisions on every line by default`, answer: `ESIZE,,${n}`, accepted: [`ESIZE,0,${n}`] };
  }, 'ESIZE,,NDIV.'),
  T('lesize-ndiv', 'LESIZE', 't6', 'mesh', (r) => {
    const l = r.int(1, 12), n = r.int(2, 12);
    return { prompt: `Divide line ${l} into ${n} elements`, answer: `LESIZE,${l},,,${n}` };
  }, 'LESIZE,NL1,SIZE,ANGSIZ,NDIV — NDIV is field 4.'),
  T('lesize-all', 'LESIZE', 't6', 'mesh', (r) => {
    const s = size(r);
    return { prompt: `Set an element size of ${s} on all selected lines`, answer: `LESIZE,ALL,${s}` };
  }, 'LESIZE,ALL,SIZE.'),
  T('lesize-all-ndiv', 'LESIZE', 't6', 'mesh', (r) => {
    const n = r.int(2, 12);
    return { prompt: `Divide all selected lines into ${n} elements`, answer: `LESIZE,ALL,,,${n}` };
  }, 'LESIZE,ALL,,,NDIV.'),
  T('mshape-hex', 'MSHAPE', 't6', 'mesh', () => ({ prompt: 'Use hexahedral (brick) shapes for 3-D meshing', answer: 'MSHAPE,0,3D', accepted: ['MSHAPE,0', 'MSHAPE'] }), 'MSHAPE,KEY,Dimension — 0 = hex/quad.'),
  T('mshape-tet', 'MSHAPE', 't6', 'mesh', () => ({ prompt: 'Use tetrahedral shapes for 3-D meshing', answer: 'MSHAPE,1,3D', accepted: ['MSHAPE,1'] }), 'MSHAPE,1 = tet/tri.'),
  T('mshkey-mapped', 'MSHKEY', 't6', 'mesh', () => ({ prompt: 'Switch to mapped meshing', answer: 'MSHKEY,1' }), 'MSHKEY: 0 free, 1 mapped, 2 mapped if possible.'),
  T('mshkey-free', 'MSHKEY', 't6', 'mesh', () => ({ prompt: 'Switch to free meshing', answer: 'MSHKEY,0', accepted: ['MSHKEY'] }), 'MSHKEY,0 = free.'),
  T('vmesh', 'VMESH', 't6', 'mesh', () => ({ prompt: 'Mesh all selected volumes', answer: 'VMESH,ALL' }), 'VMESH,NV1,NV2,NINC.'),
  T('vmesh-range', 'VMESH', 't6', 'mesh', (r) => {
    const a = r.int(1, 4), b = a + r.int(1, 6);
    return { prompt: `Mesh volumes ${a} to ${b}`, answer: `VMESH,${a},${b}` };
  }, 'VMESH,NV1,NV2.'),
  T('amesh', 'AMESH', 't6', 'mesh', (r) => {
    const a = r.int(1, 9);
    return { prompt: `Mesh area ${a} with shell elements`, answer: `AMESH,${a}` };
  }, 'AMESH,NA1,NA2,NINC.'),
  T('lmesh', 'LMESH', 't6', 'mesh', () => ({ prompt: 'Mesh all selected lines (beam elements)', answer: 'LMESH,ALL' }), 'LMESH,NL1,NL2,NINC.'),
  T('kmesh', 'KMESH', 't6', 'mesh', (r) => {
    const k = r.int(1, 99);
    return { prompt: `Mesh keypoint ${k} with a point element`, answer: `KMESH,${k}` };
  }, 'KMESH puts MASS21 elements on keypoints.'),
  T('vsweep', 'VSWEEP', 't6', 'mesh', (r) => {
    const v = r.int(1, 9);
    return { prompt: `Sweep-mesh volume ${v}`, answer: `VSWEEP,${v}` };
  }, 'VSWEEP,VNUM,SRCA,TRGA — source/target found automatically if blank.'),
];
