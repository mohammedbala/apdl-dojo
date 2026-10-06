// Track t8 lessons: parametric scripting.
import type { Lesson } from '../types';

export const lessons: Lesson[] = [
  {
    id: 't8-l1',
    track: 't8',
    order: 1,
    title: '*DO loops: type one bay, get them all',
    explanation: `## The loop is the pattern

Foundations are repetitive: columns at equal centres, pile grids, bearing pairs. Type the
repeating unit once and let \`*DO\` place it.

\`*DO,Par,IVAL,FVAL,INC\` … \`*ENDDO\`

- the counter can be **real** and step by any value: \`*DO,X,3,33,10\` gives 3, 13, 23, 33
- loop **the coordinate itself**, not an index, when you can — it saves the \`XC = …\` line
- nest loops for grids: outer X, inner Y. Every \`*DO\` needs its own \`*ENDDO\`, otherwise
  *"\\*DO on line n has no matching \\*ENDDO"*
- parameters are plain assignments: \`NCOL = 5\`, \`H = MAT_T+8\`; every numeric field accepts expressions

**Working plane offsets accumulate.** \`WPOFFS,0,0,3\` lifts the WP by 3; a second \`WPOFFS,0,0,3\` lifts
it to 6. Put it back with \`WPOFFS,0,0,-3\` when you are done, because BLOCK and BLC4 both build in
working-plane coordinates.

**Speed tricks**

- several commands per iteration on one line: \`BLC4,X,1,2,3,8 $ BLC4,X,10,2,3,8\`
- indentation inside loops is free (not counted) — use it for readability
- one parameter per line of the brief makes the daily variants trivial: change \`NCOL\`, rerun`,
    workedExample: {
      script: `/PREP7
NCOL = 4                       ! number of columns
SP = 3                         ! centres
BLOCK,-1,SP*(NCOL-1)+2,-1,2,-1,0   ! strip footing sized from the parameters
*DO,X,0,SP*(NCOL-1),SP         ! loop the coordinate itself
  BLOCK,X,X+1,0,1,0,4          ! 1 x 1 column, 4 m tall
*ENDDO
VGLUE,ALL                      ! NCOL + 1 volumes
/PNUM,VOLU,1 $ VPLOT`,
      commentary: 'Change NCOL or SP and the whole model follows, footing length included. The loop counter is the X coordinate, so no index arithmetic is needed inside the loop.',
    },
    challengeIds: ['t8-c1', 't8-c2', 't8-c5'],
  },
  {
    id: 't8-l2',
    track: 't8',
    order: 2,
    title: '*IF and *GET: decisions and numbers from the model',
    explanation: `## Let the model tell you its numbers

\`*GET,Par,Entity,ENTNUM,Item1,IT1NUM\` reads a value back from the database:

- \`*GET,NV,VOLU,0,NUM,MAX\` — highest volume number in use
- \`*GET,NN,NODE,0,COUNT\` — number of selected nodes
- \`*GET,Z1,KP,5,LOC,Z\` — a keypoint coordinate

New entities take the **lowest free number**, and Booleans renumber. After \`VSBV,1,2\` the result is a
new number (3), and the next primitive refills the gap at 1. Never hard-code a number that a Boolean
produced: \`*GET\` it, or select by location.

\`VSBV,NV1,NV2\` accepts a **component** (or \`ALL\` = the selected set) as NV2, so a loop of cutters
can be subtracted in one command.

## Branching

- one line: \`*IF,I,EQ,4,CYCLE\` (skip this iteration) or \`*IF,N,GT,10,EXIT\`
- block: \`*IF,A,LT,B,THEN\` … \`*ELSEIF\` … \`*ELSE\` … \`*ENDIF\`
- operators: \`EQ NE LT GT LE GE\`

**Speed trick:** an opening bay is one \`*IF…CYCLE\` line, not a second loop.`,
    workedExample: {
      script: `/PREP7
BLOCK,0,20,0,6,0,1                 ! slab = volume 1
WPOFFS,0,0,-1                      ! cutters start below the slab
*DO,I,1,4
  *IF,I,EQ,3,CYCLE                 ! no sleeve in bay 3
  CYL4,4*I,3,0.4,,,,3
*ENDDO
WPOFFS,0,0,1
*GET,NV,VOLU,0,NUM,MAX             ! last cutter = 4
VSEL,S,VOLU,,2,NV $ CM,CUTTERS,VOLU $ ALLSEL
VSBV,1,CUTTERS                     ! one subtraction for all cutters
*GET,VS,VOLU,0,NUM,MAX             ! the new slab number`,
      commentary: 'Three cutters are made (bay 3 is skipped), *GET finds the last one, a component collects them, and a single VSBV removes them all. The final *GET reads back the renumbered slab so later commands can use it.',
    },
    challengeIds: ['t8-c3', 't8-c4'],
  },
];
