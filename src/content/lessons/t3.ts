// Track t3 lessons: extrude (VEXT, VOFFST), rotate (VROTAT) and drag (VDRAG) areas into volumes.
import type { Lesson } from '../types';

export const lessons: Lesson[] = [
  {
    id: 't3-l1',
    track: 't3',
    order: 1,
    title: 'Extrude the plan: VEXT and VOFFST',
    explanation: `## Draw the plan, then give it thickness

Most foundation parts are a plan shape with a depth. Draw the plan as areas (\`RECTNG\`, \`CYL4\` with no
depth, \`PCIRC\`, area Booleans), then sweep it:

- \`VEXT,NA1,NA2,NINC,DX,DY,DZ\` extrudes areas by an **offset vector**. \`VEXT,ALL,,,,,8\` lifts every
  selected area 8 m up.
- \`VOFFST,NAREA,DIST\` extrudes one area along its **normal**. RECTNG areas face +Z, so a positive DIST
  goes up and a negative DIST goes down.
- \`AGEN,ITIME,NA1,NA2,NINC,DX,DY,DZ\` copies footprints first: two typed areas become eight.

## Mind the field count

\`VEXT,1,,,8\` puts 8 in **DX**: after NA1 come NA2 and NINC, then DX, DY, DZ. For a vertical
extrusion type five commas: \`VEXT,1,,,,,8\`.

## Order matters

VEXT acts on every area you name. After one extrusion the side and top faces exist too, so a
second \`VEXT,ALL\` would extrude those as well. Extrude once at the end, or select first
(\`ASEL,S,LOC,Z,0\`).

Holes: \`ASBA,1,2\` subtracts area 2 from area 1 **before** extruding. The result is renumbered (area 3 here).
Swept volumes mesh as clean layers of bricks and wedges.`,
    workedExample: {
      script: `/PREP7
RECTNG,0,2,0,2           ! 2 x 2 pier footprint
AGEN,3,1,,,5             ! two copies at 5 m -> areas 1-3
VEXT,ALL,,,,,6           ! all three up 6 m (DX, DY blank)
RECTNG,0,12,-2,4         ! cap plan, new area
*GET,AC,AREA,0,NUM,MAX
VOFFST,AC,-1.5           ! cap extruded DOWN along -normal
/PNUM,VOLU,1
VPLOT`,
      commentary: 'The piers are extruded while they are the only areas in the model, so VEXT,ALL is safe. The cap is offset with a negative distance because RECTNG areas face +Z.',
    },
    challengeIds: ['t3-c1', 't3-c2'],
  },
  {
    id: 't3-l2',
    track: 't3',
    order: 2,
    title: 'Revolve a section: VROTAT',
    explanation: `## Spin areas about an axis

\`VROTAT,NA1,NA2,NA3,NA4,NA5,NA6,PAX1,PAX2,ARC,NSEG\` revolves areas about the axis through keypoints
PAX1 and PAX2.

- The **six area slots come first**. With one area that means six commas before the axis:
  \`VROTAT,1,,,,,,5,6,360,4\`.
- ARC defaults to 360°. NSEG defaults to one segment per 90°, and each segment is its **own volume**:
  a full revolve gives 4 volumes, as in ANSYS.
- The axis keypoints usually do not exist yet: \`K,5 $ K,6,,1\` defines the global Y axis in one line.

## Where it pays off

Drums, ring footings, circular pedestals, tank walls, chimney bases: the section is a rectangle read
straight off the drawing, and the curved geometry comes for free.

## Typical mistakes

- Axis keypoints typed in field 2: \`VROTAT,1,5,6\` reads 5 and 6 as **areas**, giving
  \`Area 5 is undefined.\`
- An axis through the middle of the section: the revolved volume overlaps itself. Keep the section
  entirely on one side of the axis.
- Reusing a RECTNG corner number for the axis: \`K,1\` after a RECTNG gives
  \`Keypoint 1 is attached to a line and cannot be redefined.  Use KMODIF to move it.\` Use free
  numbers (5 and 6) or \`K,,x,y,z\`.`,
    workedExample: {
      script: `/PREP7
RECTNG,2,2.4,0,1.5       ! wall section of a circular tank, 0.4 thick, 1.5 high
K,5 $ K,6,,1             ! axis = global Y
VROTAT,1,,,,,,5,6,180,2  ! half ring, two 90 degree volumes
/PNUM,VOLU,1
VPLOT`,
      commentary: 'The section sits 2 m from the axis, so the ring has an inner radius of 2. Half a revolution with NSEG = 2 gives two quarter-ring volumes.',
    },
    challengeIds: ['t3-c3'],
  },
  {
    id: 't3-l3',
    track: 't3',
    order: 3,
    title: 'Drag along a path: VDRAG',
    explanation: `## Section plus path

\`VDRAG,NA1,...,NA6,NLP1,...,NLP6\` sweeps areas along a chain of path lines. As in VROTAT the **six
area slots come first**: the first path line is field 8, \`VDRAG,1,,,,,,5\`.

- The path can be straight (\`L\`) or curved (\`LARC\`). Several connected lines can be given in NLP1..NLP6.
- The section is carried along the path and turned with it, so a section drawn square to the start of an
  arc stays square to the arc all the way round.
- Draw the section **at the start of the path**, in the plane normal to it. For a path along X the
  section lives in the YZ plane, so all its keypoints have x = 0.

## Building the section

- Keypoints and \`A\`: \`K,1,,-.2 $ K,2,,.2 ...\` then \`A,1,2,...\`. Fastest for T, L and I shapes.
- Or rotate the working plane (\`WPROTA\`) and use \`RECTNG\` pieces plus \`AADD\`.

## Typical mistakes

- Path field off by one: \`VDRAG,1,,,,,5\` (five commas) reads 5 as an area. Count six.
- \`VDRAG needs at least one path line (field 8).\` means the path landed in an area slot or was blank.
- A path line that does not start at the section: the sweep still follows the path shape, but
  starting from wherever the section is, so the volume ends up offset.`,
    workedExample: {
      script: `/PREP7
! 0.6 x 0.8 kerb section in the YZ plane at x = 0
K,1,,0,0 $ K,2,,0.6,0 $ K,3,,0.6,0.8 $ K,4,,0,0.8
A,1,2,3,4
K,5,10                   ! path end
L,1,5                    ! straight path along +X from the section corner
VDRAG,1,,,,,,5           ! six area slots, then the path line
VPLOT`,
      commentary: 'The path starts at a corner of the section, so the kerb runs from x = 0 to x = 10. The same section could follow an arc by swapping L for LARC.',
    },
    challengeIds: ['t3-c4', 't3-c5'],
  },
];
