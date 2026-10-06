// Parameters and control flow (track t8).
import type { DrillTemplate } from '../types';
import { T } from './util';

export const macroDrills: DrillTemplate[] = [
  T('param', '*SET', 't8', 'macro', (r) => {
    const name = r.pick(['W', 'H', 'COL_B', 'DECK_T', 'ESZ']), v = r.pick([0.5, 1, 2.5, 3, 8]);
    return { prompt: `Set parameter ${name} to ${v}`, answer: `${name}=${v}`, accepted: [`*SET,${name},${v}`] };
  }, 'NAME=value is shorthand for *SET.'),
  T('do', '*DO', 't8', 'macro', (r) => {
    const n = r.int(3, 10);
    return { prompt: `Start a loop with I running from 1 to ${n}`, answer: `*DO,I,1,${n}`, accepted: [`*DO,I,1,${n},1`] };
  }, '*DO,Par,IVAL,FVAL,INC.'),
  T('do-step', '*DO', 't8', 'macro', (r) => {
    const s = r.pick([10, 12]), n = r.int(2, 4);
    return { prompt: `Loop J from 0 to ${s * n} in steps of ${s}`, answer: `*DO,J,0,${s * n},${s}` };
  }, 'INC sets the step.'),
  T('enddo', '*ENDDO', 't8', 'macro', () => ({ prompt: 'Close the current loop', answer: '*ENDDO' }), '*ENDDO closes the innermost *DO.'),
  T('if', '*IF', 't8', 'macro', (r) => {
    const v = r.int(1, 5);
    return { prompt: `Open an IF block that runs when I equals ${v}`, answer: `*IF,I,EQ,${v},THEN` };
  }, '*IF,VAL1,Oper,VAL2,THEN ... *ENDIF.'),
  T('endif', '*ENDIF', 't8', 'macro', () => ({ prompt: 'Close the IF block', answer: '*ENDIF' }), '*ENDIF.'),
  T('get-count', '*GET', 't8', 'macro', (r) => {
    const [ent, par] = r.pick([['NODE', 'NN'], ['ELEM', 'NE'], ['VOLU', 'NV'], ['KP', 'NK']] as const);
    return { prompt: `Store the number of selected ${ent === 'KP' ? 'keypoint' : ent.toLowerCase()}s in ${par}`, answer: `*GET,${par},${ent},0,COUNT`, accepted: [`*GET,${par},${ent},,COUNT`] };
  }, '*GET,Par,Entity,0,COUNT.'),
  T('get-max', '*GET', 't8', 'macro', (r) => {
    const [ent, par] = r.pick([['VOLU', 'VMAX'], ['NODE', 'NMAX'], ['KP', 'KMAX']] as const);
    return { prompt: `Store the highest ${ent === 'KP' ? 'keypoint' : ent.toLowerCase()} number in ${par}`, answer: `*GET,${par},${ent},0,NUM,MAX`, accepted: [`*GET,${par},${ent},,NUM,MAX`] };
  }, '*GET,Par,Entity,0,NUM,MAX.'),
];
