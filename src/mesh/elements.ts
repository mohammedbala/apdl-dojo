import type { ElemCategory } from '../model/types';

export interface ElementDef {
  ename: string;
  category: ElemCategory;
  /** topological dimension of the element */
  dim: 0 | 1 | 2 | 3;
  /** nominal node count */
  nodes: number;
  /** quadratic (has midside nodes) */
  midside: boolean;
  /** which attribute tables the element needs for a valid model */
  needs: ('real' | 'sec' | 'mat')[];
  summary: string;
}

export const ELEMENT_LIBRARY: Record<string, ElementDef> = {
  SOLID185: { ename: 'SOLID185', category: 'solid', dim: 3, nodes: 8, midside: false, needs: ['mat'], summary: '3-D 8-node structural solid (hex; degenerates to wedge/tet).' },
  SOLID186: { ename: 'SOLID186', category: 'solid', dim: 3, nodes: 20, midside: true, needs: ['mat'], summary: '3-D 20-node quadratic structural solid.' },
  SOLID187: { ename: 'SOLID187', category: 'solid', dim: 3, nodes: 10, midside: true, needs: ['mat'], summary: '3-D 10-node quadratic tetrahedral solid.' },
  SOLID65: { ename: 'SOLID65', category: 'solid', dim: 3, nodes: 8, midside: false, needs: ['mat'], summary: '3-D reinforced concrete solid (legacy).' },
  BEAM188: { ename: 'BEAM188', category: 'beam', dim: 1, nodes: 2, midside: false, needs: ['mat', 'sec'], summary: '3-D 2-node Timoshenko beam; needs SECTYPE/SECDATA.' },
  BEAM189: { ename: 'BEAM189', category: 'beam', dim: 1, nodes: 3, midside: true, needs: ['mat', 'sec'], summary: '3-D 3-node quadratic beam.' },
  SHELL181: { ename: 'SHELL181', category: 'shell', dim: 2, nodes: 4, midside: false, needs: ['mat', 'sec'], summary: '4-node structural shell; thickness via SECTYPE,,SHELL.' },
  SHELL281: { ename: 'SHELL281', category: 'shell', dim: 2, nodes: 8, midside: true, needs: ['mat', 'sec'], summary: '8-node quadratic shell.' },
  SHELL63: { ename: 'SHELL63', category: 'shell', dim: 2, nodes: 4, midside: false, needs: ['mat', 'real'], summary: 'Elastic shell (legacy); thickness via R.' },
  COMBIN14: { ename: 'COMBIN14', category: 'spring', dim: 1, nodes: 2, midside: false, needs: ['real'], summary: 'Spring-damper; R,set,K,CV1,CV2.' },
  COMBIN40: { ename: 'COMBIN40', category: 'spring', dim: 1, nodes: 2, midside: false, needs: ['real'], summary: 'Combination element (spring-slider-damper-gap).' },
  MASS21: { ename: 'MASS21', category: 'mass', dim: 0, nodes: 1, midside: false, needs: ['real'], summary: 'Structural point mass; KEYOPT(3)=2 takes one real (mass).' },
  LINK180: { ename: 'LINK180', category: 'link', dim: 1, nodes: 2, midside: false, needs: ['mat', 'sec'], summary: '3-D spar (truss) element.' },
  SURF154: { ename: 'SURF154', category: 'surf', dim: 2, nodes: 4, midside: false, needs: [], summary: '3-D structural surface effect (pressure loads).' },
  MPC184: { ename: 'MPC184', category: 'link', dim: 1, nodes: 2, midside: false, needs: [], summary: 'Multipoint constraint element (rigid link/beam).' },
};

export function lookupElement(name: string): ElementDef | undefined {
  return ELEMENT_LIBRARY[name.toUpperCase()];
}
