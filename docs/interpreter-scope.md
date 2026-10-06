# APDL Dojo interpreter: scope and behaviour

The trainer runs a subset of ANSYS Mechanical APDL in the browser. It builds geometry, meshes,
attributes and boundary conditions. **It does not solve.** `SOLVE` runs model checks only.

## Language

- Comma-separated fields, `!` comments, `$` to put several commands on one line.
- Commands are case-insensitive and may be abbreviated to their first four characters
  (`VMES` = `VMESH`, `ESIZ` = `ESIZE`, `ALLS` = `ALLSEL`, `/SOL` = `/SOLU`).
- Parameters: `NAME = expr` or `*SET`. Expressions support `+ - * / **`, parentheses and
  `SIN COS TAN ASIN ACOS ATAN ATAN2 SQRT ABS SIGN EXP LOG LOG10 NINT INT MOD MIN MAX`.
  `*AFUN,DEG` switches trig to degrees.
- Get functions: `NX NY NZ KX KY KZ NODE(x,y,z) KP(x,y,z) DISTND DISTKP NSEL KSEL ... NDNEXT KPNEXT CENTRX/Y/Z`.
- `%NAME%` forced substitution in fields.
- Control flow: `*DO ... *ENDDO` (nested), `*DOWHILE`, `*IF ... *ELSEIF ... *ELSE ... *ENDIF`,
  one-line `*IF,...,EXIT|CYCLE`, `*EXIT`, `*CYCLE`. Loops are capped at 20 000 iterations.
- `*GET` supports `KP|LINE|AREA|VOLU|NODE|ELEM` with `0,COUNT`, `0,NUM,MAX|MIN|MAXD|MIND`,
  `n,LOC,X|Y|Z`, `n,LENG|AREA|VOLU`, `n,ATTR,TYPE|MAT|REAL|SECN`, `n,NODE,i`, `n,NXTH|NXTL`,
  and `ACTIVE,0,CSYS|TYPE|MAT|REAL|SECN|ROUT`.
- `*DIM` (ARRAY only), `*STATUS`.
- Undefined parameters evaluate to 0 with the ANSYS warning.
- Modelling commands outside `/PREP7` are ignored with the ANSYS "not a recognized BEGIN command" warning.

## Geometry

| Family | Commands |
|---|---|
| Keypoints / lines | `K KFILL KGEN KDELE KMODIF L LSTR LARC CIRCLE LGEN LDELE LDIV` |
| Areas / volumes | `A AL AGEN ADELE V VA VGEN VDELE` and reflections `KSYMM LSYMM ARSYM VSYMM` |
| Primitives | `BLOCK BLC4 BLC5 RECTNG PCIRC CYL4 CYL5 CYLIND CONE CON4 SPHERE SPH4 RPR4 RPRISM POLYGON` |
| Booleans | `VADD VSBV VINV VOVLAP VPTN VGLUE VSBA AADD ASBA AGLUE AOVLAP APTN BOPTN` |
| Sweeps | `VEXT VOFFST VROTAT VDRAG AROTAT ADRAG` |
| Coordinate systems | `CSYS 0/1/2/4/5/6` and user systems via `LOCAL CLOCAL`, `WPOFFS WPROTA WPCSYS WPAVE KWPAVE` |

ANSYS behaviours that are reproduced on purpose:

- New entities take the **lowest available number** (`K,,x,y,z`, Boolean outputs, copies with `KINC=0`).
- Boolean outputs are created before the inputs are deleted, so `VSBV,1,2` produces volume 3.
- `VGLUE` renumbers every modified volume. Select by location or `*GET` after a glue.
- `VGLUE` only imprints coincident **planar** faces; overlapping volumes are an error
  ("Use VOVLAP or VPTN").
- `xGEN` copies do not merge coincident keypoints. Use `NUMMRG,KP` or `VGLUE`.
- `xSEL,...,LOC` tests the point for keypoints and nodes and the centroid for lines, areas and volumes.
- `BLOCK` takes ranges, `BLC4` takes a corner plus sizes, and both work in the working plane.
- `L` in a cylindrical system (`CSYS,1`) produces an arc.

