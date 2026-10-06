import type { BBox, EntityKind, Vec3 } from '../model/types';

/** Canonical, order-independent fingerprint of a model. Computed by summarize(). */
export interface ModelSummary {
  counts: Record<EntityKind, number>;
  /** bbox of all solid-model geometry (kps) and nodes; null when the model is empty */
  bbox: BBox | null;
  geomBBox: BBox | null;
  nodeBBox: BBox | null;
  totalVolume: number;
  /** total area of all areas (useful for shell/area models) */
  totalArea: number;
  /** total length of all lines */
  totalLineLength: number;
  volumes: { id: number; volume: number; bbox: BBox; centroid: Vec3 }[];
  /** element counts keyed by element name (SOLID185 ...) */
  elemByType: Record<string, number>;
  /** element type names defined with ET */
  etypesDefined: string[];
  /** element type names actually used by elements */
  etypesUsed: string[];
  materials: { id: number; props: Record<string, number> }[];
  sections: { id: number; type: string; subtype: string; data: number[] }[];
  reals: { id: number; values: number[] }[];
  bc: {
    /** number of constrained nodes */
    dNodes: number;
    /** number of (node, dof) constraint entries */
    dCount: number;
    /** bbox of constrained nodes */
    dBBox: BBox | null;
    fCount: number;
    fBBox: BBox | null;
    /** sum of nodal force components */
    fSum: Vec3;
    sfCount: number;
    acel: Vec3 | null;
  };
  /** positions of MASS21 elements and their mass value (first real) */
  masses: { xyz: Vec3; m: number }[];
  components: { name: string; kind: EntityKind; count: number }[];
  commandsUsed: string[];
  errors: number;
  warnings: number;
}

export type Stage = 'geometry' | 'attributes' | 'mesh' | 'bcs';

export interface CheckResult {
  id: string;
  label: string;
  stage: Stage;
  pass: boolean;
  /** 0..1 partial credit */
  score: number;
  expected: string;
  actual: string;
  hint?: string;
}

export interface Score {
  match: boolean;
  /** 0..100 */
  total: number;
  stages: Record<Stage, { pass: boolean; score: number; present: boolean }>;
  checks: CheckResult[];
}

export interface GradeOptions {
  /** relative tolerance for element counts (default 0.15) */
  elemTolerance?: number;
  /** relative tolerance for node counts (default 0.2) */
  nodeTolerance?: number;
  /** relative tolerance for volume (default 0.01) */
  volumeTolerance?: number;
  /** absolute bbox tolerance in model units (default 1e-3 * diag) */
  bboxTolerance?: number;
  /** checks to skip by id prefix, e.g. ['counts.area', 'counts.line'] */
  ignore?: string[];
  requiredCommands?: string[];
  forbiddenCommands?: string[];
  /** require zero errors in the user run */
  requireNoErrors?: boolean;
}
