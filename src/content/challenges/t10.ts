// Track t10 challenges: Boss — TGF-36 tabletop foundation four ways, plus the speedrun target.
import type { Challenge } from '../types';
import { BOOLEANS, PRIMITIVES, SWEEPS } from '../tracks';

/** Reference scripts (models/reference/TGF36_*.inp), inlined so the content bundle is self-contained. */
const TGF36_A = `! =====================================================================
!  TGF36_A.inp  -  TG tabletop foundation, Technique A
!  Solid primitives (BLOCK / BLC4) + Booleans (VSBV / VGLUE)
!  Units SI (m,kg,s,N). Z vertical. Mat bottom at z=0, fixed.
! =====================================================================
/CLEAR,NOSTART
/TITLE,TGF-36 tabletop foundation - A: primitives + Booleans
/PREP7
LENGTH = 36      $ WIDTH  = 12      ! deck plan
DECK_T = 3       $ DECK_EL= 14      ! deck thickness, top elevation
MAT_T  = 3       $ MAT_OH = 1       ! mat thickness, overhang each side
COL_B  = 2       $ COL_D  = 3       ! column size X, Y
NCOLX  = 4       $ COL_X0 = 4       $ COL_SP = 10
COL_Y1 = 2.5     $ COL_Y2 = 11.5
OP_L   = 6       $ OP_W   = 5       $ OP_Y0  = 4.5
OP_X1  = 6       $ OP_X2  = 26
E_C    = 3.0E10  $ NU_C   = 0.2     $ RHO_C  = 2500
ESZ    = 1.0
M_B1 = 80E3 $ M_B2 = 150E3 $ M_B3 = 150E3 $ M_B4 = 120E3
X0 = MAT_OH $ Y0 = MAT_OH
MAT_L = LENGTH+2*MAT_OH $ MAT_W = WIDTH+2*MAT_OH
DECK_Z0 = DECK_EL-DECK_T $ COL_H = DECK_Z0-MAT_T $ BY = (COL_Y1+COL_Y2)/2
! ---------- element types / material / reals ----------
ET,1,SOLID185
ET,2,MASS21
KEYOPT,2,3,2                       ! 3-D mass, no rotary inertia (one real)
MP,EX,1,E_C $ MP,PRXY,1,NU_C $ MP,DENS,1,RHO_C
R,11,M_B1 $ R,12,M_B2 $ R,13,M_B3 $ R,14,M_B4
! ---------- base mat: BLOCK is X1,X2,Y1,Y2,Z1,Z2 (working-plane coords) ----------
BLOCK,0,MAT_L,0,MAT_W,0,MAT_T
! ---------- columns: BLC4 is XCORNER,YCORNER,WIDTH,HEIGHT,DEPTH from WP ----------
WPOFFS,0,0,MAT_T                   ! move working plane to top of mat
*DO,I,1,NCOLX
  XC = COL_X0+(I-1)*COL_SP
  BLC4,XC-COL_B/2,COL_Y1-COL_D/2,COL_B,COL_D,COL_H
  BLC4,XC-COL_B/2,COL_Y2-COL_D/2,COL_B,COL_D,COL_H
*ENDDO
WPOFFS,0,0,-MAT_T                  ! WP back to global origin
! ---------- deck + openings ----------
BLOCK,X0,X0+LENGTH,Y0,Y0+WIDTH,DECK_Z0,DECK_EL
*GET,VDK,VOLU,0,NUM,MAX            ! deck volume number (=10)
BLOCK,OP_X1,OP_X1+OP_L,OP_Y0,OP_Y0+OP_W,DECK_Z0-1,DECK_EL+1   ! tool, overshoots
BLOCK,OP_X2,OP_X2+OP_L,OP_Y0,OP_Y0+OP_W,DECK_Z0-1,DECK_EL+1
*GET,VT2,VOLU,0,NUM,MAX            ! second tool (=12)
VSBV,VDK,VT2-1                     ! VSBV,NV1,NV2,SEPO,KEEP1,KEEP2  -> new deck
*GET,VDK,VOLU,0,NUM,MAX
VSBV,VDK,VT2
/PNUM,VOLU,1 $ /VIEW,1,1,1,1 $ VPLOT   ! 10 volumes, not yet connected
! ---------- glue (renumbers all touching volumes) ----------
VGLUE,ALL                          ! still 10 volumes, shared faces
VPLOT
! ---------- mesh ----------
TYPE,1 $ MAT,1
ESIZE,ESZ
VSEL,S,LOC,Z,MAT_T,DECK_Z0         ! column volumes (centroid z=7)
CM,V_COLS,VOLU
MSHAPE,0,3D $ MSHKEY,1             ! mapped hex
VMESH,ALL
VSEL,INVE                          ! mat + deck
MSHKEY,0
VSWEEP,ALL                         ! swept hex
ALLSEL
! ---------- supports, masses, gravity ----------
NSEL,S,LOC,Z,0
D,ALL,ALL,0
CM,N_MATBOT,NODE
ALLSEL
TYPE,2
REAL,11 $ E,NODE(COL_X0,BY,DECK_EL)
REAL,12 $ E,NODE(COL_X0+COL_SP,BY,DECK_EL)
REAL,13 $ E,NODE(COL_X0+2*COL_SP,BY,DECK_EL)
REAL,14 $ E,NODE(COL_X0+3*COL_SP,BY,DECK_EL)
ESEL,S,TYPE,,2 $ CM,E_BRGMASS,ELEM $ ALLSEL
ACEL,0,0,9.81
/PNUM,VOLU,0 $ EPLOT
FINISH`;
const TGF36_B = `! =====================================================================
!  TGF36_B.inp  -  TG tabletop foundation, Technique B
!  Bottom-up: keypoints -> areas -> VEXT; KGEN/AGEN replicate columns
!  Rule: create ALL footprint areas first, extrude last (avoids
!  VEXT-generated keypoints colliding with explicit K numbers).
! =====================================================================
/CLEAR,NOSTART
/TITLE,TGF-36 tabletop foundation - B: bottom-up
/PREP7
LENGTH = 36      $ WIDTH  = 12
DECK_T = 3       $ DECK_EL= 14
MAT_T  = 3       $ MAT_OH = 1
COL_B  = 2       $ COL_D  = 3
NCOLX  = 4       $ COL_X0 = 4       $ COL_SP = 10
COL_Y1 = 2.5     $ COL_Y2 = 11.5
OP_L   = 6       $ OP_W   = 5       $ OP_Y0  = 4.5
OP_X1  = 6       $ OP_X2  = 26
E_C    = 3.0E10  $ NU_C   = 0.2     $ RHO_C  = 2500
ESZ    = 1.0
M_B1 = 80E3 $ M_B2 = 150E3 $ M_B3 = 150E3 $ M_B4 = 120E3
X0 = MAT_OH $ Y0 = MAT_OH
MAT_L = LENGTH+2*MAT_OH $ MAT_W = WIDTH+2*MAT_OH
DECK_Z0 = DECK_EL-DECK_T $ COL_H = DECK_Z0-MAT_T $ BY = (COL_Y1+COL_Y2)/2
ET,1,SOLID185
ET,2,MASS21 $ KEYOPT,2,3,2
MP,EX,1,E_C $ MP,PRXY,1,NU_C $ MP,DENS,1,RHO_C
R,11,M_B1 $ R,12,M_B2 $ R,13,M_B3 $ R,14,M_B4
! ---------- mat footprint at z=0 ----------
K,1,0,0,0 $ K,2,MAT_L,0,0 $ K,3,MAT_L,MAT_W,0 $ K,4,0,MAT_W,0
A,1,2,3,4                              ! area 1
! ---------- first column footprint (row 1) at z=MAT_T, replicate ----------
XA = COL_X0-COL_B/2 $ YA = COL_Y1-COL_D/2
K,11,XA,YA,MAT_T $ K,12,XA+COL_B,YA,MAT_T
K,13,XA+COL_B,YA+COL_D,MAT_T $ K,14,XA,YA+COL_D,MAT_T
KGEN,2,11,14,1,0,COL_Y2-COL_Y1,0,4     ! row-2 keypoints 15..18 (KINC=4)
A,11,12,13,14 $ A,15,16,17,18          ! areas 2,3
*GET,ACOL,AREA,0,NUM,MAX
AGEN,NCOLX,ACOL-1,ACOL,1,COL_SP        ! AGEN,ITIME,NA1,NA2,NINC,DX -> 8 footprints
/PNUM,KP,1 $ /PNUM,AREA,1 $ /VIEW,1,1,1,1 $ APLOT
! ---------- deck outline + openings at z=DECK_Z0 ----------
K,,X0,Y0,DECK_Z0 $ K,,X0+LENGTH,Y0,DECK_Z0
K,,X0+LENGTH,Y0+WIDTH,DECK_Z0 $ K,,X0,Y0+WIDTH,DECK_Z0
*GET,KT,KP,0,NUM,MAX
A,KT-3,KT-2,KT-1,KT
*GET,ADK,AREA,0,NUM,MAX
*DO,I,1,2
  XO = OP_X1+(I-1)*(OP_X2-OP_X1)
  K,,XO,OP_Y0,DECK_Z0 $ K,,XO+OP_L,OP_Y0,DECK_Z0
  K,,XO+OP_L,OP_Y0+OP_W,DECK_Z0 $ K,,XO,OP_Y0+OP_W,DECK_Z0
  *GET,KT,KP,0,NUM,MAX
  A,KT-3,KT-2,KT-1,KT
*ENDDO
ASEL,S,LOC,Z,DECK_Z0
ASEL,U,AREA,,ADK
CM,A_OPEN,AREA
ALLSEL
ASBA,ADK,A_OPEN                        ! deck footprint with two holes
! ---------- extrude: deck first, columns, then mat (selection by Z) ----------
ASEL,S,LOC,Z,DECK_Z0 $ VEXT,ALL,,,0,0,DECK_T     ! VEXT,NA1,NA2,NINC,DX,DY,DZ
ASEL,S,LOC,Z,MAT_T   $ VEXT,ALL,,,0,0,COL_H
ASEL,S,LOC,Z,0       $ VEXT,ALL,,,0,0,MAT_T
ALLSEL
/PNUM,KP,0 $ /PNUM,AREA,0 $ /PNUM,VOLU,1 $ VPLOT     ! 10 volumes
VGLUE,ALL
! ---------- mesh (identical to A) ----------
TYPE,1 $ MAT,1 $ ESIZE,ESZ
VSEL,S,LOC,Z,MAT_T,DECK_Z0 $ CM,V_COLS,VOLU
MSHAPE,0,3D $ MSHKEY,1 $ VMESH,ALL
VSEL,INVE $ MSHKEY,0 $ VSWEEP,ALL
ALLSEL
! ---------- BCs ----------
NSEL,S,LOC,Z,0 $ D,ALL,ALL,0 $ CM,N_MATBOT,NODE $ ALLSEL
TYPE,2
REAL,11 $ E,NODE(COL_X0,BY,DECK_EL)
REAL,12 $ E,NODE(COL_X0+COL_SP,BY,DECK_EL)
REAL,13 $ E,NODE(COL_X0+2*COL_SP,BY,DECK_EL)
REAL,14 $ E,NODE(COL_X0+3*COL_SP,BY,DECK_EL)
ESEL,S,TYPE,,2 $ CM,E_BRGMASS,ELEM $ ALLSEL
ACEL,0,0,9.81
/PNUM,VOLU,0 $ EPLOT
FINISH`;
const TGF36_C = `! =====================================================================
!  TGF36_C.inp  -  TG tabletop foundation, Technique C
!  Mat by VOFFST of RECTNG, columns by VEXT of RECTNG (WP offset),
!  deck by VDRAG of a YZ cross-section along an X path line,
!  openings by VSBV, then VGLUE.
! =====================================================================
/CLEAR,NOSTART
/TITLE,TGF-36 tabletop foundation - C: extrude / drag
/PREP7
LENGTH = 36      $ WIDTH  = 12
DECK_T = 3       $ DECK_EL= 14
MAT_T  = 3       $ MAT_OH = 1
COL_B  = 2       $ COL_D  = 3
NCOLX  = 4       $ COL_X0 = 4       $ COL_SP = 10
COL_Y1 = 2.5     $ COL_Y2 = 11.5
OP_L   = 6       $ OP_W   = 5       $ OP_Y0  = 4.5
OP_X1  = 6       $ OP_X2  = 26
E_C    = 3.0E10  $ NU_C   = 0.2     $ RHO_C  = 2500
ESZ    = 1.0
M_B1 = 80E3 $ M_B2 = 150E3 $ M_B3 = 150E3 $ M_B4 = 120E3
X0 = MAT_OH $ Y0 = MAT_OH
MAT_L = LENGTH+2*MAT_OH $ MAT_W = WIDTH+2*MAT_OH
DECK_Z0 = DECK_EL-DECK_T $ COL_H = DECK_Z0-MAT_T $ BY = (COL_Y1+COL_Y2)/2
ET,1,SOLID185
ET,2,MASS21 $ KEYOPT,2,3,2
MP,EX,1,E_C $ MP,PRXY,1,NU_C $ MP,DENS,1,RHO_C
R,11,M_B1 $ R,12,M_B2 $ R,13,M_B3 $ R,14,M_B4
! ---------- columns first: RECTNG footprints on WP at z=MAT_T, VEXT up ----------
WPOFFS,0,0,MAT_T
*DO,I,1,NCOLX
  XC = COL_X0+(I-1)*COL_SP
  RECTNG,XC-COL_B/2,XC+COL_B/2,COL_Y1-COL_D/2,COL_Y1+COL_D/2
  RECTNG,XC-COL_B/2,XC+COL_B/2,COL_Y2-COL_D/2,COL_Y2+COL_D/2
*ENDDO
VEXT,ALL,,,0,0,COL_H                   ! 8 column volumes (only column areas exist)
WPOFFS,0,0,-MAT_T
! ---------- mat: RECTNG at z=0, VOFFST along area normal (+Z) ----------
RECTNG,0,MAT_L,0,MAT_W
*GET,AMAT,AREA,0,NUM,MAX
VOFFST,AMAT,MAT_T                      ! VOFFST,NAREA,DIST (negative DIST flips)
! ---------- deck: YZ section at x=X0, dragged along X path line ----------
K,,X0,Y0,DECK_Z0 $ K,,X0,Y0+WIDTH,DECK_Z0
K,,X0,Y0+WIDTH,DECK_EL $ K,,X0,Y0,DECK_EL
*GET,KT,KP,0,NUM,MAX
A,KT-3,KT-2,KT-1,KT
*GET,ASEC,AREA,0,NUM,MAX
K,,X0+LENGTH,Y0,DECK_Z0
L,KT-3,KT+1                            ! path line along +X
*GET,LPATH,LINE,0,NUM,MAX
VDRAG,ASEC,,,,,,LPATH                  ! VDRAG,NA1..NA6,NLP1..NLP6 (path is 7th arg)
*GET,VDK,VOLU,0,NUM,MAX
/PNUM,VOLU,1 $ /VIEW,1,1,1,1 $ VPLOT
! ---------- openings ----------
WPOFFS,0,0,DECK_Z0-1
BLC4,OP_X1,OP_Y0,OP_L,OP_W,DECK_T+2
BLC4,OP_X2,OP_Y0,OP_L,OP_W,DECK_T+2
WPOFFS,0,0,-(DECK_Z0-1)
*GET,VT2,VOLU,0,NUM,MAX
VSBV,VDK,VT2-1 $ *GET,VDK,VOLU,0,NUM,MAX
VSBV,VDK,VT2
VPLOT                                  ! 10 volumes
VGLUE,ALL
! ---------- mesh (identical to A) ----------
TYPE,1 $ MAT,1 $ ESIZE,ESZ
VSEL,S,LOC,Z,MAT_T,DECK_Z0 $ CM,V_COLS,VOLU
MSHAPE,0,3D $ MSHKEY,1 $ VMESH,ALL
VSEL,INVE $ MSHKEY,0 $ VSWEEP,ALL
ALLSEL
! ---------- BCs ----------
NSEL,S,LOC,Z,0 $ D,ALL,ALL,0 $ CM,N_MATBOT,NODE $ ALLSEL
TYPE,2
REAL,11 $ E,NODE(COL_X0,BY,DECK_EL)
REAL,12 $ E,NODE(COL_X0+COL_SP,BY,DECK_EL)
REAL,13 $ E,NODE(COL_X0+2*COL_SP,BY,DECK_EL)
REAL,14 $ E,NODE(COL_X0+3*COL_SP,BY,DECK_EL)
ESEL,S,TYPE,,2 $ CM,E_BRGMASS,ELEM $ ALLSEL
ACEL,0,0,9.81
/PNUM,VOLU,0 $ EPLOT
FINISH`;
const TGF36_D = `! =====================================================================
!  TGF36_D.inp  -  TG tabletop foundation, Technique D
!  Idealised frame: SHELL181 mat (direct generation N/NGEN/E/EGEN),
!  COMBIN14 Winkler soil springs, BEAM188 columns + deck grillage,
!  MASS21 at bearings.  Mat & deck modelled at their mid-planes.
! =====================================================================
/CLEAR,NOSTART
/TITLE,TGF-36 tabletop foundation - D: beam/shell/spring frame
/PREP7
LENGTH = 36      $ WIDTH  = 12
DECK_T = 3       $ DECK_EL= 14
MAT_T  = 3       $ MAT_OH = 1
COL_B  = 2       $ COL_D  = 3
NCOLX  = 4       $ COL_X0 = 4       $ COL_SP = 10
COL_Y1 = 2.5     $ COL_Y2 = 11.5
LB_W   = 3.5     $ TB_W   = 4       ! longitudinal / transverse beam widths
E_C    = 3.0E10  $ NU_C   = 0.2     $ RHO_C  = 2500
KSV    = 5E7     $ KSH    = 2.5E7   ! soil subgrade moduli, N/m3
DX     = 1.0     $ DY     = 0.5     ! mat node grid
ESZ    = 1.0
M_B1 = 80E3 $ M_B2 = 150E3 $ M_B3 = 150E3 $ M_B4 = 120E3
X0 = MAT_OH $ Y0 = MAT_OH
MAT_L = LENGTH+2*MAT_OH $ MAT_W = WIDTH+2*MAT_OH
ZMAT = MAT_T/2 $ ZDK = DECK_EL-DECK_T/2 $ BY = (COL_Y1+COL_Y2)/2
NX = NINT(MAT_L/DX)+1 $ NY = NINT(MAT_W/DY)+1        ! 39, 29
KV = KSV*DX*DY $ KH = KSH*DX*DY                        ! 2.5e7, 1.25e7 N/m
! ---------- element types ----------
ET,1,SHELL181                      ! mat
ET,2,BEAM188                       ! columns + grillage
ET,3,MASS21 $ KEYOPT,3,3,2
ET,4,COMBIN14 $ KEYOPT,4,2,3       ! 1-D spring, UZ
ET,5,COMBIN14 $ KEYOPT,5,2,1       ! UX
ET,6,COMBIN14 $ KEYOPT,6,2,2       ! UY
MP,EX,1,E_C $ MP,PRXY,1,NU_C $ MP,DENS,1,RHO_C
SECTYPE,1,SHELL $ SECDATA,MAT_T,1
SECTYPE,2,BEAM,RECT $ SECDATA,COL_D,COL_B   ! vertical beam: B along global Y
SECTYPE,3,BEAM,RECT $ SECDATA,LB_W,DECK_T   ! longitudinal: B = width, H = depth
SECTYPE,4,BEAM,RECT $ SECDATA,TB_W,DECK_T
R,4,KV $ R,5,KH $ R,6,KH
R,11,M_B1 $ R,12,M_B2 $ R,13,M_B3 $ R,14,M_B4
! ---------- mat shell by direct generation ----------
TYPE,1 $ MAT,1 $ SECNUM,1
N,1,0,0,ZMAT
NGEN,NX,1,1,1,1,DX                 ! NGEN,ITIME,INC,N1,N2,NINC,DX,DY,DZ
NGEN,NY,100,1,NX,1,0,DY            ! rows 1.., 101.., ... 2801..
E,1,2,102,101
EGEN,NX-1,1,1                      ! EGEN,ITIME,NINC,IEL1
EGEN,NY-1,100,1,NX-1
CM,E_MAT,ELEM
! ---------- soil springs: ground nodes 1 m below, then E + EGEN ----------
NLAST = 100*(NY-1)+NX
NGEN,2,10000,1,NLAST,1,0,0,-1      ! ground nodes 10001..
TYPE,4 $ REAL,4 $ E,1,10001
*GET,E1,ELEM,0,NUM,MAX
EGEN,NX,1,E1 $ EGEN,NY,100,E1,E1+NX-1
TYPE,5 $ REAL,5 $ E,1,10001
*GET,E1,ELEM,0,NUM,MAX
EGEN,NX,1,E1 $ EGEN,NY,100,E1,E1+NX-1
TYPE,6 $ REAL,6 $ E,1,10001
*GET,E1,ELEM,0,NUM,MAX
EGEN,NX,1,E1 $ EGEN,NY,100,E1,E1+NX-1
NSEL,S,LOC,Z,ZMAT-1 $ D,ALL,ALL,0 $ CM,N_GROUND,NODE $ ALLSEL
! ---------- columns: keypoint lines ZMAT -> ZDK ----------
*DO,I,1,NCOLX
  XC = COL_X0+(I-1)*COL_SP
  *DO,J,1,2
    YC = COL_Y1+(J-1)*(COL_Y2-COL_Y1)
    K,,XC,YC,ZMAT $ K,,XC,YC,ZDK
    *GET,KT,KP,0,NUM,MAX
    L,KT-1,KT
  *ENDDO
*ENDDO
LSEL,S,LOC,Z,ZMAT+0.1,ZDK-0.1      ! column lines (centroid z=7)
LATT,1,,2,,,,2                     ! LATT,MAT,REAL,TYPE,ESYS,KB,KE,SECNUM
LESIZE,ALL,ESZ
LMESH,ALL
CM,E_COLS,ELEM
! ---------- deck grillage at ZDK ----------
*DO,J,1,2
  YC = COL_Y1+(J-1)*(COL_Y2-COL_Y1)
  K,,X0,YC,ZDK $ K,,X0+LENGTH,YC,ZDK
  L,KP(X0,YC,ZDK),KP(COL_X0,YC,ZDK)
  *DO,I,1,NCOLX-1
    L,KP(COL_X0+(I-1)*COL_SP,YC,ZDK),KP(COL_X0+I*COL_SP,YC,ZDK)
  *ENDDO
  L,KP(COL_X0+(NCOLX-1)*COL_SP,YC,ZDK),KP(X0+LENGTH,YC,ZDK)
*ENDDO
LSEL,S,LOC,Y,COL_Y1 $ LSEL,A,LOC,Y,COL_Y2 $ LSEL,R,LOC,Z,ZDK
LATT,1,,2,,,,3 $ LESIZE,ALL,ESZ $ LMESH,ALL
*DO,I,1,NCOLX
  XC = COL_X0+(I-1)*COL_SP
  K,,XC,BY,ZDK                     ! bearing keypoint
  L,KP(XC,COL_Y1,ZDK),KP(XC,BY,ZDK)
  L,KP(XC,BY,ZDK),KP(XC,COL_Y2,ZDK)
*ENDDO
LSEL,S,LOC,Z,ZDK $ LSEL,U,LOC,Y,COL_Y1 $ LSEL,U,LOC,Y,COL_Y2
LATT,1,,2,,,,4 $ LESIZE,ALL,ESZ $ LMESH,ALL
ALLSEL
NUMMRG,NODE,1E-3                   ! column base nodes onto mat grid nodes
! ---------- bearing masses, gravity ----------
TYPE,3
REAL,11 $ E,NODE(COL_X0,BY,ZDK)
REAL,12 $ E,NODE(COL_X0+COL_SP,BY,ZDK)
REAL,13 $ E,NODE(COL_X0+2*COL_SP,BY,ZDK)
REAL,14 $ E,NODE(COL_X0+3*COL_SP,BY,ZDK)
ESEL,S,TYPE,,3 $ CM,E_BRGMASS,ELEM $ ALLSEL
ACEL,0,0,9.81
/ESHAPE,1 $ /VIEW,1,1,1,1 $ EPLOT
FINISH`;

