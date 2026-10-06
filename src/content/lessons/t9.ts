// Track t9 lessons: loads and boundary conditions.
import type { Lesson } from '../types';

export const lessons: Lesson[] = [
  {
    id: 't9-l1',
    track: 't9',
    order: 1,
    title: 'Constraints: D on nodes, DA on areas',
    explanation: `## Two ways to fix a model

**Nodal: \`D,NODE,Lab,VALUE\`.** Select the nodes, then \`D,ALL,…\` acts on the selected set.
\`Lab = ALL\` expands to UX UY UZ for solids, plus ROTX ROTY ROTZ when beam or shell types exist.
A symmetry plane is one direction only: \`D,ALL,UX\` on the x = 0 face.

**Solid model: \`DA,AREA,Lab\` (also \`DL\` on lines, \`DK\` on keypoints).** The constraint is stored on
the geometry and transferred to the area's nodes at the end of the run. It survives a remesh, and the
area is easy to find by centroid: \`ASEL,S,LOC,Z,0 $ DA,ALL,ALL\`.

Both are graded the same way: the **number of constrained nodes** and **where they are**.

**Common slips**

- forgetting that selection is sticky: after \`NSEL,S,LOC,X,0\` a later \`D,ALL,ALL\` hits only that face
- \`ASEL,S,LOC,Y,0\` on a glued model picks up **every** face at y = 0 (footing and stem) — usually
  what you want; use \`ASEL,R\` to narrow
- a model with no constraints fails the SOLVE check with *"No displacement constraints are defined"*

**Speed tricks:** one support per line, \`$\`-joined: \`NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL\`.`,
    workedExample: {
      script: `/PREP7
BLOCK,0,6,0,4,0,2                ! half plinth, symmetric about x = 0
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2
ESIZE,0.5 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ D,ALL,ALL       ! fixed base: 13 x 9 = 117 nodes
NSEL,S,LOC,X,0 $ D,ALL,UX        ! symmetry plane: UX only
ALLSEL
ASEL,S,LOC,Y,4 $ DA,ALL,UY       ! same idea on the solid model: back face, UY
ALLSEL
FINISH
/SOLU
SOLVE                            ! model check only: constraints present`,
      commentary: 'Nodal constraints come from node selections, the DA on the back face is stored on the area and transferred to its nodes at the end of the run. SOLVE in /SOLU runs the model check and stops.',
    },
    challengeIds: ['t9-c1', 't9-c2'],
  },
  {
    id: 't9-l2',
    track: 't9',
    order: 2,
    title: 'Forces, pressures, masses and gravity',
    explanation: `## Put each load where the engineer would

- **Point load at a known location:** \`F,NODE(x,y,z),FZ,-50E3\`. \`NODE()\` returns the nearest
  **selected** node, so no node numbers are typed. One F per component.
- **Load spread over a face:** select the area, then \`NSLA,S,1 $ F,ALL,FZ,…\` (per node), or better a
  pressure: \`SFA,AREA,1,PRES,VALUE\` — positive pressure pushes **into** the surface.
- **Machine masses:** \`ET,2,MASS21 $ KEYOPT,2,3,2\` (3-D mass, one real), \`R,n,MASS\`, then
  \`TYPE,2 $ REAL,n $ E,NODE(x,y,z)\`. Masses are graded by location (0.6 m) and value.
- **Gravity:** \`ACEL,0,0,9.81\`. ACEL is the acceleration of the frame, so +9.81 in Z makes the weight
  act in **-Z**. Material DENS must be defined for self-weight.

Units are SI throughout: N, m, kg, Pa. 10 kPa = **10E3**, 150 t = **150E3**.

**Speed tricks**

- several masses with the same real on one line: \`REAL,1 $ E,NODE(2,2,3) $ E,NODE(8,2,3)\`
- \`ALLSEL\` before any \`NODE()\` call — after a base selection it would find a base node
- the four-character forms: \`ACEL\` is already short, \`ALLS\`, \`NSEL\`, \`ASEL\``,
    workedExample: {
      script: `/PREP7
BLOCK,0,8,0,4,0,2
ET,1,SOLID185 $ ET,2,MASS21 $ KEYOPT,2,3,2
MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
R,1,50E3                          ! 50 t bearing mass
ESIZE,0.5 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL
ASEL,S,LOC,Z,2 $ SFA,ALL,1,PRES,5E3 $ ALLSEL   ! 5 kPa on the top face
F,NODE(8,2,2),FX,20E3             ! horizontal point load at the end
TYPE,2 $ REAL,1 $ E,NODE(4,2,2)   ! mass at mid-length on top
ACEL,0,0,9.81                     ! gravity in -Z`,
      commentary: 'Every load is located by coordinates: the pressure by the top area, the point load and the mass by NODE(). The ALLSEL after the base constraint is what lets NODE() find nodes on the top surface.',
    },
    challengeIds: ['t9-c3', 't9-c4', 't9-c5'],
  },
];
