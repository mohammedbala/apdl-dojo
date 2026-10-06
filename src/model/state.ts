import type { EntityKind, Id, ModelState, Selection, WorkingPlane } from './types';

export const ENTITY_KINDS: EntityKind[] = ['kp', 'line', 'area', 'volu', 'node', 'elem'];

/**
 * Entity map that remembers a lower bound of the first free number, so "lowest available number" lookups are
 * O(1) amortised instead of scanning from 1. Invariant: every id below `lowFree` is occupied.
 * (After structured cloning to the main thread this becomes a plain Map, which is fine for rendering.)
 */
export class IdMap<V> extends Map<Id, V> {
  lowFree = 1;
  delete(key: Id): boolean {
    if (key < this.lowFree) this.lowFree = Math.max(1, key);
    return super.delete(key);
  }
  clear(): void {
    this.lowFree = 1;
    super.clear();
  }
}

export function emptySelection(): Selection {
  return { kp: new Set(), line: new Set(), area: new Set(), volu: new Set(), node: new Set(), elem: new Set() };
}

export function globalWP(): WorkingPlane {
  return { origin: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
}

export function createEmptyModel(): ModelState {
  return {
    title: '',
    processor: 'BEGIN',
    kps: new IdMap(),
    lines: new IdMap(),
    areas: new IdMap(),
    volus: new IdMap(),
    nodes: new IdMap(),
    elems: new IdMap(),
    etypes: new Map(),
    mats: new Map(),
    reals: new Map(),
    secs: new Map(),
    comps: new Map(),
    sel: emptySelection(),
    bcs: [],
    solidLoads: [],
    acel: null,
    params: new Map(),
    cur: {
      type: 1, mat: 1, real: 1, secnum: 1, esys: 0,
      csys: 0, esize: 0, esizeNdiv: 0, mshape: 0, mshape3d: true, mshkey: 0, seltol: 1e-6,
    },
    csyss: new Map(),
    wp: globalWP(),
    numstr: {},
    nodeOwner: new Map(),
    commandsUsed: [],
    maxLoopIterations: 0,
  };
}

/** Map holding entities of a given kind. */
export function entityMap(m: ModelState, kind: EntityKind): Map<Id, unknown> {
  switch (kind) {
    case 'kp': return m.kps;
    case 'line': return m.lines;
    case 'area': return m.areas;
    case 'volu': return m.volus;
    case 'node': return m.nodes;
    case 'elem': return m.elems;
  }
}

/** ANSYS numbering: lowest available number >= NUMSTR start. */
export function nextId(m: ModelState, kind: EntityKind): Id {
  const map = entityMap(m, kind) as Map<Id, unknown> & { lowFree?: number };
  let n = map.lowFree ?? 1;
  while (map.has(n)) n++;
  if (map.lowFree !== undefined) map.lowFree = n;
  const start = m.numstr[kind];
  if (start && start > n) {
    let k = start;
    while (map.has(k)) k++;
    return k;
  }
  return n;
}

/** Highest defined number (0 when none). */
export function maxId(m: ModelState, kind: EntityKind): Id {
  let mx = 0;
  for (const k of entityMap(m, kind).keys()) if (k > mx) mx = k;
  return mx;
}

/** Add a freshly created entity id to the active selection (ANSYS selects new entities). */
export function selectNew(m: ModelState, kind: EntityKind, id: Id) {
  m.sel[kind].add(id);
}

/** Ids of the selected entities of a kind, ascending, restricted to those that still exist. */
export function selectedIds(m: ModelState, kind: EntityKind): Id[] {
  const map = entityMap(m, kind);
  const out: Id[] = [];
  for (const id of m.sel[kind]) if (map.has(id)) out.push(id);
  return out.sort((a, b) => a - b);
}

export function removeEntity(m: ModelState, kind: EntityKind, id: Id) {
  entityMap(m, kind).delete(id);
  m.sel[kind].delete(id);
}
