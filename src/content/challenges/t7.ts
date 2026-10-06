// Track t7 challenges: selection by location, association, components, ALLSEL.
import type { Challenge } from '../types';

export const challenges: Challenge[] = [
  {
    id: 't7-c1',
    track: 't7',
    order: 1,
    title: 'Fix the footing base',
    difficulty: 1,
    brief: `A pier on a pad footing:

| Part | X | Y | Z |
|---|---|---|---|
| Footing | 0..4 | 0..4 | 0..1 |
| Pier | 1.5..2.5 | 1.5..2.5 | 1..**{{H}}** |

- glue the two blocks, SOLID185, ESIZE **0.5**, material 1: EX **3E10**, PRXY **0.2**, DENS **2500**
- fix **every node on z = 0** in all directions (select them by location), then \`ALLSEL\``,
    params: { H: { min: 4, max: 8, step: 1 } },
    targetScript: `/PREP7
BLOCK,0,4,0,4,0,1
BLOCK,1.5,2.5,1.5,2.5,1,H
VGLUE,ALL
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,0.5
VMESH,ALL
NSEL,S,LOC,Z,0
D,ALL,ALL
ALLSEL`,
    solution: `/PREP7
BLOCK,0,4,0,4,0,1 $ BLOCK,1.5,2.5,1.5,2.5,1,6 $ VGLUE,ALL
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZE,0.5 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL`,
    parLines: 5,
    parTimeSeconds: 75,
    requiredCommands: ['NSEL'],
    hints: [
      { level: 1, text: 'Mesh first, then select the nodes on the base plane and constrain the selected set.' },
      { level: 2, text: 'NSEL,Type,Item,Comp,VMIN — NSEL,S,LOC,Z,0 selects nodes whose z is 0 (within the selection tolerance).' },
      { level: 3, text: '`NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL`' },
    ],
    tags: ['daily', 'select', 'nsel', 'bc'],
  },
  {
    id: 't7-c2',
    track: 't7',
    order: 2,
    title: 'Thickened raft strip by AATT',
    difficulty: 2,
    brief: `A **20 x 12** shell raft in the XY plane (z = 0) is built from three glued strips along Y:
Y 0..5, Y 5..7 and Y 7..12 (all X 0..20). The middle strip carries a wall and is thicker.

- element type 1 = **SHELL181**, material 1: EX **3E10**, PRXY **0.2**, DENS **2500**
- section 1: shell **0.6**; section 2: shell **1.2**
- assign section 2 to the middle strip and section 1 to the rest **by location** (ASEL + AATT)
- ESIZE **1**, AMESH`,
    targetScript: `/PREP7
RECTNG,0,20,0,5
RECTNG,0,20,5,7
RECTNG,0,20,7,12
AGLUE,ALL
ET,1,SHELL181
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
SECTYPE,1,SHELL
SECDATA,0.6
SECTYPE,2,SHELL
SECDATA,1.2
ASEL,S,LOC,Y,6
AATT,1,,1,,2
ASEL,INVE
AATT,1,,1,,1
ALLSEL
ESIZE,1
AMESH,ALL`,
    solution: `/PREP7
RECTNG,0,20,0,5 $ RECTNG,0,20,5,7 $ RECTNG,0,20,7,12 $ AGLUE,ALL
ET,1,SHELL181 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
SECT,1,SHELL $ SECD,0.6 $ SECT,2,SHELL $ SECD,1.2
ASEL,S,LOC,Y,6 $ AATT,1,,1,,2 $ ASEL,INVE $ AATT,1,,1,,1
ALLSEL $ ESIZE,1 $ AMESH,ALL`,
    parLines: 6,
    parTimeSeconds: 120,
    requiredCommands: ['ASEL', 'AATT'],
    hints: [
      { level: 1, text: 'ASEL,LOC tests area centroids: the wall strip is the only area with its centroid at y = 6. INVE flips the selection to the rest.' },
      { level: 2, text: 'AATT,MAT,REAL,TYPE,ESYS,SECN — the section number is the 5th field.' },
      { level: 3, text: '`ASEL,S,LOC,Y,6 $ AATT,1,,1,,2 $ ASEL,INVE $ AATT,1,,1,,1 $ ALLSEL`' },
    ],
    tags: ['select', 'asel', 'aatt', 'shell'],
  },
  {
    id: 't7-c3',
    track: 't7',
    order: 3,
    title: 'Load the plinth top with NSLA',
    difficulty: 2,
    brief: `A machine plinth **4 x 3 x 2** (X 0..4, Y 0..3, Z 0..2), SOLID185, ESIZE **0.5**, material 1:
EX **3E10**, PRXY **0.2**, DENS **2500**.

- fix the base (all nodes at z = 0)
- apply **FZ = -10 kN on every node of the top face**: select the top **area** by location, then its nodes
  with \`NSLA,S,1\`
- the total force is graded (63 nodes x -10 kN = **-630 kN**)`,
    targetScript: `/PREP7
BLOCK,0,4,0,3,0,2
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,0.5
VMESH,ALL
NSEL,S,LOC,Z,0
D,ALL,ALL
ASEL,S,LOC,Z,2
NSLA,S,1
F,ALL,FZ,-10E3
ALLSEL`,
    solution: `/PREP7
BLOCK,0,4,0,3,0,2 $ ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZE,0.5 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ D,ALL,ALL
ASEL,S,LOC,Z,2 $ NSLA,S,1 $ F,ALL,FZ,-10E3 $ ALLSEL`,
    parLines: 5,
    parTimeSeconds: 90,
    requiredCommands: ['NSLA'],
    hints: [
      { level: 1, text: 'Select the top area first (its centroid is at z = 2), then select the nodes attached to it.' },
      { level: 2, text: 'NSLA,Type,NKEY — NKEY = 1 includes the nodes on the area boundary (edges and corners), not just the interior.' },
      { level: 3, text: '`ASEL,S,LOC,Z,2 $ NSLA,S,1 $ F,ALL,FZ,-10E3 $ ALLSEL`' },
    ],
    tags: ['select', 'nsla', 'force'],
  },
  {
    id: 't7-c4',
    track: 't7',
    order: 4,
    title: 'Portal frame: support components',
    difficulty: 3,
    brief: `A solid portal: two pads, two piers and a cross-head, all glued, SOLID185, ESIZE **0.5**,
material 1: EX **3E10**, PRXY **0.2**, DENS **2500**.

| Part | X | Y | Z |
|---|---|---|---|
| Pad 1 / Pad 2 | 0..3 / 7..10 | 0..3 | 0..1 |
| Pier 1 / Pier 2 | 1..2 / 8..9 | 1..2 | 1..5 |
| Cross-head | 1..9 | 1..2 | 5..6 |

- right after meshing, store the base nodes (z = 0) as component **N_BASE** and the cross-head top nodes
  (z = 6) as **N_TOP**
- then reuse them: \`CMSEL\` N_BASE → **D,ALL,ALL**; CMSEL N_TOP → **FZ = -5 kN per node**
- finish with \`ALLSEL\``,
    targetScript: `/PREP7
BLOCK,0,3,0,3,0,1
BLOCK,7,10,0,3,0,1
BLOCK,1,2,1,2,1,5
BLOCK,8,9,1,2,1,5
BLOCK,1,9,1,2,5,6
VGLUE,ALL
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,0.5
VMESH,ALL
NSEL,S,LOC,Z,0
CM,N_BASE,NODE
NSEL,S,LOC,Z,6
CM,N_TOP,NODE
ALLSEL
CMSEL,S,N_BASE
D,ALL,ALL
CMSEL,S,N_TOP
F,ALL,FZ,-5E3
ALLSEL`,
    solution: `/PREP7
BLOCK,0,3,0,3,0,1 $ BLOCK,7,10,0,3,0,1 $ BLOCK,1,2,1,2,1,5 $ BLOCK,8,9,1,2,1,5
BLOCK,1,9,1,2,5,6 $ VGLUE,ALL
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZE,0.5 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ CM,N_BASE,NODE $ NSEL,S,LOC,Z,6 $ CM,N_TOP,NODE
CMSEL,S,N_BASE $ D,ALL,ALL $ CMSEL,S,N_TOP $ F,ALL,FZ,-5E3 $ ALLSEL`,
    parLines: 7,
    parTimeSeconds: 150,
    requiredCommands: ['CM', 'CMSEL'],
    hints: [
      { level: 1, text: 'A component is a named snapshot of the current selection. Select, name it, and you can get the same set back later by name.' },
      { level: 2, text: 'CM,Cname,Entity (CM,N_BASE,NODE) stores it; CMSEL,S,Cname makes it the active selection again.' },
      { level: 3, text: '`NSEL,S,LOC,Z,0 $ CM,N_BASE,NODE` … `CMSEL,S,N_BASE $ D,ALL,ALL $ CMSEL,S,N_TOP $ F,ALL,FZ,-5E3 $ ALLSEL`' },
    ],
    tags: ['select', 'cm', 'cmsel', 'bc'],
  },
  {
    id: 't7-c5',
    track: 't7',
    order: 5,
    title: 'Bearing masses and the ALLSEL trap',
    difficulty: 3,
    brief: `A turbine-deck slab **12 x 4 x 1.5** (X 0..12, Y 0..4, Z 0..1.5), SOLID185, ESIZE **0.5**,
material 1: EX **3E10**, PRXY **0.2**, DENS **2500**. Fix the base (z = 0).

Then add two bearing masses on the **top surface** with MASS21 (type 2, KEYOPT(3) = 2):

| Bearing | Location | Mass |
|---|---|---|
| B1 | (3, 2, 1.5) | **40 t** |
| B2 | (9, 2, 1.5) | **60 t** |

- store the mass elements as component **E_MASS** (\`ESEL,S,TYPE\` + \`CM\`)
- watch out: \`NODE(x,y,z)\` only searches the **selected** nodes`,
    targetScript: `/PREP7
BLOCK,0,12,0,4,0,1.5
ET,1,SOLID185
ET,2,MASS21
KEYOPT,2,3,2
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
R,1,40E3
R,2,60E3
ESIZE,0.5
VMESH,ALL
NSEL,S,LOC,Z,0
D,ALL,ALL
ALLSEL
TYPE,2
REAL,1
E,NODE(3,2,1.5)
REAL,2
E,NODE(9,2,1.5)
ESEL,S,TYPE,,2
CM,E_MASS,ELEM
ALLSEL`,
    solution: `/PREP7
BLOCK,0,12,0,4,0,1.5 $ ET,1,SOLID185 $ ET,2,MASS21 $ KEYOPT,2,3,2
MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500 $ R,1,40E3 $ R,2,60E3
ESIZE,0.5 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL
TYPE,2 $ REAL,1 $ E,NODE(3,2,1.5) $ REAL,2 $ E,NODE(9,2,1.5)
ESEL,S,TYPE,,2 $ CM,E_MASS,ELEM $ ALLSEL`,
    parLines: 7,
    parTimeSeconds: 150,
    requiredCommands: ['ESEL', 'CM', 'ALLSEL'],
    hints: [
      { level: 1, text: 'After NSEL for the base only the base nodes are active, so NODE() at the top would return a base node. Reselect everything before placing the masses.' },
      { level: 2, text: 'MASS21 with KEYOPT,2,3,2 takes one real constant (the mass). ESEL,S,TYPE,,2 selects the mass elements; CM,E_MASS,ELEM names them.' },
      { level: 3, text: '`NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL` then `TYPE,2 $ REAL,1 $ E,NODE(3,2,1.5)` …' },
    ],
    tags: ['select', 'esel', 'cm', 'allsel', 'mass'],
  },
];
