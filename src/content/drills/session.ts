// Session and display commands.
import type { DrillTemplate } from '../types';
import { T } from './util';

export const sessionDrills: DrillTemplate[] = [
  T('prep7', '/PREP7', 't1', 'session', () => ({ prompt: 'Enter the preprocessor', answer: '/PREP7' }), '/PREP7 enters PREP7; modelling commands need it.'),
  T('finish', 'FINISH', 't1', 'session', () => ({ prompt: 'Leave the current processor', answer: 'FINISH' }), 'FINISH returns to BEGIN level.'),
  T('pnum-volu', '/PNUM', 't1', 'display', (r) => {
    const lab = r.pick(['VOLU', 'AREA', 'LINE', 'KP']);
    return { prompt: `Turn on ${lab === 'KP' ? 'keypoint' : lab.toLowerCase()} numbering in plots`, answer: `/PNUM,${lab},1` };
  }, '/PNUM,Label,KEY.'),
  T('view-iso', '/VIEW', 't1', 'display', () => ({ prompt: 'Set an isometric view in window 1', answer: '/VIEW,1,1,1,1' }), '/VIEW,WN,XV,YV,ZV.'),
  T('eshape', '/ESHAPE', 't5', 'display', () => ({ prompt: 'Show beams and shells with their real section shape', answer: '/ESHAPE,1' }), '/ESHAPE,SCALE.'),
  T('eplot', 'EPLOT', 't6', 'display', () => ({ prompt: 'Plot the elements', answer: 'EPLOT' }), 'EPLOT.'),
  T('vplot', 'VPLOT', 't2', 'display', () => ({ prompt: 'Plot the volumes', answer: 'VPLOT' }), 'VPLOT.'),
];