Not supported: `LFILLT LCOMB ASKIN AINA PRISM(PTXY) LROTAT LDRAG NUMOFF EINTF ESURF`, `/INPUT`, `RAND`.

## Attributes and meshing

- Element library: `SOLID185 SOLID186 SOLID187 SOLID65 BEAM188 BEAM189 SHELL181 SHELL281 SHELL63 COMBIN14 COMBIN40 MASS21 LINK180 SURF154 MPC184`.
- `ET KEYOPT MP MPDATA R RMORE SECTYPE SECDATA SECOFFSET TYPE MAT REAL SECNUM ESYS LATT AATT VATT KATT`.
- Sizing: `LESIZE` (NDIV, SIZE, ANGSIZ, SPACE) overrides `AESIZE`/volume size, which override `ESIZE`.
  Divisions are `ceil(length / size)`. Without any size the default is 1/20 of the model diagonal.
- `MSHAPE,1` gives tetrahedra (hexes split into 6) or triangles. `SOLID187` always produces tets.

How volumes are meshed:

1. Glued groups of **axis-aligned** volumes (any union of blocks) get one structured hex grid. Nodes
   are shared across glued faces, so the mesh is conforming. Unglued touching volumes get duplicate nodes,
   exactly like ANSYS.
2. **Prismatic** volumes (any constant cross-section swept along a straight direction, such as cylinders or
   slabs with round holes) are swept: the cap is meshed in 2-D, then extruded in layers.
3. Volumes created by `VROTAT` or `VDRAG` are swept along their generating path.
4. Anything else falls back to a voxel (stair-step) mesh with a note.

Areas (`AMESH`): four-sided areas get a mapped mesh when opposite sides have equal divisions,
rectilinear planar areas get a grid, other planar areas get constrained-Delaunay triangles.
`LMESH` puts `ndiv` elements on each line. `KMESH` puts a point element at each keypoint.
Nodes are shared between entities that share topology (a beam line meshed onto a solid's keypoint
shares that node). Direct-generated nodes are never merged automatically: use `NUMMRG,NODE`.

Direct generation: `N NGEN NFILL NSYM NDELE NMODIF E EN EGEN ENGEN EDELE EMODIF`.
Numbering: `NUMMRG (NODE|KP|ELEM|ALL) NUMCMP NUMSTR`.

## Loads

`D DDELE F FDELE DK DL DA FK SFA SFL SFE SF ACEL` are stored and drawn. Solid-model loads (`DK DL DA FK SFA`)
are transferred to nodes and element faces at the end of the run. `D,...,ALL` expands to `UX UY UZ`, plus
the rotations when beam or shell types are defined. `SOLVE` checks for elements, materials (EX),
sections, real constants and constraints, then stops.

## Selection and components

`KSEL LSEL ASEL VSEL NSEL ESEL` with `S R A U ALL NONE INVE` and items: entity number, `LOC`, `TYPE MAT
REAL SEC ESYS`, `ENAME`, `CENT` (elements), `LENGTH RADIUS` (lines), `D F EXT` (nodes), `EXT` (areas).
Association: `NSLK NSLL NSLA NSLV NSLE ESLN ESLV ESLA ESLL LSLA LSLK ASLL ASLV VSLA KSLL KSLN`,
`ALLSEL` (`ALL` and `BELOW`), `SELTOL`, `CM CMSEL CMDELE`.

## Grading

A challenge's target script runs through the same interpreter. The grader compares four stages:

| Stage | Checks |
|---|---|
| Geometry | bounding box, total volume (1 %), point-sampled shape match (98.5 %), volume count; area or line totals for shell/beam models; node positions for direct-generation models; required/forbidden commands |
| Attributes | element types used, material properties (EX, PRXY/NUXY, DENS), sections, real constants |
| Mesh | element count per type (solids and shells ±15 %, beams/springs/masses exact), node count (±20 %), point masses by location and value |
| Loads | constrained node count and location, force resultant, surface load faces, ACEL vector |

Challenges can loosen or skip checks with `grading.ignore` (by id prefix, for example `counts.volu`).
