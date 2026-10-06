// Colour palettes for the renderer.

/** ANSYS-style entity colour cycle; index = (id - 1) mod length. */
export const ANSYS_CYCLE = [
  '#d946ef', '#3b82f6', '#22d3ee', '#22c55e', '#eab308',
  '#f97316', '#ef4444', '#a78bfa', '#14b8a6', '#f472b6',
];

/** Shades of #4cc9f0 used to tint the target model in compare modes. */
export const TARGET_CYCLE = ['#4cc9f0', '#36a9d4', '#7fdcf7', '#2a8fb8', '#a8e9fa', '#1f7fa6', '#5fd0f3', '#93e3f8'];

export const BG_COLOR = '#0b0e14';
export const GHOST_COLOR = '#8fb9c7';

export const COLORS = {
  kp: '#ffffff',
  kpTarget: '#d8f6ff',
  node: '#facc15',
  nodeTarget: '#9be7fb',
  line: '#b9e3ff',
  lineTarget: '#4cc9f0',
  /** element / volume outline drawn on top of an opaque fill */
  edgeDark: '#141923',
  faint: '#7a8291',
  bcD: '#22d3ee',
  bcRot: '#a5f3fc',
  force: '#ef4444',
  moment: '#f97316',
  pressure: '#f87171',
  acel: '#22c55e',
  mass: '#ff00ff',
  axisX: '#ef4444',
  axisY: '#22c55e',
  axisZ: '#3b82f6',
};

/** Palette entry for an id with ANSYS-style (id-1) modulo indexing; robust to 0/negative/NaN ids. */
export function cycleColor(id: number, palette: readonly string[] = ANSYS_CYCLE): string {
  const n = palette.length;
  const k = Number.isFinite(id) ? Math.trunc(id) - 1 : 0;
  return palette[((k % n) + n) % n];
}
