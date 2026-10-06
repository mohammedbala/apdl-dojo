// Helpers for seeded drill templates.
import type { CommandFamily, DrillTemplate, Rng, TrackId } from '../types';

export type Gen = DrillTemplate['gen'];

export function T(
  id: string,
  command: string,
  track: TrackId,
  family: CommandFamily,
  gen: Gen,
  explain: string,
  tags: string[] = [],
): DrillTemplate {
  return { id, command, track, family, tags, gen, explain };
}

/** Format a number without binary noise. */
export const f = (v: number) => String(Number(v.toPrecision(10)));

/** Pick a "nice" coordinate. */
export const coord = (r: Rng, max = 20) => r.pick([0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 15, 20].filter((v) => v <= max));
export const size = (r: Rng) => r.pick([0.25, 0.5, 1, 1.5, 2, 2.5, 3]);
export const axis = (r: Rng) => r.pick(['X', 'Y', 'Z'] as const);
export const ordinal = (n: number) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
