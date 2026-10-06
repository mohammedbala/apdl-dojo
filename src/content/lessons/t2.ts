// Track t2 lessons. SAMPLE content so the UI can be exercised; the content teammate replaces/extends it.
import type { Lesson } from '../types';

export const lessons: Lesson[] = [
  {
    id: 't2-l1',
    track: 't2',
    order: 1,
    title: 'Blocks, then subtract',
    explanation: `## One line per solid

\`BLOCK,X1,X2,Y1,Y2,Z1,Z2\` builds a brick from coordinate **ranges** in the working plane. It creates
8 keypoints, 12 lines, 6 areas and 1 volume in a single command — the bottom-up equivalent is 15+ lines.

Openings are made by building a *tool* volume and subtracting it:

- \`VSBV,1,2\` subtracts volume 2 from volume 1
- both inputs are deleted and the result gets the **next free number**
- make tools **overshoot** the target so no sliver faces are left

Then mesh: \`ET,1,SOLID185\`, \`MP,EX,1,30E9\`, \`ESIZE,1\`, \`VMESH,ALL\`.`,
    workedExample: {
      script: `/PREP7
BLOCK,0,10,0,8,0,1      ! slab 10 x 8 x 1
BLOCK,4,6,3,5,-1,2      ! tool, overshoots in Z
VSBV,1,2                ! slab minus tool
/PNUM,VOLU,1
VPLOT`,
      commentary: 'The tool block passes through the slab top and bottom, so the subtraction leaves a clean through-opening. The result is renumbered volume 3.',
    },
    challengeIds: ['t2-c1', 't2-c2'],
  },
];
