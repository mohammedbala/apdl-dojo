// Save migrations keyed by the version they migrate FROM. normalizeSave() deep-fills missing fields.
import { emptySave, SCHEMA_VERSION, type SaveV1 } from './schema';

type AnyObj = Record<string, any>;

/** from-version -> function producing the next version */
export const MIGRATIONS: Record<number, (s: AnyObj) => AnyObj> = {
  // v0: pre-release blobs without schemaVersion. Same shape, just stamp the version.
  0: (s) => ({ ...s, schemaVersion: 1 }),
};

function isObj(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Fill missing keys from defaults (one level of nested objects for known containers). */
function fill<T extends AnyObj>(def: T, v: unknown): T {
  if (!isObj(v)) return def;
  const out: AnyObj = { ...def };
  for (const k of Object.keys(def)) {
    const dv = (def as AnyObj)[k];
    const vv = v[k];
    if (vv === undefined) continue;
    if (isObj(dv) && isObj(vv) && Object.keys(dv).length > 0) out[k] = fill(dv, vv);
    else if (Array.isArray(dv)) out[k] = Array.isArray(vv) ? vv : dv;
    else if (typeof dv === typeof vv || dv === null || (isObj(dv) && isObj(vv))) out[k] = vv;
  }
  // keep unknown keys from newer builds
  for (const k of Object.keys(v)) if (!(k in out)) out[k] = v[k];
  return out as T;
}

export function normalizeSave(v: unknown): SaveV1 {
  return fill(emptySave(isObj(v) && typeof v.createdAt === 'number' ? v.createdAt : Date.now()), v);
}

/** Apply migrations up to SCHEMA_VERSION. Throws on non-object input or a future version. */
export function migrate(raw: unknown): SaveV1 {
  if (!isObj(raw)) throw new Error('save is not an object');
  let s: AnyObj = raw;
  let v = typeof s.schemaVersion === 'number' ? s.schemaVersion : 0;
  if (v > SCHEMA_VERSION) throw new Error(`save schema ${v} is newer than this build (${SCHEMA_VERSION})`);
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`no migration from schema ${v}`);
    s = m(s);
    v = typeof s.schemaVersion === 'number' && s.schemaVersion > v ? s.schemaVersion : v + 1;
  }
  return normalizeSave(s);
}
