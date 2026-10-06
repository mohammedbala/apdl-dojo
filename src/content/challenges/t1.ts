// Track t1 challenges: bottom-up modelling. Primitives and sweeps are forbidden by the track default.
import type { Challenge } from '../types';

export const challenges: Challenge[] = [
  {
    id: 't1-c1',
    track: 't1',
    order: 1,
    title: 'Pedestal from eight keypoints',
    difficulty: 1,
    brief: `A concrete bearing pedestal, **4 x 3 x {{H}}** (X 0..4, Y 0..3, Z 0..{{H}}), built bottom-up:
8 keypoints and **one V**.

- element type 1 = **SOLID185**, material 1: EX = **30E9**
- global element size **0.5**, mesh the volume`,
    params: { H: { min: 1, max: 3, step: 0.5 } },
    targetScript: `/PREP7
K,1,0,0,0
K,2,4,0,0
K,3,4,3,0
K,4,0,3,0
K,5,0,0,H
K,6,4,0,H
K,7,4,3,H
K,8,0,3,H
V,1,2,3,4,5,6,7,8
ET,1,SOLID185
MP,EX,1,30E9
ESIZE,0.5
VMESH,ALL`,
    solution: `/PREP7
K,1 $ K,2,4 $ K,3,4,3 $ K,4,,3
KGEN,2,1,4,,,,2
V,1,2,3,4,5,6,7,8
ET,1,SOLID185 $ MP,EX,1,30E9
ESIZ,0.5 $ VMES,ALL`,
    parLines: 6,
    parTimeSeconds: 75,
    hints: [
      { level: 1, text: 'Type the four bottom corners, copy them straight up, then join all eight with V: bottom loop first, top loop in the same order.' },
      { level: 2, text: 'KGEN,ITIME,NP1,NP2,NINC,DX,DY,DZ: ITIME = 2 (the original counts), NP1..NP2 = 1..4, DZ = {{H}}. The copies become keypoints 5-8.' },
      { level: 3, text: '`K,1 $ K,2,4 $ K,3,4,3 $ K,4,,3` then `KGEN,2,1,4,,,,{{H}}` then `V,1,2,3,4,5,6,7,8`' },
    ],
    tags: ['daily', 'keypoints', 'kgen', 'pedestal'],
  },
  {
    id: 't1-c2',
    track: 't1',
    order: 2,
    title: 'Column grid set-out',
    difficulty: 2,
    brief: `Set out the column grid of a turbine hall as keypoints at **z = 0**:

- **5** grid lines in X at **{{SX}} m** spacing, the first at x = 0
- **3** grid lines in Y at **{{SY}} m** spacing, the first at y = 0
- **15 keypoints**, nothing else (no lines, no mesh)`,
    params: { SX: { min: 6, max: 10, step: 1 }, SY: { min: 5, max: 7, step: 0.5 } },
    targetScript: `/PREP7
*DO,J,1,3
*DO,I,1,5
K,,(I-1)*SX,(J-1)*SY,0
*ENDDO
*ENDDO`,
    solution: `/PREP7
K,1
KGEN,5,1,,,8
KGEN,3,1,5,,,6`,
    parLines: 4,
    parTimeSeconds: 45,
    hints: [
      { level: 1, text: 'One keypoint becomes a row of five, and the row becomes the grid: two copy commands.' },
      { level: 2, text: 'KGEN,ITIME,NP1,NP2,NINC,DX,DY: a blank NP2 means just NP1. ITIME counts the original, so a row of 5 is ITIME = 5.' },
      { level: 3, text: '`K,1 $ KGEN,5,1,,,{{SX}} $ KGEN,3,1,5,,,{{SY}}`' },
    ],
    tags: ['daily', 'kgen', 'grid', 'S7'],
  },
  {
    id: 't1-c3',
    track: 't1',
    order: 3,
    title: 'L-shaped plinth, two bricks',
    difficulty: 2,
    brief: `An L-shaped machine plinth, **1.5 m** thick (Z 0..1.5), split into two bricks:

- leg A: X 0..6, Y 0..2
- leg B: X 0..2, Y 2..5

The two volumes must **share the keypoints of the joint face** (Y = 2, X 0..2) so the mesh is conforming
without a glue.

- element type 1 = **SOLID185**, element size **0.5**, mesh both volumes`,
    targetScript: `/PREP7
K,1,0,0,0
K,2,6,0,0
K,3,6,2,0
K,4,2,2,0
K,5,0,2,0
K,6,2,5,0
K,7,0,5,0
KGEN,2,1,7,1,0,0,1.5
V,1,2,3,5,8,9,10,12
V,5,4,6,7,12,11,13,14
ET,1,SOLID185
ESIZE,0.5
VMESH,ALL`,
    solution: `/PREP7
K,1 $ K,2,6 $ K,3,6,2 $ K,4,2,2 $ K,5,,2 $ K,6,2,5 $ K,7,,5
KGEN,2,1,7,,,,1.5
V,1,2,3,5,8,9,10,12
V,5,4,6,7,12,11,13,14
ET,1,SOLID185 $ ESIZ,0.5 $ VMES,ALL`,
    parLines: 7,
    parTimeSeconds: 120,
    hints: [
      { level: 1, text: 'Lay out all seven plan corners (including the re-entrant one and the point where the joint meets the outer edge), copy them up, then make two V commands that reuse the joint keypoints.' },
      { level: 2, text: 'With 7 base keypoints, KGEN,2,1,7,,,,1.5 numbers the top layer 8-14 (n + 7). Leg A runs 1,2,3,5 at the bottom; leg B runs 5,4,6,7.' },
      { level: 3, text: '`V,1,2,3,5,8,9,10,12` and `V,5,4,6,7,12,11,13,14`' },
    ],
    tags: ['keypoints', 'v', 'conforming'],
  },
  {
    id: 't1-c4',
    track: 't1',
    order: 4,
    title: 'Eight columns by VGEN',
    difficulty: 3,
    brief: `The eight columns of the TGF-36 tabletop, standing on the mat top (**z = 3**) up to the deck soffit
(**z = 11**). Each column is **2 x 3** in plan (X x Y).

| | column centres |
|---|---|
| X | **4, 14, 24, 34** |
| Y | **2.5** and **11.5** |

Build one column bottom-up and copy it.

- element type 1 = **SOLID185**; material 1: EX **30E9**, PRXY **0.2**
- element size **1**, mesh all 8 volumes`,
    targetScript: `/PREP7
K,1,3,1,3
K,2,5,1,3
K,3,5,4,3
K,4,3,4,3
KGEN,2,1,4,1,0,0,8
V,1,2,3,4,5,6,7,8
VGEN,4,1,1,1,10
VGEN,2,1,4,1,0,9
ET,1,SOLID185
MP,EX,1,30E9
MP,PRXY,1,0.2
ESIZE,1
VMESH,ALL`,
    solution: `/PREP7
K,1,3,1,3 $ K,2,5,1,3 $ K,3,5,4,3 $ K,4,3,4,3
KGEN,2,1,4,,,,8
V,1,2,3,4,5,6,7,8
VGEN,4,1,,,10 $ VGEN,2,1,4,,,9
ET,1,SOLID185 $ MP,EX,1,30E9 $ MP,PRXY,1,0.2
ESIZ,1 $ VMES,ALL`,
    parLines: 8,
    parTimeSeconds: 150,
    hints: [
      { level: 1, text: 'Only the first column needs keypoints. Copy the volume along X to make a row, then copy the row across in Y.' },
      { level: 2, text: 'VGEN,ITIME,NV1,NV2,NINC,DX,DY,DZ. Row: ITIME 4, DX 10. Second row: copy volumes 1-4 with DY 9.' },
      { level: 3, text: '`VGEN,4,1,,,10 $ VGEN,2,1,4,,,9`' },
    ],
    tags: ['vgen', 'columns', 'tgf36'],
  },
  {
    id: 't1-c5',
    track: 't1',
    order: 5,
    title: 'Rounded bearing plinth outlines',
    difficulty: 4,
    brief: `Plan outline (at **z = 0**) of a bearing plinth with a rounded nose:

- straight part **X 0..4, Y 0..2**
- semicircular nose of radius **1** centred at **(4, 1)**, bulging towards +X

Build the area from lines (two **LARC** quarter arcs for the nose), then copy it **6 m in +Y** for the
second plinth. Result: **2 areas**, about **19.14 m²** in total. Geometry only, no mesh.`,
    targetScript: `/PREP7
K,1,0,0,0
K,2,4,0,0
K,3,4,2,0
K,4,0,2,0
K,5,5,1,0
K,6,4,1,0
L,1,2
LARC,2,5,6,1
LARC,5,3,6,1
L,3,4
L,4,1
AL,1,2,3,4,5
AGEN,2,1,,,0,6`,
    solution: `/PREP7
K,1 $ K,2,4 $ K,3,4,2 $ K,4,,2 $ K,5,5,1 $ K,6,4,1
L,1,2 $ LARC,2,5,6,1 $ LARC,5,3,6,1 $ L,3,4 $ L,4,1
AL,ALL
AGEN,2,1,,,,6`,
    parLines: 6,
    parTimeSeconds: 150,
    hints: [
      { level: 1, text: 'Put a keypoint at the tip of the nose (5,1) and one at the arc centre (4,1). The outline is then 3 straight lines and 2 quarter arcs.' },
      { level: 2, text: 'LARC,P1,P2,PC,RAD: PC is a keypoint on the centre side, so use the centre keypoint itself. AL,ALL closes the loop; AGEN,ITIME,NA1,NA2,NINC,DX,DY copies it.' },
      { level: 3, text: '`L,1,2 $ LARC,2,5,6,1 $ LARC,5,3,6,1 $ L,3,4 $ L,4,1` then `AL,ALL` and `AGEN,2,1,,,,6`' },
    ],
    tags: ['larc', 'al', 'agen', 'areas'],
  },
];