const NO_BOTTOM_UP = ['K', 'L', 'LSTR', 'A', 'AL', 'V', 'VA'];
const NO_DIRECT_SOLIDS = [...PRIMITIVES, ...BOOLEANS, ...SWEEPS, 'VMESH', 'AMESH', 'VSWEEP'];

/** The solid TGF-36 spec sheet (A/B/C and the speedrun). */
const SPEC_SOLID = `| Item | Value |
|---|---|
| Base mat | **38 x 14 x 3**: X 0..38, Y 0..14, Z 0..3 |
| Columns | **8** (4 x 2), plan **2 (X) x 3 (Y)**, Z **3..11**; centres x = **4, 14, 24, 34**, y = **2.5, 11.5** |
| Deck | **36 x 12 x 3**: X 1..37, Y 1..13, Z **11..14** |
| Deck openings | 2 through-openings **6 x 5**: X **6..12** and **26..32**, Y **4.5..9.5** |
| Connectivity | all parts glued (conforming mesh), **3096 m³** in total |
| Elements | type 1 **SOLID185**, ESIZE **1** (about 3300 hexes) |
| Concrete | material 1: EX **3E10**, PRXY **0.2**, DENS **2500** |
| Supports | every node at z = 0: \`D,ALL,ALL\` |
| Bearing masses | **MASS21** (KEYOPT(3) = 2) on the deck top at y = 7, z = 14: x = 4 **80 t**, x = 14 **150 t**, x = 24 **150 t**, x = 34 **120 t** |
| Gravity | \`ACEL,0,0,9.81\` |`;

