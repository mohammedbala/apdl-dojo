// Track t2 lessons: primitives (BLOCK, BLC4, CYL4) and Booleans (VGLUE, VSBV), working plane offsets.
import type { Lesson } from '../types';

export const lessons: Lesson[] = [
  {
    id: 't2-l1',
    track: 't2',
    order: 1,
    title: 'BLOCK, BLC4 and VGLUE',
    explanation: `## One command per brick

- \`BLOCK,X1,X2,Y1,Y2,Z1,Z2\` takes coordinate **ranges**.
- \`BLC4,XCORNER,YCORNER,WIDTH,HEIGHT,DEPTH\` takes a corner plus **sizes**.

Both work in the **working plane**, so with the WP at the origin \`BLC4,2,1,2,3,8\` and
\`BLOCK,2,4,1,4,0,8\` are the same column. One primitive replaces 8 keypoints, 12 lines and 6 areas.
Use whichever matches the numbers on the drawing: ranges from a setting-out plan, sizes from a schedule.

## Connect touching bricks

Two blocks that touch are still two **unconnected** volumes: the mesh would carry duplicate nodes on
the contact face. \`VGLUE,ALL\` imprints the shared face so both volumes use it.

- VGLUE **renumbers** the volumes it modifies. After a glue, select by location, not by number.
- VGLUE is for touching volumes only. Overlap gives
  \`Volumes 1 and 2 overlap.  Use VOVLAP or VPTN instead of VGLUE.\` The usual cause is a BLC4 whose
  DEPTH was measured from the WP instead of from the top of the pedestal.
- \`VADD\` fuses them into **one** volume: same shape, but you lose the separate column volume.

Speed: four letters are enough, \`BLOC\`, \`VGLU\`, \`ESIZ\`, \`VMES\`, and \`$\` puts a whole step on one line.`,
    workedExample: {
      script: `/PREP7
BLOCK,0,6,0,5,0,3        ! pedestal, ranges
BLOCK,2,4,1,4,3,6        ! column stub sitting on top (Z 3..6)
VGLUE,ALL                ! shared face imprinted, volumes renumbered
ET,1,SOLID185
ESIZE,0.5
VMESH,ALL
/PNUM,VOLU,1
VPLOT`,
      commentary: 'The stub starts exactly at the pedestal top, so the two volumes touch without overlapping and VGLUE can connect them. The mesh shares the nodes on the imprinted face.',
    },
    challengeIds: ['t2-c1', 't2-c2'],
  },
  {
    id: 't2-l2',
    track: 't2',
    order: 2,
    title: 'Cutting openings with VSBV',
    explanation: `## Subtract a tool

\`VSBV,NV1,NV2\` removes volume NV2 from NV1. Build the slab, build a **tool** where the hole goes,
subtract.

- Both inputs are deleted. The result takes the **lowest free number** at the moment it is created,
  while the inputs still exist: \`VSBV,1,2\` on a two-volume model gives volume **3**.
- Let tools **overshoot** the target (start below, end above). Coincident faces invite slivers.
- \`CYL4,XC,YC,RAD,,,,DEPTH\` is a cylinder in the working plane; its depth runs from the WP, so drop
  the WP first (\`WPOFFS,,,-1\`) for an overshooting tool.

## Several tools at once

\`VSBV,1,ALL\` subtracts every other selected volume from volume 1: two openings, one command, no
bookkeeping of the intermediate numbers. A component works too: \`CM,TOOLS,VOLU\` then \`VSBV,1,TOOLS\`.

If the tool misses the slab you get
\`VSBV: the subtracted volume(s) 2 do not intersect volume(s) 1.  No volumes were modified.\`
Check the tool coordinates against the slab extents, and remember a WPOFFS is still active.`,
    workedExample: {
      script: `/PREP7
BLOCK,0,12,0,6,0,1.2      ! slab
BLOCK,2,4,2,4,-1,2        ! opening tool, overshoots in Z
BLOCK,8,10,2,4,-1,2       ! second tool
VSBV,1,ALL                ! subtract both tools from the slab
/PNUM,VOLU,1
VPLOT`,
      commentary: 'Both tools pass right through the slab, so the subtraction leaves two clean openings. VSBV,1,ALL avoids tracking which number the first result received.',
    },
    challengeIds: ['t2-c3', 't2-c4'],
  },
  {
    id: 't2-l3',
    track: 't2',
    order: 3,
    title: 'Move the working plane',
    explanation: `## Move the plane, not the numbers

\`WPOFFS,DX,DY,DZ\` shifts the working plane **relative to where it is now**: offsets accumulate.
\`WPOFFS,,,3\` puts the WP on top of a 3 m mat, and every BLC4 that follows starts there, so the
column DEPTH is simply the column height.

- Go back with \`WPOFFS,,,-3\` before you build anything at the old level.
- BLOCK uses the WP too: its Z1, Z2 are measured from the shifted plane.
- Typing WPOFFS twice by accident leaves the columns floating 3 m too high. The bounding-box check
  (Z max) shows it at once.

## Copy instead of retyping

\`VGEN,ITIME,NV1,NV2,NINC,DX,DY,DZ\` copies volumes. Two typed columns become a 2 x 4 grid with
\`VGEN,4,2,3,,10\`, and \`VGLUE,ALL\` then connects all of them to the mat in one line.

Element counts are predictable on glued blocks: ESIZE 1 on a 38 x 14 x 3 mat gives 1596 bricks,
and each 2 x 3 x 8 column adds 48.`,
    workedExample: {
      script: `/PREP7
BLOCK,0,20,0,8,0,2        ! mat, 2 m thick
WPOFFS,,,2                ! WP onto the mat top
BLC4,3,2,2,3,5            ! column: corner, sizes, depth = height above the mat
VGEN,3,2,,,6              ! two more columns at 6 m
WPOFFS,,,-2               ! WP back to the origin
VGLUE,ALL
/PNUM,VOLU,1
VPLOT`,
      commentary: 'With the working plane on the mat top the column needs no z arithmetic at all. VGEN copies it twice, and one VGLUE connects the four volumes.',
    },
    challengeIds: ['t2-c5'],
  },
];
