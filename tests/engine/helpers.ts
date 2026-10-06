import Module from 'manifold-3d';
import { setKernel, hasKernel } from '../../src/geometry/kernel';
import { execute } from '../../src/apdl/interpreter';
import { summarize } from '../../src/model/summary';

export async function initKernel() {
  if (hasKernel()) return;
  const wasm = await Module();
  wasm.setup();
  setKernel(wasm);
}

export function run(src: string) {
  const r = execute(src);
  return { ...r, s: summarize(r.model, r.diagnostics), errors: r.diagnostics.filter((d) => d.severity === 'error'), warnings: r.diagnostics.filter((d) => d.severity === 'warning') };
}
