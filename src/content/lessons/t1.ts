// Track t1 lessons: bottom-up modelling (keypoints -> lines -> areas -> volumes).
import type { Lesson } from '../types';

export const lessons: Lesson[] = [
  {
    id: 't1-l1',
    track: 't1',
    order: 1,
    title: 'Eight keypoints, one volume',
    explanation: `## Keypoints first

\`K,NPT,X,Y,Z\` places a keypoint. Leave NPT blank (\`K,,x,y,z\`) and ANSYS takes the **lowest free number**.
Blank coordinates are zero, so \`K,4,,3\` is (0,3,0) and \`K,1\` is the origin: fewer keystrokes.

\`V,P1,P2,P3,P4,P5,P6,P7,P8\` builds a brick: the four bottom keypoints **in order around the face**, then the
four top keypoints in the same order. V creates the 12 lines and 6 areas for you.

## Type one face, copy the other

- \`KGEN,ITIME,NP1,NP2,NINC,DX,DY,DZ,KINC\`: ITIME **includes the original**, so \`KGEN,2,...\` makes one copy.
- With KINC blank the copies take the next free numbers: copying 1-4 gives 5-8, exactly the order V wants.
- A grid is two KGENs: \`KGEN,5,1,,,8\` makes a row of five, \`KGEN,3,1,5,,,6\` copies the row twice.

## Typical mistakes

- Crossing the order (1,2,4,3) gives a twisted, self-intersecting volume.
- \`KGEN,1,...\` copies nothing: one "time" is the original.
- Putting DX in the NINC slot. The fields are NP1, NP2, **NINC**, then DX: count the commas.
- Referring to a keypoint KGEN numbered differently: \`Keypoint 17 is undefined.\` Turn on \`/PNUM,KP,1\` and \`KPLOT\`.`,
    workedExample: {
      script: `/PREP7
! bottom face of a 5 x 4 x 1.5 bearing plinth
K,1 $ K,2,5 $ K,3,5,4 $ K,4,,4
KGEN,2,1,4,,,,1.5      ! copy 1-4 up 1.5 m -> keypoints 5-8
V,1,2,3,4,5,6,7,8      ! bottom loop, then top loop in the same order
/PNUM,KP,1
VPLOT`,
      commentary: 'One line for the bottom face, one KGEN for the top, one V. Because KINC is blank the copies are numbered 5 to 8, so V can be typed without looking at a plot.',
    },
    challengeIds: ['t1-c1', 't1-c2'],
  },
  {
    id: 't1-l2',
    track: 't1',
    order: 2,
    title: 'Shared faces and VGEN copies',
    explanation: `## Volumes that share keypoints share faces

When two V commands use the same four keypoints for a face, the face is created **once** and used by both
volumes. The mesh then has a single set of nodes on it: conforming, no glue needed.

- Split an L-shape into two bricks and reuse the keypoints on the joint face.
- V looks for an existing area through the same keypoints before making a new one.

## Copy whole volumes

\`VGEN,ITIME,NV1,NV2,NINC,DX,DY,DZ\` copies volumes together with their keypoints, lines and areas.
A row of four columns at 10 m is \`VGEN,4,1,,,10\`; \`VGEN,2,1,4,,,9\` then copies the whole row.
Blank NV2 means "just NV1", blank NINC means 1.

## xGEN copies do not merge

Copies always get **new** keypoints, even when they land on existing ones. Two bricks stacked with VGEN
touch but are not connected, and the mesh gets duplicate nodes on the interface.

- \`NUMMRG,KP\` merges coincident keypoints (the lower number survives) and with them the lines and areas.
- Do it **before** meshing; it is one line and saves a VGLUE.`,
    workedExample: {
      script: `/PREP7
! one 4 x 3 x 2 lift, copied once upwards
K,1 $ K,2,4 $ K,3,4,3 $ K,4,,3
KGEN,2,1,4,,,,2
V,1,2,3,4,5,6,7,8
VGEN,2,1,,,,,2         ! second lift on top (new keypoints 9-16)
NUMMRG,KP              ! merge the 4 coincident keypoints -> shared face
ET,1,SOLID185
ESIZE,1
VMESH,ALL              ! 100 nodes, not 120: the interface is shared`,
      commentary: 'Without NUMMRG,KP the two lifts would each carry their own nodes on the joint. Merging keypoints merges the coincident face as well, so the mesh is continuous.',
    },
    challengeIds: ['t1-c3', 't1-c4'],
  },
  {
    id: 't1-l3',
    track: 't1',
    order: 3,
    title: 'Lines, arcs and areas',
    explanation: `## When the outline is not a rectangle

- \`L,P1,P2\` draws a straight line between two keypoints.
- \`LARC,P1,P2,PC,RAD\` draws an arc of radius RAD from P1 to P2. PC is any keypoint on the side where the
  **centre** lies; it also fixes the plane of the arc.
- \`AL,L1,L2,...\` builds an area from a closed loop of lines; \`AL,ALL\` takes every selected line.
- \`A,P1,P2,...\` builds an area through keypoints and **reuses** any existing line, straight or arc,
  between consecutive keypoints.

## Speed tricks

- Build all the keypoints on one \`$\`-joined line, then all the lines, then \`AL,ALL\`.
- A semicircle is ambiguous for LARC: split it into two quarter arcs with a keypoint at the apex, and use
  the arc centre as PC.
- \`AGEN,ITIME,NA1,NA2,NINC,DX,DY,DZ\` copies finished areas; ITIME counts the original, as in KGEN.

## Typical mistakes

- A gap in the loop: lines must meet at shared keypoints, not just at the same coordinates.
- PC on the wrong side flips the arc, so a convex nose becomes a notch. The area total gives it away.`,
    workedExample: {
      script: `/PREP7
! 3 x 2 seat outline with a R1 rounded corner at (3,2)
K,1 $ K,2,3 $ K,3,3,1 $ K,4,2,2 $ K,5,,2 $ K,6,2,1   ! 6 = arc centre
L,1,2 $ L,2,3
LARC,3,4,6,1           ! from 3 to 4, centre side given by keypoint 6
L,4,5 $ L,5,1
AL,ALL                 ! closed loop of 5 lines -> area 1
/PNUM,LINE,1
APLOT`,
      commentary: 'The arc centre doubles as the PC keypoint, so there is never any doubt about which way the arc bulges. AL,ALL avoids typing line numbers.',
    },
    challengeIds: ['t1-c5'],
  },
];
