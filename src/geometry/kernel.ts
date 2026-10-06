// Holds the initialised manifold-3d WASM module (set once by the worker or test setup).
import type { ManifoldToplevel } from 'manifold-3d';

let kernel: ManifoldToplevel | null = null;

export function setKernel(k: ManifoldToplevel) {
  kernel = k;
}

export function getKernel(): ManifoldToplevel {
  if (!kernel) throw new Error('Geometry kernel (manifold-3d) is not initialised.');
  return kernel;
}

export function hasKernel() {
  return kernel !== null;
}
