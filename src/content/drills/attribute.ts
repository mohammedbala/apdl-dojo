// Element types, materials, sections, attribute assignment (track t5).
import type { DrillTemplate } from '../types';
import { T } from './util';

const ETS: [string, string][] = [['SOLID185', '185'], ['SOLID186', '186'], ['BEAM188', '188'], ['SHELL181', '181'], ['MASS21', '21'], ['COMBIN14', '14'], ['SOLID187', '187']];

export const attributeDrills: DrillTemplate[] = [
  T('et', 'ET', 't5', 'attribute', (r) => {
    const n = r.int(1, 4), [name, num] = r.pick(ETS);
    return { prompt: `Define element type ${n} as ${name}`, answer: `ET,${n},${name}`, accepted: [`ET,${n},${num}`] };
  }, 'ET,ITYPE,Ename (number alone also works).'),
  T('keyopt-mass', 'KEYOPT', 't5', 'attribute', (r) => {
    const n = r.int(2, 4);
    return { prompt: `Set KEYOPT(3) of element type ${n} to 2 (MASS21 without rotary inertia)`, answer: `KEYOPT,${n},3,2` };
  }, 'KEYOPT,ITYPE,KNUM,VALUE.'),
  T('mp-ex', 'MP', 't5', 'attribute', (r) => {
    const m = r.int(1, 3), [txt, v, alt] = r.pick([['30 GPa', '30E9', '3E10'], ['210 GPa', '210E9', '2.1E11'], ['35 GPa', '35E9', '3.5E10']] as const);
    return { prompt: `Set Young's modulus of material ${m} to ${txt}`, answer: `MP,EX,${m},${v}`, accepted: [`MP,EX,${m},${alt}`] };
  }, 'MP,Lab,MAT,C0 — EX is Young\'s modulus.'),
  T('mp-prxy', 'MP', 't5', 'attribute', (r) => {
    const m = r.int(1, 3), nu = r.pick([0.2, 0.3, 0.25]);
    return { prompt: `Set Poisson's ratio of material ${m} to ${nu}`, answer: `MP,PRXY,${m},${nu}`, accepted: [`MP,NUXY,${m},${nu}`] };
  }, 'PRXY (major) or NUXY (minor) — identical for isotropic material.'),
  T('mp-dens', 'MP', 't5', 'attribute', (r) => {
    const m = r.int(1, 3), rho = r.pick([2500, 7850, 2400]);
    return { prompt: `Set the density of material ${m} to ${rho} kg/m³`, answer: `MP,DENS,${m},${rho}` };
  }, 'MP,DENS,MAT,value.'),
  T('r-mass', 'R', 't5', 'attribute', (r) => {
    const n = r.int(1, 4), m = r.pick([80000, 120000, 150000]);
    return { prompt: `Define real set ${n} with a mass of ${m} kg (MASS21, KEYOPT(3)=2)`, answer: `R,${n},${m}` };
  }, 'R,NSET,R1,... — MASS21 with KEYOPT(3)=2 takes one value.'),
  T('r-spring', 'R', 't5', 'attribute', (r) => {
    const n = r.int(1, 4), k = r.pick(['2.5E7', '1.25E7', '5E6']);
    return { prompt: `Define real set ${n} with a spring stiffness of ${k} N/m (COMBIN14)`, answer: `R,${n},${k}` };
  }, 'COMBIN14: R,NSET,K,CV1,CV2.'),
  T('sectype-rect', 'SECTYPE', 't5', 'attribute', (r) => {
    const n = r.int(1, 4);
    return { prompt: `Define section ${n} as a rectangular beam section`, answer: `SECTYPE,${n},BEAM,RECT` };
  }, 'SECTYPE,SECID,Type,Subtype.'),
  T('secdata-rect', 'SECDATA', 't5', 'attribute', (r) => {
    const b = r.pick([0.5, 1, 2]), h = r.pick([1, 2, 3]);
    return { prompt: `Give the current rectangular section B = ${b}, H = ${h}`, answer: `SECDATA,${b},${h}` };
  }, 'SECDATA for RECT is B,H (B along element y).'),
  T('sectype-shell', 'SECTYPE', 't5', 'attribute', (r) => {
    const n = r.int(1, 4);
    return { prompt: `Define section ${n} as a shell section`, answer: `SECTYPE,${n},SHELL` };
  }, 'SECTYPE,SECID,SHELL then SECDATA,thickness.'),
  T('secdata-shell', 'SECDATA', 't5', 'attribute', (r) => {
    const t = r.pick([0.3, 0.5, 1, 1.5, 3]);
    return { prompt: `Give the current shell section a thickness of ${t}`, answer: `SECDATA,${t}` };
  }, 'Shell SECDATA: first value is thickness.'),
  T('type', 'TYPE', 't5', 'attribute', (r) => {
    const n = r.int(2, 5);
    return { prompt: `Activate element type ${n}`, answer: `TYPE,${n}` };
  }, 'TYPE,ITYPE sets the active element type.'),
  T('mat', 'MAT', 't5', 'attribute', (r) => {
    const n = r.int(2, 5);
    return { prompt: `Activate material ${n}`, answer: `MAT,${n}` };
  }, 'MAT,MAT sets the active material.'),
  T('real', 'REAL', 't5', 'attribute', (r) => {
    const n = r.int(2, 5);
    return { prompt: `Activate real constant set ${n}`, answer: `REAL,${n}` };
  }, 'REAL,NSET sets the active real set.'),
  T('secnum', 'SECNUM', 't5', 'attribute', (r) => {
    const n = r.int(2, 5);
    return { prompt: `Activate section ${n}`, answer: `SECNUM,${n}` };
  }, 'SECNUM,SECID sets the active section.'),
  T('vatt', 'VATT', 't5', 'attribute', (r) => {
    const m = r.int(1, 3), t = r.int(1, 3);
    return { prompt: `Assign material ${m}, real set 1 and element type ${t} to the selected volumes`, answer: `VATT,${m},1,${t}` };
  }, 'VATT,MAT,REAL,TYPE,ESYS,SECNUM.'),
  T('latt', 'LATT', 't5', 'attribute', (r) => {
    const m = r.int(1, 2), t = r.int(1, 3), s = r.int(1, 4);
    return { prompt: `Assign material ${m}, element type ${t} and section ${s} to the selected lines`, answer: `LATT,${m},,${t},,,,${s}` };
  }, 'LATT,MAT,REAL,TYPE,ESYS,KB,KE,SECNUM — SECNUM is field 7.'),
  T('aatt', 'AATT', 't5', 'attribute', (r) => {
    const m = r.int(1, 2), t = r.int(1, 3), s = r.int(1, 4);
    return { prompt: `Assign material ${m}, element type ${t} and section ${s} to the selected areas`, answer: `AATT,${m},,${t},,${s}` };
  }, 'AATT,MAT,REAL,TYPE,ESYS,SECN.'),
];
