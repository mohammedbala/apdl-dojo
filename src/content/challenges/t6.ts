// Track t6 challenges: meshing control (ESIZE, LESIZE, MSHAPE, VSWEEP, AESIZE).
import type { Challenge } from '../types';

const TIGHT = { elemTolerance: 0.02, nodeTolerance: 0.05 };

export const challenges: Challenge[] = [
  {
    id: 't6-c1',
    track: 't6',
    order: 1,
    title: 'Mapped block by line divisions',
    difficulty: 2,
    brief: `A **6 x 4 x 2** concrete block (X 0..6, Y 0..4, Z 0..2) needs a mapped hex mesh with an exact
division count on each edge direction:

| Edge direction | Length | Divisions |
|---|---|---|
| X | 6 | **{{NX}}** |
| Y | 4 | **4** |
| Z | 2 | **2** |

- element type 1 = **SOLID185**, material 1: EX **3E10**, PRXY **0.2**
- set the divisions with **LESIZE** (ESIZE is not allowed here)
- the element count is graded to **±2%**`,
    params: { NX: { min: 6, max: 18, step: 2 } },
    targetScript: `/PREP7
BLOCK,0,6,0,4,0,2
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
LSEL,S,LOC,X,3
LESIZE,ALL,,,NX
LSEL,S,LOC,Y,2
LESIZE,ALL,,,4
LSEL,S,LOC,Z,1
LESIZE,ALL,,,2
ALLSEL
VMESH,ALL`,
    solution: `/PREP7
BLOCK,0,6,0,4,0,2
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2
LSEL,S,LOC,X,3 $ LESIZE,ALL,,,12
LSEL,S,LOC,Y,2 $ LESIZE,ALL,,,4
LSEL,S,LOC,Z,1 $ LESIZE,ALL,,,2
ALLSEL $ VMESH,ALL`,
    parLines: 7,
    parTimeSeconds: 90,
    requiredCommands: ['LESIZE'],
    forbiddenCommands: ['ESIZE'],
    hints: [
      { level: 1, text: 'LSEL,LOC tests the line centroid: every X-direction edge of this block has its centroid at x = 3.' },
      { level: 2, text: 'LESIZE,NL1,SIZE,ANGSIZ,NDIV — the division count is the 4th field, so leave SIZE and ANGSIZ blank: LESIZE,ALL,,,n.' },
      { level: 3, text: '`LSEL,S,LOC,X,3 $ LESIZE,ALL,,,{{NX}}` then the same for LOC,Y,2 (4) and LOC,Z,1 (2), `ALLSEL`, `VMESH,ALL`' },
    ],
    tags: ['daily', 'mesh', 'lesize', 'S5'],
    grading: TIGHT,
  },
  {
    id: 't6-c2',
    track: 't6',
    order: 2,
    title: 'Pile cap: exactly 640 elements',
    difficulty: 2,
    brief: `Mesh an **8 x 5 x 1.5** pile cap (X 0..8, Y 0..5, Z 0..1.5) with **exactly 640** SOLID185 hexes.

- plan size **0.5** everywhere (ESIZE)
- **4 elements** through the 1.5 m depth (ESIZE alone would give 3)
- material 1: EX **3E10**, PRXY **0.2**, DENS **2500**
- graded to **±2%** elements, **±5%** nodes`,
    targetScript: `/PREP7
BLOCK,0,8,0,5,0,1.5
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,0.5
LSEL,S,LOC,Z,0.75
LESIZE,ALL,,,4
ALLSEL
VMESH,ALL`,
    solution: `/PREP7
BLOCK,0,8,0,5,0,1.5
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZE,0.5 $ LSEL,S,LOC,Z,0.75 $ LESIZE,ALL,,,4
ALLSEL $ VMESH,ALL`,
    parLines: 5,
    parTimeSeconds: 90,
    requiredCommands: ['ESIZE', 'LESIZE'],
    hints: [
      { level: 1, text: 'ESIZE gives ceil(length/size) divisions: 16 x 10 x 3 = 480. Only the vertical edges need overriding.' },
      { level: 2, text: 'LESIZE beats ESIZE. The four vertical edges all have their centroid at z = 0.75.' },
      { level: 3, text: '`ESIZE,0.5 $ LSEL,S,LOC,Z,0.75 $ LESIZE,ALL,,,4` then `ALLSEL $ VMESH,ALL`' },
    ],
    tags: ['mesh', 'esize', 'lesize', 'count'],
    grading: TIGHT,
  },
  {
    id: 't6-c3',
    track: 't6',
    order: 3,
    title: 'Tet-meshed anchor block',
    difficulty: 3,
    brief: `An anchor block **3 x 3 x 4** (X 0..3, Y 0..3, Z 0..4) has a **1 x 1** bolt pocket cut **1 m** deep
from the top (X 1..2, Y 1..2, Z 3..4).

- element type 1 = **SOLID187** (10-node tet), material 1: EX **3E10**, PRXY **0.2**
- free tet mesh: **MSHAPE,1,3D**, ESIZE **0.5**
- graded to **±2%** elements`,
    targetScript: `/PREP7
BLOCK,0,3,0,3,0,4
BLOCK,1,2,1,2,3,5
VSBV,1,2
ET,1,SOLID187
MP,EX,1,3E10
MP,PRXY,1,0.2
MSHAPE,1,3D
ESIZE,0.5
VMESH,ALL`,
    solution: `/PREP7
BLOCK,0,3,0,3,0,4 $ BLOCK,1,2,1,2,3,5 $ VSBV,1,2
ET,1,SOLID187 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2
MSHA,1,3D $ ESIZ,0.5 $ VMES,ALL`,
    parLines: 4,
    parTimeSeconds: 90,
    requiredCommands: ['MSHAPE'],
    hints: [
      { level: 1, text: 'Cut the pocket with a tool block that overshoots the top, then switch the mesher to tetrahedra.' },
      { level: 2, text: 'MSHAPE,KEY,DIMENSION — KEY 1 means tets/triangles, DIMENSION 3D. SOLID187 needs tets.' },
      { level: 3, text: '`BLOCK,1,2,1,2,3,5 $ VSBV,1,2` … `MSHAPE,1,3D $ ESIZE,0.5 $ VMESH,ALL`' },
    ],
    tags: ['mesh', 'tet', 'mshape'],
    grading: TIGHT,
  },
  {
    id: 't6-c4',
    track: 't6',
    order: 4,
    title: 'Swept cylinder pedestal',
    difficulty: 2,
    brief: `A round pump pedestal: cylinder **radius 1.5**, height **{{H}}**, centred on the origin, base at z = 0.

- element type 1 = **SOLID185**, material 1: EX **3E10**, PRXY **0.2**, DENS **2500**
- ESIZE **0.5**, mesh with **VSWEEP** (hexes swept bottom to top)
- graded to **±2%** elements`,
    params: { H: { min: 3, max: 5, step: 0.5 } },
    targetScript: `/PREP7
CYL4,0,0,1.5,,,,H
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,0.5
VSWEEP,1`,
    solution: `/PREP7
CYL4,0,0,1.5,,,,4
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZE,0.5 $ VSWEEP,1`,
    parLines: 4,
    parTimeSeconds: 60,
    requiredCommands: ['VSWEEP'],
    hints: [
      { level: 1, text: 'A cylinder is a prism: mesh the circular cap in 2-D, then sweep it in layers along the axis.' },
      { level: 2, text: 'CYL4,XCENTER,YCENTER,RAD1,THETA1,RAD2,THETA2,DEPTH — the height is the 7th field. VSWEEP,VNUM.' },
      { level: 3, text: '`CYL4,0,0,1.5,,,,{{H}}` … `ESIZE,0.5 $ VSWEEP,1`' },
    ],
    tags: ['daily', 'mesh', 'vsweep'],
    grading: TIGHT,
  },
  {
    id: 't6-c5',
    track: 't6',
    order: 5,
    title: 'Shell slab with a refined bearing strip',
    difficulty: 3,
    brief: `Model a **14 x 10** deck slab in the XY plane at z = 0 as three areas: X 0..6, X 6..8 and X 8..14
(all Y 0..10), glued together.

- element type 1 = **SHELL181**, section 1 = shell **0.6** thick, material 1: EX **3E10**, PRXY **0.2**
- global ESIZE **1**; the middle bearing strip (X 6..8) is refined to **0.5** with **AESIZE**
- graded to **±2%** elements`,
    targetScript: `/PREP7
RECTNG,0,6,0,10
RECTNG,6,8,0,10
RECTNG,8,14,0,10
AGLUE,ALL
ET,1,SHELL181
SECTYPE,1,SHELL
SECDATA,0.6
MP,EX,1,3E10
MP,PRXY,1,0.2
ESIZE,1
ASEL,S,LOC,X,7
AESIZE,ALL,0.5
ALLSEL
AMESH,ALL`,
    solution: `/PREP7
RECTNG,0,6,0,10 $ RECTNG,6,8,0,10 $ RECTNG,8,14,0,10 $ AGLUE,ALL
ET,1,SHELL181 $ SECT,1,SHELL $ SECD,0.6 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2
ESIZE,1 $ ASEL,S,LOC,X,7 $ AESIZE,ALL,0.5 $ ALLSEL $ AMESH,ALL`,
    parLines: 4,
    parTimeSeconds: 120,
    requiredCommands: ['AESIZE', 'AMESH'],
    hints: [
      { level: 1, text: 'ESIZE sets the default; AESIZE overrides it for the selected areas only. Select the strip by its centroid.' },
      { level: 2, text: 'AESIZE,ANUM,SIZE — ANUM can be ALL (the selected set). Glue the areas first so the mesh is shared.' },
      { level: 3, text: '`ESIZE,1 $ ASEL,S,LOC,X,7 $ AESIZE,ALL,0.5 $ ALLSEL $ AMESH,ALL`' },
    ],
    tags: ['mesh', 'shell', 'aesize'],
    grading: TIGHT,
  },
];
