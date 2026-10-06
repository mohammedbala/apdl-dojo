// Track t7 lessons: selection and components.
import type { Lesson } from '../types';

export const lessons: Lesson[] = [
  {
    id: 't7-l1',
    track: 't7',
    order: 1,
    title: 'Select by location, not by number',
    explanation: `## Numbers change, coordinates don't

After a \`VGLUE\` or \`VSBV\` the entity numbers shift, but the base is still at z = 0. Selecting by
location makes a script survive any renumbering.

\`xSEL,Type,LOC,Comp,VMIN,VMAX\`

- Type: \`S\` new set, \`R\` reselect from the set, \`A\` add, \`U\` unselect, plus \`ALL\`, \`NONE\`, \`INVE\`
- keypoints and nodes are tested at their **point**; lines, areas and volumes at their **centroid**
  (the top face of a 0..2 block is at \`ASEL,S,LOC,Z,2\`; its four vertical edges at \`LSEL,S,LOC,Z,1\`)
- a single value selects within a small tolerance; give VMIN,VMAX for a band

**Association** walks down the hierarchy: \`NSLA,S,1\` = nodes on the selected areas (1 includes
the area's edges and corners), \`NSLV\` volumes → nodes, \`ASLV\` volumes → areas, \`ESLN\` nodes → elements.

**Attributes by selection:** \`VSEL\`/\`ASEL\` the region, then \`VATT\`/\`AATT,MAT,REAL,TYPE,ESYS,SECN\`,
then \`ASEL,INVE\` and assign the rest. Meshing picks the attributes up automatically.

**Speed tricks:** one line per load: \`ASEL,S,LOC,Z,2 $ NSLA,S,1 $ F,ALL,FZ,-10E3\`; \`NSEL,R\` to narrow
(\`NSEL,S,LOC,Z,0 $ NSEL,R,LOC,X,0,2\`).`,
    workedExample: {
      script: `/PREP7
BLOCK,0,10,0,6,0,1.5               ! mat
BLOCK,1,3,2,4,1.5,5.5              ! pier 1
BLOCK,7,9,2,4,1.5,5.5              ! pier 2
VGLUE,ALL                          ! numbers change here
ET,1,SOLID185
MP,EX,1,3E10 $ MP,EX,2,3.5E10      ! two concrete grades
VSEL,S,LOC,Z,3.5                   ! piers: centroid z = 3.5
VATT,2,,1                          ! VATT,MAT,REAL,TYPE
VSEL,INVE $ VATT,1,,1              ! everything else
ALLSEL $ ESIZE,0.5 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ D,ALL,ALL         ! fixed base
ASEL,S,LOC,Z,5.5 $ NSLA,S,1        ! pier tops and their nodes
F,ALL,FZ,-20E3
ALLSEL`,
      commentary: 'No entity number is typed after the glue: the piers are found by centroid height, the base nodes by z = 0 and the pier tops by z = 5.5. Each pier top has 5 x 5 = 25 nodes, so 50 nodes carry -20 kN each.',
    },
    challengeIds: ['t7-c1', 't7-c2', 't7-c3'],
  },
  {
    id: 't7-l2',
    track: 't7',
    order: 2,
    title: 'Components and the forgotten ALLSEL',
    explanation: `## Name a selection once, reuse it everywhere

\`CM,Cname,Entity\` stores the **current** selection under a name (\`NODE\`, \`ELEM\`, \`KP\`, \`LINE\`,
\`AREA\`, \`VOLU\`). \`CMSEL,S,Cname\` brings it back; \`CMSEL,A\` adds to the set. Build the support and load
sets right after meshing, then apply BCs from the names: the intent is readable and you never repeat a
location filter.

## The classic trap

Selections are **sticky**. After \`NSEL,S,LOC,Z,0 $ D,ALL,ALL\` only the base nodes are active, and
everything that follows works on that subset:

- \`NODE(3,2,1.5)\` returns the **nearest selected** node — a base node — so the mass lands on the mat
  soffit without any warning
- \`VMESH,ALL\` after a \`VSEL\` meshes only the selected volumes
- \`D,ALL,ALL\` after \`NSEL,S,LOC,X,0\` constrains one edge instead of the whole base

The rule: **every selection block ends with \`ALLSEL\`** (\`ALLS\` for short). Check the counts the
grader reports — a mass at the wrong height or 65 constrained nodes instead of 273 is almost always a
missing ALLSEL.

**Speed trick:** \`ESEL,S,TYPE,,2 $ CM,E_MASS,ELEM $ ALLSEL\` on one line.`,
    workedExample: {
      script: `/PREP7
BLOCK,0,10,0,6,0,1.5
ET,1,SOLID185 $ ET,2,MASS21 $ KEYOPT,2,3,2
MP,EX,1,3E10 $ R,1,50E3
ESIZE,0.5 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ CM,N_BASE,NODE    ! store the support set
ALLSEL                             ! without this, NODE() below finds a base node
TYPE,2 $ REAL,1
E,NODE(5,3,1.5)                    ! mass on the top surface
ESEL,S,TYPE,,2 $ CM,E_MASS,ELEM    ! name the mass elements
ALLSEL
CMSEL,S,N_BASE $ D,ALL,ALL         ! reuse the support set
ALLSEL`,
      commentary: 'The base set is stored as N_BASE and used later for D. The ALLSEL before E,NODE(...) is what puts the mass on the top surface: delete it and the mass silently lands on a base node.',
    },
    challengeIds: ['t7-c4', 't7-c5'],
  },
];
