// Track t6 lessons: meshing control.
import type { Lesson } from '../types';

export const lessons: Lesson[] = [
  {
    id: 't6-l1',
    track: 't6',
    order: 1,
    title: 'ESIZE, LESIZE and the division count',
    explanation: `## Count before you mesh

Every edge gets an integer number of divisions, and the hex count is their product. With
\`ESIZE,S\` an edge of length **L** gets **ceil(L / S)** divisions, so a 6 x 4 x 2 block at
\`ESIZE,0.7\` is 9 x 6 x 3 = **162** elements, not 6/0.7 x 4/0.7 x 2/0.7.

Priority, highest first:

1. \`LESIZE,NL1,SIZE,ANGSIZ,NDIV\` on a line (NDIV is the **4th** field: \`LESIZE,ALL,,,12\`)
2. \`AESIZE\` on an area, then volume sizes
3. \`ESIZE\` (global default)
4. nothing set: 1/20 of the model diagonal, with the note *"No ESIZE or LESIZE was set"*

**Speed tricks**

- Select edges by **centroid**: every X-edge of a block from x 0..6 sits at \`LOC,X,3\`.
  One \`LSEL\` + one \`LESIZE\` per direction, joined with \`$\`.
- Set the global size, then override only what differs (\`ESIZE,0.5\` + four vertical edges).
- \`ALLSEL\` before \`VMESH,ALL\` — otherwise ALL means "the lines you just selected" for anything
  that follows.
- Abbreviate: \`ESIZ\`, \`LESI\`, \`VMES\`, \`ALLS\`.`,
    workedExample: {
      script: `/PREP7
BLOCK,0,6,0,4,0,2            ! 6 x 4 x 2 block
ET,1,SOLID185 $ MP,EX,1,3E10
ESIZE,1                      ! default: 6 x 4 x 2 divisions
LSEL,S,LOC,X,3               ! the four X-direction edges (centroid x = 3)
LESIZE,ALL,,,12              ! NDIV is the 4th field
ALLSEL                       ! back to everything before meshing
VMESH,ALL                    ! 12 x 4 x 2 = 96 hexes, 13 x 5 x 3 = 195 nodes`,
      commentary: 'ESIZE sets 1 m everywhere, then LESIZE overrides only the X-direction edges. The mapped mesh is the product of the divisions: 96 elements and 195 nodes, exactly the S5 stepping stone.',
    },
    challengeIds: ['t6-c1', 't6-c2'],
  },
  {
    id: 't6-l2',
    track: 't6',
    order: 2,
    title: 'Tets and sweeps',
    explanation: `## Pick the mesher for the shape

**Hex (default, MSHAPE,0).** Any union of axis-aligned blocks gets one structured hex grid. This is
what you want for foundations: predictable counts, good elements.

**Tets: \`MSHAPE,1,3D\`.** Each hex cell is split into **6 tetrahedra**, so a tet mesh has about six
times the element count of the hex mesh at the same ESIZE. \`SOLID187\` (10-node tet) always
produces tets and adds mid-side nodes, so the node count roughly matches a hex mesh of half the size.
Switch back with \`MSHAPE,0\` before meshing hex regions.

**Sweeps: \`VSWEEP,VNUM\`.** A prism (a cylinder, a slab with round holes) is meshed by meshing the cap in
2-D and extruding it in layers. The layer count is ceil(height / size). Use it for pedestals, piles and
anything round: \`CYL4,0,0,R,,,,H $ ESIZE,0.5 $ VSWEEP,1\`.

**Speed tricks**

- \`MSHA,1,3D\`, \`VSWE,ALL\` — four-character abbreviations work for every command.
- Decide the element type before meshing: changing SOLID185 to SOLID187 later means \`VCLEAR\`
  and remeshing.
- Mesh mixed models in passes: \`VSEL\` the round parts, \`VSWEEP,ALL\`, \`VSEL,INVE\`, \`VMESH,ALL\`.`,
    workedExample: {
      script: `/PREP7
CYL4,0,0,1.5,,,,4            ! r = 1.5 pedestal, 4 m tall
ET,1,SOLID185 $ MP,EX,1,3E10
ESIZE,0.5
VSWEEP,1                     ! cap meshed in 2-D, swept in 8 layers
ET,2,SOLID187
TYPE,2
BLOCK,3,6,0,3,0,2            ! a separate plinth, meshed with tets
MSHAPE,1,3D
VMESH,2                      ! 6 x 6 x 4 cells x 6 tets = 864 tets`,
      commentary: 'The cylinder is a prism, so VSWEEP stacks 8 identical layers of the cap mesh. The plinth uses MSHAPE,1,3D with SOLID187: every hex cell becomes six 10-node tetrahedra.',
    },
    challengeIds: ['t6-c3', 't6-c4'],
  },
  {
    id: 't6-l3',
    track: 't6',
    order: 3,
    title: 'Shell meshes: AESIZE and AMESH',
    explanation: `## Mesh the mid-surface, not the solid

Slabs and mats are often modelled as **SHELL181** on their mid-surface: \`RECTNG\` areas,
\`SECTYPE,1,SHELL\` + \`SECDATA,T\`, then \`AMESH\`. Rectangular areas get a structured quad grid,
so the count is again a product: a 14 x 10 slab at ESIZE 1 is **140** quads.

Local refinement uses the size hierarchy:

- \`ESIZE,1\` — the default for everything
- \`AESIZE,ANUM,SIZE\` — overrides ESIZE on the chosen areas (\`ALL\` = the selected set)
- \`LESIZE\` — still wins on individual lines

Split the slab into areas where the size changes (\`RECTNG\` strips), then \`AGLUE,ALL\` so the
strips share their common lines and the mesh is conforming. Without the glue the strips get
duplicate nodes on the joint — the grader's node count will tell you.

**Speed tricks**

- Select the strip by centroid: \`ASEL,S,LOC,X,7\` picks the area spanning x 6..8.
- Put the whole size block on one line: \`ESIZE,1 $ ASEL,S,LOC,X,7 $ AESIZE,ALL,0.5 $ ALLSEL $ AMESH,ALL\`.
- \`SECT\`/\`SECD\` are the short forms of SECTYPE/SECDATA.`,
    workedExample: {
      script: `/PREP7
RECTNG,0,8,0,6 $ RECTNG,8,12,0,6   ! slab + edge strip
AGLUE,ALL                          ! shared line at x = 8
ET,1,SHELL181
SECTYPE,1,SHELL $ SECDATA,0.5      ! 0.5 m thick
MP,EX,1,3E10
ESIZE,1                            ! default size
ASEL,S,LOC,X,10                    ! the edge strip (centroid x = 10)
AESIZE,ALL,0.5                     ! refine it
ALLSEL
AMESH,ALL`,
      commentary: 'The main slab meshes at 1 m, the strip at 0.5 m. Because the areas are glued they share the line at x = 8, so the nodes along the joint are common to both meshes.',
    },
    challengeIds: ['t6-c5'],
  },
];
