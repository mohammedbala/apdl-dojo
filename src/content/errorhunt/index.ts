// Error-hunt puzzles: realistic broken scripts with planted bugs. Win = zero diagnostics and a grader match
// against targetScript. bugs[].line is the 1-based line in brokenScript where the fix goes.
import type { ErrorHunt } from '../types';

export const errorHunts: ErrorHunt[] = [
  {
    id: 'eh-1',
    title: 'The column that never got built',
    difficulty: 1,
    brokenScript: `! S1 column: 2 x 3 x 8 concrete, mapped hexes at 1 m
BLOCK,0,2,0,3,0,8
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
VMESH,ALL
ESIZE,1
NSEL,S,LOC,Z,0
D,ALL,ALL
ALLSEL`,
    targetScript: `! S1 column: 2 x 3 x 8 concrete, mapped hexes at 1 m
/PREP7
BLOCK,0,2,0,3,0,8
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
ESIZE,1
VMESH,ALL
NSEL,S,LOC,Z,0
D,ALL,ALL
ALLSEL`,
    bugs: [
      { line: 2, kind: 'missing-processor', hint: '"BLOCK is not a recognized BEGIN command": modelling commands only work inside the preprocessor. Start with /PREP7.' },
      { line: 6, kind: 'command-order', hint: 'The mesh is made with whatever size is set at the time of VMESH. ESIZE has to come first.' },
    ],
    parTimeSeconds: 60,
  },
  {
    id: 'eh-2',
    title: 'BLOCK is not BLC4',
    difficulty: 1,
    brokenScript: `/PREP7
BLOCK,0,18,0,6,0,2            ! footing 18 x 6 x 2
WPOFFS,0,0,2                  ! WP on top of the footing
BLC4,3,1.5,2,3,8              ! pier 1: corner (3,1.5), 2 x 3, 8 m tall
BLOCK,13,2,1.5,3,0,8          ! pier 2: corner (13,1.5), 2 x 3, 8 m tall
WPOFFS,0,0,-2
VGLUE,ALL
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,1
VMESH,ALL`,
    targetScript: `/PREP7
BLOCK,0,18,0,6,0,2            ! footing 18 x 6 x 2
WPOFFS,0,0,2                  ! WP on top of the footing
BLC4,3,1.5,2,3,8              ! pier 1: corner (3,1.5), 2 x 3, 8 m tall
BLOCK,13,15,1.5,4.5,0,8       ! pier 2: corner (13,1.5), 2 x 3, 8 m tall
WPOFFS,0,0,-2
VGLUE,ALL
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,1
VMESH,ALL`,
    bugs: [
      { line: 5, kind: 'wrong-arguments', hint: 'BLOCK takes coordinate ranges X1,X2,Y1,Y2,Z1,Z2, not corner + size. This pier spans x 2..13 and runs through pier 1, hence the overlap error at VGLUE.' },
    ],
    parTimeSeconds: 90,
  },
  {
    id: 'eh-3',
    title: 'Glue that will not stick',
    difficulty: 2,
    brokenScript: `/PREP7
! one bent of TGF-36: mat strip, two columns (z 3..11), cross-beam
BLOCK,0,8,0,14,0,3
BLOCK,3,5,1,4,0,11
BLOCK,3,5,10,13,3,11
BLOCK,1,7,1,13,11,14
VGLUE,ALL
ET,1,SOLID185
MP,EX,1,3E9                   ! concrete, E = 30 GPa
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,1
VMESH,ALL
NSEL,S,LOC,Z,0
D,ALL,ALL
ALLSEL`,
    targetScript: `/PREP7
! one bent of TGF-36: mat strip, two columns (z 3..11), cross-beam
BLOCK,0,8,0,14,0,3
BLOCK,3,5,1,4,3,11
BLOCK,3,5,10,13,3,11
BLOCK,1,7,1,13,11,14
VGLUE,ALL
ET,1,SOLID185
MP,EX,1,3E10                  ! concrete, E = 30 GPa
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,1
VMESH,ALL
NSEL,S,LOC,Z,0
D,ALL,ALL
ALLSEL`,
    bugs: [
      { line: 4, kind: 'overlap', hint: '"Volumes 1 and 2 overlap. Use VOVLAP or VPTN instead of VGLUE": the first column starts at z = 0 inside the mat. Columns sit on the mat, z 3..11.' },
      { line: 9, kind: 'wrong-value', hint: '30 GPa is 3E10 Pa, not 3E9. Check the material row of the checklist.' },
    ],
    parTimeSeconds: 120,
  },
  {
    id: 'eh-4',
    title: 'Meshing without an element type',
    difficulty: 1,
    brokenScript: `/PREP7
BLOCK,0,4,0,3,0,2             ! machine plinth
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
NSEL,S,LOC,Z,0                ! fix the base
D,ALL,ALL
ALLSEL
ESIZE,0.5
VMESH,ALL
ET,1,SOLID185`,
    targetScript: `/PREP7
BLOCK,0,4,0,3,0,2             ! machine plinth
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,0.5
VMESH,ALL
NSEL,S,LOC,Z,0                ! fix the base
D,ALL,ALL
ALLSEL`,
    bugs: [
      { line: 7, kind: 'command-order', hint: '"D: no nodes selected; nothing applied": there are no nodes before the mesh exists. Constrain after VMESH.' },
      { line: 10, kind: 'missing-definition', hint: '"Element type 1 is not defined. Define it with ET before meshing": ET belongs before VMESH.' },
    ],
    parTimeSeconds: 75,
  },
  {
    id: 'eh-5',
    title: 'The loop that never closed',
    difficulty: 2,
    brokenScript: `/PREP7
! TGF-36 columns: 8 x (2 x 3), z 3..11, centres x = 4,14,24,34
COL_X0 = 4
COL_SP = 10
WPOFFS,0,0,3
*DO,I,1,4
  XC = COL_X0+(I-1)*COLSP
  BLC4,XC-1,1,2,3,8
  BLC4,XC-1,10,2,3,8
WPOFFS,0,0,-3`,
    targetScript: `/PREP7
! TGF-36 columns: 8 x (2 x 3), z 3..11, centres x = 4,14,24,34
COL_X0 = 4
COL_SP = 10
WPOFFS,0,0,3
*DO,I,1,4
  XC = COL_X0+(I-1)*COL_SP
  BLC4,XC-1,1,2,3,8
  BLC4,XC-1,10,2,3,8
*ENDDO
WPOFFS,0,0,-3`,
    bugs: [
      { line: 7, kind: 'undefined-parameter', hint: '"Parameter COLSP is not defined. A value of zero will be used": a typo for COL_SP, so every column lands at x = 4.' },
      { line: 10, kind: 'unterminated-loop', hint: '"*DO on line 6 has no matching *ENDDO": close the loop before resetting the working plane, otherwise the WPOFFS runs inside it.' },
    ],
    parTimeSeconds: 90,
  },
  {
    id: 'eh-6',
    title: 'Subtracting a volume that is gone',
    difficulty: 2,
    brokenScript: `/PREP7
BLOCK,1,37,1,13,11,14              ! TGF-36 deck = volume 1
BLOCK,6,12,4.5,9.5,10,15           ! opening 1 tool = volume 2
BLOCK,26,32,4.5,9.5,10,11          ! opening 2 tool = volume 3
VSBV,1,2                           ! deck minus opening 1
VSBV,1,3                           ! deck minus opening 2
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,1
VMESH,ALL`,
    targetScript: `/PREP7
BLOCK,1,37,1,13,11,14              ! TGF-36 deck = volume 1
BLOCK,6,12,4.5,9.5,10,15           ! opening 1 tool = volume 2
BLOCK,26,32,4.5,9.5,10,15          ! opening 2 tool = volume 3
VSBV,1,2                           ! deck minus opening 1 -> volume 4
VSBV,4,3                           ! deck minus opening 2
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,1
VMESH,ALL`,
    bugs: [
      { line: 4, kind: 'wrong-geometry', hint: 'The second tool stops at z = 11, the deck soffit, so it only touches the deck: "the subtracted volume(s) do not intersect". Tools must overshoot the deck, z 10..15 like the first one.' },
      { line: 6, kind: 'renumbering', hint: '"Volume 1 is undefined": VSBV deletes its inputs and the result gets a new number (4, because 1–3 still existed when it was made). Subtract from volume 4.' },
    ],
    parTimeSeconds: 120,
  },
  {
    id: 'eh-7',
    title: 'Portal frame that fails the model check',
    difficulty: 3,
    brokenScript: `/PREP7
! BEAM188 portal: two 6 m columns at x = 0 and 10, beam at z = 6, 0.5 x 0.5 section
ET,1,BEAM188
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
K,1,0,0,0 $ K,2,0,0,6 $ K,3,10,0,6 $ K,4,10,0,0
L,1,2 $ L,2,3 $ L,3,4
LESIZE,ALL,0.5
LMESH,ALL
NSEL,S,LOC,Z,0
D,ALL,ALL                          ! fixed column bases
F,NODE(5,0,6),FZ,-100E3            ! 100 kN at mid-span
FINISH
/SOLU
SOLVE`,
    targetScript: `/PREP7
! BEAM188 portal: two 6 m columns at x = 0 and 10, beam at z = 6, 0.5 x 0.5 section
ET,1,BEAM188
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
SECTYPE,1,BEAM,RECT
SECDATA,0.5,0.5
K,1,0,0,0 $ K,2,0,0,6 $ K,3,10,0,6 $ K,4,10,0,0
L,1,2 $ L,2,3 $ L,3,4
LESIZE,ALL,0.5
LMESH,ALL
NSEL,S,LOC,Z,0
D,ALL,ALL                          ! fixed column bases
ALLSEL
F,NODE(5,0,6),FZ,-100E3            ! 100 kN at mid-span
FINISH
/SOLU
SOLVE`,
    bugs: [
      { line: 7, kind: 'missing-section', hint: '"Section 1 (used by element 1, BEAM188) is not defined. Use SECTYPE/SECDATA": BEAM188 needs a cross-section before the run. Define SECTYPE,1,BEAM,RECT and SECDATA,B,H.' },
      { line: 13, kind: 'missing-allsel', hint: 'After NSEL for the bases only base nodes are selected, so NODE(5,0,6) returns a base node and the load lands on a support. ALLSEL first.' },
    ],
    parTimeSeconds: 180,
  },
  {
    id: 'eh-8',
    title: 'Spring chain with missing nodes',
    difficulty: 3,
    brokenScript: `/PREP7
! S10: 4 storeys of COMBIN14 (UZ) + MASS21, nodes 1..5 at 1 m, base fixed
ET,1,COMBIN14
KEYOPT,1,2,3
ET,2,MASS21
KEYOPT,2,3,2
R,1,5E7                            ! storey stiffness, N/m
R,2,20E3                           ! storey mass, kg
N,1,0,0,0
NGEN,4,1,1,1,1,0,0,1
TYPE,1 $ REAL,1
E,1,2
EGEN,4,1,1
TYPE,2 $ REAL,1
E,2
EGEN,4,1,5
D,1,ALL`,
    targetScript: `/PREP7
! S10: 4 storeys of COMBIN14 (UZ) + MASS21, nodes 1..5 at 1 m, base fixed
ET,1,COMBIN14
KEYOPT,1,2,3
ET,2,MASS21
KEYOPT,2,3,2
R,1,5E7                            ! storey stiffness, N/m
R,2,20E3                           ! storey mass, kg
N,1,0,0,0
NGEN,5,1,1,1,1,0,0,1
TYPE,1 $ REAL,1
E,1,2
EGEN,4,1,1
TYPE,2 $ REAL,2
E,2
EGEN,4,1,5
D,1,ALL`,
    bugs: [
      { line: 10, kind: 'wrong-count', hint: 'NGEN ITIME counts the original: 4 gives nodes 1..4 only. Five nodes need NGEN,5,…, which is why EGEN reports elements "not generated because their nodes … do not exist" and the mass EGEN finds no element 5.' },
      { line: 14, kind: 'wrong-real', hint: 'The masses use REAL,1 (the 5E7 spring stiffness) instead of real set 2, so each storey weighs 50 000 t. Check the point-mass row.' },
    ],
    parTimeSeconds: 180,
  },
];
