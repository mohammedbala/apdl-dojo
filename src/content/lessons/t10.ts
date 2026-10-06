// Track t10 lessons: Boss — TGF-36 tabletop foundation four ways, then free choice.
import type { Lesson } from '../types';

export const lessons: Lesson[] = [
  {
    id: 't10-l1',
    track: 't10',
    order: 1,
    title: 'Technique A: primitives + Booleans',
    explanation: `## Five solids, two holes, one glue

TGF-36 is a mat, eight columns and a deck with two openings. With primitives every part is
**one BLOCK**:

1. mat \`BLOCK,0,38,0,14,0,3\` → volume 1
2. columns in one loop over the corner x: \`*DO,X,3,33,10\` with two BLOCKs per line → volumes 2–9
3. deck \`BLOCK,1,37,1,13,11,14\` → volume 10, tools → 11 and 12 (overshoot to z 10..15)
4. \`VSBV,10,11\` → **13** (made while 10 and 11 still exist); \`VSBV,13,12\` → refills **10**
5. \`VGLUE,ALL\` — still 10 volumes, now sharing faces, so \`VMESH,ALL\` gives one conforming hex grid

**Why the glue matters:** unglued touching volumes mesh separately, with duplicate nodes on every
interface, so the columns are not connected to the mat or the deck and the model would fall apart in a
real solve. The counts barely change (5 080 nodes glued, 5 116 unglued), so do not rely on them:
make sure \`VGLUE,ALL\` ran without the *"overlap"* error.

**Speed tricks**

- loop the coordinate, not an index; two BLOCKs per iteration on one \`$\` line
- one attribute block on three lines: \`ET … $ KEYOPT\`, \`MP … $ MP … $ MP\`, \`R … $ R … $ R\`
- the two 150 t bearings share one real: \`REAL,2 $ E,NODE(14,7,14) $ E,NODE(24,7,14)\`
- \`VGLUE\` *"overlap"* error means a tool or column intersects instead of touching — check the ranges`,
    workedExample: {
      script: `/PREP7
BLOCK,0,8,0,14,0,3           ! mat strip
BLOCK,3,5,1,4,3,11           ! column 1
BLOCK,3,5,10,13,3,11         ! column 2
BLOCK,1,7,1,13,11,14         ! cross-beam = volume 4
BLOCK,2,6,4.5,9.5,10,15      ! a tool through the beam = volume 5
VSBV,4,5                     ! beam with opening -> volume 6
VGLUE,ALL                    ! 4 volumes, shared faces
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZE,1 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL
/PNUM,VOLU,1 $ /VIEW,1,1,1,1 $ VPLOT`,
      commentary: 'One bent of the foundation with a trial opening in the beam. The VSBV result is numbered 6 because 1–5 are still in use while it is created; VGLUE then renumbers the touching volumes, so after this point select by location.',
    },
    challengeIds: ['t10-c1', 't10-c2', 't10-c3'],
  },
  {
    id: 't10-l2',
    track: 't10',
    order: 2,
    title: 'Technique B: bottom-up with generation',
    explanation: `## Footprints first, extrude last

Bottom-up does not mean typing 96 keypoints. Type **one** column footprint and generate:

- 4 × \`K\` at z = 3 → \`KGEN,2,…,9 (DY)\` for the second row (KINC 4 keeps numbers tidy)
- \`A,5,6,7,8 $ A,9,10,11,12\` → \`AGEN,4,2,3,1,10\` puts all 8 footprints down
- deck outline + two opening rectangles (the second by \`KGEN\` +20 in X), \`ASBA\` twice
- extrude each **level** by selecting it: \`ASEL,S,LOC,Z,11 $ VEXT,ALL,,,0,0,3\`, then z = 3 (8 m), then the mat

**The numbering rule.** Create every footprint area before the first VEXT. VEXT makes new keypoints with
the lowest free numbers, which would collide with keypoints you type afterwards. Typing high numbers
(\`K,101,…\`) for the deck is a second safety net.

**ASBA numbering** works like VSBV: deck area 10 minus opening 11 → **13**; 13 minus 12 → **10**.

**Speed tricks**

- blank fields are zero: \`KGEN,2,105,108,1,20,,,4\`, \`VEXT,ALL,,,,,8\`
- select levels by centroid z instead of tracking area numbers after AGEN
- finish with \`ALLSEL $ VGLUE,ALL\` and reuse the same attribute/mesh/BC tail as technique A`,
    workedExample: {
      script: `/PREP7
K,1,3,1,3 $ K,2,5,1,3 $ K,3,5,4,3 $ K,4,3,4,3   ! first footprint at z = 3
KGEN,2,1,4,1,0,9,0,4               ! second row: keypoints 5-8
A,1,2,3,4 $ A,5,6,7,8              ! areas 1, 2
AGEN,4,1,2,1,10                    ! 4 column lines at 10 m: 8 areas
K,101,0,0,0 $ K,102,38,0,0 $ K,103,38,14,0 $ K,104,0,14,0
A,101,102,103,104                  ! mat footprint at z = 0
ASEL,S,LOC,Z,3 $ VEXT,ALL,,,0,0,8  ! columns
ASEL,S,LOC,Z,0 $ VEXT,ALL,,,0,0,3  ! mat
ALLSEL $ VGLUE,ALL                 ! 9 volumes
/PNUM,VOLU,1 $ VPLOT`,
      commentary: 'All footprints exist before the first VEXT, and each level is extruded by selecting its areas by height. The mat is typed with keypoints from 101 so it can never clash with generated numbers.',
    },
    challengeIds: ['t10-c4', 't10-c5', 't10-c6'],
  },
  {
    id: 't10-l3',
    track: 't10',
    order: 3,
    title: 'Technique C: extrude, offset, drag',
    explanation: `## Draw sections, sweep solids

Every TGF-36 part has a constant cross-section, so each can be swept from 2-D:

- **columns**: \`WPOFFS,0,0,3\`, a \`*DO\` loop of \`RECTNG\` footprints, then \`VEXT,ALL,,,0,0,8\` while
  they are the only areas
- **mat**: \`RECTNG,0,38,0,14\` at z = 0 and \`VOFFST,49,3\` — the offset follows the area normal
  (+Z for a RECTNG); a negative distance flips it
- **deck**: the YZ section at x = 1 (four keypoints, \`A\`) dragged along a path line to x = 37:
  \`VDRAG,NA1,,,,,,NLP1\` — the path line is the **7th** field (six area slots come first)
- **openings**: \`BLC4\` tools from z = 0 with depth 15 and two VSBVs, then \`VGLUE,ALL\`

**Know the counts.** 8 swept columns own 48 areas, 64 keypoints and 96 lines; the mat adds 6 areas,
8 keypoints and 12 lines. So the mat is area 49, the deck section area 55 and its path line 113 when
you number your section keypoints from 101. Alternatively \`*GET,A,AREA,0,NUM,MAX\` after each step.

**Speed tricks:** \`VEXT,ALL,,,,,8\` (blanks are zero); the drag path is just \`L,101,105\`; the tool
volumes need no WPOFFS because they may cut through the mat region — VSBV only touches the deck.`,
    workedExample: {
      script: `/PREP7
WPOFFS,0,0,3                       ! columns start on top of the mat
*DO,X,3,33,10
  RECTNG,X,X+2,1,4 $ RECTNG,X,X+2,10,13
*ENDDO
VEXT,ALL,,,0,0,8                   ! 8 columns
WPOFFS,0,0,-3
K,101,1,1,11 $ K,102,1,13,11 $ K,103,1,13,14 $ K,104,1,1,14
A,101,102,103,104                  ! deck cross-section (YZ plane)
*GET,ASEC,AREA,0,NUM,MAX
K,105,37,1,11 $ L,101,105          ! path along +X
*GET,LP,LINE,0,NUM,MAX
VDRAG,ASEC,,,,,,LP                 ! path is the 7th field
VGLUE,ALL
/PNUM,VOLU,1 $ /VIEW,1,1,1,1 $ VPLOT`,
      commentary: 'Columns by VEXT of footprints, the deck by dragging its section along a straight line. *GET reads back the section and path numbers, so the script does not depend on counting entities.',
    },
    challengeIds: ['t10-c7', 't10-c8', 't10-c9'],
  },
  {
    id: 't10-l4',
    track: 't10',
    order: 4,
    title: 'Technique D: beam, shell and spring frame',
    explanation: `## The design-office model

Dynamic checks of a TG foundation often use an idealised frame: **SHELL181** mat on **COMBIN14**
Winkler springs, **BEAM188** columns and deck grillage at the mid-planes (mat z = 1.5, deck z = 12.5),
**MASS21** at the bearings.

**Mat by direct generation.** \`N,1,0,0,1.5 $ NGEN,39,1,1,1,1,1 $ NGEN,29,100,1,39,1,0,0.5\` gives
nodes \`1 + i + 100·j\`. One shell \`E,1,2,102,101\`, \`EGEN,38,1,1\` along X, \`EGEN,28,100,1,38\` across:
**1064** shells. \`NGEN,2,10000,…,0,0,-1\` copies the grid 1 m down as ground nodes.

**Springs.** One COMBIN14 type per direction (KEYOPT(2) = 3 UZ, 1 UX, 2 UY), each \`E,1,10001\` +
two EGENs = **1131** per type. A \`*DO,T,4,6\` loop with \`*GET,E1,ELEM,0,NUM,MAX\` writes all three.
Stiffness per spring = modulus × tributary area: 5E7 × 1 × 0.5 = **2.5E7** N/m.

**Frame.** Keypoints at column ends and bearing points, lines, \`LATT\` sections by line centroid,
\`LESIZE,ALL,1 $ LMESH,ALL\`, then **\`NUMMRG,NODE\`** so the column bases share the mat nodes.
Beams, springs and masses are graded **exactly**: 200 / 3393 / 4.

**Speed tricks:** explicit keypoint numbers \`K,5*I+1,…\` inside the loop make the line commands
trivial; \`LATT,1,,2,,,,SEC\` — the section is the 7th field.`,
    workedExample: {
      script: `/PREP7
ET,1,SHELL181 $ ET,4,COMBIN14 $ KEYOPT,4,2,3   ! shell + UZ spring
MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
SECTYPE,1,SHELL $ SECDATA,3,1                  ! 3 m thick mat
R,4,2.5E7                                      ! 5E7 N/m3 x 1 x 0.5 m
TYPE,1 $ SECNUM,1
N,1,0,0,1.5 $ NGEN,11,1,1,1,1,1                ! 11 nodes along X
NGEN,9,100,1,11,1,0,0.5                        ! 9 rows at 0.5 m
E,1,2,102,101 $ EGEN,10,1,1 $ EGEN,8,100,1,10  ! 80 shells
NGEN,2,10000,1,811,1,0,0,-1                    ! ground nodes 1 m below
TYPE,4 $ REAL,4 $ E,1,10001
*GET,E1,ELEM,0,NUM,MAX
EGEN,11,1,E1 $ EGEN,9,100,E1,E1+10             ! 99 springs
NSEL,S,LOC,Z,0.5 $ D,ALL,ALL $ ALLSEL          ! fix the ground
/ESHAPE,1 $ /VIEW,1,1,1,1 $ EPLOT`,
      commentary: 'A 10 x 4 m patch of the Winkler mat: the shell grid comes from one node and one element, the springs from one element copied across the grid. The full TGF-36 mat is the same script with 39 x 29 nodes.',
    },
    challengeIds: ['t10-c10', 't10-c11', 't10-c12'],
  },
  {
    id: 't10-l5',
    track: 't10',
    order: 5,
    title: 'Free choice: the speedrun',
    explanation: `## Pick the fastest route

The speedrun target is the solid TGF-36 with **no technique rules**: any command, any volume split.
You have now built it four ways; the times usually rank like this:

| Technique | Typical expert script | Why |
|---|---|---|
| A primitives + Booleans | ~18 lines | one BLOCK per part, one loop |
| C extrude / drag | ~23 lines | sections are short, but numbering needs care |
| B bottom-up | ~25 lines | generation helps, footprints still need keypoints |
| D frame | different model | not a match for the solid target |

**Mixing is allowed.** BLOCK for the mat and deck, a loop for the columns, VSBV for the openings,
then the shared tail: attributes on three \`$\` lines, \`ESIZE,1 $ VMESH,ALL\`,
\`NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL\`, masses with \`E,NODE(x,7,14)\`, \`ACEL,0,0,9.81\`.

**Before you start the clock**

- rehearse the dimension table: 38 x 14 x 3, columns 2 x 3 at x 4/14/24/34, y 2.5/11.5, z 3..11,
  deck 1..37 x 1..13 x 11..14, openings x 6..12 and 26..32, y 4.5..9.5
- abbreviate (\`VMES\`, \`ALLS\`, \`ESIZ\`) — fewer keystrokes, same model
- run early (Ctrl+Enter) after the geometry: the checklist turns green stage by stage and the split
  times show where you lose seconds
- paste is disabled in timed modes; a clean run with zero errors and lines ≤ par counts for 100%`,
    workedExample: {
      script: `/PREP7
BLOCK,0,38,0,14,0,3                          ! mat
WPOFFS,0,0,3
*DO,X,3,33,10                                ! columns by BLC4 on a lifted WP
  BLC4,X,1,2,3,8 $ BLC4,X,10,2,3,8
*ENDDO
WPOFFS,0,0,-3
BLOCK,1,37,1,13,11,14                        ! deck = volume 10
BLOCK,6,12,4.5,9.5,10,15 $ BLOCK,26,32,4.5,9.5,10,15
VSEL,S,VOLU,,11,12 $ CM,TOOLS,VOLU $ ALLSEL
VSBV,10,TOOLS                                ! both openings at once
VGLUE,ALL
/PNUM,VOLU,1 $ /VIEW,1,1,1,1 $ VPLOT`,
      commentary: 'A hybrid geometry block: BLOCK for mat and deck, BLC4 columns after WPOFFS, and both openings removed with one VSBV against a component. Add the standard attribute, mesh and load tail to finish the speedrun model.',
    },
    challengeIds: ['t10-speedrun'],
  },
];
