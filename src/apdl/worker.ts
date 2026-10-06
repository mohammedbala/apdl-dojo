/// <reference lib="webworker" />
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { execute } from './interpreter';
import { setKernel } from '../geometry/kernel';

const ready = (async () => {
  const wasm = await Module({ locateFile: () => wasmUrl });
  wasm.setup();
  setKernel(wasm);
})();

self.onmessage = async (ev: MessageEvent) => {
  const { id, src, opts } = ev.data as { id: number; src: string; opts?: unknown };
  try {
    await ready;
    const result = execute(src, opts as never);
    (self as unknown as Worker).postMessage({ id, result });
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) });
  }
};
