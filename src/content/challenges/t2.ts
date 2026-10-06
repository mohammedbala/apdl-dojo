// Track t2 challenges: primitives and Booleans. K/L/A/V are forbidden by the track default.
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
- material 1: EX = **30E9**, PRXY = **0.2**, DENS = **2500**
- global element size **1**, mesh all volumes`,
    params: { H: { min: 6, max: 10, step: 1 } },
    targetScript: `/PREP7
BLOCK,0,2,0,3,0,H
ET,1,SOLID185
MP,EX,1,30E9
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,1
VMESH,ALL`,
    solution: `/PREP7
BLOC,0,2,0,3,0,8
ET,1,SOLID185 $ MP,EX,1,30E9 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZ,1 $ VMES,ALL`,
    parLines: 4,
    parTimeSeconds: 50,
    hints: [
      { level: 1, text: 'One primitive is the whole column. BLOCK takes coordinate ranges.' },
      { level: 2, text: 'BLOCK,X1,X2,Y1,Y2,Z1,Z2. Then ET,1,SOLID185, three MP lines, ESIZE,1 and VMESH,ALL.' },
      { level: 3, text: '`BLOCK,0,2,0,3,0,{{H}}`' },
    ],
    tags: ['daily', 'block', 'S1'],
  },
  {
    id: 't2-c2',
    track: 't2',
    order: 2,
    title: 'Column on a pedestal',
    difficulty: 2,
    brief: `A concrete pedestal **6 x 5 x 3** (X 0..6, Y 0..5, Z 0..3) carries a column stub with a **2 x 3**
footprint (X 2..4, Y 1..4) from the pedestal top up to **z = 6.5**.

- keep **two volumes**, connected with **VGLUE** (total **111 m³**)
- element type 1 = **SOLID185**, material 1: EX = **30E9**
- element size **0.5**, mesh all`,
    targetScript: `/PREP7
BLOCK,0,6,0,5,0,3
BLOCK,2,4,1,4,3,6.5
VGLUE,ALL
ET,1,SOLID185
MP,EX,1,30E9
ESIZE,0.5
VMESH,ALL`,
    solution: `/PREP7
BLOC,0,6,0,5,0,3 $ BLOC,2,4,1,4,3,6.5
VGLU,ALL
ET,1,SOLID185 $ MP,EX,1,30E9
ESIZ,0.5 $ VMES,ALL`,
    parLines: 5,
    parTimeSeconds: 75,
    requiredCommands: ['VGLUE'],
    hints: [
      { level: 1, text: 'Two bricks that touch on the pedestal top. Gluing makes the mesh share nodes on that face.' },
      { level: 2, text: 'BLOCK the pedestal (Z 0..3) and the stub (Z 3..6.5), then VGLUE,ALL before meshing. A BLC4 here would start at the WP (z = 0) and overlap.' },
      { level: 3, text: '`BLOCK,0,6,0,5,0,3 $ BLOCK,2,4,1,4,3,6.5 $ VGLUE,ALL`' },
    ],
    tags: ['block', 'vglue', 'S2'],
  },
  {
    id: 't2-c3',
    track: 't2',
    order: 3,
    title: 'Slab with a round hole',
    difficulty: 2,
    brief: `A **10 x 8 x 1** slab (X 0..10, Y 0..8, Z 0..1) with a circular through-hole of radius
**{{R}}** centred at **(5, 4)**, for a pipe sleeve.

- element type 1 = **SOLID185**, material 1: EX = **30E9**
- element size **0.5**, mesh the slab`,
    params: { R: { min: 1, max: 2, step: 0.5 } },
    targetScript: `/PREP7
BLOCK,0,10,0,8,0,1
WPOFFS,0,0,-1
CYL4,5,4,R,,,,3
WPOFFS,0,0,1
VSBV,1,2
ET,1,SOLID185
MP,EX,1,30E9
ESIZE,0.5
VMESH,ALL`,
    solution: `/PREP7
