// Track t5 lessons: element types, sections, materials, real constants and attribute assignment.
import type { Lesson } from '../types';

export const lessons: Lesson[] = [
  {
    id: 't5-l1',
    track: 't5',
    order: 1,
    title: 'Beams: ET, SECTYPE and LATT',
    explanation: `## Attributes before the mesh

A beam mesh needs four things set **before** LMESH: the element type (\`ET,1,BEAM188\`), a material
(\`MP,EX,1,...\`), a section (\`SECTYPE,1,BEAM,RECT\` then \`SECDATA,B,H\`) and line divisions (\`LESIZE\`).

- RECT is **B, H**: B is the width along the element y axis, H the depth along z. A 0.4 wide x 0.8 deep
  steel bar is \`SECDATA,0.4,0.8\`.
- \`LESIZE,NL1,SIZE,ANGSIZ,NDIV\`: a division count goes in the **4th** field (\`LESIZE,1,,,16\`), an element
  length in the 2nd (\`LESIZE,ALL,1\`).

## Several sections: LATT

\`LATT,MAT,REAL,TYPE,ESYS,KB,KE,SECNUM\` stores attributes on the selected lines. SECNUM is the
**7th** field: \`LATT,1,,1,,,,2\` is material 1, type 1, section 2.

- Select, LATT, select, LATT, \`ALLSEL\`, then a single \`LMESH,ALL\`.
- Lines without LATT mesh with the active TYPE, MAT and SECNUM.

## Supports on beam models

With beam elements defined, \`D,...,ALL\` fixes all six DOFs (UX to ROTZ). \`NODE(x,y,z)\` returns the
selected node nearest to a point, so \`D,NODE(0,0,0),ALL\` fixes a cantilever root in one command.

Typical error: \`SECDATA must follow a SECTYPE command.\` means the SECTYPE line was skipped or misspelt.`,
    workedExample: {
      script: `/PREP7
ET,1,BEAM188
MP,EX,1,2.1E11 $ MP,PRXY,1,0.3 $ MP,DENS,1,7850   ! steel
SECTYPE,1,BEAM,RECT $ SECDATA,0.3,0.6              ! section 1
SECTYPE,2,BEAM,RECT $ SECDATA,0.3,0.4              ! section 2
K,1 $ K,2,6 $ K,3,6,4
L,1,2 $ L,2,3
LSEL,S,LOC,Y,2 $ LATT,1,,1,,,,2 $ ALLSEL           ! line 2 gets section 2
LESIZE,ALL,0.5
LMESH,ALL
/ESHAPE,1
EPLOT`,
      commentary: 'Line 1 has no LATT and meshes with the active section 1; line 2 is selected by its centroid (y = 2) and given section 2. /ESHAPE shows the real cross-sections.',
    },
    challengeIds: ['t5-c1', 't5-c2'],
  },
  {
    id: 't5-l2',
    track: 't5',
    order: 2,
    title: 'Shell sections and two materials',
    explanation: `## Shells: area plus section

SHELL181 meshes **areas**. Define the thickness with \`SECTYPE,1,SHELL\` and \`SECDATA,TK\`.

- \`RECTNG,X1,X2,Y1,Y2\` makes the plate, \`CYL4,XC,YC,RAD\` with no depth a circular area.
- \`ASBA,1,2\` punches the circle out; the result is a new area (3).
- \`AMESH,ALL\` meshes it. Around a hole the mesher uses a free triangular mesh, so element counts are
  graded to ±15 %.

## Two materials: VATT

Each \`MP\` belongs to a material number: \`MP,EX,2,50E6\` defines material 2. To give a volume its own
material, select it and assign before meshing:

- Glue first. VGLUE renumbers volumes, so select by location afterwards.
- \`VSEL,S,LOC,Z,-2.5\` tests the volume **centroid**: one value picks the soil block.
- \`VATT,MAT,REAL,TYPE,ESYS,SECNUM\`: \`VATT,2,,1\` is material 2, element type 1.
- Volumes without VATT use the active \`MAT\` (default 1), so only the exception needs a VATT.
- \`ALLSEL\` before VMESH, or only the selected volumes are meshed.

\`VATT: no volumes are selected.\` means the LOC test missed: the centroid is not where you expected.`,
    workedExample: {
      script: `/PREP7
ET,1,SOLID185
MP,EX,1,3E10 $ MP,PRXY,1,0.2         ! concrete
MP,EX,2,2.1E11 $ MP,PRXY,2,0.3       ! steel
BLOCK,0,2,0,2,0,1                    ! plinth
BLOCK,0.5,1.5,0.5,1.5,1,1.1          ! bearing plate on top
VGLUE,ALL
VSEL,S,LOC,Z,1.05 $ VATT,2,,1 $ ALLSEL
ESIZE,0.1
VMESH,ALL
EPLOT`,
      commentary: 'The steel plate is the only volume with its centroid at z = 1.05, so one VSEL finds it whatever number VGLUE gave it. The plinth keeps the default material 1.',
    },
    challengeIds: ['t5-c3', 't5-c4'],
  },
  {
    id: 't5-l3',
    track: 't5',
    order: 3,
    title: 'Point masses and real constants',
    explanation: `## MASS21 and its real set

MASS21 is a one-node element. \`KEYOPT,2,3,2\` makes it a 3-D mass **without rotary inertia**, so the
real set holds a single value: \`R,11,80E3\` is an 80 t mass.

- Use one real set per distinct mass. Bearings carrying 80, 150, 150 and 120 t need four \`R\` lines
  (or three if both 150 t bearings share a set).
- Real set numbers are arbitrary. 11-14 for bearings 1-4 keeps a model readable.
- Leave KEYOPT(3) at 0 and the element expects six reals (MASSX, MASSY, MASSZ, IXX, IYY, IZZ): a single
  value then gives mass in X only.

## Masses on keypoints: KMESH

\`KMESH,NP1\` puts a point element on a keypoint. When that keypoint is the end of a meshed line, the mass
**shares the line's node**, so no NUMMRG is needed.

- Set the attributes first, either active (\`TYPE,2 $ REAL,11 $ KMESH,1\`) or stored on the keypoint
  (\`KATT,MAT,REAL,TYPE\`).
- \`TYPE\` stays active afterwards. Switch back to \`TYPE,1\` before meshing more beams, or they will be
  meshed with the mass type.
- Order does not matter: LMESH before or after KMESH gives the same shared node.`,
    workedExample: {
      script: `/PREP7
ET,1,BEAM188 $ ET,2,MASS21 $ KEYOPT,2,3,2
MP,EX,1,3E10 $ MP,PRXY,1,0.2
SECTYPE,1,BEAM,RECT $ SECDATA,1,1.5
R,1,60E3                         ! 60 t
K,1 $ K,2,6 $ K,3,12
L,1,2 $ L,2,3
LESIZE,ALL,1 $ LMESH,ALL          ! TYPE 1 active
TYPE,2 $ REAL,1 $ KMESH,2         ! mass at mid-span keypoint
/PNUM,TYPE,1
EPLOT`,
      commentary: 'The mass sits on keypoint 2, which both beam lines share, so it is attached to the beam node there. The beams were meshed first, while TYPE 1 was still active.',
    },
    challengeIds: ['t5-c5'],
  },
];
