// Booleans (track t2).
import type { DrillTemplate } from '../types';
import { T } from './util';

export const booleanDrills: DrillTemplate[] = [
  T('vsbv', 'VSBV', 't2', 'boolean', (r) => {
    const a = r.int(1, 4), b = a + r.int(1, 4);
    return { prompt: `Subtract volume ${b} from volume ${a}`, answer: `VSBV,${a},${b}` };
  }, 'VSBV,NV1,NV2 = NV1 minus NV2; inputs deleted, result renumbered.'),
  T('vsbv-keep', 'VSBV', 't2', 'boolean', (r) => {
    const a = r.int(1, 3), b = a + 1;
    return { prompt: `Subtract volume ${b} from volume ${a} but keep the tool volume`, answer: `VSBV,${a},${b},,,KEEP` };
  }, 'VSBV,NV1,NV2,SEPO,KEEP1,KEEP2.'),
  T('vadd', 'VADD', 't2', 'boolean', () => ({ prompt: 'Add (union) all selected volumes into one', answer: 'VADD,ALL' }),
    'VADD merges volumes — the interfaces disappear.'),
  T('vglue', 'VGLUE', 't2', 'boolean', () => ({ prompt: 'Glue all volumes so touching faces become shared areas', answer: 'VGLUE,ALL' }),
    'VGLUE keeps volumes separate but makes the mesh conformal.'),
  T('vglue-two', 'VGLUE', 't2', 'boolean', (r) => {
    const a = r.int(1, 5), b = a + 1;
    return { prompt: `Glue volumes ${a} and ${b}`, answer: `VGLUE,${a},${b}` };
  }, 'VGLUE,NV1,NV2,...'),
  T('vovlap', 'VOVLAP', 't2', 'boolean', (r) => {
    const a = r.int(1, 3), b = a + 1;
    return { prompt: `Overlap volumes ${a} and ${b} (split into shared and unshared parts)`, answer: `VOVLAP,${a},${b}` };
  }, 'VOVLAP handles intersecting volumes; VGLUE refuses overlaps.'),
  T('asba', 'ASBA', 't2', 'boolean', (r) => {
    const a = r.int(1, 3), b = a + 1;
    return { prompt: `Subtract area ${b} from area ${a}`, answer: `ASBA,${a},${b}` };
  }, 'ASBA,NA1,NA2 punches holes in plates.'),
  T('aadd', 'AADD', 't2', 'boolean', (r) => {
    const a = r.int(1, 3), b = a + 1;
    return { prompt: `Add areas ${a} and ${b} into one area`, answer: `AADD,${a},${b}` };
  }, 'AADD unites coplanar areas.'),
  T('aglue', 'AGLUE', 't2', 'boolean', () => ({ prompt: 'Glue all selected areas', answer: 'AGLUE,ALL' }), 'AGLUE shares edges between touching areas.'),
];
