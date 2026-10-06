// Main-thread client for the interpreter Web Worker.
import type { RunOptions, RunResult } from './diagnostics';

interface Pending {
  resolve: (r: RunResult) => void;
  reject: (e: unknown) => void;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent) => {
    const { id, result, error } = ev.data as { id: number; result?: RunResult; error?: string };
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(result!);
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(e);
    pending.clear();
  };
  return worker;
}

/** Run an APDL script in the worker. Every call gets its own result (no cancellation of other calls). */
export function runScript(src: string, opts?: RunOptions): Promise<RunResult> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, src, opts });
  });
}

/**
 * Debounced "latest wins" runner for live editing: only the most recent request resolves;
 * older in-flight requests resolve with null.
 */
export function createLiveRunner(delayMs = 250) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest = 0;
  return {
    run(src: string, cb: (r: RunResult) => void, opts?: RunOptions, immediate = false) {
      if (timer) clearTimeout(timer);
      const fire = () => {
        const ticket = ++latest;
        runScript(src, opts).then((r) => {
          if (ticket === latest) cb(r);
        }).catch((e) => console.error('APDL run failed', e));
      };
      if (immediate) fire();
      else timer = setTimeout(fire, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      latest++;
    },
  };
}
