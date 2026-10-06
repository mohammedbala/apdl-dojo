// The 10 technique tracks (plan §6). lessonIds are filled from the lesson registry in content/index.ts.
import type { Track } from './types';

export const PRIMITIVES = ['BLOCK', 'BLC4', 'BLC5', 'CYLIND', 'CYL4', 'CYL5', 'CONE', 'SPHERE', 'PRISM', 'RECTNG', 'PCIRC', 'POLYGON'];
export const SWEEPS = ['VEXT', 'VOFFST', 'VDRAG', 'VROTAT', 'AROTAT', 'ADRAG', 'LROTAT', 'LDRAG'];
export const BOTTOM_UP = ['K', 'L', 'LSTR', 'LARC', 'A', 'AL', 'V', 'VA', 'KGEN', 'LGEN', 'AGEN', 'VGEN', 'KFILL', 'CIRCLE'];
export const BOOLEANS = ['VADD', 'VSBV', 'VGLUE', 'VOVLAP', 'VPTN', 'VSBA', 'AADD', 'ASBA', 'AGLUE'];
export const SOLID_MESHERS = ['VMESH', 'AMESH', 'LMESH', 'KMESH', 'VSWEEP'];

export const TRACKS: Track[] = [
  {
    id: 't1', title: 'Bottom-up', color: '--trk-1', lessonIds: [],
    tagline: 'Keypoints, lines, areas, volumes — the hard way, fast.',
    whyFaster: 'KGEN/AGEN patterns turn one typed bay into a whole grid in a single line.',
    defaultForbidden: [...PRIMITIVES, ...SWEEPS],
  },
  {
    id: 't2', title: 'Primitives & Booleans', color: '--trk-2', lessonIds: [],
    tagline: 'BLOCK, BLC4, CYL4 and VSBV/VGLUE.',
    whyFaster: 'One primitive replaces 8 keypoints, 12 lines and 6 areas.',
    defaultForbidden: ['K', 'L', 'LSTR', 'A', 'AL', 'V', 'VA'],
  },
  {
    id: 't3', title: 'Extrude, sweep, rotate', color: '--trk-3', lessonIds: [],
    tagline: 'VEXT, VOFFST, VROTAT, VDRAG.',
    whyFaster: 'Draw the section once, sweep it into a solid: the plan view becomes the model.',
  },
  {
    id: 't4', title: 'Direct generation', color: '--trk-4', lessonIds: [],
    tagline: 'Nodes and elements without geometry.',
    whyFaster: 'For springs, masses and regular grids, N/NGEN/E/EGEN skip the mesher entirely.',
    defaultForbidden: [...BOTTOM_UP, ...PRIMITIVES, ...SWEEPS, ...BOOLEANS, ...SOLID_MESHERS],
  },
  {
    id: 't5', title: 'Elements, sections, materials', color: '--trk-5', lessonIds: [],
    tagline: 'ET, KEYOPT, MP, R, SECTYPE/SECDATA, xATT.',
    whyFaster: 'Attributes set once up front and assigned by selection never need fixing later.',
  },
  {
    id: 't6', title: 'Meshing control', color: '--trk-6', lessonIds: [],
    tagline: 'ESIZE, LESIZE, MSHKEY, VSWEEP — hit the element count.',
    whyFaster: 'Knowing exactly what ESIZE produces avoids remesh-and-check cycles.',
  },
  {
    id: 't7', title: 'Selection & components', color: '--trk-7', lessonIds: [],
    tagline: 'xSEL,LOC, NSLA/NSLV, CM, ALLSEL.',
    whyFaster: 'Select by location instead of by number: scripts survive renumbering.',
    unlock: { tracksAtLeastHalf: 2 },
  },
  {
    id: 't8', title: 'Parametric scripting', color: '--trk-8', lessonIds: [],
    tagline: '*DO, *IF, *GET and parameters.',
    whyFaster: 'A loop writes the eight columns; changing one parameter rebuilds the model.',
    defaultRequired: ['*DO'],
    unlock: { tracksAtLeastHalf: 2 },
  },
  {
    id: 't9', title: 'Loads & BCs', color: '--trk-9', lessonIds: [],
    tagline: 'D, F, DA, SFA, ACEL on the right entities.',
    whyFaster: 'Selection-driven constraints are one line each and never miss a node.',
    unlock: { tracksAtLeastHalf: 2 },
  },
  {
    id: 't10', title: 'Boss: Tabletop foundation', color: '--trk-10', lessonIds: [],
    tagline: 'TGF-36 four ways, then free choice against the clock.',
    whyFaster: 'Every technique combined: the fastest route is the one you choose.',
    unlock: { starShareAcross: 0.6 },
  },
];
