// Track t4 lessons: direct generation of nodes and elements (N, NFILL, NGEN, E, EGEN).
import type { Lesson } from '../types';

export const lessons: Lesson[] = [
  {
    id: 't4-l1',
    track: 't4',
    order: 1,
    title: 'Nodes and line elements',
    explanation: `## No geometry, no mesher

For springs, masses and regular beam lines you can skip keypoints entirely and type the mesh:

- \`N,NODE,X,Y,Z\` places a node. Blank coordinates are zero: \`N,1\` is the origin.
- \`NFILL,N1,N2\` fills the gap between two existing nodes with evenly spaced nodes, numbered on from N1.
- \`NGEN,ITIME,INC,NODE1,NODE2,NINC,DX,DY,DZ\` copies a set of nodes; **INC** is the node-number offset of
  each copy, and ITIME includes the original.
- \`E,I,J\` creates an element with the **active** TYPE, MAT, REAL and SECNUM.
- \`EGEN,ITIME,NINC,IEL1\` copies elements by adding NINC to every node number. One typed element
  becomes a whole line.

## Springs and masses

- \`COMBIN14\` with \`KEYOPT,ITYPE,2,3\` is a 1-D spring in UZ (1 = UX, 2 = UY); stiffness is real 1.
- \`MASS21\` with \`KEYOPT,ITYPE,3,2\` is a 3-D mass without rotary inertia: the real set holds **one** value, M.
- Switch \`TYPE\` and \`REAL\` before each group of E commands; forgetting is the classic error.

## Typical warnings

- \`Node 9 is undefined.  Element not created.\` E used a number that was never generated.
- \`3 element(s) were not generated because their nodes (offset by NINC=1) do not exist.\` EGEN ran off the
  end of the node line: ITIME is one too many.`,
    workedExample: {
      script: `/PREP7
ET,1,COMBIN14 $ KEYOPT,1,2,3   ! vertical spring
ET,2,MASS21 $ KEYOPT,2,3,2     ! point mass, one real
R,1,5E7 $ R,2,20E3             ! k = 5e7 N/m, m = 20 t
N,1 $ N,2,,,1                  ! ground node and mass node
E,1,2                          ! TYPE 1, REAL 1 are active
TYPE,2 $ REAL,2
E,2                            ! mass on node 2
D,1,ALL                        ! fix the ground node
/PNUM,NODE,1
EPLOT`,
      commentary: 'A single-degree-of-freedom oscillator in seven lines. The spring uses the default TYPE 1 / REAL 1; the mass needs both switched before its E command.',
    },
    challengeIds: ['t4-c1', 't4-c2'],
  },
  {
    id: 't4-l2',
    track: 't4',
    order: 2,
    title: 'Numbering schemes for frames',
    explanation: `## Plan the numbers, then type little

Direct generation is fast only when node numbers follow a pattern you can copy. A good scheme for a
frame: number each column **1..5, 101..105, 201..205 ...** (column line x 100) and the beam nodes between
columns 6..9, 106..109 ... Then every member is a copy of the first one.

- \`NGEN,4,100,1,5,,10\` copies column 1 three times, +100 in number and +10 m in X.
- \`EGEN,4,100,1,4\` copies elements 1-4 with node numbers +100.

## NFILL defaults that bite

\`NFILL,NODE1,NODE2,NFILL,NSTRT,NINC\`: when NINC is blank ANSYS **interpolates** the number increment,
(NODE2 - NODE1) / (NFILL + 1). \`NFILL,5,105,4,6\` therefore numbers the fill nodes 6, 26, 46, 66. If you
want 6, 7, 8, 9 you must type \`NINC = 1\`: \`NFILL,5,105,4,6,1\`.

## Beam elements

\`BEAM188\` takes a section: \`SECTYPE,1,BEAM,RECT\` and \`SECDATA,B,H\`. With direct generation the
active SECNUM (default 1) goes onto every E. Constrain all column bases in one line:
\`D,1,ALL,,,301,100\` (NODE, Lab, VALUE, VALUE2, NEND, NINC).`,
    workedExample: {
      script: `/PREP7
ET,1,BEAM188 $ SECTYPE,1,BEAM,RECT $ SECDATA,0.8,0.8
N,1 $ N,4,,,6 $ NFILL,1,4          ! column 1: nodes 1-4, 2 m apart
NGEN,2,100,1,4,,8                  ! column 2: nodes 101-104 at x = 8
NFILL,4,104,3,5,1                  ! beam nodes 5, 6, 7 (NINC = 1!)
E,1,2 $ EGEN,3,1,1                 ! column 1 elements
EGEN,2,100,1,3                     ! column 2 elements
E,4,5 $ EGEN,3,1,7 $ E,7,104       ! beam
D,1,ALL,,,101,100                  ! fix both column bases
/PNUM,NODE,1
EPLOT`,
      commentary: 'A single-bay portal: 11 nodes, 10 elements. Typing NINC = 1 in the NFILL keeps the beam nodes consecutive, so EGEN,3,1 can generate the first three beam elements from one.',
    },
    challengeIds: ['t4-c3'],
  },
  {
    id: 't4-l3',
    track: 't4',
    order: 3,
    title: 'Shell grids and spring beds',
    explanation: `## A grid is two NGENs and two EGENs

\`N,1 $ NGEN,NX,1,1,,,DX\` makes the first row. \`NGEN,NY,100,1,NX,,,DY\` copies the row with **+100**
numbering, so node (i, j) is \`i + 100(j-1)\`. Then:

- \`E,1,2,102,101\`: one quad, nodes counter-clockwise seen from +Z
- \`EGEN,NX-1,1,1\` along the row, \`EGEN,NY-1,100,1,NX-1\` up the grid

\`SHELL181\` takes \`SECTYPE,1,SHELL\` and \`SECDATA,TK\`. The active SECNUM is used, as for beams.

## Winkler springs

A soil spring bed is one spring per mat node to a fixed ground node:

- ground nodes: \`NGEN,2,1000,1,LAST,,,,-1\` copies **every** mat node 1 m down, +1000 in number
- \`TYPE,2 $ REAL,2 $ E,1,1001\`, then the same two EGENs as for the shells
- fix the ground: \`NSEL,S,LOC,Z,-1 $ D,ALL,ALL $ ALLSEL\`

The spring stiffness is subgrade modulus x tributary area: 5E7 N/m³ on a 1 x 1 m grid gives
**5E7 N/m** per spring.

Mistake to avoid: an EGEN with the wrong IEL1 copies the shells instead of the springs. Use
\`*GET,E1,ELEM,0,NUM,MAX\` right after the first spring to get its number.`,
    workedExample: {
      script: `/PREP7
ET,1,SHELL181 $ SECTYPE,1,SHELL $ SECDATA,1.0
ET,2,COMBIN14 $ KEYOPT,2,2,3 $ R,2,5E7
N,1 $ NGEN,4,1,1,,,1 $ NGEN,3,100,1,4,,,1   ! 4 x 3 node grid
E,1,2,102,101 $ EGEN,3,1,1 $ EGEN,2,100,1,3 ! 6 shells
NGEN,2,1000,1,204,,,,-1                     ! ground nodes 1 m below
TYPE,2 $ REAL,2 $ E,1,1001
*GET,E1,ELEM,0,NUM,MAX
EGEN,4,1,E1 $ EGEN,3,100,E1,E1+3            ! 12 springs
NSEL,S,LOC,Z,-1 $ D,ALL,ALL $ ALLSEL
EPLOT`,
      commentary: 'Six shells on twelve springs. The *GET keeps the EGEN pointing at the first spring, whatever the shell count was.',
    },
    challengeIds: ['t4-c4', 't4-c5'],
  },
];
