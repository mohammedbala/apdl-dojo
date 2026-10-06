// Track t9 challenges: loads and boundary conditions.
import type { Challenge } from '../types';

export const challenges: Challenge[] = [
  {
    id: 't9-c1',
    track: 't9',
    order: 1,
    title: 'Half model: base and symmetry plane',
    difficulty: 1,
    brief: `Model **half** of a symmetric plinth: X 0..**{{L}}**, Y 0..4, Z 0..2 (the plane x = 0 is the plane of
symmetry). SOLID185, ESIZE **0.5**, material 1: EX **3E10**, PRXY **0.2**, DENS **2500**.

- base (z = 0): **fixed** in all directions — \`D,ALL,ALL\`
- symmetry face (x = 0): **UX = 0** only
- \`ALLSEL\` at the end`,
    params: { L: { min: 4, max: 8, step: 1 } },
    targetScript: `/PREP7
BLOCK,0,L,0,4,0,2
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,0.5
VMESH,ALL
NSEL,S,LOC,Z,0
D,ALL,ALL
NSEL,S,LOC,X,0
D,ALL,UX
ALLSEL`,
    solution: `/PREP7
BLOCK,0,6,0,4,0,2 $ ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZE,0.5 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ D,ALL,ALL $ NSEL,S,LOC,X,0 $ D,ALL,UX $ ALLSEL`,
    parLines: 4,
    parTimeSeconds: 60,
    requiredCommands: ['D'],
    hints: [
      { level: 1, text: 'Two selections, two D commands: the base gets every DOF, the symmetry face only the normal displacement.' },
      { level: 2, text: 'D,NODE,Lab — with NODE = ALL it acts on the selected nodes. Lab ALL means UX, UY, UZ for solids.' },
      { level: 3, text: '`NSEL,S,LOC,Z,0 $ D,ALL,ALL $ NSEL,S,LOC,X,0 $ D,ALL,UX $ ALLSEL`' },
    ],
    tags: ['daily', 'bc', 'd', 'symmetry'],
  },
  {
    id: 't9-c2',
    track: 't9',
    order: 2,
    title: 'Retaining wall strip: constraints on areas',
    difficulty: 2,
    brief: `A **1 m strip** of an L-shaped retaining wall (Y 0..1):

| Part | X | Z |
|---|---|---|
| Footing | 0..4 | 0..0.6 |
| Stem | 1..1.5 | 0.6..4 |

- glue, SOLID185, ESIZE **0.25**, material 1: EX **3E10**, PRXY **0.2**, DENS **2500**
- apply the supports on the **solid model** with **DA** (no D on nodes):
  footing soffit (z = 0) **all DOF**; both strip faces (y = 0 and y = 1) **UY = 0** (plane strain)`,
    targetScript: `/PREP7
BLOCK,0,4,0,1,0,0.6
BLOCK,1,1.5,0,1,0.6,4
VGLUE,ALL
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,0.25
VMESH,ALL
ASEL,S,LOC,Z,0
DA,ALL,ALL
ASEL,S,LOC,Y,0
ASEL,A,LOC,Y,1
DA,ALL,UY
ALLSEL`,
    solution: `/PREP7
BLOCK,0,4,0,1,0,0.6 $ BLOCK,1,1.5,0,1,0.6,4 $ VGLUE,ALL
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZE,0.25 $ VMESH,ALL
ASEL,S,LOC,Z,0 $ DA,ALL,ALL
ASEL,S,LOC,Y,0 $ ASEL,A,LOC,Y,1 $ DA,ALL,UY $ ALLSEL`,
    parLines: 6,
    parTimeSeconds: 120,
    requiredCommands: ['DA'],
    forbiddenCommands: ['D'],
    hints: [
      { level: 1, text: 'Solid-model constraints live on areas and are transferred to their nodes when the run finishes. Select the areas by centroid.' },
      { level: 2, text: 'DA,AREA,Lab — AREA = ALL for the selected set. ASEL,A adds: both y = 0 and y = 1 faces of footing and stem are needed.' },
      { level: 3, text: '`ASEL,S,LOC,Z,0 $ DA,ALL,ALL` then `ASEL,S,LOC,Y,0 $ ASEL,A,LOC,Y,1 $ DA,ALL,UY $ ALLSEL`' },
    ],
    tags: ['bc', 'da', 'solid-model-loads'],
  },
  {
    id: 't9-c3',
    track: 't9',
    order: 3,
    title: 'Cantilever bracket: forces at NODE()',
    difficulty: 2,
    brief: `A cantilever bracket modelled with **BEAM188** along X from (0,0,0) to (**8**,0,0).

- section 1: **RECT 0.4 x 0.8** (SECDATA,B,H), material 1: EX **3E10**, PRXY **0.2**, DENS **2500**
- **0.5 m** elements (LESIZE), LMESH
- root (0,0,0): **fixed**, all DOF
- tip (8,0,0): **FZ = -50 kN** and **FX = +10 kN**
- find the nodes with **NODE(x,y,z)** — no node numbers`,
    targetScript: `/PREP7
K,1,0,0,0
K,2,8,0,0
L,1,2
ET,1,BEAM188
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
SECTYPE,1,BEAM,RECT
SECDATA,0.4,0.8
LESIZE,ALL,0.5
LMESH,ALL
D,NODE(0,0,0),ALL
F,NODE(8,0,0),FZ,-50E3
F,NODE(8,0,0),FX,10E3`,
    solution: `/PREP7
K,1 $ K,2,8 $ L,1,2
ET,1,BEAM188 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
SECT,1,BEAM,RECT $ SECD,0.4,0.8 $ LESIZE,ALL,0.5 $ LMESH,ALL
D,NODE(0,0,0),ALL $ F,NODE(8,0,0),FZ,-50E3 $ F,NODE(8,0,0),FX,10E3`,
    parLines: 5,
    parTimeSeconds: 90,
    requiredCommands: ['F'],
    hints: [
      { level: 1, text: 'NODE(x,y,z) returns the number of the selected node closest to the point: use it directly as the node field.' },
      { level: 2, text: 'F,NODE,Lab,VALUE — one command per force component. D,NODE,ALL fixes all six DOF of a beam node.' },
      { level: 3, text: '`D,NODE(0,0,0),ALL $ F,NODE(8,0,0),FZ,-50E3 $ F,NODE(8,0,0),FX,10E3`' },
    ],
    tags: ['bc', 'f', 'beam', 'getfn'],
  },
  {
    id: 't9-c4',
    track: 't9',
    order: 4,
    title: 'Deck pressure with SFA',
    difficulty: 2,
    brief: `An operating-floor slab **12 x 6 x 1** (X 0..12, Y 0..6, Z 0..1), SOLID185, ESIZE **0.5**,
material 1: EX **3E10**, PRXY **0.2**, DENS **2500**.

- base (z = 0) fixed with \`D,ALL,ALL\`
- a live load of **10 kPa** on the **top face** (z = 1) as a solid-model pressure: **SFA**
- the number of loaded element faces is graded`,
    targetScript: `/PREP7
BLOCK,0,12,0,6,0,1
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,0.5
VMESH,ALL
NSEL,S,LOC,Z,0
D,ALL,ALL
ALLSEL
ASEL,S,LOC,Z,1
SFA,ALL,1,PRES,10E3
ALLSEL`,
    solution: `/PREP7
BLOCK,0,12,0,6,0,1 $ ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZE,0.5 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL
ASEL,S,LOC,Z,1 $ SFA,ALL,1,PRES,10E3 $ ALLSEL`,
    parLines: 5,
    parTimeSeconds: 75,
    requiredCommands: ['SFA'],
    hints: [
      { level: 1, text: 'Put the pressure on the area, not on nodes: it is transferred to every element face on that area.' },
      { level: 2, text: 'SFA,AREA,LKEY,Lab,VALUE — LKEY is 1 for a volume\'s face, Lab is PRES, and positive pressure acts into the surface.' },
      { level: 3, text: '`ASEL,S,LOC,Z,1 $ SFA,ALL,1,PRES,10E3 $ ALLSEL`' },
    ],
    tags: ['bc', 'sfa', 'pressure'],
  },
  {
    id: 't9-c5',
    track: 't9',
    order: 5,
    title: 'Gravity and bearing masses',
    difficulty: 3,
    brief: `A turbine pedestal block **10 x 4 x 3** (X 0..10, Y 0..4, Z 0..3), SOLID185, ESIZE **0.5**,
material 1: EX **3E10**, PRXY **0.2**, DENS **2500**. Fix the base (z = 0).

Bearing masses on the top surface, **MASS21** (type 2, KEYOPT(3) = 2, one real per mass):

| Bearing | Node at | Mass |
|---|---|---|
| B1 | (2, 2, 3) | **30 t** |
| B2 | (5, 2, 3) | **{{MB}} t** |
| B3 | (8, 2, 3) | **30 t** |

- gravity **9.81 m/s²** in -Z: in ANSYS that is \`ACEL,0,0,+9.81\``,
    params: { MB: { min: 30, max: 60, step: 5 } },
    targetScript: `/PREP7
BLOCK,0,10,0,4,0,3
ET,1,SOLID185
ET,2,MASS21
KEYOPT,2,3,2
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
R,1,30E3
R,2,MB*1000
ESIZE,0.5
VMESH,ALL
NSEL,S,LOC,Z,0
D,ALL,ALL
ALLSEL
TYPE,2
REAL,1
E,NODE(2,2,3)
E,NODE(8,2,3)
REAL,2
E,NODE(5,2,3)
ACEL,0,0,9.81`,
    solution: `/PREP7
BLOCK,0,10,0,4,0,3 $ ET,1,SOLID185 $ ET,2,MASS21 $ KEYOPT,2,3,2
MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500 $ R,1,30E3 $ R,2,45E3
ESIZE,0.5 $ VMESH,ALL $ NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL
TYPE,2 $ REAL,1 $ E,NODE(2,2,3) $ E,NODE(8,2,3) $ REAL,2 $ E,NODE(5,2,3)
ACEL,0,0,9.81`,
    parLines: 6,
    parTimeSeconds: 120,
    requiredCommands: ['ACEL'],
    hints: [
      { level: 1, text: 'ACEL is the acceleration of the reference frame: gravity pulling down is an upward acceleration, +9.81 in Z.' },
      { level: 2, text: 'MASS21 with KEYOPT,2,3,2 takes one real (the mass in kg). Set TYPE and REAL, then E,NODE(x,y,z) creates a 1-node element.' },
      { level: 3, text: '`TYPE,2 $ REAL,1 $ E,NODE(2,2,3) $ E,NODE(8,2,3) $ REAL,2 $ E,NODE(5,2,3)` then `ACEL,0,0,9.81`' },
    ],
    tags: ['daily', 'bc', 'acel', 'mass'],
  },
];
