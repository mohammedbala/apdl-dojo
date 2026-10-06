// Track t3 challenges: extrude, offset, rotate and drag. The track has no default forbidden list, so each
// challenge requires the sweep it trains.
import type { Challenge } from '../types';

export const challenges: Challenge[] = [
  {
    id: 't3-c1',
    track: 't3',
    order: 1,
    title: 'Extruded column footprints',
    difficulty: 1,
    brief: `Eight **2 x 3** column footprints at **z = 0**, extruded **{{H}} m** up with **VEXT**.

| | footprint ranges |
|---|---|
| X | **3..5**, then every **10 m** (13..15, 23..25, 33..35) |
| Y | **1..4** and **10..13** |

- element type 1 = **SOLID185**, material 1: EX **3E10**
- element size **1**, mesh all 8 volumes`,
    params: { H: { min: 6, max: 10, step: 1 } },
    targetScript: `/PREP7
RECTNG,3,5,1,4
RECTNG,3,5,10,13
AGEN,4,1,2,1,10
VEXT,ALL,,,0,0,H
ET,1,SOLID185
MP,EX,1,3E10
ESIZE,1
VMESH,ALL`,
    solution: `/PREP7
RECT,3,5,1,4 $ RECT,3,5,10,13
AGEN,4,1,2,,10
VEXT,ALL,,,,,8
ET,1,SOLID185 $ MP,EX,1,3E10
ESIZ,1 $ VMES,ALL`,
    parLines: 6,
    parTimeSeconds: 75,
    requiredCommands: ['VEXT'],
    hints: [
      { level: 1, text: 'Draw two footprints, copy the pair along X, then extrude all the areas at once.' },
      { level: 2, text: 'RECTNG,X1,X2,Y1,Y2 for the footprints, AGEN,4,1,2,,10 for the copies, then VEXT,NA1,NA2,NINC,DX,DY,DZ with NA1 = ALL.' },
      { level: 3, text: '`VEXT,ALL,,,,,{{H}}`' },
    ],
    tags: ['daily', 'vext', 'columns', 'tgf36'],
  },
  {
    id: 't3-c2',
    track: 't3',
    order: 2,
    title: 'Mat with a drainage sump',
    difficulty: 2,
    brief: `A pump-house mat **20 x 12** in plan (X 0..20, Y 0..12, at z = 0) with a circular sump opening
of radius **2** at **(10, 6)**.

- cut the hole in the **plan area**, then give the mat its thickness of **{{T}} m** upwards with **VOFFST**
- element type 1 = **SOLID185**, material 1: EX **3E10**
- element size **1**, mesh the mat`,
    params: { T: { min: 2, max: 3, step: 0.5 } },
    targetScript: `/PREP7
RECTNG,0,20,0,12
PCIRC,2,,0,360
AGEN,2,2,,,10,6,0,,,1
ASBA,1,2
VOFFST,3,T
ET,1,SOLID185
MP,EX,1,3E10
ESIZE,1
VMESH,ALL`,
    solution: `/PREP7
RECT,0,20,0,12 $ CYL4,10,6,2
ASBA,1,2
VOFF,3,2.5
ET,1,SOLID185 $ MP,EX,1,3E10
ESIZ,1 $ VMES,ALL`,
    parLines: 6,
    parTimeSeconds: 90,
    requiredCommands: ['VOFFST'],
    hints: [
      { level: 1, text: 'Work in 2-D first: rectangle minus circle gives the mat plan with a hole. Then offset that one area.' },
      { level: 2, text: 'CYL4,XC,YC,RAD with no depth makes a circular area. ASBA,1,2 subtracts it; the result is area 3. VOFFST,NAREA,DIST.' },
      { level: 3, text: '`RECTNG,0,20,0,12 $ CYL4,10,6,2 $ ASBA,1,2 $ VOFFST,3,{{T}}`' },
    ],
    tags: ['daily', 'voffst', 'asba', 'mat'],
  },
  {
    id: 't3-c3',
    track: 't3',
    order: 3,
    title: 'Revolved drum',
    difficulty: 3,
    brief: `A thick-walled concrete drum, axis along global **Y**:

- wall section in the XY plane: **X 1..1.5, Y 0..2** (inner radius 1, outer radius 1.5, height 2)
- revolve it **360°** about the Y axis in **4 segments** with **VROTAT** (4 volumes, about **7.85 m³**)
- element type 1 = **SOLID185**, element size **0.25**, mesh all`,
    targetScript: `/PREP7
RECTNG,1,1.5,0,2
K,5,0,0,0
K,6,0,1,0
VROTAT,1,,,,,,5,6,360,4
ET,1,SOLID185
ESIZE,0.25
VMESH,ALL`,
    solution: `/PREP7
RECT,1,1.5,0,2 $ K,5 $ K,6,,1
VROT,1,,,,,,5,6,360,4
ET,1,SOLID185 $ ESIZ,0.25 $ VMES,ALL`,
    parLines: 4,
    parTimeSeconds: 75,
    requiredCommands: ['VROTAT'],
    hints: [
      { level: 1, text: 'Draw the wall section as a rectangle, define two keypoints on the axis, revolve.' },
      { level: 2, text: 'VROTAT,NA1,NA2,NA3,NA4,NA5,NA6,PAX1,PAX2,ARC,NSEG: six area slots, then the two axis keypoints. RECTNG already uses keypoints 1-4.' },
      { level: 3, text: '`K,5 $ K,6,,1 $ VROTAT,1,,,,,,5,6,360,4`' },
    ],
    tags: ['vrotat', 'drum', 'S11'],
  },
  {
    id: 't3-c4',
    track: 't3',
    order: 4,
    title: 'Curved ring beam',
    difficulty: 3,
    brief: `A quarter-circle ring beam around a circular plant room:

- section **2 wide x 1.5 deep** in the **XZ plane** at y = 0: **X 4..6, Z 0..1.5**
- path: a quarter circle of radius **5** about the global Z axis, in the plane z = 0, from **(5, 0, 0)**
  to **(0, 5, 0)**
- sweep the section with **VDRAG** (one volume, about **23.56 m³**)
- element type 1 = **SOLID185**, element size **0.5**, mesh it`,
    targetScript: `/PREP7
K,1,4,0,0
K,2,6,0,0
K,3,6,0,1.5
K,4,4,0,1.5
A,1,2,3,4
K,5,5,0,0
K,6,0,5,0
K,7,0,0,0
LARC,5,6,7,5
VDRAG,1,,,,,,5
ET,1,SOLID185
ESIZE,0.5
VMESH,ALL`,
    solution: `/PREP7
K,1,4 $ K,2,6 $ K,3,6,,1.5 $ K,4,4,,1.5 $ A,1,2,3,4
K,5,5 $ K,6,,5 $ K,7 $ LARC,5,6,7,5
VDRA,1,,,,,,5
ET,1,SOLID185 $ ESIZ,0.5 $ VMES,ALL`,
    parLines: 5,
    parTimeSeconds: 120,
    requiredCommands: ['VDRAG'],
    hints: [
      { level: 1, text: 'Section from four keypoints and A, path from LARC with the origin as the centre keypoint, then drag.' },
      { level: 2, text: 'LARC,P1,P2,PC,RAD with PC = a keypoint at the origin. A,1,2,3,4 creates lines 1-4 for the section, so the arc is line 5. VDRAG,NA1..NA6,NLP1: the path is field 8.' },
      { level: 3, text: '`K,5,5 $ K,6,,5 $ K,7 $ LARC,5,6,7,5 $ VDRAG,1,,,,,,5`' },
    ],
    tags: ['vdrag', 'larc', 'S12'],
  },
  {
    id: 't3-c5',
    track: 't3',
    order: 5,
    title: 'T-beam dragged along a path',
    difficulty: 4,
    brief: `A precast T-beam, **8 m** long along +X. Cross-section in the **YZ plane** at x = 0:

- web: **Y -0.2..0.2**, **Z 0..1.2**
- flange: **Y -1..1**, **Z 1.2..1.6**

Build the T as **one area**, then sweep it along a straight path line with **VDRAG**.

- element type 1 = **SOLID185**; material 1: EX **3E10**, PRXY **0.2**
- element size **0.2**, mesh it`,
    targetScript: `/PREP7
K,1,0,-0.2,0
K,2,0,0.2,0
K,3,0,0.2,1.2
K,4,0,1,1.2
K,5,0,1,1.6
K,6,0,-1,1.6
K,7,0,-1,1.2
K,8,0,-0.2,1.2
A,1,2,3,4,5,6,7,8
K,9,8,-0.2,0
L,1,9
VDRAG,1,,,,,,9
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
ESIZE,0.2
VMESH,ALL`,
    solution: `/PREP7
K,1,,-.2 $ K,2,,.2 $ K,3,,.2,1.2 $ K,4,,1,1.2 $ K,5,,1,1.6 $ K,6,,-1,1.6 $ K,7,,-1,1.2 $ K,8,,-.2,1.2
A,1,2,3,4,5,6,7,8
K,9,8,-.2 $ L,1,9 $ VDRA,1,,,,,,9
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2
ESIZ,0.2 $ VMES,ALL`,
    parLines: 6,
    parTimeSeconds: 180,
    requiredCommands: ['VDRAG'],
    hints: [
      { level: 1, text: 'Walk round the T outline with eight keypoints (all at x = 0), make one area, then add a path line along X from one of the section keypoints.' },
      { level: 2, text: 'A,P1..P8 builds the area through the keypoints in order. The area has 8 edges (lines 1-8), so the path is line 9. VDRAG,1,,,,,,9.' },
      { level: 3, text: '`K,9,8,-.2 $ L,1,9 $ VDRAG,1,,,,,,9`' },
    ],
    tags: ['vdrag', 'section', 'beam'],
  },
];
