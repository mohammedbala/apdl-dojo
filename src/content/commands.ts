// Command reference records: feed canon.ts (blank-means-zero / default slots), the reference page,
// autocomplete signatures, the stats heatmap axes and flashcard distractors.
//
// Arg DSL used below:  NAME        plain argument
//                      NAME=0      blank means zero (blankIsZero)
//                      NAME=1      blank means the number 1 (ANSYS default)
//                      NAME=S      blank means the label S
import type { CommandArg, CommandFamily, CommandInfo, TrackId } from './types';

/** CommandArg with an optional ANSYS default used when the field is blank (canon only). */
export interface CommandArgX extends CommandArg {
  dflt?: number | string;
}
export interface CommandInfoX extends CommandInfo {
  args: CommandArgX[];
}

function parseArgs(spec: string): CommandArgX[] {
  if (!spec) return [];
  return spec.split(',').map((tok) => {
    const [name, d] = tok.split('=');
    if (d === undefined) return { name };
    if (d === '0') return { name, blankIsZero: true, dflt: 0 };
    const n = Number(d);
    return { name, dflt: Number.isFinite(n) ? n : d };
  });
}

function abbrevOf(name: string): string | undefined {
  const prefix = name[0] === '/' || name[0] === '*' ? name[0] : '';
  const body = name.slice(prefix.length);
  return body.length > 4 ? prefix + body.slice(0, 4) : undefined;
}

function cmd(name: string, family: CommandFamily, spec: string, summary: string, trackIds: TrackId[], abbrev?: string): CommandInfoX {
  const args = parseArgs(spec);
  const signature = [name, ...args.map((a) => a.name)].join(',');
  const ab = abbrev === '' ? undefined : (abbrev ?? abbrevOf(name));
  return { name, abbrev: ab, family, signature, args, summary, trackIds };
}

