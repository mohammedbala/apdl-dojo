// Bottom-up geometry, working plane and coordinate systems (track t1).
import type { DrillTemplate } from '../types';
import { T, coord, axis } from './util';

export const geometryDrills: DrillTemplate[] = [
  T('k-basic', 'K', 't1', 'geometry', (r) => {
    const n = r.int(1, 40), x = coord(r), y = coord(r), z = coord(r);
    return { prompt: `Create keypoint ${n} at (${x}, ${y}, ${z})`, answer: `K,${n},${x},${y},${z}` };
  }, 'K,NPT,X,Y,Z defines a keypoint; blank coordinates are zero.'),
  T('k-auto', 'K', 't1', 'geometry', (r) => {
    const x = coord(r), y = coord(r), z = coord(r);
    return { prompt: `Create a keypoint at (${x}, ${y}, ${z}) using the next free number`, answer: `K,,${x},${y},${z}` };
  }, 'Leaving NPT blank takes the lowest free keypoint number.'),
  T('k-axis', 'K', 't1', 'geometry', (r) => {
    const n = r.int(1, 20), x = r.int(1, 30);
    return { prompt: `Create keypoint ${n} on the X axis at X = ${x}`, answer: `K,${n},${x}`, accepted: [`K,${n},${x},0,0`] };
  }, 'Trailing blank coordinates default to zero.'),
  T('l-basic', 'L', 't1', 'geometry', (r) => {
    const a = r.int(1, 20), b = a + r.int(1, 4);
    return { prompt: `Draw a straight line from keypoint ${a} to keypoint ${b}`, answer: `L,${a},${b}`, accepted: [`LSTR,${a},${b}`] };
  }, 'L,P1,P2 joins two keypoints (straight in the active CSYS).'),
  T('larc', 'LARC', 't1', 'geometry', (r) => {
    const a = r.int(1, 8), b = a + 1, c = a + 2, rad = r.pick([1, 1.5, 2, 3, 5]);
    return { prompt: `Draw an arc of radius ${rad} from keypoint ${a} to ${b}, curving towards keypoint ${c}`, answer: `LARC,${a},${b},${c},${rad}` };
  }, 'LARC,P1,P2,PC,RAD: PC sets the plane and the side of curvature.'),
  T('a-kps', 'A', 't1', 'geometry', (r) => {
    const s = r.int(1, 12);
    return { prompt: `Create an area through keypoints ${s}, ${s + 1}, ${s + 2}, ${s + 3} (in that order)`, answer: `A,${s},${s + 1},${s + 2},${s + 3}` };
  }, 'A,P1,P2,... lists keypoints around the boundary.'),
  T('al', 'AL', 't1', 'geometry', (r) => {
    const s = r.int(1, 12);
    return { prompt: `Create an area bounded by lines ${s} to ${s + 3}`, answer: `AL,${s},${s + 1},${s + 2},${s + 3}` };
  }, 'AL,L1,L2,... builds an area from bounding lines.'),
  T('v-kps', 'V', 't1', 'geometry', () => ({ prompt: 'Create a brick volume from keypoints 1-8 (bottom face 1-4, top face 5-8)', answer: 'V,1,2,3,4,5,6,7,8' }),
    'V,P1..P8: bottom face then top face, same rotation.'),
  T('va', 'VA', 't1', 'geometry', (r) => {
    const s = r.pick([1, 7, 13]);
    return { prompt: `Create a volume bounded by areas ${s} to ${s + 5}`, answer: `VA,${s},${s + 1},${s + 2},${s + 3},${s + 4},${s + 5}` };
  }, 'VA,A1,A2,... builds a volume from bounding areas.'),
  T('kgen', 'KGEN', 't1', 'geometry', (r) => {
    const n = r.int(2, 5), a = 1, b = r.pick([2, 4, 8]), d = r.pick([2, 5, 10, 12]), ax = axis(r);
    const dx = ax === 'X' ? d : 0, dy = ax === 'Y' ? d : 0, dz = ax === 'Z' ? d : 0;
    return {
      prompt: `Copy keypoints ${a}-${b} to make ${n} sets in total (original included) at ${d} m spacing in ${ax}`,
      answer: `KGEN,${n},${a},${b},1,${dx},${dy},${dz}`,
      accepted: [`KGEN,${n},${a},${b},,${dx},${dy},${dz}`],
    };
  }, 'KGEN,ITIME,NP1,NP2,NINC,DX,DY,DZ — ITIME counts the original set.'),
  T('lgen', 'LGEN', 't1', 'geometry', (r) => {
    const n = r.int(2, 6), l = r.int(1, 10), d = r.pick([1, 2, 3, 4]);
    return { prompt: `Copy line ${l} to make ${n} lines in total at ${d} m spacing in Y`, answer: `LGEN,${n},${l},,,0,${d}`, accepted: [`LGEN,${n},${l},,,,${d}`] };
  }, 'LGEN,ITIME,NL1,NL2,NINC,DX,DY,DZ copies lines.'),
  T('agen', 'AGEN', 't1', 'geometry', (r) => {
    const n = r.int(2, 4), a = r.int(1, 6), d = r.pick([3, 5, 10]);
    return { prompt: `Copy area ${a} to make ${n} areas in total at ${d} m spacing in Z`, answer: `AGEN,${n},${a},,,0,0,${d}`, accepted: [`AGEN,${n},${a},,,,,${d}`] };
  }, 'AGEN,ITIME,NA1,NA2,NINC,DX,DY,DZ copies areas.'),
  T('vgen', 'VGEN', 't1', 'geometry', (r) => {
    const n = r.int(2, 4), d = r.pick([10, 12]);
    return { prompt: `Copy volume 1 to make ${n} volumes in total spaced ${d} m in X`, answer: `VGEN,${n},1,,,${d}` };
  }, 'VGEN,ITIME,NV1,NV2,NINC,DX,DY,DZ copies volumes.'),
  T('kfill', 'KFILL', 't1', 'geometry', (r) => {
    const a = r.int(1, 5), b = a + r.int(4, 8), n = r.int(2, 5);
    return { prompt: `Fill ${n} evenly spaced keypoints between keypoints ${a} and ${b}`, answer: `KFILL,${a},${b},${n}` };
  }, 'KFILL,NP1,NP2,NFILL generates keypoints between two keypoints.'),
  T('kdele', 'KDELE', 't1', 'geometry', (r) => {
    const a = r.int(1, 10), b = a + r.int(1, 10);
    return { prompt: `Delete keypoints ${a} to ${b}`, answer: `KDELE,${a},${b}` };
  }, 'KDELE,NP1,NP2,NINC deletes unattached keypoints.'),
  T('vdele-kswp', 'VDELE', 't1', 'geometry', (r) => {
    const v = r.int(1, 9);
    return { prompt: `Delete volume ${v} together with its areas, lines and keypoints`, answer: `VDELE,${v},,,1` };
  }, 'VDELE,NV1,NV2,NINC,KSWP — KSWP=1 sweeps lower entities too.'),
  T('wpoffs', 'WPOFFS', 't2', 'geometry', (r) => {
    const x = r.pick([0, 2, 4, 10]), y = r.pick([0, 1, 2.5, 5]), z = r.pick([0, 3, 11]);
    return { prompt: `Move the working plane by (${x}, ${y}, ${z})`, answer: `WPOFFS,${x},${y},${z}` };
  }, 'WPOFFS,XOFF,YOFF,ZOFF is cumulative and in WP coordinates.'),
  T('wprota', 'WPROTA', 't3', 'geometry', (r) => {
    const a = r.pick([90, -90]);
    return { prompt: `Rotate the working plane ${a}° about its own X axis (Y towards Z)`, answer: `WPROTA,,${a}`, accepted: [`WPROTA,0,${a}`] };
  }, 'WPROTA,THXY,THYZ,THZX: second field rotates about WP X.'),
  T('csys-cyl', 'CSYS', 't3', 'geometry', () => ({ prompt: 'Activate the global cylindrical coordinate system', answer: 'CSYS,1' }),
    'CSYS,1 = global cylindrical (R, θ, Z).'),
  T('csys-cart', 'CSYS', 't1', 'geometry', () => ({ prompt: 'Go back to the global Cartesian coordinate system', answer: 'CSYS,0', accepted: ['CSYS'] }),
    'CSYS,0 = global Cartesian.'),
];


