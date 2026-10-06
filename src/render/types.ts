// Shared renderer types (re-exported from viewport.ts, which is the public entry point).
import type { EntityKind, Vec3 } from '../model/types';

export type ViewMode = 'yours' | 'target' | 'split' | 'ghost';
export type ViewPreset = 'iso' | 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';

export interface DisplayOptions {
  show: { kp: boolean; line: boolean; area: boolean; volu: boolean; node: boolean; elem: boolean; bc: boolean };
  labels: { kp: boolean; line: boolean; area: boolean; volu: boolean; node: boolean; elem: boolean };
  /** 'auto' = ANSYS-like: show elements if any exist, else volumes+areas+lines+kps */
  auto: boolean;
  wireframe: boolean; // solid elements/volumes as edges only
  eshape: boolean; // /ESHAPE: extrude beam sections, thicken shells
  colorBy: 'entity' | 'type' | 'mat' | 'real' | 'sec';
  projection: 'ortho' | 'persp';
}

export type SceneRole = 'yours' | 'target' | 'ghost';

/** Which layers a built scene actually draws (after resolving display.auto / plot hints). */
export interface LayerSet {
  kp: boolean;
  line: boolean;
  area: boolean;
  volu: boolean;
  node: boolean;
  elem: boolean;
  bc: boolean;
}

export interface LabelSpec {
  text: string;
  pos: Vec3;
  /** CSS colour string */
  color: string;
  kind: EntityKind | 'acel';
}

export function defaultDisplay(): DisplayOptions {
  return {
    show: { kp: true, line: true, area: true, volu: true, node: false, elem: true, bc: true },
    labels: { kp: false, line: false, area: false, volu: false, node: false, elem: false },
    auto: true,
    wireframe: false,
    eshape: false,
    colorBy: 'entity',
    projection: 'ortho',
  };
}

export function cloneDisplay(d: DisplayOptions): DisplayOptions {
  return { ...d, show: { ...d.show }, labels: { ...d.labels } };
}
