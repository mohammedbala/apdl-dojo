// Track t5 challenges: element types, sections, materials, real constants and xATT assignment.
// No default forbidden list: each challenge requires the attribute command it trains.
import type { Challenge } from '../types';

export const challenges: Challenge[] = [
  {
    id: 't5-c1',
    track: 't5',
    order: 1,
    title: 'Steel cantilever',
    difficulty: 1,
    brief: `A steel cantilever arm along +X from the origin, length **{{L0}} m**.

- element type 1 = **BEAM188**; material 1 (steel): EX **2.1E11**, PRXY **0.3**, DENS **7850**
- section 1: **RECT**, B = **0.4**, H = **0.8**
- **16** elements on the line
- fixed at x = 0 (all DOFs), tip load **FZ = -50E3** N at x = {{L0}}`,
    params: { L0: { min: 6, max: 10, step: 1 } },
    targetScript: `/PREP7
ET,1,BEAM188
MP,EX,1,2.1E11
MP,PRXY,1,0.3
MP,DENS,1,7850
SECTYPE,1,BEAM,RECT
SECDATA,0.4,0.8
K,1,0,0,0
K,2,L0,0,0
L,1,2
LESIZE,1,,,16
LMESH,1
NSEL,S,LOC,X,0
D,ALL,ALL,0
NSEL,S,LOC,X,L0
F,ALL,FZ,-50E3
ALLSEL`,
    solution: `/PREP7
ET,1,BEAM188 $ MP,EX,1,2.1E11 $ MP,PRXY,1,0.3 $ MP,DENS,1,7850
SECT,1,BEAM,RECT $ SECD,0.4,0.8
K,1 $ K,2,8 $ L,1,2
LESI,1,,,16 $ LMES,1
D,NODE(0,0,0),ALL $ F,NODE(8,0,0),FZ,-50E3`,
    parLines: 6,
    parTimeSeconds: 90,
    requiredCommands: ['SECTYPE'],
    hints: [
      { level: 1, text: 'Element type, material and section first, then one line with 16 divisions, mesh, root support and tip load.' },
      { level: 2, text: 'SECTYPE,1,BEAM,RECT then SECDATA,B,H. LESIZE,NL1,SIZE,ANGSIZ,NDIV: the 16 goes in the 4th field. NODE(x,y,z) finds the node at a point.' },
      { level: 3, text: '`LESIZE,1,,,16 $ LMESH,1 $ D,NODE(0,0,0),ALL $ F,NODE({{L0}},0,0),FZ,-50E3`' },
    ],
    tags: ['daily', 'beam188', 'sectype', 'S8'],
  },
  {
    id: 't5-c2',
    track: 't5',
    order: 2,
    title: 'L-shaped deck grillage',
    difficulty: 2,
    brief: `Two concrete deck beams meeting at a corner, at **z = 12.5**:

- beam A from **(0, 0)** to **(12, 0)**: section 1, RECT B **3.5**, H **3**
- beam B from **(0, 0)** to **(0, 10)**: section 2, RECT B **4**, H **3**
- element type 1 = **BEAM188**; material 1: EX **3E10**, PRXY **0.2**, DENS **2500**
- assign the sections with **LATT**, element length **1** (**22** elements)`,
    targetScript: `/PREP7
ET,1,BEAM188
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
SECTYPE,1,BEAM,RECT
SECDATA,3.5,3
SECTYPE,2,BEAM,RECT
SECDATA,4,3
K,1,0,0,12.5
K,2,12,0,12.5
K,3,0,10,12.5
L,1,2
L,1,3
LSEL,S,LOC,Y,0
LATT,1,,1,,,,1
LSEL,S,LOC,X,0
LATT,1,,1,,,,2
ALLSEL
LESIZE,ALL,1
LMESH,ALL`,
    solution: `/PREP7
ET,1,BEAM188 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
SECT,1,BEAM,RECT $ SECD,3.5,3 $ SECT,2,BEAM,RECT $ SECD,4,3
K,1,,,12.5 $ K,2,12,,12.5 $ K,3,,10,12.5 $ L,1,2 $ L,1,3
LATT,1,,1,,,,1 $ LSEL,S,,,2 $ LATT,1,,1,,,,2 $ ALLS
LESI,ALL,1 $ LMES,ALL`,
    parLines: 6,
    parTimeSeconds: 120,
    requiredCommands: ['LATT'],
    hints: [
      { level: 1, text: 'Two sections, two lines. Give each line its section with LATT before one LMESH of everything.' },
      { level: 2, text: 'LATT,MAT,REAL,TYPE,ESYS,KB,KE,SECNUM: the section is the 7th field. LATT acts on the selected lines, so select line 2 on its own for section 2.' },
      { level: 3, text: '`LATT,1,,1,,,,1 $ LSEL,S,,,2 $ LATT,1,,1,,,,2 $ ALLSEL`' },
    ],
    tags: ['beam188', 'latt', 'lesize', 'S4', 'tgf36'],
  },
  {
    id: 't5-c3',
    track: 't5',
    order: 3,
    title: 'Steel plate with a hole',
    difficulty: 3,
    brief: `A **12 x 8** steel base plate (X 0..12, Y 0..8, at z = 0), **40 mm** thick, with a hole of
radius **{{R}}** at **(6, 4)** for a holding-down sleeve.

- element type 1 = **SHELL181**; material 1: EX **2.1E11**, PRXY **0.3**, DENS **7850**
- section 1: **SHELL**, thickness **0.04**
- plate area minus circle area with **ASBA**, element size **0.5**, mesh the area`,
    params: { R: { min: 1, max: 2, step: 0.5 } },
    targetScript: `/PREP7
ET,1,SHELL181
MP,EX,1,2.1E11
MP,PRXY,1,0.3
MP,DENS,1,7850
SECTYPE,1,SHELL
SECDATA,0.04
RECTNG,0,12,0,8
CYL4,6,4,R
ASBA,1,2
ESIZE,0.5
AMESH,ALL`,
    solution: `/PREP7
ET,1,SHELL181 $ MP,EX,1,2.1E11 $ MP,PRXY,1,0.3 $ MP,DENS,1,7850
SECT,1,SHELL $ SECD,0.04
RECT,0,12,0,8 $ CYL4,6,4,1.5 $ ASBA,1,2
ESIZ,0.5 $ AMES,ALL`,
    parLines: 5,
    parTimeSeconds: 100,
    requiredCommands: ['ASBA', 'SECTYPE'],
    hints: [
      { level: 1, text: 'Shells mesh areas: build the plate as an area, punch the hole with an area Boolean, give it a shell section.' },
      { level: 2, text: 'SECTYPE,1,SHELL then SECDATA,0.04. RECTNG,X1,X2,Y1,Y2 is area 1, CYL4,XC,YC,RAD (no depth) is area 2, ASBA,1,2.' },
      { level: 3, text: '`RECTNG,0,12,0,8 $ CYL4,6,4,{{R}} $ ASBA,1,2 $ ESIZE,0.5 $ AMESH,ALL`' },
    ],
    tags: ['daily', 'shell181', 'asba', 'amesh', 'S9'],
  },
  {
    id: 't5-c4',
    track: 't5',
    order: 4,
    title: 'Footing on soil: two materials',
    difficulty: 3,
    brief: `A pad footing on a block of soil, as two glued solids with **different materials**:

- soil: X 0..10, Y 0..10, Z **-5..0**, material **2**: EX **50E6**, PRXY **0.3**, DENS **1800**
- footing: X 3..7, Y 3..7, Z **0..1**, material **1**: EX **3E10**, PRXY **0.2**, DENS **2500**
- glue the two volumes, assign materials with **VATT**
- element type 1 = **SOLID185**, element size **0.5**, mesh all`,
    targetScript: `/PREP7
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
MP,EX,2,50E6
MP,PRXY,2,0.3
MP,DENS,2,1800
BLOCK,0,10,0,10,-5,0
BLOCK,3,7,3,7,0,1
VGLUE,ALL
VSEL,S,LOC,Z,-5,0
VATT,2,,1
VSEL,S,LOC,Z,0,1
VATT,1,,1
ALLSEL
ESIZE,0.5
VMESH,ALL`,
    solution: `/PREP7
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
MP,EX,2,50E6 $ MP,PRXY,2,0.3 $ MP,DENS,2,1800
BLOC,0,10,0,10,-5,0 $ BLOC,3,7,3,7,0,1 $ VGLU,ALL
VSEL,S,LOC,Z,-2.5 $ VATT,2,,1 $ ALLS
ESIZ,0.5 $ VMES,ALL`,
    parLines: 6,
    parTimeSeconds: 120,
    requiredCommands: ['VATT'],
    hints: [
      { level: 1, text: 'Define both materials, build and glue the blocks, then select the soil by location and give it material 2. The footing can keep the default material 1.' },
      { level: 2, text: 'VSEL,S,LOC,Z tests the volume centroid: the soil centroid is at z = -2.5. VATT,MAT,REAL,TYPE: VATT,2,,1. ALLSEL before VMESH.' },
      { level: 3, text: '`VSEL,S,LOC,Z,-2.5 $ VATT,2,,1 $ ALLSEL $ ESIZE,0.5 $ VMESH,ALL`' },
    ],
    tags: ['vatt', 'materials', 'vglue', 'soil'],
  },
  {
    id: 't5-c5',
    track: 't5',
    order: 5,
    title: 'Bearing masses on a deck beam',
    difficulty: 4,
    brief: `A deck beam stick model with the four turbine-generator bearing masses of TGF-36:

- beam along X at **y = 7, z = 12.5**, from x = **4** to **34**, keypoints at **x = 4, 14, 24, 34**
  (3 lines), element length **1** (30 BEAM188)
- type 1 = **BEAM188**, section 1 RECT B **3.5**, H **3**; material 1: EX **3E10**, PRXY **0.2**, DENS **2500**
- type 2 = **MASS21** with KEYOPT(3) = **2**
- bearing masses at the four keypoints, west to east: **80E3, 150E3, 150E3, 120E3** kg,
  real sets **11-14**, placed with **KMESH**`,
    targetScript: `/PREP7
ET,1,BEAM188
ET,2,MASS21
KEYOPT,2,3,2
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
SECTYPE,1,BEAM,RECT
SECDATA,3.5,3
R,11,80E3
R,12,150E3
R,13,150E3
R,14,120E3
K,1,4,7,12.5
K,2,14,7,12.5
K,3,24,7,12.5
K,4,34,7,12.5
L,1,2
L,2,3
L,3,4
LATT,1,,1,,,,1
LESIZE,ALL,1
LMESH,ALL
KSEL,S,KP,,1
KATT,,11,2
KMESH,1
KSEL,S,KP,,2
KATT,,12,2
KMESH,2
KSEL,S,KP,,3
KATT,,13,2
KMESH,3
KSEL,S,KP,,4
KATT,,14,2
KMESH,4
ALLSEL`,
    solution: `/PREP7
ET,1,BEAM188 $ ET,2,MASS21 $ KEYO,2,3,2
MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500 $ SECT,1,BEAM,RECT $ SECD,3.5,3
R,11,80E3 $ R,12,150E3 $ R,13,150E3 $ R,14,120E3
K,1,4,7,12.5 $ KGEN,4,1,,,10 $ L,1,2 $ L,2,3 $ L,3,4
LESI,ALL,1 $ LMES,ALL
TYPE,2 $ REAL,11 $ KMES,1 $ REAL,12 $ KMES,2 $ REAL,13 $ KMES,3 $ REAL,14 $ KMES,4`,
    parLines: 7,
    parTimeSeconds: 180,
    requiredCommands: ['KMESH'],
    hints: [
      { level: 1, text: 'Mesh the beam lines first with type 1, then switch to the mass type and put one point element on each keypoint, changing the real set each time.' },
      { level: 2, text: 'KEYOPT,2,3,2 makes MASS21 take one real (the mass). R,11,80E3 ... R,14,120E3. KMESH,NP1 uses the active TYPE and REAL (or KATT if set).' },
      { level: 3, text: '`TYPE,2 $ REAL,11 $ KMESH,1 $ REAL,12 $ KMESH,2 $ REAL,13 $ KMESH,3 $ REAL,14 $ KMESH,4`' },
    ],
    tags: ['mass21', 'keyopt', 'kmesh', 'real', 'tgf36'],
  },
];