const SEL = 'Type=S,Item,Comp,VMIN=0,VMAX,VINC=1,KABS=0';
const GEN = 'DX=0,DY=0,DZ=0,KINC=0,NOELEM=0,IMOVE=0';
const LIST9 = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`).join(',');

export const COMMANDS: CommandInfoX[] = [
  // ---------------------------------------------------------------- session / processors
  cmd('/PREP7', 'session', '', 'Enter the model-creation preprocessor (PREP7).', ['t1', 't2', 't10'], '/PREP'),
  cmd('FINISH', 'session', '', 'Exit the current processor back to BEGIN level.', ['t1', 't10'], 'FINI'),
  cmd('/SOLU', 'session', '', 'Enter the solution processor.', ['t9']),
  cmd('/CLEAR', 'session', 'Read', 'Clear the database and start a new model.', ['t1']),
  cmd('/TITLE', 'session', 'Title', 'Define the main title shown on plots.', ['t1']),
  cmd('SOLVE', 'session', 'Action', 'Start a solution (stubbed here: runs pre-checks only).', ['t9']),
  cmd('ANTYPE', 'session', 'Antype', 'Choose the analysis type (STATIC, MODAL, ...).', ['t9']),

  // ---------------------------------------------------------------- parameters / control
  cmd('*SET', 'macro', 'Par,VALUE', 'Assign a parameter value (NAME=value is the shorthand).', ['t8']),
  cmd('*DO', 'macro', 'Par,IVAL,FVAL,INC=1', 'Start a do-loop: Par runs from IVAL to FVAL in steps of INC.', ['t8', 't10']),
  cmd('*ENDDO', 'macro', '', 'Close the innermost *DO loop.', ['t8', 't10'], '*ENDD'),
  cmd('*IF', 'macro', 'VAL1,Oper1,VAL2,Base1', 'Conditional block: *IF,A,EQ,B,THEN ... *ENDIF.', ['t8']),
  cmd('*ELSEIF', 'macro', 'VAL1,Oper1,VAL2', 'Alternative branch inside an *IF block (cannot be abbreviated).', ['t8'], ''),
  cmd('*ELSE', 'macro', '', 'Final branch of an *IF block.', ['t8']),
  cmd('*ENDIF', 'macro', '', 'Close an *IF block.', ['t8'], '*ENDI'),
  cmd('*GET', 'macro', 'Par,Entity,ENTNUM=0,Item1,IT1NUM,Item2,IT2NUM', 'Retrieve a model value (count, max number, location ...) into a parameter.', ['t8', 't10']),
  cmd('*EXIT', 'macro', '', 'Exit the current *DO loop.', ['t8']),
  cmd('*CYCLE', 'macro', '', 'Skip to the next *DO iteration.', ['t8']),

  // ---------------------------------------------------------------- display
  cmd('/PNUM', 'display', 'Label,KEY=0', 'Turn entity numbering on plots on (1) or off (0).', ['t1', 't10']),
  cmd('/VIEW', 'display', 'WN=1,XV=0,YV=0,ZV=0', 'Set the viewing direction; /VIEW,1,1,1,1 is isometric.', ['t1', 't10']),
  cmd('/ESHAPE', 'display', 'SCALE=0,KEY=0', 'Display beams and shells with their real cross-section shape.', ['t5']),
  cmd('/AUTO', 'display', 'WN=1', 'Fit the plot to the window.', ['t1']),
  cmd('/REPLOT', 'display', 'Label', 'Redraw the last plot.', ['t1']),
  cmd('KPLOT', 'display', 'NP1,NP2,NINC', 'Plot the selected keypoints.', ['t1']),
  cmd('LPLOT', 'display', 'NL1,NL2,NINC', 'Plot the selected lines.', ['t1']),
  cmd('APLOT', 'display', 'NA1,NA2,NINC', 'Plot the selected areas.', ['t1']),
  cmd('VPLOT', 'display', 'NV1,NV2,NINC', 'Plot the selected volumes.', ['t1', 't2']),
  cmd('NPLOT', 'display', 'KNUM', 'Plot the selected nodes.', ['t4']),
  cmd('EPLOT', 'display', '', 'Plot the selected elements.', ['t4', 't6']),
  cmd('GPLOT', 'display', '', 'Plot all entity types together.', ['t1']),

  // ---------------------------------------------------------------- working plane / csys
  cmd('CSYS', 'geometry', 'KCN=0', 'Activate a coordinate system (0 cartesian, 1 cylindrical, 2 spherical).', ['t1', 't3']),
  cmd('LOCAL', 'geometry', 'KCN,KCS=0,XC=0,YC=0,ZC=0,THXY=0,THYZ=0,THZX=0', 'Define and activate a local coordinate system.', ['t3']),
  cmd('WPOFFS', 'geometry', 'XOFF=0,YOFF=0,ZOFF=0', 'Offset the working plane (cumulative, in WP coordinates).', ['t2', 't10']),
  cmd('WPROTA', 'geometry', 'THXY=0,THYZ=0,THZX=0', 'Rotate the working plane about its own Z, X and Y axes.', ['t2', 't3']),
  cmd('WPCSYS', 'geometry', 'WN=1,KCN', 'Align the working plane with a coordinate system.', ['t2']),

  // ---------------------------------------------------------------- keypoints / lines / areas / volumes
  cmd('K', 'geometry', 'NPT,X=0,Y=0,Z=0', 'Define a keypoint; K,,x,y,z takes the lowest free number.', ['t1', 't10']),
  cmd('KFILL', 'geometry', 'NP1,NP2,NFILL,NSTRT,NINC,SPACE', 'Generate keypoints evenly between two keypoints.', ['t1']),
  cmd('KGEN', 'geometry', `ITIME,NP1,NP2,NINC=1,${GEN}`, 'Copy a keypoint pattern; ITIME includes the original set.', ['t1', 't10']),
  cmd('KDELE', 'geometry', 'NP1,NP2,NINC=1', 'Delete unattached keypoints.', ['t1']),
  cmd('L', 'geometry', 'P1,P2,NDIV,SPACE', 'Straight (in active CSYS) line between two keypoints.', ['t1', 't10']),
  cmd('LSTR', 'geometry', 'P1,P2', 'Straight line between two keypoints regardless of CSYS.', ['t1']),
  cmd('LARC', 'geometry', 'P1,P2,PC,RAD', 'Circular arc from P1 to P2; PC sets the plane/curvature side.', ['t1', 't3']),
  cmd('CIRCLE', 'geometry', 'PCENT,RAD,PAXIS,PZERO,ARC,NSEG', 'Generate circular arc lines around a centre keypoint.', ['t1']),
  cmd('LGEN', 'geometry', `ITIME,NL1,NL2,NINC=1,${GEN}`, 'Copy a line pattern (ITIME includes original).', ['t1']),
  cmd('LDELE', 'geometry', 'NL1,NL2,NINC=1,KSWP=0', 'Delete lines (KSWP=1 also deletes keypoints).', ['t1']),
  cmd('A', 'geometry', LIST9('P', 9), 'Area through keypoints listed in boundary order.', ['t1', 't10']),
  cmd('AL', 'geometry', LIST9('L', 10), 'Area bounded by the listed lines.', ['t1']),
  cmd('AGEN', 'geometry', `ITIME,NA1,NA2,NINC=1,${GEN}`, 'Copy an area pattern (ITIME includes original).', ['t1', 't10']),
  cmd('ADELE', 'geometry', 'NA1,NA2,NINC=1,KSWP=0', 'Delete areas (KSWP=1 also lines/keypoints).', ['t1']),
  cmd('V', 'geometry', LIST9('P', 8), 'Volume through 8 keypoints (bottom face then top face).', ['t1']),
  cmd('VA', 'geometry', LIST9('A', 10), 'Volume bounded by the listed areas.', ['t1']),
  cmd('VGEN', 'geometry', `ITIME,NV1,NV2,NINC=1,${GEN}`, 'Copy a volume pattern (ITIME includes original).', ['t1', 't2']),
  cmd('VDELE', 'geometry', 'NV1,NV2,NINC=1,KSWP=0', 'Delete volumes (KSWP=1 also lower entities).', ['t1', 't2']),

  // ---------------------------------------------------------------- primitives
  cmd('BLOCK', 'primitive', 'X1=0,X2=0,Y1=0,Y2=0,Z1=0,Z2=0', 'Block by WP coordinate ranges X1,X2,Y1,Y2,Z1,Z2.', ['t2', 't10']),
  cmd('BLC4', 'primitive', 'XCORNER=0,YCORNER=0,WIDTH=0,HEIGHT=0,DEPTH=0', 'Block (or rectangle if DEPTH=0) by WP corner + sizes.', ['t2', 't10']),
  cmd('BLC5', 'primitive', 'XCENTER=0,YCENTER=0,WIDTH=0,HEIGHT=0,DEPTH=0', 'Block (or rectangle) by WP centre + sizes.', ['t2']),
  cmd('CYLIND', 'primitive', 'RAD1=0,RAD2=0,Z1=0,Z2=0,THETA1=0,THETA2=360', 'Cylinder about the WP Z axis by radii and Z range.', ['t2']),
  cmd('CYL4', 'primitive', 'XCENTER=0,YCENTER=0,RAD1=0,THETA1=0,RAD2=0,THETA2=360,DEPTH=0', 'Circular area or cylinder at a WP centre (DEPTH=0 gives an area).', ['t2', 't10']),
  cmd('CONE', 'primitive', 'RBOT=0,RTOP=0,Z1=0,Z2=0,THETA1=0,THETA2=360', 'Cone or frustum about the WP Z axis.', ['t2']),
  cmd('SPHERE', 'primitive', 'RAD1=0,RAD2=0,THETA1=0,THETA2=360', 'Sphere centred at the WP origin.', ['t2']),
  cmd('RECTNG', 'primitive', 'X1=0,X2=0,Y1=0,Y2=0', 'Rectangular area by WP X and Y ranges.', ['t2', 't3']),
  cmd('PCIRC', 'primitive', 'RAD1=0,RAD2=0,THETA1=0,THETA2=360', 'Circular area at the WP origin.', ['t2']),

  // ---------------------------------------------------------------- booleans
  cmd('VADD', 'boolean', LIST9('NV', 9), 'Add (union) volumes into one volume.', ['t2']),
  cmd('VSBV', 'boolean', 'NV1,NV2,SEPO,KEEP1,KEEP2', 'Subtract volume NV2 from NV1; inputs are deleted, result renumbered.', ['t2', 't10']),
  cmd('VGLUE', 'boolean', LIST9('NV', 9), 'Glue volumes so touching faces become shared areas (renumbers).', ['t2', 't10']),
  cmd('VOVLAP', 'boolean', LIST9('NV', 9), 'Overlap volumes: split into shared and unshared pieces.', ['t2']),
  cmd('VPTN', 'boolean', LIST9('NV', 9), 'Partition volumes against each other.', ['t2']),
  cmd('VSBA', 'boolean', 'NV,NA,SEPO,KEEPV,KEEPA', 'Cut volumes with areas (e.g. a working-plane slice).', ['t2']),
  cmd('AADD', 'boolean', LIST9('NA', 9), 'Add (union) coplanar areas.', ['t2']),
  cmd('ASBA', 'boolean', 'NA1,NA2,SEPO,KEEP1,KEEP2', 'Subtract area NA2 from NA1 (holes in plates).', ['t2', 't10']),
  cmd('AGLUE', 'boolean', LIST9('NA', 9), 'Glue areas so touching edges become shared lines.', ['t2']),

  // ---------------------------------------------------------------- sweeps
  cmd('VEXT', 'sweep', 'NA1,NA2,NINC=1,DX=0,DY=0,DZ=0,RX=0,RY=0,RZ=0', 'Extrude areas by offsets DX,DY,DZ (optional scale RX,RY,RZ).', ['t3', 't10']),
  cmd('VOFFST', 'sweep', 'NAREA,DIST,KINC=0', 'Extrude one area along its normal by DIST.', ['t3', 't10']),
  cmd('VDRAG', 'sweep', `${LIST9('NA', 6)},${LIST9('NLP', 6)}`, 'Drag areas (six slots) along a line path (six slots).', ['t3', 't10']),
  cmd('VROTAT', 'sweep', `${LIST9('NA', 6)},PAX1,PAX2,ARC=360,NSEG`, 'Revolve areas (six slots) about the axis PAX1-PAX2.', ['t3']),
  cmd('AROTAT', 'sweep', `${LIST9('NL', 6)},PAX1,PAX2,ARC=360,NSEG`, 'Revolve lines about an axis to make areas.', ['t3']),
  cmd('ADRAG', 'sweep', `${LIST9('NL', 6)},${LIST9('NLP', 6)}`, 'Drag lines along a path to make areas.', ['t3']),

  // ---------------------------------------------------------------- attributes
  cmd('ET', 'attribute', 'ITYPE,Ename,KOP1=0,KOP2=0,KOP3=0,KOP4=0,KOP5=0,KOP6=0,INOPR=0', 'Define element type ITYPE (SOLID185, BEAM188, SHELL181 ...).', ['t5', 't10']),
  cmd('KEYOPT', 'attribute', 'ITYPE,KNUM,VALUE=0', 'Set element key option KNUM of type ITYPE.', ['t5', 't10']),
  cmd('MP', 'attribute', 'Lab,MAT,C0=0,C1=0,C2=0,C3=0,C4=0', 'Material property: MP,EX|PRXY|NUXY|DENS,MAT,value.', ['t5', 't10']),
  cmd('R', 'attribute', 'NSET,R1=0,R2=0,R3=0,R4=0,R5=0,R6=0', 'Real constant set (MASS21 mass, COMBIN14 stiffness ...).', ['t5', 't10']),
  cmd('RMORE', 'attribute', 'R7=0,R8=0,R9=0,R10=0,R11=0,R12=0', 'Continue the previous real constant set.', ['t5']),
  cmd('SECTYPE', 'attribute', 'SECID,Type,Subtype,Name,REFINEKEY', 'Define a section: SECTYPE,1,BEAM,RECT or SECTYPE,2,SHELL.', ['t5', 't10']),
  cmd('SECDATA', 'attribute', 'VAL1=0,VAL2=0,VAL3=0,VAL4=0,VAL5=0,VAL6=0', 'Section dimensions: RECT = B,H; SHELL = thickness.', ['t5', 't10']),
  cmd('SECOFFSET', 'attribute', 'Location,OFFSET1=0,OFFSET2=0', 'Offset a beam/shell section (CENT, TOP, BOT, MID ...).', ['t5']),
  cmd('TYPE', 'attribute', 'ITYPE=1', 'Activate element type for direct generation / meshing.', ['t4', 't5']),
  cmd('MAT', 'attribute', 'MAT=1', 'Activate material number.', ['t4', 't5']),
  cmd('REAL', 'attribute', 'NSET=1', 'Activate real constant set.', ['t4', 't5']),
  cmd('SECNUM', 'attribute', 'SECID=1', 'Activate section number.', ['t4', 't5']),
  cmd('ESYS', 'attribute', 'KCN=0', 'Activate element coordinate system.', ['t5']),
  cmd('LATT', 'attribute', 'MAT,REAL,TYPE,ESYS,KB,KE,SECNUM', 'Assign MAT, REAL, TYPE, ESYS, orientation KP and SECNUM to selected lines.', ['t5', 't10']),
  cmd('AATT', 'attribute', 'MAT,REAL,TYPE,ESYS,SECN', 'Assign attributes to selected areas.', ['t5', 't10']),
  cmd('VATT', 'attribute', 'MAT,REAL,TYPE,ESYS,SECNUM', 'Assign attributes to selected volumes.', ['t5', 't10']),
  cmd('KATT', 'attribute', 'MAT,REAL,TYPE,ESYS', 'Assign attributes to selected keypoints (point elements).', ['t5']),

  // ---------------------------------------------------------------- meshing
  cmd('ESIZE', 'mesh', 'SIZE=0,NDIV=0', 'Default element edge size (or divisions per line).', ['t6', 't10']),
  cmd('LESIZE', 'mesh', 'NL1,SIZE=0,ANGSIZ=0,NDIV=0,SPACE=1', 'Divisions or size on selected lines: LESIZE,NL1,SIZE,,NDIV.', ['t6', 't10']),
  cmd('AESIZE', 'mesh', 'ANUM,SIZE=0', 'Element size on area interiors.', ['t6']),
  cmd('MSHAPE', 'mesh', 'KEY=0,Dimension=3D', 'Element shape: 0 hex/quad, 1 tet/tri.', ['t6']),
  cmd('MSHKEY', 'mesh', 'KEY=0', 'Meshing type: 0 free, 1 mapped, 2 mapped if possible.', ['t6']),
  cmd('VMESH', 'mesh', 'NV1,NV2,NINC=1', 'Mesh volumes with the active attributes.', ['t6', 't10']),
  cmd('AMESH', 'mesh', 'NA1,NA2,NINC=1', 'Mesh areas (shell elements).', ['t6', 't10']),
  cmd('LMESH', 'mesh', 'NL1,NL2,NINC=1', 'Mesh lines (beam / link elements).', ['t6', 't10']),
  cmd('KMESH', 'mesh', 'NP1,NP2,NINC=1', 'Mesh keypoints (MASS21 point elements).', ['t6', 't10']),
  cmd('VSWEEP', 'mesh', 'VNUM,SRCA,TRGA,LSMO=0', 'Sweep-mesh a volume from a source to a target area.', ['t6', 't10']),
  cmd('VCLEAR', 'mesh', 'NV1,NV2,NINC=1', 'Delete the mesh of volumes.', ['t6']),
  cmd('ACLEAR', 'mesh', 'NA1,NA2,NINC=1', 'Delete the mesh of areas.', ['t6']),

  // ---------------------------------------------------------------- direct generation / numbering
  cmd('N', 'direct', 'NODE,X=0,Y=0,Z=0,THXY=0,THYZ=0,THZX=0', 'Define a node in the active coordinate system.', ['t4', 't10']),
  cmd('NGEN', 'direct', 'ITIME,INC,NODE1,NODE2,NINC=1,DX=0,DY=0,DZ=0,SPACE', 'Copy a node pattern: ITIME sets (incl. original), node increment INC.', ['t4', 't10']),
  cmd('NFILL', 'direct', 'NODE1,NODE2,NFILL,NSTRT,NINC,ITIME,INC,SPACE', 'Fill nodes evenly between two nodes.', ['t4']),
  cmd('NDELE', 'direct', 'NODE1,NODE2,NINC=1', 'Delete nodes.', ['t4']),
  cmd('E', 'direct', 'I,J,K,L,M,N,O,P', 'Define an element from node numbers (active TYPE/MAT/REAL/SECNUM).', ['t4', 't10']),
  cmd('EGEN', 'direct', 'ITIME,NINC,IEL1,IEL2,IEINC=1,MINC=0,TINC=0,RINC=0,CINC=0,SINC=0,DX=0,DY=0,DZ=0', 'Copy elements by offsetting their node numbers by NINC.', ['t4', 't10']),
  cmd('EDELE', 'direct', 'IEL1,IEL2,INC=1', 'Delete elements.', ['t4']),
  cmd('NUMMRG', 'direct', 'Label,TOLER,GTOLER,Action,Switch', 'Merge coincident items (NODE, KP, ELEM, ALL); lower numbers kept.', ['t4', 't10']),
  cmd('NUMCMP', 'direct', 'Label', 'Compress numbering to remove gaps.', ['t4']),
  cmd('NUMSTR', 'direct', 'Label,VALUE', 'Set the starting number for new entities.', ['t4']),

  // ---------------------------------------------------------------- selection / components
  cmd('KSEL', 'select', SEL.replace('Item', 'Item=KP'), 'Select keypoints (S/R/A/U, LOC, number range ...).', ['t7']),
  cmd('LSEL', 'select', SEL.replace('Item', 'Item=LINE'), 'Select lines; LOC tests the line centroid.', ['t7', 't6']),
  cmd('ASEL', 'select', SEL.replace('Item', 'Item=AREA'), 'Select areas; LOC tests the area centroid.', ['t7', 't3']),
  cmd('VSEL', 'select', SEL.replace('Item', 'Item=VOLU'), 'Select volumes; LOC tests the volume centroid.', ['t7', 't10']),
  cmd('NSEL', 'select', SEL.replace('Item', 'Item=NODE'), 'Select nodes (e.g. NSEL,S,LOC,Z,0).', ['t7', 't9', 't10']),
  cmd('ESEL', 'select', SEL.replace('Item', 'Item=ELEM'), 'Select elements (TYPE, MAT, REAL, SEC ...).', ['t7']),
  cmd('NSLA', 'select', 'Type=S,NKEY=0', 'Select nodes attached to selected areas (NKEY=1 includes interior).', ['t7', 't9']),
  cmd('NSLV', 'select', 'Type=S,NKEY=0', 'Select nodes attached to selected volumes (NKEY=1 all).', ['t7']),
  cmd('NSLL', 'select', 'Type=S,NKEY=0', 'Select nodes attached to selected lines (NKEY=1 includes interior).', ['t7']),
  cmd('NSLK', 'select', 'Type=S', 'Select nodes at the selected keypoints.', ['t7']),
  cmd('NSLE', 'select', 'Type=S,NodeType=ALL', 'Select nodes attached to the selected elements.', ['t7']),
  cmd('ESLN', 'select', 'Type=S,EKEY=0,NodeType=ALL', 'Select elements attached to the selected nodes.', ['t7']),
  cmd('ESLV', 'select', 'Type=S', 'Select elements belonging to the selected volumes.', ['t7']),
  cmd('ASLV', 'select', 'Type=S', 'Select areas of the selected volumes.', ['t7']),
  cmd('LSLA', 'select', 'Type=S', 'Select lines of the selected areas.', ['t7']),
  cmd('ALLSEL', 'select', 'LabT=ALL,Entity=ALL', 'Select everything again.', ['t7', 't10'], 'ALLS'),
  cmd('CM', 'select', 'Cname,Entity', 'Group the selected entities into a named component.', ['t7', 't10']),
  cmd('CMSEL', 'select', 'Type=S,Name,Entity', 'Select a component by name.', ['t7']),
  cmd('CMDELE', 'select', 'Name', 'Delete a component.', ['t7']),

  // ---------------------------------------------------------------- loads
  cmd('D', 'load', 'NODE,Lab,VALUE=0,VALUE2=0,NEND,NINC,Lab2,Lab3,Lab4,Lab5,Lab6', 'Constrain DOFs at nodes: D,ALL,ALL fixes the selected nodes.', ['t9', 't10']),
  cmd('DK', 'load', 'KPOI,Lab,VALUE=0,VALUE2=0,KEXPND=0', 'Constrain DOFs at keypoints (transferred to nodes).', ['t9']),
  cmd('DL', 'load', 'LINE,AREA,Lab,Value1=0,Value2=0', 'Constrain DOFs on lines.', ['t9']),
  cmd('DA', 'load', 'AREA,Lab,Value1=0,Value2=0', 'Constrain DOFs on areas.', ['t9', 't10']),
  cmd('F', 'load', 'NODE,Lab,VALUE=0,VALUE2=0,NEND,NINC', 'Nodal force or moment (FX FY FZ MX MY MZ).', ['t9']),
  cmd('FK', 'load', 'KPOI,Lab,VALUE=0,VALUE2=0', 'Force at keypoints.', ['t9']),
  cmd('SFA', 'load', 'AREA,LKEY=1,Lab,VALUE=0,VALUE2=0', 'Surface load (PRES) on areas.', ['t9']),
  cmd('SFE', 'load', 'ELEM,LKEY,Lab,KVAL,VAL1=0', 'Surface load on element faces.', ['t9']),
  cmd('ACEL', 'load', 'ACEL_X=0,ACEL_Y=0,ACEL_Z=0', 'Global acceleration; ACEL,,,9.81 = gravity acting in -Z.', ['t9', 't10']),

  // ---------------------------------------------------------------- more supported commands
  cmd('*AFUN', 'macro', 'Lab', 'Angle units for trig functions: DEG or RAD.', ['t8']),
  cmd('*DIM', 'macro', 'Par,Type,IMAX,JMAX,KMAX', 'Dimension an array parameter (ARRAY).', ['t8']),
  cmd('*STATUS', 'macro', '', 'List all parameters in the output log.', ['t8']),
  cmd('/COM', 'session', 'Comment', 'Print a comment line to the output.', ['t1']),
  cmd('/NUMBER', 'display', 'NKEY=0', 'Show numbers and/or colours on plots.', ['t1']),
  cmd('/POST1', 'session', '', 'Enter the general postprocessor (no results in the trainer).', ['t9']),
  cmd('CON4', 'primitive', 'XCENTER,YCENTER,RAD1,RAD2=0,DEPTH', 'Cone from a WP centre, bottom and top radii and depth.', ['t2']),
  cmd('CYL5', 'primitive', 'XEDGE1,YEDGE1,XEDGE2,YEDGE2,DEPTH', 'Cylinder from the two ends of a diameter.', ['t2']),
  cmd('SPH4', 'primitive', 'XCENTER,YCENTER,RAD1,RAD2=0', 'Sphere centred at a WP point.', ['t2']),
  cmd('RPR4', 'primitive', 'NSIDES,XCENTER,YCENTER,RADIUS,THETA=0,DEPTH=0', 'Regular polygon area (or prism with DEPTH).', ['t2']),
  cmd('RPRISM', 'primitive', 'Z1,Z2,NSIDES,LSIDE,MAJRAD,MINRAD', 'Regular prism about the WP Z axis.', ['t2']),
  cmd('POLYGON', 'primitive', 'NPT,X1,Y1,X2,Y2,X3,Y3,X4,Y4', 'Polygon area from WP vertices.', ['t2']),
  cmd('VINV', 'boolean', 'NV1,NV2,NV3,NV4,NV5,NV6,NV7,NV8,NV9', 'Intersection of volumes.', ['t2']),
  cmd('AOVLAP', 'boolean', 'NA1,NA2,NA3,NA4,NA5,NA6,NA7,NA8,NA9', 'Overlap areas: split into pieces that share boundaries.', ['t2']),
  cmd('BOPTN', 'boolean', 'Lab,Value', 'Boolean options, e.g. BOPTN,KEEP,YES keeps inputs.', ['t2']),
  cmd('KSYMM', 'geometry', 'Ncomp,NP1,NP2,NINC=1,KINC=0,NOELEM=0,IMOVE=0', 'Reflect keypoints about the X, Y or Z plane of the active CSYS.', ['t1']),
  cmd('LSYMM', 'geometry', 'Ncomp,NL1,NL2,NINC=1,KINC=0,NOELEM=0,IMOVE=0', 'Reflect lines.', ['t1']),
  cmd('ARSYM', 'geometry', 'Ncomp,NA1,NA2,NINC=1,KINC=0,NOELEM=0,IMOVE=0', 'Reflect areas.', ['t1']),
  cmd('VSYMM', 'geometry', 'Ncomp,NV1,NV2,NINC=1,KINC=0,NOELEM=0,IMOVE=0', 'Reflect volumes (half model -> full model).', ['t1']),
  cmd('KMODIF', 'geometry', 'NPT,X,Y,Z', 'Move an existing keypoint (blank = keep coordinate).', ['t1']),
  cmd('LDIV', 'geometry', 'NL1,RATIO=0.5,PDIV,NDIV=2,KEEP=0', 'Divide a line into NDIV pieces.', ['t1']),
  cmd('KWPAVE', 'geometry', 'P1,P2,P3,P4,P5,P6,P7,P8,P9', 'Move the WP origin to the average of keypoints.', ['t2']),
  cmd('WPAVE', 'geometry', 'X1,Y1,Z1,X2,Y2,Z2,X3,Y3,Z3', 'Move the WP origin to the average of points.', ['t2']),
  cmd('CLOCAL', 'geometry', 'KCN,KCS,XL,YL,ZL,THXY,THYZ,THZX', 'Local coordinate system relative to the active one.', ['t1']),
  cmd('MPDATA', 'attribute', 'Lab,MAT,STLOC,C1', 'Material property data (first value used).', ['t5']),
  cmd('SELTOL', 'select', 'Toler', 'Tolerance for xSEL,LOC range tests.', ['t7']),
  cmd('ASLL', 'select', 'Type=S,ARKEY=0', 'Select areas containing the selected lines.', ['t7']),
  cmd('LSLK', 'select', 'Type=S,LSKEY=0', 'Select lines containing the selected keypoints.', ['t7']),
  cmd('KSLL', 'select', 'Type=S', 'Select keypoints of the selected lines.', ['t7']),
  cmd('KSLN', 'select', 'Type=S', 'Select keypoints at the selected nodes.', ['t7']),
  cmd('VSLA', 'select', 'Type=S,VLKEY=0', 'Select volumes containing the selected areas.', ['t7']),
  cmd('ESLA', 'select', 'Type=S', 'Select elements meshed on the selected areas.', ['t7']),
  cmd('ESLL', 'select', 'Type=S', 'Select elements meshed on the selected lines.', ['t7']),
  cmd('NSYM', 'direct', 'Ncomp,INC,NODE1,NODE2,NINC=1', 'Reflect nodes about the X, Y or Z plane; numbers + INC.', ['t4']),
  cmd('NMODIF', 'direct', 'NODE,X,Y,Z', 'Move an existing node (blank = keep coordinate).', ['t4']),
  cmd('EN', 'direct', 'IEL,I,J,K,L,M,N,O,P', 'Define an element with an explicit element number.', ['t4']),
  cmd('ENGEN', 'direct', 'IINC,ITIME,NINC,IEL1,IEL2,IEINC=1,MINC=0,TINC=0,RINC=0,CINC=0,SINC=0', 'Copy elements with explicit element-number increments.', ['t4']),
  cmd('EMODIF', 'direct', 'IEL,STLOC,I1', 'Change an element attribute: EMODIF,IEL,MAT,2.', ['t5']),
  cmd('DDELE', 'load', 'NODE,Lab=ALL,NEND,NINC', 'Delete constraints at nodes.', ['t9']),
  cmd('FDELE', 'load', 'NODE,Lab=ALL,NEND,NINC', 'Delete nodal forces.', ['t9']),
  cmd('SF', 'load', 'Nlist,Lab,VALUE', 'Surface load on element faces whose nodes are all selected.', ['t9']),
  cmd('SFL', 'load', 'LINE,Lab,VALI,VALJ', 'Surface load on lines.', ['t9']),
  cmd('VSUM', 'display', 'LAB', 'Total volume of the selected volumes in the log.', ['t1']),
  cmd('ASUM', 'display', 'LAB', 'Total area of the selected areas in the log.', ['t1']),
];

export const COMMAND_INFO: ReadonlyMap<string, CommandInfoX> = new Map(COMMANDS.map((c) => [c.name, c]));

export function getCommandInfo(name: string): CommandInfoX | undefined {
  return COMMAND_INFO.get(name.toUpperCase());
}

/** Flashcard glossary (plan §9). Individual command names. */
export const GLOSSARY: readonly string[] = [
  '/PREP7', 'FINISH', 'ET', 'KEYOPT', 'MP', 'R', 'SECTYPE', 'SECDATA', 'TYPE', 'MAT', 'REAL', 'SECNUM', 'LATT', 'VATT',
  'K', 'L', 'LARC', 'A', 'RECTNG', 'CYL4', 'BLOCK', 'BLC4', 'WPOFFS', 'VEXT', 'VOFFST', 'VDRAG', 'VROTAT', 'KGEN', 'AGEN',
  'VSBV', 'ASBA', 'VGLUE', 'AGLUE', 'VADD', 'ESIZE', 'LESIZE', 'MSHKEY', 'MSHAPE', 'VMESH', 'VSWEEP', 'AMESH', 'LMESH',
  'N', 'NGEN', 'E', 'EGEN', 'NUMMRG', 'NSEL', 'VSEL', 'NSLK', 'NSLL', 'NSLA', 'NSLV', 'CM', 'ALLSEL', 'D', 'F', 'ACEL',
  '*DO', '*GET', '/PNUM', '/VIEW', '/ESHAPE',
];

/** Families in display order (reference page, drill setup). */
export const FAMILIES: { id: CommandFamily; label: string }[] = [
  { id: 'session', label: 'Session' },
  { id: 'geometry', label: 'Geometry' },
  { id: 'primitive', label: 'Primitives' },
  { id: 'boolean', label: 'Booleans' },
  { id: 'sweep', label: 'Sweeps' },
  { id: 'direct', label: 'Direct generation' },
  { id: 'attribute', label: 'Attributes' },
  { id: 'mesh', label: 'Meshing' },
  { id: 'select', label: 'Selection' },
  { id: 'load', label: 'Loads' },
  { id: 'macro', label: 'Macro / control' },
  { id: 'display', label: 'Display' },
];
