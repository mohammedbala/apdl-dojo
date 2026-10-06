// Level ladder: xpForLevel(n) = 150 n (n-1). Level 12 = 19 800 XP.
export const LEVEL_TITLES = [
  'Keypoint Cadet', 'Line Drafter', 'Area Apprentice', 'Volume Builder', 'Boolean Technician', 'Extrusion Engineer',
  'Node Wrangler', 'Section Specialist', 'Mesh Whisperer', 'Selection Surgeon', 'Parametric Principal', 'Foundation Architect',
] as const;

export const MAX_LEVEL = LEVEL_TITLES.length;

export function xpForLevel(n: number): number {
  return 150 * n * (n - 1);
}

export function levelForXp(xp: number): number {
  let lvl = 1;
  while (lvl < MAX_LEVEL && xp >= xpForLevel(lvl + 1)) lvl++;
  return lvl;
}

export interface LevelInfo {
  level: number;
  title: string;
  /** XP into the current level */
  into: number;
  /** XP span of the current level (0 at max level) */
  span: number;
  /** 0..1 progress to the next level (1 at max) */
  progress: number;
  nextAt: number | null;
}

export function levelInfo(xp: number): LevelInfo {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const nextAt = level < MAX_LEVEL ? xpForLevel(level + 1) : null;
  const span = nextAt === null ? 0 : nextAt - base;
  const into = xp - base;
  return { level, title: LEVEL_TITLES[level - 1], into, span, progress: span ? Math.min(1, into / span) : 1, nextAt };
}

/** Post-12 suffix tier from the best foundation speedrun time (seconds). */
export function foundationTier(bestSeconds: number | null | undefined): '' | '★' | '★★' | '★★★' {
  if (bestSeconds == null) return '';
  if (bestSeconds < 60) return '★★★';
  if (bestSeconds < 120) return '★★';
  if (bestSeconds < 300) return '★';
  return '';
}