const FAST_A = `/PREP7
BLOCK,0,38,0,14,0,3
*DO,X,3,33,10
BLOCK,X,X+2,1,4,3,11 $ BLOCK,X,X+2,10,13,3,11
*ENDDO
BLOCK,1,37,1,13,11,14
BLOCK,6,12,4.5,9.5,10,15 $ BLOCK,26,32,4.5,9.5,10,15
VSBV,10,11 $ VSBV,13,12
VGLUE,ALL
ET,1,SOLID185 $ ET,2,MASS21 $ KEYOPT,2,3,2
MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
R,1,80E3 $ R,2,150E3 $ R,3,120E3
ESIZE,1 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL
TYPE,2 $ REAL,1 $ E,NODE(4,7,14)
REAL,2 $ E,NODE(14,7,14) $ E,NODE(24,7,14)
REAL,3 $ E,NODE(34,7,14)
ACEL,0,0,9.81`;

/** Attributes, mesh, supports, masses and gravity: identical tail for A/B/C. */
const SOLID_TAIL = `ET,1,SOLID185 $ ET,2,MASS21 $ KEYOPT,2,3,2
MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
R,1,80E3 $ R,2,150E3 $ R,3,120E3
ESIZE,1 $ VMESH,ALL
NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL
TYPE,2 $ REAL,1 $ E,NODE(4,7,14)
REAL,2 $ E,NODE(14,7,14) $ E,NODE(24,7,14)
REAL,3 $ E,NODE(34,7,14)
ACEL,0,0,9.81`;