BLOC,0,10,0,8,0,1 $ WPOF,,,-1 $ CYL4,5,4,1.5,,,,3
VSBV,1,2
ET,1,SOLID185 $ MP,EX,1,30E9
ESIZ,0.5 $ VMES,ALL`,
    parLines: 5,
    parTimeSeconds: 75,
    hints: [
      { level: 1, text: 'Make a cylinder where the hole goes, longer than the slab is thick, and subtract it.' },
      { level: 2, text: 'CYL4,XC,YC,RAD1,THETA1,RAD2,THETA2,DEPTH: leave THETA1, RAD2 and THETA2 blank, so four commas follow RAD1. The depth starts at the WP, so lower the WP with WPOFFS,,,-1 first. Then VSBV,1,2.' },
      { level: 3, text: '`WPOFFS,,,-1 $ CYL4,5,4,{{R}},,,,3 $ VSBV,1,2`' },
    ],
    tags: ['daily', 'cyl4', 'vsbv', 'S3'],
  },
  {
    id: 't2-c4',
    track: 't2',
    order: 4,
    title: 'Deck with two openings',
    difficulty: 3,
    brief: `The TGF-36 deck: **36 x 12 x 3** (X 1..37, Y 1..13, Z 11..14) with two **6 x 5** openings for the
turbine casings:

- opening 1: X **6..12**, Y **4.5..9.5**
- opening 2: X **26..32**, Y **4.5..9.5**

- element type 1 = **SOLID185**; material 1: EX **3E10**, PRXY **0.2**, DENS **2500**
- element size **1**, mesh the deck (one volume)`,
    targetScript: `/PREP7
BLOCK,1,37,1,13,11,14
BLOCK,6,12,4.5,9.5,10,15
BLOCK,26,32,4.5,9.5,10,15
VSBV,1,2
VSBV,4,3
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,1
VMESH,ALL`,
    solution: `/PREP7
BLOC,1,37,1,13,11,14
BLOC,6,12,4.5,9.5,10,15 $ BLOC,26,32,4.5,9.5,10,15
VSBV,1,ALL
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZ,1 $ VMES,ALL`,
    parLines: 6,
    parTimeSeconds: 120,
    hints: [
      { level: 1, text: 'Deck block plus two tool blocks that overshoot the deck top and soffit, then subtract.' },
      { level: 2, text: 'VSBV,1,2 renumbers: the result is volume 4, so the second cut would be VSBV,4,3. Or subtract every other selected volume at once with VSBV,1,ALL.' },
      { level: 3, text: '`BLOCK,6,12,4.5,9.5,10,15 $ BLOCK,26,32,4.5,9.5,10,15 $ VSBV,1,ALL`' },
    ],
    tags: ['block', 'vsbv', 'deck', 'tgf36'],
  },
  {
    id: 't2-c5',
    track: 't2',
    order: 5,
    title: 'Mat and eight columns',
    difficulty: 4,
    brief: `The lower half of the TGF-36 tabletop:

- base mat **38 x 14 x 3** (X 0..38, Y 0..14, Z 0..3)
- eight **2 x 3** columns, **8 m** tall, standing on the mat top. Column corners (min X, min Y):
  X **3, 13, 23, 33** and Y **1** and **10**
- move the working plane onto the mat top (**WPOFFS**) and place the columns with **BLC4**
- glue everything (**9 volumes**)

- element type 1 = **SOLID185**; material 1: EX **3E10**, PRXY **0.2**, DENS **2500**
- element size **1**, mesh all`,
    targetScript: `/PREP7
BLOCK,0,38,0,14,0,3
WPOFFS,0,0,3
*DO,I,1,4
BLC4,3+(I-1)*10,1,2,3,8
BLC4,3+(I-1)*10,10,2,3,8
*ENDDO
WPOFFS,0,0,-3
VGLUE,ALL
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,1
VMESH,ALL`,
    solution: `/PREP7
BLOC,0,38,0,14,0,3
WPOF,,,3 $ BLC4,3,1,2,3,8 $ BLC4,3,10,2,3,8
VGEN,4,2,3,,10
VGLU,ALL
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZ,1 $ VMES,ALL`,
    parLines: 8,
    parTimeSeconds: 180,
    requiredCommands: ['WPOFFS', 'BLC4', 'VGLUE'],
    hints: [
      { level: 1, text: 'Lift the working plane by the mat thickness, type the first pair of columns, copy the pair along X, glue.' },
      { level: 2, text: 'WPOFFS,,,3 then BLC4,XCORNER,YCORNER,WIDTH,HEIGHT,DEPTH with DEPTH = 8. VGEN,ITIME,NV1,NV2,NINC,DX copies volumes 2-3 four times (original included).' },
      { level: 3, text: '`WPOFFS,,,3 $ BLC4,3,1,2,3,8 $ BLC4,3,10,2,3,8` then `VGEN,4,2,3,,10` and `VGLUE,ALL`' },
    ],
    tags: ['wpoffs', 'blc4', 'vgen', 'vglue', 'S6', 'tgf36'],
  },
];
