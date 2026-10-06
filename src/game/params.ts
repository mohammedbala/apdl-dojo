// Challenge parameters: defaults, random draws (daily), injection into scripts, brief substitution.
import type { ParamSpec, Rng } from '../content/types';
import { roundTo } from './rng';

export type Params = Record<string, number>;

export function defaultParams(specs: Record<string, ParamSpec> | undefined): Params {
  const out: Params = {};
  if (!specs) return out;
  for (const [k, s] of Object.entries(specs)) {
    const mid = (s.min + s.max) / 2;
    let v = s.step ? roundTo(Math.round((mid - s.min) / s.step) * s.step + s.min, s.step) : mid;
    v = Math.min(s.max, Math.max(s.min, v));
    out[k] = v;
  }
  return out;
}

export function drawParams(specs: Record<string, ParamSpec> | undefined, rng: Rng): Params {
  const out: Params = {};
  if (!specs) return out;
  for (const [k, s] of Object.entries(specs)) out[k] = rng.float(s.min, s.max, s.step ?? (Number.isInteger(s.min) && Number.isInteger(s.max) ? 1 : undefined));
  return out;
}

export function fmtNum(v: number): string {
  return String(Number(v.toPrecision(10)));
}

/** Prepend NAME=value lines to a script. */
export function withParams(script: string, params: Params | undefined): string {
  if (!params || Object.keys(params).length === 0) return script;
  const head = Object.entries(params).map(([k, v]) => `${k}=${fmtNum(v)}`).join('\n');
  return `${head}\n${script}`;
}

/** Replace {{NAME}} in a brief with parameter values. Unknown names are left untouched. */
export function fillBrief(brief: string, params: Params | undefined): string {
  return brief.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, name: string) => {
    const v = params?.[name] ?? params?.[name.toUpperCase()];
    return v === undefined ? m : fmtNum(v);
  });
}