const FAST_B = `/PREP7
K,1,0,0,0 $ K,2,38,0,0 $ K,3,38,14,0 $ K,4,0,14,0
A,1,2,3,4
K,5,3,1,3 $ K,6,5,1,3 $ K,7,5,4,3 $ K,8,3,4,3
KGEN,2,5,8,1,0,9,0,4
A,5,6,7,8 $ A,9,10,11,12
AGEN,4,2,3,1,10
K,101,1,1,11 $ K,102,37,1,11 $ K,103,37,13,11 $ K,104,1,13,11
K,105,6,4.5,11 $ K,106,12,4.5,11 $ K,107,12,9.5,11 $ K,108,6,9.5,11
KGEN,2,105,108,1,20,,,4
A,101,102,103,104 $ A,105,106,107,108 $ A,109,110,111,112
ASBA,10,11 $ ASBA,13,12
ASEL,S,LOC,Z,11 $ VEXT,ALL,,,0,0,3
ASEL,S,LOC,Z,3 $ VEXT,ALL,,,0,0,8
ASEL,S,AREA,,1 $ VEXT,1,,,0,0,3
ALLSEL $ VGLUE,ALL
${SOLID_TAIL}`;

const FAST_C = `/PREP7
WPOFFS,0,0,3
*DO,X,3,33,10
RECTNG,X,X+2,1,4 $ RECTNG,X,X+2,10,13
*ENDDO
VEXT,ALL,,,0,0,8
WPOFFS,0,0,-3
RECTNG,0,38,0,14 $ VOFFST,49,3
K,101,1,1,11 $ K,102,1,13,11 $ K,103,1,13,14 $ K,104,1,1,14 $ K,105,37,1,11
A,101,102,103,104 $ L,101,105
VDRAG,55,,,,,,113
BLC4,6,4.5,6,5,15 $ BLC4,26,4.5,6,5,15
VSBV,10,11 $ VSBV,13,12
VGLUE,ALL
${SOLID_TAIL}`;

const FAST_D = `/PREP7
ET,1,SHELL181 $ ET,2,BEAM188 $ ET,3,MASS21 $ KEYOPT,3,3,2
ET,4,COMBIN14 $ KEYOPT,4,2,3 $ ET,5,COMBIN14 $ KEYOPT,5,2,1 $ ET,6,COMBIN14 $ KEYOPT,6,2,2
MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
SECT,1,SHELL $ SECD,3,1 $ SECT,2,BEAM,RECT $ SECD,3,2
SECT,3,BEAM,RECT $ SECD,3.5,3 $ SECT,4,BEAM,RECT $ SECD,4,3
R,4,2.5E7 $ R,5,1.25E7 $ R,6,1.25E7 $ R,11,80E3 $ R,12,150E3 $ R,13,120E3
TYPE,1 $ SECN,1 $ N,1,0,0,1.5 $ NGEN,39,1,1,1,1,1 $ NGEN,29,100,1,39,1,0,0.5
E,1,2,102,101 $ EGEN,38,1,1 $ EGEN,28,100,1,38
NGEN,2,10000,1,2839,1,0,0,-1
*DO,T,4,6
TYPE,T $ REAL,T $ E,1,10001 $ *GET,E1,ELEM,0,NUM,MAX $ EGEN,39,1,E1 $ EGEN,29,100,E1,E1+38
*ENDDO
NSEL,S,LOC,Z,0.5 $ D,ALL,ALL $ ALLSEL
*DO,I,0,3
X=4+10*I $ K,5*I+1,X,2.5,1.5 $ K,5*I+2,X,2.5,12.5 $ K,5*I+3,X,11.5,1.5 $ K,5*I+4,X,11.5,12.5 $ K,5*I+5,X,7,12.5
L,5*I+1,5*I+2 $ L,5*I+3,5*I+4 $ L,5*I+2,5*I+5 $ L,5*I+5,5*I+4
*ENDDO
K,21,1,2.5,12.5 $ K,22,37,2.5,12.5 $ K,23,1,11.5,12.5 $ K,24,37,11.5,12.5
L,21,2 $ L,2,7 $ L,7,12 $ L,12,17 $ L,17,22 $ L,23,4 $ L,4,9 $ L,9,14 $ L,14,19 $ L,19,24
LSEL,S,LOC,Z,7 $ LATT,1,,2,,,,2
LSEL,S,LOC,Y,2.5 $ LSEL,A,LOC,Y,11.5 $ LSEL,R,LOC,Z,12.5 $ LATT,1,,2,,,,3
LSEL,S,LOC,X,4 $ LSEL,A,LOC,X,14 $ LSEL,A,LOC,X,24 $ LSEL,A,LOC,X,34 $ LSEL,R,LOC,Z,12.5 $ LATT,1,,2,,,,4
ALLSEL $ LESIZE,ALL,1 $ LMESH,ALL $ NUMMRG,NODE,1E-3
TYPE,3 $ REAL,11 $ E,NODE(4,7,12.5) $ REAL,12 $ E,NODE(14,7,12.5) $ E,NODE(24,7,12.5) $ REAL,13 $ E,NODE(34,7,12.5)
ACEL,0,0,9.81`;

