// Element topology helpers: canonical face tables and exterior-face extraction.
import type { ElemShape } from '../model/types';

export type SolidShape = 'hex' | 'wedge' | 'pyramid' | 'tet';

export const SOLID_CODE: Record<SolidShape, number> = { hex: 0, wedge: 1, pyramid: 2, tet: 3 };

/** Corner node counts per shape. */
export const CORNERS: Record<ElemShape, number> = {
  hex: 8, wedge: 6, pyramid: 5, tet: 4, quad: 4, tri: 3, line: 2, point: 1,
};

/** Outward-wound faces (local corner indices) per solid shape code. */
export const SOLID_FACES: number[][][] = [
  // hex: I J K L (bottom) M N O P (top)
  [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]],
  // wedge: b0 b1 b2 t0 t1 t2
  [[0, 2, 1], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]],
  // pyramid: b0..b3 apex
  [[0, 3, 2, 1], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]],
  // tet
  [[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]],
];

/** ANSYS load face numbers (1-based index into array) for SF/SFE pressure on solids. null = no such face. */
export const ANSYS_SOLID_LOAD_FACES: Record<SolidShape, (number[] | null)[]> = {
  hex: [[1, 0, 3, 2], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]],
  // degenerate-hex numbering (K=L, O=P)
  wedge: [[1, 0, 2], [0, 1, 4, 3], [1, 2, 5, 4], null, [2, 0, 3, 5], [3, 4, 5]],
  // degenerate-hex numbering (M=N=O=P)
  pyramid: [[1, 0, 3, 2], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], null],
  tet: [[1, 0, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]],
};

export interface ExteriorFaces {
  /** number of exterior faces */
  count: number;
  /** 4 dense node indices per face in original (outward) order; -1 padding for triangles */
  verts: Int32Array;
  /** corner count per face (3 or 4) */
  nv: Uint8Array;
  /** owning cell ordinal per face */
  owner: Int32Array;
}

function hash4(a: number, b: number, c: number, d: number): number {
  let h = Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 0x632be5ab, 0x85ebca77) ^ Math.imul(c + 0x1b873593, 0xc2b2ae3d) ^
    Math.imul(d + 2, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * Faces that appear exactly once among the given solid cells.
 * Faces are matched by their sorted (deduplicated) corner ids using a numeric open-addressing
 * hash table, so degenerate hexes (repeated node ids) still match neighbouring tets/wedges.
 * @param shape   solid shape code per cell (SOLID_CODE)
 * @param corners dense node indices, `stride` per cell
 */
export function extractExteriorFaces(shape: Uint8Array, corners: Int32Array, nCells: number, stride = 8): ExteriorFaces {
  let maxFaces = 0;
  for (let i = 0; i < nCells; i++) maxFaces += SOLID_FACES[shape[i]]?.length ?? 0;
  let cap = 16;
  while (cap < maxFaces * 2) cap <<= 1;
  const mask = cap - 1;
  const table = new Int32Array(cap).fill(-1);
  const fSorted = new Int32Array(maxFaces * 4);
  const fOrig = new Int32Array(maxFaces * 4);
  const fNv = new Uint8Array(maxFaces);
  const fCnt = new Uint8Array(maxFaces);
  const fOwner = new Int32Array(maxFaces);
  let nf = 0;
  const u = [0, 0, 0, 0];
  const s = [0, 0, 0, 0];

  for (let i = 0; i < nCells; i++) {
    const faces = SOLID_FACES[shape[i]];
    if (!faces) continue;
    const base = i * stride;
    for (let f = 0; f < faces.length; f++) {
      const face = faces[f];
      let m = 0;
      for (let k = 0; k < face.length; k++) {
        const v = corners[base + face[k]];
        let dup = false;
        for (let q = 0; q < m; q++) if (u[q] === v) { dup = true; break; }
        if (!dup) u[m++] = v;
      }
      if (m < 3) continue;
      for (let q = 0; q < m; q++) s[q] = u[q];
      // insertion sort (m <= 4)
      for (let p = 1; p < m; p++) {
        const v = s[p];
        let q = p - 1;
        while (q >= 0 && s[q] > v) { s[q + 1] = s[q]; q--; }
        s[q + 1] = v;
      }
      const s3 = m === 4 ? s[3] : -1;
      let slot = hash4(s[0], s[1], s[2], s3) & mask;
      for (;;) {
        const t = table[slot];
        if (t < 0) {
          const o = nf * 4;
          fSorted[o] = s[0]; fSorted[o + 1] = s[1]; fSorted[o + 2] = s[2]; fSorted[o + 3] = s3;
          fOrig[o] = u[0]; fOrig[o + 1] = u[1]; fOrig[o + 2] = u[2]; fOrig[o + 3] = m === 4 ? u[3] : -1;
          fNv[nf] = m;
          fCnt[nf] = 1;
          fOwner[nf] = i;
          table[slot] = nf++;
          break;
        }
        const o = t * 4;
        if (fNv[t] === m && fSorted[o] === s[0] && fSorted[o + 1] === s[1] && fSorted[o + 2] === s[2] && fSorted[o + 3] === s3) {
          if (fCnt[t] < 255) fCnt[t]++;
          break;
        }
        slot = (slot + 1) & mask;
      }
    }
  }

  let count = 0;
  for (let t = 0; t < nf; t++) if (fCnt[t] === 1) count++;
  const verts = new Int32Array(count * 4);
  const nv = new Uint8Array(count);
  const owner = new Int32Array(count);
  let j = 0;
  for (let t = 0; t < nf; t++) {
    if (fCnt[t] !== 1) continue;
    verts.set(fOrig.subarray(t * 4, t * 4 + 4), j * 4);
    nv[j] = fNv[t];
    owner[j] = fOwner[t];
    j++;
  }
  return { count, verts, nv, owner };
}
