// All drill templates.
import type { DrillTemplate } from '../types';
import { geometryDrills } from './geometry';
import { primitiveDrills } from './primitive';
import { booleanDrills } from './boolean';
import { sweepDrills } from './sweep';
import { directDrills } from './direct';
import { attributeDrills } from './attribute';
import { meshDrills } from './mesh';
import { selectDrills } from './select';
import { loadDrills } from './load';
import { macroDrills } from './macro';
import { sessionDrills } from './session';

export const drills: DrillTemplate[] = [
  ...sessionDrills,
  ...geometryDrills,
  ...primitiveDrills,
  ...booleanDrills,
  ...sweepDrills,
  ...directDrills,
  ...attributeDrills,
  ...meshDrills,
  ...selectDrills,
  ...loadDrills,
  ...macroDrills,
];