export const challenges: Challenge[] = [
  // ------------------------------------------------------------------ A: primitives + Booleans
  {
    id: 't10-c1',
    track: 't10',
    order: 1,
    title: 'Warm-up A: one transverse bent',
    difficulty: 2,
    brief: `One slice of TGF-36 around the first column line: a mat strip, two columns and the cross-beam.

| Part | X | Y | Z |
|---|---|---|---|
| Mat strip | 0..8 | 0..14 | 0..3 |
| Column 1 / 2 | 3..5 | 1..4 / 10..13 | 3..11 |
| Cross-beam | 1..7 | 1..13 | 11..14 |

- primitives only (no K/L/A/V), **VGLUE** everything (4 volumes)
- SOLID185, ESIZE **1**, concrete EX **3E10**, PRXY **0.2**, DENS **2500**
- fix every node at z = 0`,
    targetScript: `/PREP7
BLOCK,0,8,0,14,0,3
BLOCK,3,5,1,4,3,11
BLOCK,3,5,10,13,3,11
BLOCK,1,7,1,13,11,14
VGLUE,ALL
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,1
VMESH,ALL
NSEL,S,LOC,Z,0
D,ALL,ALL
ALLSEL`,
    solution: `/PREP7
BLOCK,0,8,0,14,0,3 $ BLOCK,3,5,1,4,3,11 $ BLOCK,3,5,10,13,3,11 $ BLOCK,1,7,1,13,11,14
VGLUE,ALL $ ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZE,1 $ VMESH,ALL $ NSEL,S,LOC,Z,0 $ D,ALL,ALL $ ALLSEL`,
    parLines: 4,
    parTimeSeconds: 90,
    forbiddenCommands: NO_BOTTOM_UP,
    requiredCommands: ['VGLUE'],
    hints: [
      { level: 1, text: 'Four BLOCKs by coordinate ranges, then glue so the column ends share nodes with the mat and the beam.' },
      { level: 2, text: 'BLOCK,X1,X2,Y1,Y2,Z1,Z2. VGLUE,ALL keeps 4 volumes but makes the touching faces common.' },
      { level: 3, text: '`BLOCK,3,5,1,4,3,11 $ BLOCK,3,5,10,13,3,11 $ BLOCK,1,7,1,13,11,14 $ VGLUE,ALL`' },
    ],
    tags: ['boss', 'tgf36', 'technique-a', 'warmup'],
  },
  {
    id: 't10-c2',
    track: 't10',
    order: 2,
    title: 'Warm-up A: deck with two openings',
    difficulty: 2,
    brief: `The TGF-36 deck on its own: **36 x 12 x 3** at X 1..37, Y 1..13, Z 11..14, with two through-openings
**{{OPL}} m** long (in X) and **5 m** wide (Y 4.5..9.5), starting at x = **6** and x = **26**.

- one BLOCK for the deck, overshooting tool blocks and **VSBV** (1 volume)
- SOLID185, ESIZE **1**, concrete EX **3E10**, PRXY **0.2**, DENS **2500**. No supports.`,
    params: { OPL: { min: 4, max: 8, step: 1 } },
    targetScript: `/PREP7
BLOCK,1,37,1,13,11,14
BLOCK,6,6+OPL,4.5,9.5,10,15
BLOCK,26,26+OPL,4.5,9.5,10,15
VSBV,1,2
VSBV,4,3
ET,1,SOLID185
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
ESIZE,1
VMESH,ALL`,
    solution: `/PREP7
BLOCK,1,37,1,13,11,14 $ BLOCK,6,12,4.5,9.5,10,15 $ BLOCK,26,32,4.5,9.5,10,15
VSBV,1,2 $ VSBV,4,3
ET,1,SOLID185 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
ESIZE,1 $ VMESH,ALL`,
    parLines: 5,
    parTimeSeconds: 90,
    forbiddenCommands: NO_BOTTOM_UP,
    requiredCommands: ['VSBV'],
    hints: [
      { level: 1, text: 'Subtract two tool blocks that stick out above and below the deck, so no sliver faces remain.' },
      { level: 2, text: 'The first VSBV,1,2 creates volume 4 (1, 2 and 3 are still in use when it is made). Subtract tool 3 from volume 4 next.' },
      { level: 3, text: '`BLOCK,6,6+{{OPL}},4.5,9.5,10,15 $ BLOCK,26,26+{{OPL}},4.5,9.5,10,15 $ VSBV,1,2 $ VSBV,4,3`' },
    ],
    tags: ['daily', 'boss', 'tgf36', 'technique-a', 'warmup'],
  },
  {
    id: 't10-c3',
    track: 't10',
    order: 3,
    title: 'TGF-36 A: primitives + Booleans',
    difficulty: 5,
    brief: `Build the full **TGF-36** turbine-generator tabletop foundation with **primitives and Booleans**:
BLOCK/BLC4 for every solid, **VSBV** for the deck openings, **VGLUE** to connect it all.
No keypoints, lines or areas, no sweeps.

${SPEC_SOLID}`,
    targetScript: TGF36_A,
    solution: FAST_A,
    parLines: 20,
    parTimeSeconds: 420,
    forbiddenCommands: [...NO_BOTTOM_UP, ...SWEEPS],
    requiredCommands: ['VSBV', 'VGLUE'],
    hints: [
      { level: 1, text: 'Mat, 8 columns in one loop, deck, two tools. Subtract, glue, then a single attribute/mesh/BC block.' },
      { level: 2, text: 'Volumes are 1 (mat), 2–9 (columns), 10 (deck), 11–12 (tools). VSBV,10,11 makes 13; VSBV,13,12 then refills 10.' },
      { level: 3, text: '`*DO,X,3,33,10` / `BLOCK,X,X+2,1,4,3,11 $ BLOCK,X,X+2,10,13,3,11` / `*ENDDO`' },
    ],
    tags: ['boss', 'tgf36', 'technique-a'],
    grading: { ignore: ['counts.volu'], elemTolerance: 0.15 },
  },
  // ------------------------------------------------------------------ B: bottom-up
  {
    id: 't10-c4',
    track: 't10',
    order: 4,
    title: 'Warm-up B: column footprints by KGEN and AGEN',
    difficulty: 3,
    brief: `The 8 TGF-36 columns, bottom-up: **2 x 3** footprints at z = **3**, extruded **8 m** to z = 11.

- type the four keypoints of the first footprint (X 3..5, Y 1..4, z = 3) only
- **KGEN** them to the second row (+9 in Y), make the two areas, **AGEN** the pair 4 times at **10 m**
- **VEXT** all footprints (8 volumes, **384 m³**). No primitives. Geometry only.`,
    targetScript: `/PREP7
K,1,3,1,3
K,2,5,1,3
K,3,5,4,3
K,4,3,4,3
KGEN,2,1,4,1,0,9,0,4
A,1,2,3,4
A,5,6,7,8
AGEN,4,1,2,1,10
VEXT,ALL,,,0,0,8`,
    solution: `/PREP7
K,1,3,1,3 $ K,2,5,1,3 $ K,3,5,4,3 $ K,4,3,4,3 $ KGEN,2,1,4,1,,9,,4
A,1,2,3,4 $ A,5,6,7,8 $ AGEN,4,1,2,1,10 $ VEXT,ALL,,,,,8`,
    parLines: 3,
    parTimeSeconds: 120,
    forbiddenCommands: [...PRIMITIVES, 'VOFFST', 'VDRAG', 'VROTAT'],
    requiredCommands: ['KGEN', 'AGEN', 'VEXT'],
    hints: [
      { level: 1, text: 'Generate, don\'t type: one footprint → two rows with KGEN → four column lines with AGEN → solids with one VEXT.' },
      { level: 2, text: 'KGEN,ITIME,NP1,NP2,NINC,DX,DY,DZ,KINC (ITIME counts the original). AGEN,ITIME,NA1,NA2,NINC,DX. VEXT,NA1,NA2,NINC,DX,DY,DZ.' },
      { level: 3, text: '`KGEN,2,1,4,1,,9,,4 $ A,1,2,3,4 $ A,5,6,7,8 $ AGEN,4,1,2,1,10 $ VEXT,ALL,,,,,8`' },
    ],
    tags: ['boss', 'tgf36', 'technique-b', 'warmup'],
  },
  {
    id: 't10-c5',
    track: 't10',
    order: 5,
    title: 'Warm-up B: deck plate with ASBA',
    difficulty: 3,
    brief: `The deck, bottom-up: outline **X 1..37, Y 1..13** at z = **11**, two **6 x 5** openings (X 6..12 and 26..32,
Y 4.5..9.5) cut from the **area** with **ASBA**, then **VEXT** 3 m up to z = 14.

- keypoints + A only (no RECTNG/BLOCK); use **KGEN** for the second opening
- 1 volume, **1116 m³**. Geometry only.`,
    targetScript: `/PREP7
K,1,1,1,11
K,2,37,1,11
K,3,37,13,11
K,4,1,13,11
K,5,6,4.5,11
K,6,12,4.5,11
K,7,12,9.5,11
K,8,6,9.5,11
KGEN,2,5,8,1,20,0,0,4
A,1,2,3,4
A,5,6,7,8
A,9,10,11,12
ASBA,1,2
ASBA,4,3
VEXT,ALL,,,0,0,3`,
    solution: `/PREP7
K,1,1,1,11 $ K,2,37,1,11 $ K,3,37,13,11 $ K,4,1,13,11
K,5,6,4.5,11 $ K,6,12,4.5,11 $ K,7,12,9.5,11 $ K,8,6,9.5,11 $ KGEN,2,5,8,1,20,,,4
A,1,2,3,4 $ A,5,6,7,8 $ A,9,10,11,12 $ ASBA,1,2 $ ASBA,4,3
VEXT,ALL,,,,,3`,
    parLines: 5,
    parTimeSeconds: 150,
    forbiddenCommands: [...PRIMITIVES, 'VSBV', 'VOFFST', 'VDRAG', 'VROTAT'],
    requiredCommands: ['KGEN', 'ASBA', 'VEXT'],
    hints: [
      { level: 1, text: 'Cut the openings in 2-D before extruding: one ASBA per opening on the deck footprint, then one VEXT.' },
      { level: 2, text: 'ASBA,NA1,NA2 — the result takes the next free number: ASBA,1,2 gives area 4, so the second cut is ASBA,4,3.' },
      { level: 3, text: '`KGEN,2,5,8,1,20,,,4 $ A,1,2,3,4 $ A,5,6,7,8 $ A,9,10,11,12 $ ASBA,1,2 $ ASBA,4,3`' },
    ],
    tags: ['boss', 'tgf36', 'technique-b', 'warmup'],
  },
  {
    id: 't10-c6',
    track: 't10',
    order: 6,
    title: 'TGF-36 B: bottom-up',
    difficulty: 5,
    brief: `Build the full **TGF-36** **bottom-up**: keypoints → areas → **VEXT**. Replicate with KGEN/AGEN, cut the
deck openings from the deck footprint with **ASBA**, extrude each level, then **VGLUE**.
No primitives (BLOCK, BLC4, RECTNG …), no volume Booleans other than the glue.

${SPEC_SOLID}`,
    targetScript: TGF36_B,
    solution: FAST_B,
    parLines: 27,
    parTimeSeconds: 540,
    forbiddenCommands: [...PRIMITIVES, 'VSBV', 'VADD', 'VOFFST', 'VDRAG', 'VROTAT'],
    requiredCommands: ['K', 'A', 'VEXT', 'VGLUE'],
    hints: [
      { level: 1, text: 'Make every footprint first (mat at z 0, columns at z 3, deck at z 11 with its holes), extrude last: VEXT-created keypoints then never collide with your K numbers.' },
      { level: 2, text: 'Areas: 1 mat, 2–3 first column pair, AGEN,4,2,3,1,10 → 2–9, deck 10, openings 11–12. ASBA,10,11 → 13, ASBA,13,12 → 10. Extrude by selecting each level: ASEL,S,LOC,Z,11 $ VEXT,ALL,,,0,0,3.' },
      { level: 3, text: '`ASEL,S,LOC,Z,11 $ VEXT,ALL,,,0,0,3` / `ASEL,S,LOC,Z,3 $ VEXT,ALL,,,0,0,8` / `ASEL,S,AREA,,1 $ VEXT,1,,,0,0,3` / `ALLSEL $ VGLUE,ALL`' },
    ],
    tags: ['boss', 'tgf36', 'technique-b'],
    grading: { ignore: ['counts.volu'], elemTolerance: 0.15 },
  },
  // ------------------------------------------------------------------ C: extrude / drag
  {
    id: 't10-c7',
    track: 't10',
    order: 7,
    title: 'Warm-up C: mat and columns by extrusion',
    difficulty: 3,
    brief: `TGF-36 without the deck, built from 2-D rectangles:

- columns: **RECTNG** footprints (X x..x+2, Y 1..4 and 10..13 for x = 3, 13, 23, 33) on a working plane lifted
  to z = 3, **VEXT** 8 m up
- mat: \`RECTNG,0,38,0,14\` at z = 0, **VOFFST** 3 m (along the area normal, +Z)
- glue (9 volumes, **1980 m³**). No BLOCK/BLC4. Geometry only.`,
    targetScript: `/PREP7
WPOFFS,0,0,3
*DO,I,1,4
  XC = 4+(I-1)*10
  RECTNG,XC-1,XC+1,1,4
  RECTNG,XC-1,XC+1,10,13
*ENDDO
VEXT,ALL,,,0,0,8
WPOFFS,0,0,-3
RECTNG,0,38,0,14
*GET,AMAT,AREA,0,NUM,MAX
VOFFST,AMAT,3
VGLUE,ALL`,
    solution: `/PREP7
WPOFFS,0,0,3
*DO,X,3,33,10
RECTNG,X,X+2,1,4 $ RECTNG,X,X+2,10,13
*ENDDO
VEXT,ALL,,,,,8 $ WPOFFS,0,0,-3 $ RECTNG,0,38,0,14 $ VOFFST,49,3 $ VGLUE,ALL`,
    parLines: 6,
    parTimeSeconds: 120,
    forbiddenCommands: ['BLOCK', 'BLC4', 'BLC5', 'V', 'VA'],
    requiredCommands: ['RECTNG', 'VEXT', 'VOFFST'],
    hints: [
      { level: 1, text: 'Make the column rectangles first and extrude them with VEXT,ALL while they are the only areas. Then the mat.' },
      { level: 2, text: '8 extruded columns own 6 areas each (48), so the mat RECTNG becomes area 49. VOFFST,NAREA,DIST offsets along the normal.' },
      { level: 3, text: '`VEXT,ALL,,,,,8 $ WPOFFS,0,0,-3 $ RECTNG,0,38,0,14 $ VOFFST,49,3 $ VGLUE,ALL`' },
    ],
    tags: ['boss', 'tgf36', 'technique-c', 'warmup'],
  },
  {
    id: 't10-c8',
    track: 't10',
    order: 8,
    title: 'Warm-up C: deck by VDRAG',
    difficulty: 3,
    brief: `Build the solid deck (no openings) by **dragging its cross-section**: the YZ section at x = **1**
(Y 1..13, Z 11..14) dragged along a straight path line from (1, 1, 11) to (**37**, 1, 11).

- 1 volume, **1296 m³**. No BLOCK/BLC4. Geometry only.`,
    targetScript: `/PREP7
K,1,1,1,11
K,2,1,13,11
K,3,1,13,14
K,4,1,1,14
K,5,37,1,11
A,1,2,3,4
L,1,5
VDRAG,1,,,,,,5`,
    solution: `/PREP7
K,1,1,1,11 $ K,2,1,13,11 $ K,3,1,13,14 $ K,4,1,1,14 $ K,5,37,1,11
A,1,2,3,4 $ L,1,5 $ VDRAG,1,,,,,,5`,
    parLines: 3,
    parTimeSeconds: 90,
    forbiddenCommands: ['BLOCK', 'BLC4', 'BLC5', 'VEXT', 'V', 'VA'],
    requiredCommands: ['VDRAG'],
    hints: [
      { level: 1, text: 'A section area plus a path line: the area is swept along the line into a solid.' },
      { level: 2, text: 'VDRAG,NA1,NA2,NA3,NA4,NA5,NA6,NLP1 — the path line is the 7th field. The section has 4 lines, so the path line is line 5.' },
      { level: 3, text: '`A,1,2,3,4 $ L,1,5 $ VDRAG,1,,,,,,5`' },
    ],
    tags: ['boss', 'tgf36', 'technique-c', 'warmup'],
  },
  {
    id: 't10-c9',
    track: 't10',
    order: 9,
    title: 'TGF-36 C: extrude and drag',
    difficulty: 5,
    brief: `Build the full **TGF-36** by **sweeping 2-D sections**: columns by **VEXT** of RECTNG footprints, the mat by
**VOFFST** of a RECTNG, the deck by **VDRAG** of its YZ section along an X path line. Cut the openings with
BLC4 tools + VSBV, then VGLUE. No BLOCK.

${SPEC_SOLID}`,
    targetScript: TGF36_C,
    solution: FAST_C,
    parLines: 25,
    parTimeSeconds: 480,
    forbiddenCommands: ['BLOCK', 'BLC5', 'V', 'VA'],
    requiredCommands: ['VEXT', 'VOFFST', 'VDRAG'],
    hints: [
      { level: 1, text: 'Order matters for numbering: columns (VEXT,ALL while only their areas exist), mat (VOFFST), deck (VDRAG), then the cutters.' },
      { level: 2, text: 'After columns and mat there are 54 areas, 72 keypoints and 108 lines. Number your section keypoints from 101 so they never clash; the section is area 55 and the path line 113.' },
      { level: 3, text: '`K,101,1,1,11 $ K,102,1,13,11 $ K,103,1,13,14 $ K,104,1,1,14 $ K,105,37,1,11` / `A,101,102,103,104 $ L,101,105` / `VDRAG,55,,,,,,113`' },
    ],
    tags: ['boss', 'tgf36', 'technique-c'],
    grading: { ignore: ['counts.volu'], elemTolerance: 0.15 },
  },
  // ------------------------------------------------------------------ D: beam / shell / spring frame
  {
    id: 't10-c10',
    track: 't10',
    order: 10,
    title: 'Warm-up D: Winkler mat',
    difficulty: 3,
    brief: `The mat as a **SHELL181** plate on **COMBIN14** soil springs, all by direct generation:

| Item | Value |
|---|---|
| Mat mid-plane | z = **1.5**, X 0..38, Y 0..14 |
| Node grid | **1 m** in X (39 nodes), **0.5 m** in Y (29 rows), numbering \`1 + i + 100·j\` |
| Shell | type 1 SHELL181, section 1: \`SECDATA,3,1\` (3 m thick), concrete EX **3E10**, PRXY **0.2**, DENS **2500** |
| Ground nodes | node number + **10000**, 1 m below (z = 0.5), all fixed |
| Springs | type 4 COMBIN14, KEYOPT(2) = **3** (UZ), real 4: **2.5E7** N/m, one per mat node |

- no solid modelling or meshing commands: N, NGEN, E, EGEN only`,
    targetScript: `/PREP7
ET,1,SHELL181
ET,4,COMBIN14
KEYOPT,4,2,3
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
SECTYPE,1,SHELL
SECDATA,3,1
R,4,2.5E7
TYPE,1
MAT,1
SECNUM,1
N,1,0,0,1.5
NGEN,39,1,1,1,1,1
NGEN,29,100,1,39,1,0,0.5
E,1,2,102,101
EGEN,38,1,1
EGEN,28,100,1,38
NGEN,2,10000,1,2839,1,0,0,-1
TYPE,4
REAL,4
E,1,10001
*GET,E1,ELEM,0,NUM,MAX
EGEN,39,1,E1
EGEN,29,100,E1,E1+38
NSEL,S,LOC,Z,0.5
D,ALL,ALL
ALLSEL`,
    solution: `/PREP7
ET,1,SHELL181 $ ET,4,COMBIN14 $ KEYOPT,4,2,3 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
SECT,1,SHELL $ SECD,3,1 $ R,4,2.5E7
N,1,,,1.5 $ NGEN,39,1,1,,,1 $ NGEN,29,100,1,39,1,,0.5
E,1,2,102,101 $ EGEN,38,1,1 $ EGEN,28,100,1,38
NGEN,2,10000,1,2839,1,,,-1
TYPE,4 $ REAL,4 $ E,1,10001 $ EGEN,39,1,1065 $ EGEN,29,100,1065,1103
NSEL,S,LOC,Z,0.5 $ D,ALL,ALL $ ALLSEL`,
    parLines: 8,
    parTimeSeconds: 180,
    forbiddenCommands: NO_DIRECT_SOLIDS,
    requiredCommands: ['NGEN', 'EGEN'],
    hints: [
      { level: 1, text: 'One node → a row (NGEN) → the grid (NGEN with increment 100). One element → a row (EGEN) → the plate. Then copy the whole grid down for the ground nodes.' },
      { level: 2, text: 'NGEN,ITIME,INC,NODE1,NODE2,NINC,DX,DY,DZ. EGEN,ITIME,NINC,IEL1,IEL2. The 1064 shells come first, so the first spring is element 1065.' },
      { level: 3, text: '`NGEN,2,10000,1,2839,1,,,-1 $ TYPE,4 $ REAL,4 $ E,1,10001 $ EGEN,39,1,1065 $ EGEN,29,100,1065,1103`' },
    ],
    tags: ['boss', 'tgf36', 'technique-d', 'warmup'],
  },
  {
    id: 't10-c11',
    track: 't10',
    order: 11,
    title: 'Warm-up D: column-and-grillage frame',
    difficulty: 4,
    brief: `The TGF-36 superstructure as a **BEAM188** frame (mid-planes: mat z = **1.5**, deck z = **12.5**):

| Members | Lines | Section (SECDATA,B,H) |
|---|---|---|
| 8 columns | (x, y, 1.5)→(x, y, 12.5), x = 4, 14, 24, 34; y = 2.5, 11.5 | 2: **3, 2** |
| Longitudinal beams | y = 2.5 and 11.5, x 1→37 split at every column | 3: **3.5, 3** |
| Transverse beams | x = 4 … 34, y 2.5→**7**→11.5 (bearing keypoint at y = 7) | 4: **4, 3** |

- type 2 BEAM188, concrete EX **3E10**, PRXY **0.2**, DENS **2500**, **LESIZE 1** (200 beam elements)
- column bases (z = 1.5) fixed; **MASS21** (type 3, KEYOPT(3) = 2) at (x, 7, 12.5): **80 / 150 / 150 / 120 t**
- \`ACEL,0,0,9.81\``,
    targetScript: `/PREP7
ET,2,BEAM188
ET,3,MASS21
KEYOPT,3,3,2
MP,EX,1,3E10
MP,PRXY,1,0.2
MP,DENS,1,2500
SECTYPE,2,BEAM,RECT
SECDATA,3,2
SECTYPE,3,BEAM,RECT
SECDATA,3.5,3
SECTYPE,4,BEAM,RECT
SECDATA,4,3
R,11,80E3
R,12,150E3
R,13,150E3
R,14,120E3
*DO,I,1,4
  XC = 4+(I-1)*10
  *DO,J,1,2
    YC = 2.5+(J-1)*9
    K,,XC,YC,1.5
    K,,XC,YC,12.5
    *GET,KT,KP,0,NUM,MAX
    L,KT-1,KT
  *ENDDO
*ENDDO
LSEL,S,LOC,Z,7
LATT,1,,2,,,,2
LESIZE,ALL,1
LMESH,ALL
*DO,J,1,2
  YC = 2.5+(J-1)*9
  K,,1,YC,12.5
  K,,37,YC,12.5
  L,KP(1,YC,12.5),KP(4,YC,12.5)
  *DO,I,1,3
    L,KP(4+(I-1)*10,YC,12.5),KP(4+I*10,YC,12.5)
  *ENDDO
  L,KP(34,YC,12.5),KP(37,YC,12.5)
*ENDDO
LSEL,S,LOC,Y,2.5
LSEL,A,LOC,Y,11.5
LSEL,R,LOC,Z,12.5
LATT,1,,2,,,,3
LESIZE,ALL,1
LMESH,ALL
*DO,I,1,4
  XC = 4+(I-1)*10
  K,,XC,7,12.5
  L,KP(XC,2.5,12.5),KP(XC,7,12.5)
  L,KP(XC,7,12.5),KP(XC,11.5,12.5)
*ENDDO
LSEL,S,LOC,Z,12.5
LSEL,U,LOC,Y,2.5
LSEL,U,LOC,Y,11.5
LATT,1,,2,,,,4
LESIZE,ALL,1
LMESH,ALL
ALLSEL
NSEL,S,LOC,Z,1.5
D,ALL,ALL
ALLSEL
TYPE,3
REAL,11
E,NODE(4,7,12.5)
REAL,12
E,NODE(14,7,12.5)
REAL,13
E,NODE(24,7,12.5)
REAL,14
E,NODE(34,7,12.5)
ACEL,0,0,9.81`,
    solution: `/PREP7
ET,2,BEAM188 $ ET,3,MASS21 $ KEYOPT,3,3,2 $ MP,EX,1,3E10 $ MP,PRXY,1,0.2 $ MP,DENS,1,2500
SECT,2,BEAM,RECT $ SECD,3,2 $ SECT,3,BEAM,RECT $ SECD,3.5,3 $ SECT,4,BEAM,RECT $ SECD,4,3
R,11,80E3 $ R,12,150E3 $ R,13,120E3
*DO,I,0,3
X=4+10*I $ K,5*I+1,X,2.5,1.5 $ K,5*I+2,X,2.5,12.5 $ K,5*I+3,X,11.5,1.5 $ K,5*I+4,X,11.5,12.5 $ K,5*I+5,X,7,12.5
L,5*I+1,5*I+2 $ L,5*I+3,5*I+4 $ L,5*I+2,5*I+5 $ L,5*I+5,5*I+4
*ENDDO
K,21,1,2.5,12.5 $ K,22,37,2.5,12.5 $ K,23,1,11.5,12.5 $ K,24,37,11.5,12.5
L,21,2 $ L,2,7 $ L,7,12 $ L,12,17 $ L,17,22 $ L,23,4 $ L,4,9 $ L,9,14 $ L,14,19 $ L,19,24
LSEL,S,LOC,Z,7 $ LATT,1,,2,,,,2
LSEL,S,LOC,Y,2.5 $ LSEL,A,LOC,Y,11.5 $ LSEL,R,LOC,Z,12.5 $ LATT,1,,2,,,,3
LSEL,S,LOC,X,4 $ LSEL,A,LOC,X,14 $ LSEL,A,LOC,X,24 $ LSEL,A,LOC,X,34 $ LSEL,R,LOC,Z,12.5 $ LATT,1,,2,,,,4
ALLSEL $ LESIZE,ALL,1 $ LMESH,ALL
NSEL,S,LOC,Z,1.5 $ D,ALL,ALL $ ALLSEL
TYPE,3 $ REAL,11 $ E,NODE(4,7,12.5) $ REAL,12 $ E,NODE(14,7,12.5) $ E,NODE(24,7,12.5) $ REAL,13 $ E,NODE(34,7,12.5)
ACEL,0,0,9.81`,
    parLines: 18,
    parTimeSeconds: 360,
    forbiddenCommands: NO_DIRECT_SOLIDS,
    requiredCommands: ['LATT', 'LMESH'],
    hints: [
      { level: 1, text: 'Five keypoints per column line (two column ends top and bottom pairs plus the bearing point) in one loop, then lines between them. Sections go on by selecting lines by centroid and LATT.' },
      { level: 2, text: 'LATT,MAT,REAL,TYPE,ESYS,KB,KE,SECNUM — the section is the 7th field. Column lines have centroid z = 7; longitudinal beams y = 2.5/11.5 at z = 12.5; transverse beams x = 4…34 at z = 12.5.' },
      { level: 3, text: '`LSEL,S,LOC,Z,7 $ LATT,1,,2,,,,2` … `ALLSEL $ LESIZE,ALL,1 $ LMESH,ALL`' },
    ],
    tags: ['boss', 'tgf36', 'technique-d', 'warmup'],
  },
  {
    id: 't10-c12',
    track: 't10',
    order: 12,
    title: 'TGF-36 D: beam/shell/spring frame',
    difficulty: 5,
    brief: `Build the **idealised TGF-36 frame**: the Winkler mat of warm-up D1 plus the column-and-grillage frame of
warm-up D2, with the column bases merged onto the mat nodes.

| Item | Value |
|---|---|
| Mat | SHELL181 (type 1, section 1 \`SECDATA,3,1\`) at z = **1.5**, node grid 1 m (X) x 0.5 m (Y), numbering \`1 + i + 100·j\` |
| Soil springs | per mat node, to a fixed ground node (+10000) at z = 0.5: COMBIN14 type 4 UZ (KEYOPT(2)=3, real 4 = **2.5E7**), type 5 UX (KEYOPT(2)=1, real 5 = **1.25E7**), type 6 UY (KEYOPT(2)=2, real 6 = **1.25E7**) |
| Columns | BEAM188 (type 2), section 2 RECT **3 x 2**, (x, y, 1.5)→(x, y, 12.5), x = 4/14/24/34, y = 2.5/11.5 |
| Grillage | z = **12.5**: longitudinal section 3 RECT **3.5 x 3**, transverse section 4 RECT **4 x 3** via the bearing point y = 7 |
| Mesh | LESIZE **1** on all frame lines, then \`NUMMRG,NODE\` to tie the column bases to the mat |
| Masses | MASS21 (type 3, KEYOPT(3)=2) at (x, 7, 12.5): **80 / 150 / 150 / 120 t** |
| Material / gravity | EX **3E10**, PRXY **0.2**, DENS **2500**; \`ACEL,0,0,9.81\` |

Element counts are graded exactly for beams, springs and masses: **200 BEAM188, 3393 COMBIN14, 4 MASS21**,
plus **1064 SHELL181**.`,
    targetScript: TGF36_D,
    solution: FAST_D,
    parLines: 28,
    parTimeSeconds: 600,
    forbiddenCommands: NO_DIRECT_SOLIDS,
    requiredCommands: ['NGEN', 'EGEN', 'LMESH', 'NUMMRG'],
    hints: [
      { level: 1, text: 'Two halves: the mat and springs by direct generation (warm-up D1, three spring types), the frame by K/L/LATT/LMESH (warm-up D2), then NUMMRG,NODE to connect them.' },
      { level: 2, text: 'Loop the three spring types: *DO,T,4,6 with TYPE,T $ REAL,T $ E,1,10001, *GET the new element number, then EGEN across the row and down the grid.' },
      { level: 3, text: '`*DO,T,4,6` / `TYPE,T $ REAL,T $ E,1,10001 $ *GET,E1,ELEM,0,NUM,MAX $ EGEN,39,1,E1 $ EGEN,29,100,E1,E1+38` / `*ENDDO`' },
    ],
    tags: ['boss', 'tgf36', 'technique-d'],
  },
  // ------------------------------------------------------------------ speedrun target (own page)
  {
    id: 't10-speedrun',
    track: 't10',
    order: 13,
    title: 'TGF-36 speedrun',
    difficulty: 5,
    brief: `Build the solid **TGF-36** turbine-generator tabletop foundation as fast as you can. **Any technique**:
primitives, bottom-up, sweeps, loops — whatever gets you there first. The grader is technique-agnostic
(any valid volume split is accepted).

${SPEC_SOLID}`,
    targetScript: TGF36_A,
    solution: FAST_A,
    parLines: 30,
    parTimeSeconds: 300,
    forbiddenCommands: [],
    requiredCommands: [],
    hints: [
      { level: 1, text: 'Primitives are the shortest route: one BLOCK per part, one loop for the columns, two tools for the openings.' },
      { level: 2, text: 'Put the whole attribute block on three $-joined lines, mesh everything with ESIZE,1 $ VMESH,ALL, and place the masses with E,NODE(x,7,14).' },
      { level: 3, text: '`*DO,X,3,33,10` / `BLOCK,X,X+2,1,4,3,11 $ BLOCK,X,X+2,10,13,3,11` / `*ENDDO`' },
    ],
    tags: ['boss', 'tgf36', 'speedrun'],
    grading: { ignore: ['counts.volu'], elemTolerance: 0.15 },
  },
];
