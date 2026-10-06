// Track t8 challenges: parametric scripting (*DO required by default).
import type { Challenge } from '../types';

export const challenges: Challenge[] = [
  {
    id: 't8-c1',
    track: 't8',
    order: 1,
    title: 'A row of N columns',
    difficulty: 2,
    brief: `A strip footing carries **{{NCOL}}** columns in a row. Write it with one loop.

| Part | X | Y | Z |
|---|---|---|---|
| Footing | -1 .. 4·(N-1)+2 | -1..2 | -1..0 |
| Column *i* (i = 0 … N-1) | 4i .. 4i+1 | 0..1 | 0..5 |

- columns are **1 x 1**, **5 m** tall, at **4 m** centres starting at x = 0
- glue everything (**N + 1** volumes). Geometry only.`,
    params: { NCOL: { min: 3, max: 7, step: 1 } },
    targetScript: `/PREP7
BLOCK,-1,4*(NCOL-1)+2,-1,2,-1,0
*DO,I,0,NCOL-1
  BLOCK,4*I,4*I+1,0,1,0,5
*ENDDO
VGLUE,ALL`,
    solution: `/PREP7
BLOCK,-1,18,-1,2,-1,0
*DO,I,0,4
BLOCK,4*I,4*I+1,0,1,0,5
*ENDDO
VGLUE,ALL`,
    parLines: 6,
    parTimeSeconds: 75,
    hints: [
      { level: 1, text: 'One BLOCK inside a loop: the loop counter drives the X position.' },
      { level: 2, text: '*DO,Par,IVAL,FVAL,INC … *ENDDO. Fields accept expressions: BLOCK,4*I,4*I+1,0,1,0,5.' },
      { level: 3, text: '`*DO,I,0,{{NCOL}}-1` / `BLOCK,4*I,4*I+1,0,1,0,5` / `*ENDDO`' },
    ],
    tags: ['daily', 'param', 'do'],
  },
  {
    id: 't8-c2',
    track: 't8',
    order: 2,
    title: 'Pile group: nested loops',
    difficulty: 3,
    brief: `A pile cap **9 x 6 x 1.5** (X 0..9, Y 0..6, Z 0..1.5) sits on a **4 x 3** group of bored piles.

- piles: **radius 0.4**, **12 m** long, from z = 0 down to z = **-12**
- pile centres: x = **1.5, 3.5, 5.5, 7.5**; y = **1, 3, 5** (2 m spacing both ways)
- use **nested \`*DO\`** loops, then glue the cap and piles (13 volumes). Geometry only.`,
    targetScript: `/PREP7
BLOCK,0,9,0,6,0,1.5
*DO,I,1,4
  *DO,J,1,3
    CYL4,2*I-0.5,2*J-1,0.4,,,,-12
  *ENDDO
*ENDDO
VGLUE,ALL`,
    solution: `/PREP7
BLOCK,0,9,0,6,0,1.5
*DO,I,1.5,7.5,2
*DO,J,1,5,2
CYL4,I,J,0.4,,,,-12
*ENDDO
*ENDDO
VGLUE,ALL`,
    parLines: 8,
    parTimeSeconds: 120,
    hints: [
      { level: 1, text: 'The outer loop walks along X, the inner loop along Y; one cylinder per inner iteration.' },
      { level: 2, text: 'Loop counters can be real numbers with a step: *DO,X,1.5,7.5,2. CYL4,XC,YC,R,,,,DEPTH — a negative depth goes down.' },
      { level: 3, text: '`*DO,I,1.5,7.5,2` / `*DO,J,1,5,2` / `CYL4,I,J,0.4,,,,-12` / `*ENDDO` / `*ENDDO`' },
    ],
    tags: ['param', 'do', 'nested', 'piles'],
  },
  {
    id: 't8-c3',
    track: 't8',
    order: 3,
    title: 'Skip the stair bay with *IF',
    difficulty: 2,
    brief: `A floor of precast planks: **6 bays** of **2 m** wide planks along X (bay *i* spans x = 2(i-1) .. 2i),
each plank **Y 0..8**, **Z 0..0.25**.

- **bay 4** (x 6..8) is left open for a stair
- write one loop over the six bays and skip bay 4 with **\`*IF\`** (5 separate planks, no glue). Geometry only.`,
    targetScript: `/PREP7
*DO,I,1,6
  *IF,I,EQ,4,CYCLE
  BLOCK,2*(I-1),2*I,0,8,0,0.25
*ENDDO`,
    solution: `/PREP7
*DO,I,1,6
*IF,I,EQ,4,CYCLE
BLOCK,2*I-2,2*I,0,8,0,0.25
*ENDDO`,
    parLines: 5,
    parTimeSeconds: 75,
    requiredCommands: ['*DO', '*IF'],
    hints: [
      { level: 1, text: 'Loop over all six bays and jump to the next iteration when the counter hits the stair bay.' },
      { level: 2, text: 'The one-line form *IF,VAL1,Oper,VAL2,CYCLE skips the rest of the loop body. Oper is EQ, NE, LT, GT, LE, GE.' },
      { level: 3, text: '`*IF,I,EQ,4,CYCLE` as the first line inside the loop' },
    ],
    tags: ['param', 'if', 'do'],
  },
  {
    id: 't8-c4',
    track: 't8',
    order: 4,
    title: 'Sleeves: *GET drives the subtraction',
    difficulty: 3,
    brief: `A **24 x 6 x 0.5** slab (X 0..24, Y 0..6, Z 0..0.5) gets **{{NH}}** round service sleeves of
**radius 0.5**, equally spaced along y = 3: sleeve *i* at x = i · 24 / (NH + 1).

- build the slab first (volume 1), create the cutters in a loop (overshoot the slab in Z)
- use **\`*GET,…,VOLU,0,NUM,MAX\`** to find the last cutter, select the cutters, and subtract them all from
  the slab with one **VSBV**. Geometry only (1 volume).`,
    params: { NH: { min: 3, max: 7, step: 1 } },
    targetScript: `/PREP7
BLOCK,0,24,0,6,0,0.5
WPOFFS,0,0,-1
*DO,I,1,NH
  CYL4,I*24/(NH+1),3,0.5,,,,3
*ENDDO
WPOFFS,0,0,1
*GET,NV,VOLU,0,NUM,MAX
VSEL,S,VOLU,,2,NV
CM,CUTTERS,VOLU
ALLSEL
VSBV,1,CUTTERS`,
    solution: `/PREP7
BLOCK,0,24,0,6,0,0.5 $ WPOFFS,0,0,-1
*DO,I,1,5
CYL4,4*I,3,0.5,,,,3
*ENDDO
*GET,NV,VOLU,0,NUM,MAX $ VSEL,S,VOLU,,2,NV $ CM,CUTTERS,VOLU $ ALLSEL
VSBV,1,CUTTERS`,
    parLines: 7,
    parTimeSeconds: 120,
    requiredCommands: ['*DO', '*GET', 'VSBV'],
    hints: [
      { level: 1, text: 'New volumes take the lowest free number, so the cutters are 2 … N+1. *GET tells you N+1 without counting.' },
      { level: 2, text: '*GET,Par,VOLU,0,NUM,MAX. Then VSEL,S,VOLU,,2,NV + CM,Cname,VOLU, and VSBV accepts the component name as NV2.' },
      { level: 3, text: '`*GET,NV,VOLU,0,NUM,MAX $ VSEL,S,VOLU,,2,NV $ CM,CUTTERS,VOLU $ ALLSEL` then `VSBV,1,CUTTERS`' },
    ],
    tags: ['daily', 'param', 'get', 'boolean'],
  },
  {
    id: 't8-c5',
    track: 't8',
    order: 5,
    title: 'Eight columns after WPOFFS',
    difficulty: 3,
    brief: `The TGF-36 columns on their own: **8 columns** of **2 x 3** plan, **8 m** tall, from z = **3** to **11**.

- column centres x = **4, 14, 24, 34**; y = **2.5** and **11.5**
- move the working plane up to z = 3 with **WPOFFS** and build each column with **BLC4** (corner + sizes)
  in a **\`*DO\`** loop, then put the working plane back
- 8 volumes, **384 m³**. Geometry only.`,
    targetScript: `/PREP7
WPOFFS,0,0,3
*DO,I,1,4
  XC = 4+(I-1)*10
  BLC4,XC-1,1,2,3,8
  BLC4,XC-1,10,2,3,8
*ENDDO
WPOFFS,0,0,-3`,
    solution: `/PREP7
WPOFFS,0,0,3
*DO,X,3,33,10
BLC4,X,1,2,3,8 $ BLC4,X,10,2,3,8
*ENDDO
WPOFFS,0,0,-3`,
    parLines: 6,
    parTimeSeconds: 90,
    requiredCommands: ['*DO', 'WPOFFS', 'BLC4'],
    hints: [
      { level: 1, text: 'BLC4 works in the working plane: lift the WP to the top of the mat once and every column starts at its local z = 0.' },
      { level: 2, text: 'BLC4,XCORNER,YCORNER,WIDTH,HEIGHT,DEPTH. A column centred at x = 4 has its corner at x = 3; loop the corner directly: *DO,X,3,33,10.' },
      { level: 3, text: '`*DO,X,3,33,10` / `BLC4,X,1,2,3,8 $ BLC4,X,10,2,3,8` / `*ENDDO`' },
    ],
    tags: ['param', 'do', 'wpoffs', 'S6'],
  },
];
