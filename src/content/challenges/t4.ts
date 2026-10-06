// Track t4 challenges: direct generation. Solid modelling, Booleans, sweeps and the solid meshers are
// forbidden by the track default.
import type { Challenge } from '../types';

export const challenges: Challenge[] = [
  {
    id: 't4-c1',
    track: 't4',
    order: 1,
    title: 'Deck beam by NFILL and EGEN',
    difficulty: 1,
    brief: `A longitudinal deck beam of the tabletop as a stick model, at **z = 12.5**, from **x = 0** to
**x = {{L}}** (y = 0), with **2 m** BEAM188 elements (**{{L}}/2** elements).

- element type 1 = **BEAM188**; material 1: EX **3E10**, PRXY **0.2**, DENS **2500**
- section 1: **RECT**, B = **3.5**, H = **3** (\`SECDATA,3.5,3\`)
- nodes and elements by direct generation only`,
    params: { L: { min: 30, max: 42, step: 2 } },
    targetScript: `/PREP7
NE=L/2
ET,1,BEAM188
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
SECTYPE,1,BEAM,RECT
SECDATA,3.5,3
N,1,0,0,12.5
N,NE+1,L,0,12.5
NFILL,1,NE+1
E,1,2
EGEN,NE,1,1`,
    solution: `/PREP7
ET,1,BEAM188 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
SECT,1,BEAM,RECT $ SECD,3.5,3
N,1,,,12.5 $ N,19,36,,12.5 $ NFIL,1,19
E,1,2 $ EGEN,18,1,1`,
    parLines: 5,
    parTimeSeconds: 75,
    hints: [
      { level: 1, text: 'Place the two end nodes, fill between them, type the first element and copy it along.' },
      { level: 2, text: 'With {{L}}/2 elements the far node is number {{L}}/2 + 1. NFILL,1,N2 fills the gap with consecutive numbers. EGEN,ITIME,NINC,IEL1: ITIME = number of elements, NINC = 1.' },
      { level: 3, text: '`N,1,,,12.5 $ N,{{L}}/2+1,{{L}},,12.5 $ NFILL,1,{{L}}/2+1 $ E,1,2 $ EGEN,{{L}}/2,1,1`' },
    ],
    tags: ['daily', 'nfill', 'egen', 'beam188', 'tgf36'],
  },
  {
    id: 't4-c2',
    track: 't4',
    order: 2,
    title: 'Four bearing oscillators',
    difficulty: 2,
    brief: `A first-cut dynamic model of four bearing pedestals: four spring-mass oscillators.

- ground nodes **1-4** at z = 0, x = **0, 10, 20, 30** (y = 0), all **fixed**
- mass nodes **11-14** directly above, at **z = 1**
- type 1 = **COMBIN14**, KEYOPT(2) = **3** (UZ spring), real 1: k = **2E8** N/m
- type 2 = **MASS21**, KEYOPT(3) = **2**, real 2: m = **40E3** kg
- 4 springs (ground to mass node) and 4 masses, by direct generation`,
    targetScript: `/PREP7
ET,1,COMBIN14
KEYOPT,1,2,3
ET,2,MASS21
KEYOPT,2,3,2
R,1,2E8
R,2,40E3
N,1,0,0,0
NGEN,4,1,1,1,1,10
NGEN,2,10,1,4,1,0,0,1
TYPE,1
REAL,1
E,1,11
EGEN,4,1,1
TYPE,2
REAL,2
E,11
EGEN,4,1,5
NSEL,S,LOC,Z,0
D,ALL,ALL,0
ALLSEL`,
    solution: `/PREP7
ET,1,COMBIN14 $ KEYO,1,2,3 $ ET,2,MASS21 $ KEYO,2,3,2
R,1,2E8 $ R,2,40E3
N,1 $ NGEN,4,1,1,,,10 $ NGEN,2,10,1,4,,,,1
E,1,11 $ EGEN,4,1,1
TYPE,2 $ REAL,2 $ E,11 $ EGEN,4,1,5
D,1,ALL,,,4`,
    parLines: 7,
    parTimeSeconds: 120,
    hints: [
      { level: 1, text: 'Generate the ground row, copy it up 1 m with +10 numbering, then one spring and one mass, each copied along the row.' },
      { level: 2, text: 'NGEN,ITIME,INC,NODE1,NODE2,NINC,DX,DY,DZ. Springs use TYPE 1 / REAL 1 (the defaults); switch to TYPE,2 and REAL,2 before the mass. The first mass is element 5.' },
      { level: 3, text: '`E,1,11 $ EGEN,4,1,1` then `TYPE,2 $ REAL,2 $ E,11 $ EGEN,4,1,5`' },
    ],
    tags: ['combin14', 'mass21', 'ngen', 'egen', 'S10'],
  },
  {
    id: 't4-c3',
    track: 't4',
    order: 3,
    title: 'Three-bay portal frame',
    difficulty: 3,
    brief: `A 2-D transverse frame (in the XZ plane, y = 0) for a quick sway check:

- four columns at **x = 0, 10, 20, 30**, base z = 0, top z = **8**, each **4 elements** (2 m)
- a continuous beam along the tops, **5 elements per bay** (2 m)
- **32 nodes, 31 BEAM188 elements**, all column bases **fixed**
- element type 1 = **BEAM188**; material 1: EX **3E10**, PRXY **0.2**; section 1 RECT **1 x 1**
- direct generation only. Suggested numbering: column k = nodes 1..5 + 100(k-1), beam nodes between
  columns 6..9, 106..109, 206..209`,
    targetScript: `/PREP7
ET,1,BEAM188
MP,EX,1,3E10
MP,PRXY,1,0.2
SECTYPE,1,BEAM,RECT
SECDATA,1,1
N,1,0,0,0
N,5,0,0,8
NFILL,1,5
NGEN,4,100,1,5,1,10
NFILL,5,105,4,6,1
NGEN,3,100,6,9,1,10
E,1,2
EGEN,4,1,1
EGEN,4,100,1,4
E,5,6
EGEN,4,1,17
E,9,105
EGEN,3,100,17,21
NSEL,S,LOC,Z,0
D,ALL,ALL,0
ALLSEL`,
    solution: `/PREP7
ET,1,BEAM188 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ SECT,1,BEAM,RECT $ SECD,1,1
N,1 $ N,5,,,8 $ NFIL,1,5 $ NGEN,4,100,1,5,,10
NFIL,5,105,4,6,1 $ NGEN,3,100,6,9,,10
E,1,2 $ EGEN,4,1,1 $ EGEN,4,100,1,4
E,5,6 $ EGEN,4,1,17 $ E,9,105 $ EGEN,3,100,17,21
D,1,ALL,,,301,100`,
    parLines: 8,
    parTimeSeconds: 200,
    hints: [
      { level: 1, text: 'Build column 1 and copy it with +100 numbering. Fill the first bay of beam nodes and copy that too. Then the same pattern for the elements.' },
      { level: 2, text: 'NFILL,5,105,4,6,1: NINC must be typed, otherwise the fill nodes are numbered 6, 26, 46, 66. Column elements are 1-16, so the first beam element is 17; one bay = 5 elements (17-21).' },
      { level: 3, text: '`E,5,6 $ EGEN,4,1,17 $ E,9,105 $ EGEN,3,100,17,21` and `D,1,ALL,,,301,100`' },
    ],
    tags: ['beam188', 'frame', 'nfill', 'egen'],
  },
  {
    id: 't4-c4',
    track: 't4',
    order: 4,
    title: 'Mat as a shell grid',
    difficulty: 3,
    brief: `A foundation mat as a mid-plane shell model at **z = 0**: **{{LX}} x {{LY}} m** (X 0..{{LX}},
Y 0..{{LY}}), **1 x 1 m** SHELL181 elements.

- element type 1 = **SHELL181**; material 1: EX **3E10**, PRXY **0.2**, DENS **2500**
- section 1: **SHELL**, thickness **1.5**
- nodes and elements by **N / NGEN / E / EGEN** (row numbering +100 recommended)`,
    params: { LX: { min: 8, max: 12, step: 1 }, LY: { min: 4, max: 8, step: 1 } },
    targetScript: `/PREP7
ET,1,SHELL181
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
SECTYPE,1,SHELL
SECDATA,1.5
N,1,0,0,0
NGEN,LX+1,1,1,1,1,1
NGEN,LY+1,100,1,LX+1,1,0,1
E,1,2,102,101
EGEN,LX,1,1
EGEN,LY,100,1,LX`,
    solution: `/PREP7
ET,1,SHELL181 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
SECT,1,SHELL $ SECD,1.5
N,1 $ NGEN,11,1,1,,,1 $ NGEN,7,100,1,11,,,1
E,1,2,102,101 $ EGEN,10,1,1 $ EGEN,6,100,1,10`,
    parLines: 5,
    parTimeSeconds: 120,
    hints: [
      { level: 1, text: 'One node, copied into a row, the row copied into a grid. Then one quad, copied along the row and up the grid.' },
      { level: 2, text: 'NGEN,{{LX}}+1,1,1,,,1 makes the row; NGEN,{{LY}}+1,100,1,{{LX}}+1,,,1 copies it with +100 numbering. E,1,2,102,101 is the first quad.' },
      { level: 3, text: '`E,1,2,102,101 $ EGEN,{{LX}},1,1 $ EGEN,{{LY}},100,1,{{LX}}`' },
    ],
    tags: ['daily', 'shell181', 'ngen', 'egen', 'mat'],
  },
  {
    id: 't4-c5',
    track: 't4',
    order: 5,
    title: 'Winkler spring bed',
    difficulty: 4,
    brief: `The TGF-36 technique D in miniature: a shell mat on vertical soil springs.

- mat: SHELL181 at **z = 0**, **8 x 4 m** (X 0..8, Y 0..4), **1 m** grid (45 nodes, 32 shells);
  material 1: EX **3E10**, PRXY **0.2**, DENS **2500**; section 1 SHELL thickness **1.5**
- ground nodes **1 m below every mat node** (z = -1), all **fixed**
- one **COMBIN14** spring (type 2, KEYOPT(2) = **3**) from each mat node to its ground node,
  real 2: k = **5E7** N/m (45 springs)
- direct generation only`,
    targetScript: `/PREP7
ET,1,SHELL181
ET,2,COMBIN14
KEYOPT,2,2,3
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
SECTYPE,1,SHELL
SECDATA,1.5
R,2,5E7
N,1,0,0,0
NGEN,9,1,1,1,1,1
NGEN,5,100,1,9,1,0,1
E,1,2,102,101
EGEN,8,1,1
EGEN,4,100,1,8
NGEN,2,1000,1,409,1,0,0,-1
TYPE,2
REAL,2
E,1,1001
EGEN,9,1,33
EGEN,5,100,33,41
NSEL,S,LOC,Z,-1
D,ALL,ALL,0
ALLSEL`,
    solution: `/PREP7
ET,1,SHELL181 $ ET,2,COMBIN14 $ KEYO,2,2,3
MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
SECT,1,SHELL $ SECD,1.5 $ R,2,5E7
N,1 $ NGEN,9,1,1,,,1 $ NGEN,5,100,1,9,,,1
E,1,2,102,101 $ EGEN,8,1,1 $ EGEN,4,100,1,8
NGEN,2,1000,1,409,,,,-1
TYPE,2 $ REAL,2 $ E,1,1001 $ EGEN,9,1,33 $ EGEN,5,100,33,41
NSEL,S,LOC,Z,-1 $ D,ALL,ALL $ ALLS`,
    parLines: 9,
    parTimeSeconds: 240,
    hints: [
      { level: 1, text: 'Shell grid first (+100 row numbering). Copy all mat nodes 1 m down with a big number offset, then one spring and the same two EGENs as for the shells.' },
      { level: 2, text: 'NGEN,2,1000,1,409,,,,-1 copies every existing node in 1..409 (gaps are skipped). The shells are elements 1-32, so the first spring is element 33.' },
      { level: 3, text: '`TYPE,2 $ REAL,2 $ E,1,1001 $ EGEN,9,1,33 $ EGEN,5,100,33,41`' },
    ],
    tags: ['combin14', 'shell181', 'winkler', 'tgf36'],
  },
];
