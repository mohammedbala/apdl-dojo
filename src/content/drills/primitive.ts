// Primitives (track t2).
import type { DrillTemplate } from '../types';
import { T } from './util';

export const primitiveDrills: DrillTemplate[] = [
  T('block-origin', 'BLOCK', 't2', 'primitive', (r) => {
    const w = r.pick([1, 2, 3]), d = r.pick([2, 3, 4]), h = r.pick([6, 8, 10]);
    return { prompt: `Make a ${w} x ${d} x ${h} column block from the origin`, answer: `BLOCK,0,${w},0,${d},0,${h}` };
  }, 'BLOCK,X1,X2,Y1,Y2,Z1,Z2 takes coordinate ranges.'),
  T('block-range', 'BLOCK', 't2', 'primitive', (r) => {
    const x1 = r.int(0, 10), y1 = r.int(0, 6), z1 = r.pick([0, 3, 11]);
    const x2 = x1 + r.int(1, 6), y2 = y1 + r.int(1, 6), z2 = z1 + r.pick([1, 3, 8]);
    return { prompt: `Make a block spanning X ${x1}..${x2}, Y ${y1}..${y2}, Z ${z1}..${z2}`, answer: `BLOCK,${x1},${x2},${y1},${y2},${z1},${z2}` };
  }, 'BLOCK,X1,X2,Y1,Y2,Z1,Z2 in working-plane coordinates.'),
  T('blc4', 'BLC4', 't2', 'primitive', (r) => {
    const x = r.int(0, 10), y = r.int(0, 10), w = r.int(1, 6), h = r.int(1, 6), d = r.pick([1, 3, 8]);
    return { prompt: `Make a block with WP corner (${x}, ${y}), width ${w}, height ${h}, depth ${d} (corner + sizes)`, answer: `BLC4,${x},${y},${w},${h},${d}` };
  }, 'BLC4,XCORNER,YCORNER,WIDTH,HEIGHT,DEPTH.'),
  T('blc4-rect', 'BLC4', 't2', 'primitive', (r) => {
    const w = r.int(2, 10), h = r.int(2, 10);
    return { prompt: `Make a ${w} x ${h} rectangular area with its corner at the WP origin using BLC4`, answer: `BLC4,0,0,${w},${h}` };
  }, 'BLC4 with DEPTH blank or 0 makes an area.'),
  T('blc5', 'BLC5', 't2', 'primitive', (r) => {
    const x = r.int(2, 30), y = r.pick([2.5, 7, 11.5]), w = 2, h = 3, d = 8;
    return { prompt: `Make a ${w} x ${h} x ${d} block centred on WP (${x}, ${y})`, answer: `BLC5,${x},${y},${w},${h},${d}` };
  }, 'BLC5,XCENTER,YCENTER,WIDTH,HEIGHT,DEPTH.'),
  T('cyl4-solid', 'CYL4', 't2', 'primitive', (r) => {
    const x = r.int(0, 10), y = r.int(0, 10), rad = r.pick([0.5, 1, 1.5, 2]), d = r.pick([1, 2, 5]);
    return { prompt: `Make a solid cylinder of radius ${rad}, depth ${d}, centred at WP (${x}, ${y})`, answer: `CYL4,${x},${y},${rad},,,,${d}`, accepted: [`CYL4,${x},${y},${rad},0,0,360,${d}`] };
  }, 'CYL4,XCENTER,YCENTER,RAD1,THETA1,RAD2,THETA2,DEPTH.'),
  T('cyl4-area', 'CYL4', 't2', 'primitive', (r) => {
    const x = r.int(0, 10), y = r.int(0, 10), rad = r.pick([0.5, 1, 1.5]);
    return { prompt: `Make a circular area of radius ${rad} centred at WP (${x}, ${y})`, answer: `CYL4,${x},${y},${rad}` };
  }, 'CYL4 without DEPTH gives an area.'),
  T('cylind', 'CYLIND', 't2', 'primitive', (r) => {
    const rad = r.pick([0.5, 1, 2]), z1 = r.pick([0, 1, 3]), z2 = z1 + r.pick([2, 5, 8]);
    return { prompt: `Make a solid cylinder of radius ${rad} from Z = ${z1} to Z = ${z2} about the WP Z axis (CYLIND)`, answer: `CYLIND,${rad},,${z1},${z2}`, accepted: [`CYLIND,${rad},0,${z1},${z2}`] };
  }, 'CYLIND,RAD1,RAD2,Z1,Z2,THETA1,THETA2.'),
  T('rectng', 'RECTNG', 't2', 'primitive', (r) => {
    const x1 = r.int(0, 5), x2 = x1 + r.int(1, 8), y1 = r.int(0, 5), y2 = y1 + r.int(1, 8);
    return { prompt: `Make a rectangular area X ${x1}..${x2}, Y ${y1}..${y2}`, answer: `RECTNG,${x1},${x2},${y1},${y2}` };
  }, 'RECTNG,X1,X2,Y1,Y2 — ranges, like BLOCK.'),
  T('pcirc', 'PCIRC', 't2', 'primitive', (r) => {
    const rad = r.pick([0.5, 1, 1.5, 2, 3]);
    return { prompt: `Make a circular area of radius ${rad} at the WP origin (PCIRC)`, answer: `PCIRC,${rad}` };
  }, 'PCIRC,RAD1,RAD2,THETA1,THETA2.'),
  T('cyl4-ring', 'CYL4', 't2', 'primitive', (r) => {
    const ri = r.pick([1, 2]), ro = ri + r.pick([0.5, 1]), d = r.pick([1, 2]);
    return { prompt: `Make a hollow cylinder at the WP origin: inner radius ${ri}, outer radius ${ro}, depth ${d}`, answer: `CYL4,0,0,${ri},,${ro},,${d}` };
  }, 'CYL4 RAD1 and RAD2 give an annulus.'),
];
