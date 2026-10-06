// Track t2 challenges. SAMPLE content so the UI can be exercised; the content teammate replaces/extends it.
import type { Challenge } from '../types';

export const challenges: Challenge[] = [
  {
    id: 't2-c1',
    track: 't2',
    order: 1,
    title: 'Meshed column',
    difficulty: 1,
    brief: `Model a **2 x 3 x {{H}}** concrete column standing on the origin (X 0..2, Y 0..3, Z 0..{{H}}).

- element type 1 = **SOLID185**
- material 1: EX = 30E9
- global element size **1**, mesh all volumes`,
    params: { H: { min: 6, max: 10, step: 1 } },
    targetScript: `/PREP7
BLOCK,0,2,0,3,0,H
ET,1,SOLID185
MP,EX,1,30E9
ESIZE,1
VMESH,ALL`,
    solution: `/PREP7
BLOCK,0,2,0,3,0,8
ET,1,SOLID185
MP,EX,1,30E9
ESIZE,1
VMESH,ALL`,
    parLines: 6,
    parTimeSeconds: 60,
    hints: [
      { level: 1, text: 'BLOCK takes coordinate ranges: X1,X2,Y1,Y2,Z1,Z2.' },
      { level: 2, text: 'Attributes: ET,1,SOLID185 and MP,EX,1,30E9. Then ESIZE,1 and VMESH,ALL.' },
      { level: 3, text: '`BLOCK,0,2,0,3,0,{{H}}`' },
    ],
    tags: ['daily', 'sample'],
  },
  {
    id: 't2-c2',
    track: 't2',
    order: 2,
    title: 'Slab with an opening',
    difficulty: 2,
    brief: `Model a **10 x 8 x 1** slab (X 0..10, Y 0..8, Z 0..1) with a **2 x 2** through-opening at
X 4..6, Y 3..5. Geometry only — no mesh needed.`,
    targetScript: `/PREP7
BLOCK,0,10,0,8,0,1
BLOCK,4,6,3,5,-1,2
VSBV,1,2`,
    solution: `/PREP7
BLOCK,0,10,0,8,0,1
BLOCK,4,6,3,5,-1,2
VSBV,1,2`,
    parLines: 4,
    parTimeSeconds: 45,
    hints: [
      { level: 1, text: 'Build the slab, then a tool block where the opening goes.' },
      { level: 2, text: 'VSBV,1,2 subtracts volume 2 from volume 1. Let the tool overshoot in Z.' },
      { level: 3, text: '`BLOCK,4,6,3,5,-1,2` then `VSBV,1,2`' },
    ],
    tags: ['sample'],
  },
];
