// Deterministic seeded RNG (mulberry32) + string hash. Implements the content Rng interface.
import type { Rng } from '../content/types';

/** 32-bit string hash (FNV-1a with a final avalanche). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Round to a step without binary noise (0.1 + 0.2 -> 0.3). */
export function roundTo(v: number, step: number): number {
  if (!step) return v;
  const r = Math.round(v / step) * step;
  const str = String(step);
  const [mant, exp] = str.split('e-');
  const dec = Math.min(12, (mant.split('.')[1]?.length ?? 0) + (exp ? Number(exp) : 0));
  return Number(r.toFixed(dec));
}

export function createRng(seed: number | string): Rng {
  const next = mulberry32(typeof seed === 'string' ? hashString(seed) : seed);
  return {
    next,
    int(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('pick from empty array');
      return arr[Math.floor(next() * arr.length)];
    },
    float(min, max, step) {
      if (step && step > 0) {
        const n = Math.floor((max - min) / step + 1e-9);
        return roundTo(min + Math.floor(next() * (n + 1)) * step, step);
      }
      return min + next() * (max - min);
    },
  };
}
