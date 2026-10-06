// Pure ModelState -> THREE.Group builder. No WebGL access; safe to run in Node (tests).
//
// Everything is emitted as a handful of merged BufferGeometries / InstancedMeshes per layer;
// the only per-entity output is the LabelSpec list (turned into CSS2D labels by the viewport).

import * as THREE from 'three';
import type { PlotWhat } from '../apdl/diagnostics';
import type {
  Area, ElemCategory, ElemShape, Element, EntityKind, Id, ModelState, Section, TriMesh, Vec3,
} from '../model/types';
import { IndexedSoup, PointSoup, SegSoup, TriSoup, F32 } from './buffers';
import { ANSYS_CYCLE, COLORS, GHOST_COLOR, TARGET_CYCLE, cycleColor } from './colors';
import * as Glyph from './glyphs';
import { ANSYS_SOLID_LOAD_FACES, CORNERS, SOLID_CODE, extractExteriorFaces, type SolidShape } from './topology';
import type { DisplayOptions, LabelSpec, LayerSet, SceneRole } from './types';

export type { LabelSpec } from './types';

export const LABEL_CAP = 1500;
export const INSTANCE_CAP = 20000;

export interface BuildOptions {
  display: DisplayOptions;
  role: SceneRole;
  /** last xPLOT hint (only honoured when display.auto) */
  plot?: PlotWhat | null;
  labelCap?: number;
}

export interface BuildStats {
  solidCells: number;
  exteriorFaces: number;
  shellCells: number;
  beamCells: number;
  springCells: number;
  massCells: number;
  skippedElems: number;
  dGlyphs: number;
  rotGlyphs: number;
  fGlyphs: number;
  mGlyphs: number;
  sfGlyphs: number;
  buildMs: number;
}

export interface BuiltScene {
  group: THREE.Group;
  /** bbox of visible model geometry (glyphs excluded); empty Box3 when nothing is drawn */
  bbox: THREE.Box3;
  labels: LabelSpec[];
  labelsCapped: boolean;
  layers: LayerSet;
  stats: BuildStats;
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------
// Layer resolution

/** Which layers to draw for a model, given display options and the last xPLOT hint. */
export function resolveLayers(model: ModelState | null, display: DisplayOptions, plot?: PlotWhat | null): LayerSet {
  const bc = display.show.bc;
  if (!display.auto) return { ...display.show };
  const none: LayerSet = { kp: false, line: false, area: false, volu: false, node: false, elem: false, bc };
  if (plot) {
    if (plot === 'all') return { kp: true, line: true, area: true, volu: true, node: true, elem: true, bc };
    return { ...none, [plot]: true };
  }
  if (!model) return none;
  if (model.elems.size > 0) return { ...none, elem: true };
  return { kp: true, line: true, area: true, volu: true, node: model.nodes.size > 0, elem: false, bc };
}

// ---------------------------------------------------------------------------------------------
// Node lookup (id -> dense index) using a flat table when ids are reasonably compact.

class NodeIndex {
  pos: Float64Array;
  count = 0;
  private table: Int32Array | null = null;
  private map: Map<number, number> | null = null;

  constructor(nodes: Map<Id, { xyz: Vec3 }>) {
    let maxId = 0;
    for (const id of nodes.keys()) if (id > maxId) maxId = id;
    this.pos = new Float64Array(nodes.size * 3);
    if (Number.isFinite(maxId) && maxId <= Math.max(1_000_000, nodes.size * 8)) {
      this.table = new Int32Array(Math.max(0, Math.floor(maxId)) + 1).fill(-1);
    } else {
      this.map = new Map();
    }
    let i = 0;
    for (const [id, nd] of nodes) {
      const x = nd?.xyz;
      if (!okVec(x) || !Number.isInteger(id) || id < 0) continue;
      this.pos[i * 3] = x[0];
      this.pos[i * 3 + 1] = x[1];
      this.pos[i * 3 + 2] = x[2];
      if (this.table) this.table[id] = i;
      else this.map!.set(id, i);
      i++;
    }
    this.count = i;
  }

  idx(id: number): number {
    if (this.table) {
      if (!(id >= 0 && id < this.table.length)) return -1;
      return this.table[id | 0] ?? -1;
    }
    return this.map!.get(id) ?? -1;
  }

  p(i: number): [number, number, number] {
    return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]];
  }
}

function okVec(v: unknown): v is Vec3 {
  return (
    Array.isArray(v) && v.length >= 3 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2])
  );
}

// ---------------------------------------------------------------------------------------------
// Small vector helpers on plain arrays

type V = [number, number, number];
const sub = (a: ArrayLike<number>, b: ArrayLike<number>): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: ArrayLike<number>, b: ArrayLike<number>): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: ArrayLike<number>) => Math.hypot(a[0], a[1], a[2]);
function norm(a: V): V {
  const l = len(a);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}
/** Newell normal of a polygon (unit, or zero vector when degenerate). */
function newell(pts: ArrayLike<number>[]): V {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm([x, y, z]);
}
function centroidOf(pts: ArrayLike<number>[]): V {
  const c: V = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  const n = Math.max(1, pts.length);
  return [c[0] / n, c[1] / n, c[2] / n];
}

function emptyStats(): BuildStats {
  return {
    solidCells: 0, exteriorFaces: 0, shellCells: 0, beamCells: 0, springCells: 0, massCells: 0, skippedElems: 0,
    dGlyphs: 0, rotGlyphs: 0, fGlyphs: 0, mGlyphs: 0, sfGlyphs: 0, buildMs: 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Build context

class Ctx {
  group = new THREE.Group();
  bbox = new THREE.Box3();
  labels: LabelSpec[] = [];
  capped = false;
  geoms: THREE.BufferGeometry[] = [];
  mats = new Map<string, THREE.Material>();
  inst: THREE.InstancedMesh[] = [];
  nodes: NodeIndex;
  modelBox = new THREE.Box3();
  diag = 1;
  ghost: boolean;
  palette: readonly string[];
  private colorCache = new Map<string, THREE.Color>();
  stats: BuildStats = emptyStats();

  constructor(
    public model: ModelState,
    public display: DisplayOptions,
    public role: SceneRole,
    public layers: LayerSet,
    public labelCap: number,
  ) {
    this.group.name = `scene-${role}`;
    this.ghost = role === 'ghost';
    this.palette = role === 'yours' ? ANSYS_CYCLE : TARGET_CYCLE;
    this.nodes = new NodeIndex(model.nodes ?? new Map());
    this.computeModelBox();
  }

  private computeModelBox() {
    const b = this.modelBox;
    const v = new THREE.Vector3();
    const np = this.nodes.pos;
    for (let i = 0; i < this.nodes.count; i++) b.expandByPoint(v.set(np[i * 3], np[i * 3 + 1], np[i * 3 + 2]));
    for (const k of this.model.kps?.values() ?? []) if (okVec(k?.xyz)) b.expandByPoint(v.fromArray(k.xyz));
    for (const l of this.model.lines?.values() ?? []) for (const p of l?.pts ?? []) if (okVec(p)) b.expandByPoint(v.fromArray(p));
    for (const vo of this.model.volus?.values() ?? []) {
      if (okVec(vo?.bbox?.min) && okVec(vo?.bbox?.max)) {
        b.expandByPoint(v.fromArray(vo.bbox.min));
        b.expandByPoint(v.fromArray(vo.bbox.max));
      }
    }
    for (const a of this.model.areas?.values() ?? []) {
      const pos = a?.tess?.pos;
      if (!pos) continue;
      for (let i = 0; i + 2 < pos.length; i += 3) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) b.expandByPoint(v.set(x, y, z));
      }
    }
    const d = b.isEmpty() ? 0 : b.min.distanceTo(b.max);
    this.diag = d > 1e-12 && Number.isFinite(d) ? d : 1;
  }

  sel(kind: EntityKind, id: Id): boolean {
    const s = this.model.sel?.[kind];
    return s ? s.has(id) : true;
  }

  colorCss(key: number): string {
    if (this.ghost) return GHOST_COLOR;
    return cycleColor(key, this.palette);
  }

  color(css: string): THREE.Color {
    let c = this.colorCache.get(css);
    if (!c) {
      c = new THREE.Color(css);
      this.colorCache.set(css, c);
    }
    return c;
  }

  keyColor(key: number): THREE.Color {
    return this.color(this.colorCss(key));
  }

  elemKey(e: Element): number {
    switch (this.display.colorBy) {
      case 'mat': return e.mat;
      case 'real': return e.real;
      case 'sec': return e.secnum;
      default: return e.type;
    }
  }

  attrKey(id: Id, attrs?: { type?: Id; mat?: Id; real?: Id; secnum?: Id }): number {
    const a = attrs ?? {};
    switch (this.display.colorBy) {
      case 'type': return a.type ?? id;
      case 'mat': return a.mat ?? id;
      case 'real': return a.real ?? id;
      case 'sec': return a.secnum ?? id;
      default: return id;
    }
  }

  mat<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.mats.get(key) as T | undefined;
    if (!m) {
      m = make();
      this.mats.set(key, m);
    }
    return m;
  }

  fillMat(kind: 'solid' | 'area', faint: boolean): THREE.Material {
    if (this.ghost) {
      return this.mat('ghost-fill', () => new THREE.MeshLambertMaterial({
        color: GHOST_COLOR, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
      }));
    }
    if (faint) {
      return this.mat('faint-fill', () => new THREE.MeshBasicMaterial({
        color: COLORS.faint, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide,
      }));
    }
    if (kind === 'area') {
      return this.mat('area-fill', () => new THREE.MeshLambertMaterial({
        vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      }));
    }
    return this.mat('solid-fill', () => new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }));
  }

  lineMat(faint: boolean): THREE.Material {
    if (this.ghost) {
      return this.mat('ghost-line', () => new THREE.LineBasicMaterial({
        color: GHOST_COLOR, transparent: true, opacity: 0.35, depthWrite: false,
      }));
    }
    if (faint) {
      return this.mat('faint-line', () => new THREE.LineBasicMaterial({
        color: COLORS.faint, transparent: true, opacity: 0.16, depthWrite: false,
      }));
    }
    return this.mat('line', () => new THREE.LineBasicMaterial({ vertexColors: true }));
  }

  pointMat(kind: 'kp' | 'node', faint: boolean): THREE.Material {
    const size = kind === 'kp' ? 6 : 3.5;
    if (this.ghost) {
      return this.mat(`ghost-pts-${kind}`, () => new THREE.PointsMaterial({
        color: GHOST_COLOR, size, sizeAttenuation: false, transparent: true, opacity: 0.4, depthWrite: false,
      }));
    }
    if (faint) {
      return this.mat(`faint-pts-${kind}`, () => new THREE.PointsMaterial({
        color: COLORS.faint, size, sizeAttenuation: false, transparent: true, opacity: 0.25, depthWrite: false,
      }));
    }
    const color = kind === 'kp'
      ? (this.role === 'target' ? COLORS.kpTarget : COLORS.kp)
      : (this.role === 'target' ? COLORS.nodeTarget : COLORS.node);
    return this.mat(`pts-${kind}`, () => new THREE.PointsMaterial({ color, size, sizeAttenuation: false }));
  }

  glyphMat(css: string): THREE.Material {
    return this.mat(`glyph-${css}`, () => new THREE.MeshLambertMaterial({ color: css }));
  }

  /** Add an object built from a geometry we own. */
  add(obj: THREE.Object3D, name: string, geom: THREE.BufferGeometry, inBox = true) {
    obj.name = name;
    this.geoms.push(geom);
    this.group.add(obj);
    if (inBox) {
      geom.computeBoundingBox();
      const bb = geom.boundingBox;
      if (bb && !bb.isEmpty() && Number.isFinite(bb.min.x) && Number.isFinite(bb.max.x)) this.bbox.union(bb);
    }
  }

  addMesh(name: string, geom: THREE.BufferGeometry | null, mat: THREE.Material, inBox = true) {
    if (!geom) return null;
    const m = new THREE.Mesh(geom, mat);
    this.add(m, name, geom, inBox);
    return m;
  }

  addLines(name: string, geom: THREE.BufferGeometry | null, mat: THREE.Material, inBox = true) {
    if (!geom) return null;
    const l = new THREE.LineSegments(geom, mat);
    this.add(l, name, geom, inBox);
    return l;
  }

  addPoints(name: string, geom: THREE.BufferGeometry | null, mat: THREE.Material) {
    if (!geom) return null;
    const p = new THREE.Points(geom, mat);
    this.add(p, name, geom, true);
    return p;
  }

  label(kind: LabelSpec['kind'], text: string, pos: ArrayLike<number>, color: string) {
    if (this.ghost) return;
    if (this.labels.length >= this.labelCap) {
      this.capped = true;
      return;
    }
    if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[1]) || !Number.isFinite(pos[2])) return;
    this.labels.push({ text, pos: [pos[0], pos[1], pos[2]], color, kind });
  }

  wantLabels(kind: EntityKind): boolean {
    return !this.ghost && !!this.display.labels[kind] && !!this.layers[kind];
  }

  dispose() {
    for (const g of this.geoms) g.dispose();
    for (const i of this.inst) i.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.geoms = [];
    this.inst = [];
    this.mats.clear();
  }
}

// ---------------------------------------------------------------------------------------------
// Public entry point

export function buildScene(model: ModelState | null, opts: BuildOptions): BuiltScene {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const layers = resolveLayers(model, opts.display, opts.plot);
  if (!model) {
    const group = new THREE.Group();
    group.name = `scene-${opts.role}`;
    return {
      group, bbox: new THREE.Box3(), labels: [], labelsCapped: false, layers,
      stats: emptyStats(),
      dispose() {},
    };
  }
  const ctx = new Ctx(model, opts.display, opts.role, layers, opts.labelCap ?? LABEL_CAP);
  const steps: [string, (c: Ctx) => void][] = [
    ['volumes', buildVolumes],
    ['areas', buildAreas],
    ['lines', buildLines],
    ['keypoints', buildKeypoints],
    ['elements', buildElements],
    ['nodes', buildNodes],
    ['bcs', buildBCs],
  ];
  for (const [name, fn] of steps) {
    try {
      fn(ctx);
    } catch (e) {
      // Never throw on malformed data: drop the layer and keep going.
      console.warn(`[render] ${name} layer failed:`, e);
    }
  }
  ctx.stats.buildMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return {
    group: ctx.group,
    bbox: ctx.bbox,
    labels: ctx.labels,
    labelsCapped: ctx.capped,
    layers,
    stats: ctx.stats,
    dispose: () => ctx.dispose(),
  };
}

// ---------------------------------------------------------------------------------------------
// Solid model layers

/** Append a tessellation into an indexed soup, splitting vertices per tag (so normals stay sharp
 *  across area boundaries) or per triangle when no tag is given and `flatIfUntagged`. */
function appendTess(soup: IndexedSoup, tess: TriMesh | undefined, col: THREE.Color, flatIfUntagged: boolean): boolean {
  const pos = tess?.pos;
  const idx = tess?.idx;
  if (!pos || !idx || idx.length < 3) return false;
  const nv = Math.floor(pos.length / 3);
  const ntri = Math.floor(idx.length / 3);
  const tag = tess!.tag && tess!.tag.length >= ntri ? tess!.tag : undefined;
  const base = soup.vertexCount;
  const remap = new Map<number, number>();
  const tagSlot = new Map<number, number>();
  let local = 0;
  const split = !!tag || flatIfUntagged;
  const triIdx: number[] = [];
  for (let t = 0; t < ntri; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    if (!(a < nv && b < nv && c < nv)) continue;
    let slot = 0;
    if (tag) {
      const tg = tag[t];
      let s = tagSlot.get(tg);
      if (s === undefined) { s = tagSlot.size; tagSlot.set(tg, s); }
      slot = s;
    } else if (split) {
      slot = t;
    }
    for (const vi of [a, b, c]) {
      const key = vi + nv * slot;
      let li = remap.get(key);
      if (li === undefined) {
        li = local++;
        remap.set(key, li);
        soup.pos.p3(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
      }
      triIdx.push(li);
    }
  }
  if (triIdx.length === 0) return false;
  // accumulate area-weighted normals
  const acc = new Float64Array(local * 3);
  const P = soup.pos.a;
  const o = base * 3;
  for (let k = 0; k < triIdx.length; k += 3) {
    const ia = triIdx[k], ib = triIdx[k + 1], ic = triIdx[k + 2];
    const ax = P[o + ia * 3], ay = P[o + ia * 3 + 1], az = P[o + ia * 3 + 2];
    const ux = P[o + ib * 3] - ax, uy = P[o + ib * 3 + 1] - ay, uz = P[o + ib * 3 + 2] - az;
    const vx = P[o + ic * 3] - ax, vy = P[o + ic * 3 + 1] - ay, vz = P[o + ic * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [ia, ib, ic]) { acc[i * 3] += nx; acc[i * 3 + 1] += ny; acc[i * 3 + 2] += nz; }
    soup.idx.push(base + ia);
    soup.idx.push(base + ib);
    soup.idx.push(base + ic);
  }
  for (let i = 0; i < local; i++) {
    const x = acc[i * 3], y = acc[i * 3 + 1], z = acc[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    soup.nrm.p3(x / l, y / l, z / l);
    soup.col.p3(col.r, col.g, col.b);
  }
  return true;
}

/** Is the volume fill drawn (as opposed to just its edges)? */
function volumesFilled(ctx: Ctx): boolean {
  if (!ctx.layers.volu || ctx.display.wireframe) return false;
  if (ctx.layers.elem && ctx.model.elems.size > 0) return false;
  return true;
}

function buildVolumes(ctx: Ctx) {
  if (!ctx.layers.volu || !volumesFilled(ctx)) {
    // labels still apply in wireframe
    if (ctx.layers.volu) volumeLabels(ctx);
    return;
  }
  const soups = [new IndexedSoup(), new IndexedSoup()];
  const ids = [...ctx.model.volus.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const v = ctx.model.volus.get(id);
    if (!v) continue;
    const s = ctx.sel('volu', id);
    if (!s && ctx.ghost) continue;
    appendTess(soups[s ? 0 : 1], v.tess, ctx.keyColor(ctx.attrKey(id, v.attrs)), true);
  }
  ctx.addMesh('volu-fill', soups[0].geometry(), ctx.fillMat('solid', false));
  ctx.addMesh('volu-fill-unselected', soups[1].geometry(), ctx.fillMat('solid', true));
  volumeLabels(ctx);
}

function volumeLabels(ctx: Ctx) {
  if (!ctx.wantLabels('volu')) return;
  const ids = [...ctx.model.volus.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const v = ctx.model.volus.get(id);
    if (!v || !ctx.sel('volu', id)) continue;
    const c = okVec(v.centroid) ? v.centroid : okVec(v.bbox?.min) && okVec(v.bbox?.max)
      ? centroidOf([v.bbox.min, v.bbox.max]) : null;
    if (c) ctx.label('volu', `V${id}`, c, ctx.colorCss(ctx.attrKey(id, v.attrs)));
  }
}

/** area id -> owning volume ids */
function areaOwners(model: ModelState): Map<Id, Id[]> {
  const own = new Map<Id, Id[]>();
  for (const v of model.volus.values()) {
    for (const a of v?.areas ?? []) {
      let l = own.get(a);
      if (!l) own.set(a, (l = []));
      l.push(v.id);
    }
  }
  return own;
}

function buildAreas(ctx: Ctx) {
  if (!ctx.layers.area) return;
  const owners = areaOwners(ctx.model);
  const skipOwned = volumesFilled(ctx);
  const soups = [new IndexedSoup(), new IndexedSoup()];
  const ids = [...ctx.model.areas.keys()].sort((a, b) => a - b);
  const wantLabels = ctx.wantLabels('area');
  for (const id of ids) {
    const a = ctx.model.areas.get(id);
    if (!a) continue;
    const s = ctx.sel('area', id);
    const css = ctx.colorCss(ctx.attrKey(id, a.attrs));
    if (s && wantLabels) {
      const c = okVec(a.centroid) ? a.centroid : tessCentroid(a.tess);
      if (c) ctx.label('area', `A${id}`, c, css);
    }
    if (!s && ctx.ghost) continue;
    if (skipOwned && owners.has(id)) continue;
    appendTess(soups[s ? 0 : 1], a.tess, ctx.color(css), false);
  }
  ctx.addMesh('area-fill', soups[0].geometry(), ctx.fillMat('area', false));
  ctx.addMesh('area-fill-unselected', soups[1].geometry(), ctx.fillMat('area', true));
}

function tessCentroid(t: TriMesh | undefined): V | null {
  const p = t?.pos;
  if (!p || p.length < 3) return null;
  const c: V = [0, 0, 0];
  const n = Math.floor(p.length / 3);
  for (let i = 0; i < n; i++) { c[0] += p[i * 3]; c[1] += p[i * 3 + 1]; c[2] += p[i * 3 + 2]; }
  return [c[0] / n, c[1] / n, c[2] / n];
}

function linePts(ctx: Ctx, l: { pts?: Vec3[]; kps?: [Id, Id] }): Vec3[] {
  const pts = (l.pts ?? []).filter(okVec);
  if (pts.length >= 2) return pts;
  const a = ctx.model.kps.get(l.kps?.[0] as Id)?.xyz;
  const b = ctx.model.kps.get(l.kps?.[1] as Id)?.xyz;
  return okVec(a) && okVec(b) ? [a, b] : [];
}

function buildLines(ctx: Ctx) {
  const m = ctx.model;
  const L = ctx.layers;
  // Which lines are drawn, and are they "selected"?
  const drawn = new Map<Id, boolean>();
  const onFilledVolume = new Set<Id>();
  const filled = volumesFilled(ctx);
  if (L.line) for (const id of m.lines.keys()) drawn.set(id, ctx.sel('line', id));
  const addAreaEdges = (aid: Id, selected: boolean, vol: boolean) => {
    const a = m.areas.get(aid);
    if (!a) return;
    for (const loop of a.loops ?? []) {
      for (const sl of loop ?? []) {
        const lid = Math.abs(sl);
        if (!m.lines.has(lid)) continue;
        if (!L.line) drawn.set(lid, (drawn.get(lid) ?? false) || selected);
        if (vol && filled) onFilledVolume.add(lid);
      }
    }
  };
  if (L.volu) {
    for (const v of m.volus.values()) {
      const s = ctx.sel('volu', v.id);
      for (const aid of v.areas ?? []) addAreaEdges(aid, s, true);
    }
  }
  if (L.area) for (const a of m.areas.values()) addAreaEdges(a.id, ctx.sel('area', a.id), false);
  if (drawn.size === 0) return;

  const soups = [new SegSoup(), new SegSoup()];
  const colorLines = !!ctx.display.labels.line && L.line;
  const baseCss = ctx.role === 'target' ? COLORS.lineTarget : COLORS.line;
  const ids = [...drawn.keys()].sort((a, b) => a - b);
  const wantLabels = ctx.wantLabels('line');
  for (const id of ids) {
    const l = m.lines.get(id);
    if (!l) continue;
    const s = drawn.get(id)!;
    if (!s && ctx.ghost) continue;
    const pts = linePts(ctx, l);
    if (pts.length < 2) continue;
    const entCss = ctx.colorCss(ctx.attrKey(id, l.attrs));
    let css = colorLines ? entCss : baseCss;
    if (!colorLines && onFilledVolume.has(id)) css = COLORS.edgeDark;
    const col = ctx.color(css);
    const soup = soups[s ? 0 : 1];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      soup.seg(a[0], a[1], a[2], b[0], b[1], b[2], col);
    }
    if (s && wantLabels && ctx.sel('line', id)) {
      const n = pts.length;
      const mid = n % 2 === 1 ? pts[(n - 1) / 2] : centroidOf([pts[n / 2 - 1], pts[n / 2]]);
      ctx.label('line', `L${id}`, mid, colorLines ? entCss : baseCss);
    }
  }
  ctx.addLines('lines', soups[0].geometry(), ctx.lineMat(false));
  ctx.addLines('lines-unselected', soups[1].geometry(), ctx.lineMat(true));
}

function buildKeypoints(ctx: Ctx) {
  if (!ctx.layers.kp) return;
  const soups = [new PointSoup(), new PointSoup()];
  const wantLabels = ctx.wantLabels('kp');
  const css = ctx.role === 'target' ? COLORS.kpTarget : COLORS.kp;
  const ids = [...ctx.model.kps.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const k = ctx.model.kps.get(id);
    if (!k || !okVec(k.xyz)) continue;
    const s = ctx.sel('kp', id);
    if (!s && ctx.ghost) continue;
    soups[s ? 0 : 1].pt(k.xyz[0], k.xyz[1], k.xyz[2]);
    if (s && wantLabels) ctx.label('kp', `K${id}`, k.xyz, css);
  }
  ctx.addPoints('kps', soups[0].geometry(), ctx.pointMat('kp', false));
  ctx.addPoints('kps-unselected', soups[1].geometry(), ctx.pointMat('kp', true));
}

function buildNodes(ctx: Ctx) {
  if (!ctx.layers.node) return;
  const soups = [new PointSoup(), new PointSoup()];
  const wantLabels = ctx.wantLabels('node');
  const css = ctx.role === 'target' ? COLORS.nodeTarget : COLORS.node;
  const ids = [...ctx.model.nodes.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const n = ctx.model.nodes.get(id);
    if (!n || !okVec(n.xyz)) continue;
    const s = ctx.sel('node', id);
    if (!s && ctx.ghost) continue;
    soups[s ? 0 : 1].pt(n.xyz[0], n.xyz[1], n.xyz[2]);
    if (s && wantLabels) ctx.label('node', `N${id}`, n.xyz, css);
  }
  ctx.addPoints('nodes', soups[0].geometry(), ctx.pointMat('node', false));
  ctx.addPoints('nodes-unselected', soups[1].geometry(), ctx.pointMat('node', true));
}

// ---------------------------------------------------------------------------------------------
// Elements

const SOLID_SHAPES = new Set<ElemShape>(['hex', 'wedge', 'pyramid', 'tet']);

function categoryOf(m: ModelState, e: Element): ElemCategory | null {
  const c = m.etypes.get(e.type)?.category;
  if (c) return c;
  switch (e.shape) {
    case 'hex': case 'wedge': case 'pyramid': case 'tet': return 'solid';
    case 'quad': case 'tri': return 'shell';
    case 'line': return 'beam';
    case 'point': return 'mass';
  }
  return null;
}

function shapeOf(e: Element, cat: ElemCategory | null): ElemShape | null {
  if (e.shape && e.shape in CORNERS) return e.shape;
  const n = e.nodes.length;
  switch (cat) {
    case 'solid':
      if (n === 8 || n >= 20) return 'hex';
      if (n === 4 || n === 10) return 'tet';
      if (n === 6 || n === 15) return 'wedge';
      if (n === 5 || n === 13) return 'pyramid';
      return null;
    case 'shell': case 'surf':
      if (n === 3 || n === 6) return 'tri';
      return n >= 4 ? 'quad' : null;
    case 'beam': case 'link': case 'spring':
      return n >= 2 ? 'line' : null;
    case 'mass':
      return n >= 1 ? 'point' : null;
  }
  return null;
}

interface SolidAcc { shape: Uint8Array; corners: Int32Array; color: Float32Array; n: number }
function solidAcc(cap: number): SolidAcc {
  return { shape: new Uint8Array(cap), corners: new Int32Array(cap * 8), color: new Float32Array(cap * 3), n: 0 };
}

interface Cell { c: number[]; col: THREE.Color; e: Element }

function shellThickness(m: ModelState, e: Element): number {
  const s = m.secs.get(e.secnum);
  const t = s?.data?.[0];
  if (s && Number.isFinite(t) && (t as number) > 0) return t as number;
  const r = m.reals.get(e.real)?.values?.[0];
  return Number.isFinite(r) && (r as number) > 0 ? (r as number) : 0;
}

function buildElements(ctx: Ctx) {
  const m = ctx.model;
  if (!ctx.layers.elem || m.elems.size === 0) return;
  const ni = ctx.nodes;
  const N = m.elems.size;
  const solids = [solidAcc(N), solidAcc(N)];
  const shells: Cell[][] = [[], []];
  const beams: Cell[][] = [[], []];
  const springs: Cell[][] = [[], []];
  const masses: Cell[][] = [[], []];
  const wantLabels = ctx.wantLabels('elem');
  const tmp: number[] = [];
  const keyCol = new Map<number, THREE.Color>();

  // sort only when labels are wanted (so the label cap keeps the lowest numbers)
  const ids = wantLabels ? [...m.elems.keys()].sort((a, b) => a - b) : m.elems.keys();
  for (const id of ids) {
    const e = m.elems.get(id);
    if (!e || !Array.isArray(e.nodes)) { ctx.stats.skippedElems++; continue; }
    const cat = categoryOf(m, e);
    const shape = shapeOf(e, cat);
    if (!shape) { ctx.stats.skippedElems++; continue; }
    const nc = CORNERS[shape];
    if (e.nodes.length < nc) { ctx.stats.skippedElems++; continue; }
    tmp.length = 0;
    let bad = false;
    for (let k = 0; k < nc; k++) {
      const i = ni.idx(e.nodes[k]);
      if (i < 0) { bad = true; break; }
      tmp.push(i);
    }
    if (bad) { ctx.stats.skippedElems++; continue; }
    const s = ctx.sel('elem', id);
    if (!s && ctx.ghost) continue;
    const g = s ? 0 : 1;
    const key = ctx.elemKey(e);
    let col = keyCol.get(key);
    if (!col) keyCol.set(key, (col = ctx.keyColor(key)));

    if (SOLID_SHAPES.has(shape)) {
      const acc = solids[g];
      const j = acc.n++;
      acc.shape[j] = SOLID_CODE[shape as SolidShape];
      for (let k = 0; k < 8; k++) acc.corners[j * 8 + k] = k < nc ? tmp[k] : -1;
      acc.color[j * 3] = col.r; acc.color[j * 3 + 1] = col.g; acc.color[j * 3 + 2] = col.b;
      ctx.stats.solidCells++;
    } else if (shape === 'quad' || shape === 'tri') {
      shells[g].push({ c: tmp.slice(), col, e });
      ctx.stats.shellCells++;
    } else if (shape === 'line') {
      (cat === 'spring' ? springs : beams)[g].push({ c: tmp.slice(), col, e });
      if (cat === 'spring') ctx.stats.springCells++;
      else ctx.stats.beamCells++;
    } else if (shape === 'point') {
      masses[g].push({ c: tmp.slice(), col, e });
      ctx.stats.massCells++;
    }

    if (s && wantLabels) {
      const pts = tmp.map((i) => ni.p(i));
      ctx.label('elem', `E${id}`, centroidOf(pts), ctx.colorCss(key));
    }
  }

  for (let g = 0; g < 2; g++) {
    const faint = g === 1;
    buildSolidCells(ctx, solids[g], faint);
    buildShellCells(ctx, shells[g], faint);
    buildBeamCells(ctx, beams[g], faint);
    buildSpringCells(ctx, springs[g], faint);
    buildMassCells(ctx, masses[g], faint);
  }
}

function edgeColor(ctx: Ctx, own: THREE.Color): THREE.Color {
  return ctx.display.wireframe ? own : ctx.color(COLORS.edgeDark);
}

function buildSolidCells(ctx: Ctx, acc: SolidAcc, faint: boolean) {
  if (acc.n === 0) return;
  const ni = ctx.nodes;
  const ext = extractExteriorFaces(acc.shape, acc.corners, acc.n, 8);
  ctx.stats.exteriorFaces += ext.count;
  const fill = new TriSoup();
  const edges = new SegSoup();
  const seen = new Set<number>();
  const NN = Math.max(1, ni.count);
  const col = new THREE.Color();
  const pts: V[] = [];
  const P = ni.pos;
  const wire = ctx.display.wireframe;
  for (let f = 0; f < ext.count; f++) {
    const nv = ext.nv[f];
    pts.length = 0;
    for (let k = 0; k < nv; k++) pts.push(ni.p(ext.verts[f * 4 + k]));
    const o = ext.owner[f];
    col.setRGB(acc.color[o * 3], acc.color[o * 3 + 1], acc.color[o * 3 + 2]);
    if (!wire) {
      const n = newell(pts);
      fill.tri(pts[0], pts[1], pts[2], n, col);
      if (nv === 4) fill.tri(pts[0], pts[2], pts[3], n, col);
    }
    const ec = edgeColor(ctx, col);
    for (let k = 0; k < nv; k++) {
      const a = ext.verts[f * 4 + k];
      const b = ext.verts[f * 4 + ((k + 1) % nv)];
      const key = a < b ? a * NN + b : b * NN + a;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.seg(P[a * 3], P[a * 3 + 1], P[a * 3 + 2], P[b * 3], P[b * 3 + 1], P[b * 3 + 2], ec);
    }
  }
  const sfx = faint ? '-unselected' : '';
  ctx.addMesh(`elem-solid-fill${sfx}`, fill.geometry(), ctx.fillMat('solid', faint));
  ctx.addLines(`elem-solid-edges${sfx}`, edges.geometry(), ctx.lineMat(faint));
}

function uniqueCorners(c: number[]): number[] {
  const u: number[] = [];
  for (const v of c) if (!u.includes(v)) u.push(v);
  return u;
}

function buildShellCells(ctx: Ctx, cells: Cell[], faint: boolean) {
  if (cells.length === 0) return;
  const ni = ctx.nodes;
  const P = ni.pos;
  const fill = new TriSoup();
  const edges = new SegSoup();
  const seen = new Set<number>();
  const NN = Math.max(1, ni.count);
  const thick = ctx.display.eshape && !faint && !ctx.ghost;
  const wire = ctx.display.wireframe;
  for (const cell of cells) {
    const u = uniqueCorners(cell.c);
    if (u.length < 3) continue;
    const pts = u.map((i) => ni.p(i));
    const n = newell(pts);
    const ec = edgeColor(ctx, cell.col);
    const t = thick ? shellThickness(ctx.model, cell.e) : 0;
    if (t > 0 && len(n) > 0) {
      const h = t / 2;
      const top = pts.map((p) => [p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h] as V);
      const bot = pts.map((p) => [p[0] - n[0] * h, p[1] - n[1] * h, p[2] - n[2] * h] as V);
      if (!wire) {
        fill.poly(top, n, cell.col);
        fill.poly([...bot].reverse(), [-n[0], -n[1], -n[2]], cell.col);
        for (let k = 0; k < u.length; k++) {
          const k2 = (k + 1) % u.length;
          const q = [bot[k], bot[k2], top[k2], top[k]];
          fill.poly(q, newell(q), cell.col);
        }
      }
      for (let k = 0; k < u.length; k++) {
        const k2 = (k + 1) % u.length;
        edges.seg(top[k][0], top[k][1], top[k][2], top[k2][0], top[k2][1], top[k2][2], ec);
        edges.seg(bot[k][0], bot[k][1], bot[k][2], bot[k2][0], bot[k2][1], bot[k2][2], ec);
        edges.seg(bot[k][0], bot[k][1], bot[k][2], top[k][0], top[k][1], top[k][2], ec);
      }
    } else {
      if (!wire) fill.poly(pts, n, cell.col);
      for (let k = 0; k < u.length; k++) {
        const a = u[k], b = u[(k + 1) % u.length];
        const key = a < b ? a * NN + b : b * NN + a;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.seg(P[a * 3], P[a * 3 + 1], P[a * 3 + 2], P[b * 3], P[b * 3 + 1], P[b * 3 + 2], ec);
      }
    }
  }
  const sfx = faint ? '-unselected' : '';
  ctx.addMesh(`elem-shell-fill${sfx}`, fill.geometry(), ctx.fillMat('solid', faint));
  ctx.addLines(`elem-shell-edges${sfx}`, edges.geometry(), ctx.lineMat(faint));
}

/** Beam/link cross-section as a list of convex polygons in the element (y, z) plane. */
export function sectionProfile(sec: Section | undefined): [number, number][][] | null {
  if (!sec || !Array.isArray(sec.data)) return null;
  const type = (sec.type ?? '').toUpperCase();
  const sub = (sec.subtype ?? '').toUpperCase();
  const d = sec.data.map((x) => (Number.isFinite(x) ? x : 0));
  const rect = (y0: number, y1: number, z0: number, z1: number): [number, number][] =>
    [[y0, z0], [y1, z0], [y1, z1], [y0, z1]];
  const ngon = (r: number, n = 8): [number, number][] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      return [r * Math.cos(a), r * Math.sin(a)] as [number, number];
    });
  if (type === 'LINK') {
    const A = d[0];
    return A > 0 ? [ngon(Math.sqrt(A / Math.PI))] : null;
  }
  if (type !== 'BEAM') return null;
  switch (sub) {
    case 'RECT': {
      const [B, H] = d;
      return B > 0 && H > 0 ? [rect(-B / 2, B / 2, -H / 2, H / 2)] : null;
    }
    case 'CSOLID': {
      const R = d[0];
      return R > 0 ? [ngon(R)] : null;
    }
    case 'CTUBE': {
      const ri = Math.max(0, d[0]), ro = d[1];
      if (!(ro > ri)) return null;
      const out: [number, number][][] = [];
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
        out.push([
          [ri * Math.cos(a0), ri * Math.sin(a0)], [ro * Math.cos(a0), ro * Math.sin(a0)],
          [ro * Math.cos(a1), ro * Math.sin(a1)], [ri * Math.cos(a1), ri * Math.sin(a1)],
        ]);
      }
      return out;
    }
    case 'I': {
      // W1 bottom flange width, W2 top flange width, W3 depth, t1 bottom flange, t2 top flange, t3 web
      const [W1, W2, W3, t1, t2, t3] = d;
      if (!(W3 > 0)) return null;
      const h = W3 / 2;
      const out: [number, number][][] = [];
      if (W1 > 0 && t1 > 0) out.push(rect(-W1 / 2, W1 / 2, -h, -h + t1));
      if (W2 > 0 && t2 > 0) out.push(rect(-W2 / 2, W2 / 2, h - t2, h));
      if (t3 > 0) out.push(rect(-t3 / 2, t3 / 2, -h + (t1 > 0 ? t1 : 0), h - (t2 > 0 ? t2 : 0)));
      return out.length ? out : null;
    }
    case 'HREC': {
      // W1 width (y), W2 height (z), t1 left, t2 right, t3 bottom, t4 top
      const [W1, W2, t1, t2, t3, t4] = d;
      if (!(W1 > 0 && W2 > 0)) return null;
      const y = W1 / 2, z = W2 / 2;
      if (!(t1 > 0 && t2 > 0 && t3 > 0 && t4 > 0)) return [rect(-y, y, -z, z)];
      return [
        rect(-y, -y + t1, -z, z),
        rect(y - t2, y, -z, z),
        rect(-y + t1, y - t2, -z, -z + t3),
        rect(-y + t1, y - t2, z - t4, z),
      ];
    }
  }
  return null;
}

/** Element local axes for a 2-node beam: x along I->J, y = normalize(Z x x) (or global Y when x || Z), z = x x y. */
export function beamAxes(p0: ArrayLike<number>, p1: ArrayLike<number>): { x: V; y: V; z: V } | null {
  const x = norm(sub(p1, p0));
  if (len(x) === 0) return null;
  let y: V;
  if (Math.abs(x[2]) > 0.999) y = [0, 1, 0];
  else y = norm(cross([0, 0, 1], x));
  const z = norm(cross(x, y));
  return { x, y, z };
}

function extrudeProfile(
  fill: TriSoup, edges: SegSoup, p0: V, p1: V, ax: { x: V; y: V; z: V }, polys: [number, number][][],
  col: THREE.Color, ec: THREE.Color, wire: boolean,
) {
  const at = (p: V, y: number, z: number): V => [
    p[0] + ax.y[0] * y + ax.z[0] * z,
    p[1] + ax.y[1] * y + ax.z[1] * z,
    p[2] + ax.y[2] * y + ax.z[2] * z,
  ];
  const nx: V = [-ax.x[0], -ax.x[1], -ax.x[2]];
  for (const poly of polys) {
    const n = poly.length;
    const A = poly.map(([y, z]) => at(p0, y, z));
    const B = poly.map(([y, z]) => at(p1, y, z));
    if (!wire) {
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        const q = [A[k], A[k2], B[k2], B[k]];
        const qn = newell(q);
        fill.tri(q[0], q[1], q[2], qn, col);
        fill.tri(q[0], q[2], q[3], qn, col);
      }
      fill.poly([...A].reverse(), nx, col);
      fill.poly(B, ax.x, col);
    }
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      edges.seg(A[k][0], A[k][1], A[k][2], A[k2][0], A[k2][1], A[k2][2], ec);
      edges.seg(B[k][0], B[k][1], B[k][2], B[k2][0], B[k2][1], B[k2][2], ec);
      if (n <= 4) edges.seg(A[k][0], A[k][1], A[k][2], B[k][0], B[k][1], B[k][2], ec);
    }
  }
}

function buildBeamCells(ctx: Ctx, cells: Cell[], faint: boolean) {
  if (cells.length === 0) return;
  const ni = ctx.nodes;
  const lines = new SegSoup();
  const fill = new TriSoup();
  const edges = new SegSoup();
  const eshape = ctx.display.eshape && !faint && !ctx.ghost;
  const wire = ctx.display.wireframe;
  for (const cell of cells) {
    const p0 = ni.p(cell.c[0]);
    const p1 = ni.p(cell.c[1]);
    if (eshape) {
      const prof = sectionProfile(ctx.model.secs.get(cell.e.secnum));
      const ax = prof ? beamAxes(p0, p1) : null;
      if (prof && ax) {
        extrudeProfile(fill, edges, p0, p1, ax, prof, cell.col, edgeColor(ctx, cell.col), wire);
        continue;
      }
    }
    lines.seg(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], cell.col);
  }
  const sfx = faint ? '-unselected' : '';
  ctx.addLines(`elem-beam-lines${sfx}`, lines.geometry(), ctx.lineMat(faint));
  ctx.addMesh(`elem-beam-eshape${sfx}`, fill.geometry(), ctx.fillMat('solid', faint));
  ctx.addLines(`elem-beam-eshape-edges${sfx}`, edges.geometry(), ctx.lineMat(faint));
}

function buildSpringCells(ctx: Ctx, cells: Cell[], faint: boolean) {
  if (cells.length === 0) return;
  const ni = ctx.nodes;
  const soup = new SegSoup();
  for (const cell of cells) {
    const p0 = ni.p(cell.c[0]);
    let p1 = ni.p(cell.c[1]);
    let d = sub(p1, p0);
    let L = len(d);
    if (L < ctx.diag * 1e-6) {
      // coincident nodes: short vertical glyph below the node
      L = ctx.diag * 0.05;
      p1 = [p0[0], p0[1], p0[2] - L];
      d = sub(p1, p0);
    }
    const dir = norm(d);
    let perp = cross(dir, [0, 0, 1]);
    if (len(perp) < 1e-6) perp = cross(dir, [1, 0, 0]);
    perp = norm(perp);
    const amp = Math.min(L * 0.12, ctx.diag * 0.02);
    const pts: V[] = [p0];
    const at = (t: number, off: number): V => [
      p0[0] + dir[0] * L * t + perp[0] * off,
      p0[1] + dir[1] * L * t + perp[1] * off,
      p0[2] + dir[2] * L * t + perp[2] * off,
    ];
    const peaks = 6;
    pts.push(at(0.15, 0));
    for (let k = 1; k < peaks * 2; k += 2) pts.push(at(0.15 + (0.7 * k) / (peaks * 2), k % 4 === 1 ? amp : -amp));
    pts.push(at(0.85, 0));
    pts.push(p1);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      soup.seg(a[0], a[1], a[2], b[0], b[1], b[2], cell.col);
    }
  }
  ctx.addLines(`elem-spring${faint ? '-unselected' : ''}`, soup.geometry(), ctx.lineMat(faint));
}

function buildMassCells(ctx: Ctx, cells: Cell[], faint: boolean) {
  if (cells.length === 0) return;
  const pos = new F32();
  const dir = new F32();
  for (const cell of cells) {
    const p = ctx.nodes.p(cell.c[0]);
    pos.p3(p[0], p[1], p[2]);
    dir.p3(0, 1, 0);
  }
  const mat = ctx.ghost ? ctx.fillMat('solid', false) : faint ? ctx.fillMat('solid', true) : ctx.glyphMat(COLORS.mass);
  addInstanced(ctx, `elem-mass${faint ? '-unselected' : ''}`, Glyph.cube(), mat, pos, dir, ctx.diag * 0.015, true);
}

// ---------------------------------------------------------------------------------------------
// Glyphs (BCs, loads, acceleration)

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** InstancedMesh with one instance per (pos, dir) pair, subsampled beyond INSTANCE_CAP. Returns instance count. */
function addInstanced(
  ctx: Ctx, name: string, geom: THREE.BufferGeometry, mat: THREE.Material, pos: F32, dir: F32, size: number,
  inBox = false,
): number {
  const count = pos.n / 3;
  if (count === 0) {
    geom.dispose();
    return 0;
  }
  const stride = count > INSTANCE_CAP ? Math.ceil(count / INSTANCE_CAP) : 1;
  const nInst = Math.ceil(count / stride);
  const mesh = new THREE.InstancedMesh(geom, mat, nInst);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const d = new THREE.Vector3();
  const s = new THREE.Vector3(size, size, size);
  let k = 0;
  for (let i = 0; i < count && k < nInst; i += stride) {
    p.set(pos.a[i * 3], pos.a[i * 3 + 1], pos.a[i * 3 + 2]);
    d.set(dir.a[i * 3], dir.a[i * 3 + 1], dir.a[i * 3 + 2]);
    if (d.lengthSq() === 0) d.set(0, 1, 0);
    d.normalize();
    q.setFromUnitVectors(Y_AXIS, d);
    m4.compose(p, q, s);
    mesh.setMatrixAt(k++, m4);
  }
  mesh.count = k;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.name = name;
  ctx.group.add(mesh);
  ctx.geoms.push(geom);
  ctx.inst.push(mesh);
  if (inBox) {
    const r = size * 0.5;
    for (let i = 0; i < count; i++) {
      ctx.bbox.expandByPoint(p.set(pos.a[i * 3] - r, pos.a[i * 3 + 1] - r, pos.a[i * 3 + 2] - r));
      ctx.bbox.expandByPoint(p.set(pos.a[i * 3] + r, pos.a[i * 3 + 1] + r, pos.a[i * 3 + 2] + r));
    }
  }
  return k;
}

const DOF_AXIS: Record<string, { axis: number; rot: boolean }> = {
  UX: { axis: 0, rot: false }, UY: { axis: 1, rot: false }, UZ: { axis: 2, rot: false },
  ROTX: { axis: 0, rot: true }, ROTY: { axis: 1, rot: true }, ROTZ: { axis: 2, rot: true },
};
const FORCE_AXIS: Record<string, { axis: number; moment: boolean }> = {
  FX: { axis: 0, moment: false }, FY: { axis: 1, moment: false }, FZ: { axis: 2, moment: false },
  MX: { axis: 0, moment: true }, MY: { axis: 1, moment: true }, MZ: { axis: 2, moment: true },
};

function expandDofLab(lab: string, rotDofs: boolean): string[] {
  const L = (lab ?? '').toUpperCase();
  if (L === 'ALL') return rotDofs ? ['UX', 'UY', 'UZ', 'ROTX', 'ROTY', 'ROTZ'] : ['UX', 'UY', 'UZ'];
  return [L];
}

class GlyphSets {
  d = { pos: new F32(), dir: new F32() };
  rot = { pos: new F32(), dir: new F32() };
  f = { pos: new F32(), dir: new F32() };
  m = { pos: new F32(), dir: new F32() };
  sf = { pos: new F32(), dir: new F32() };
  private dSeen = new Set<string>();
  constructor(private rotDofs: boolean) {}

  addD(key: string, p: ArrayLike<number>, lab: string) {
    for (const l of expandDofLab(lab, this.rotDofs)) {
      const info = DOF_AXIS[l];
      if (!info) continue;
      const k = `${key}|${l}`;
      if (this.dSeen.has(k)) continue;
      this.dSeen.add(k);
      const set = info.rot ? this.rot : this.d;
      const dir: V = [0, 0, 0];
      dir[info.axis] = 1;
      set.pos.p3(p[0], p[1], p[2]);
      set.dir.p3(dir[0], dir[1], dir[2]);
    }
  }

  addF(p: ArrayLike<number>, lab: string, value: number) {
    const info = FORCE_AXIS[(lab ?? '').toUpperCase()];
    if (!info || !Number.isFinite(value) || value === 0) return;
    const set = info.moment ? this.m : this.f;
    const dir: V = [0, 0, 0];
    dir[info.axis] = Math.sign(value);
    set.pos.p3(p[0], p[1], p[2]);
    set.dir.p3(dir[0], dir[1], dir[2]);
  }

  addP(p: ArrayLike<number>, dir: ArrayLike<number>) {
    this.sf.pos.p3(p[0], p[1], p[2]);
    this.sf.dir.p3(dir[0], dir[1], dir[2]);
  }
}

/** Centroid and inward (pressure) direction of an element load face. */
function elementFace(ctx: Ctx, e: Element, face: number): { c: V; dir: V } | null {
  const cat = categoryOf(ctx.model, e);
  const shape = shapeOf(e, cat);
  if (!shape) return null;
  const nc = CORNERS[shape];
  const ids = e.nodes.slice(0, nc).map((id) => ctx.nodes.idx(id));
  if (ids.length < nc || ids.some((i) => i < 0)) return null;
  const all = ids.map((i) => ctx.nodes.p(i));
  if (shape === 'quad' || shape === 'tri') {
    if ((face || 1) !== 1) return null;
    const u = uniqueCorners(ids).map((i) => ctx.nodes.p(i));
    const n = newell(u);
    return { c: centroidOf(u), dir: [-n[0], -n[1], -n[2]] };
  }
  if (!SOLID_SHAPES.has(shape)) return null;
  const def = ANSYS_SOLID_LOAD_FACES[shape as SolidShape][(face || 1) - 1];
  if (!def) return null;
  const fp = uniqueCorners(def.map((k) => ids[k])).map((i) => ctx.nodes.p(i));
  if (fp.length < 3) return null;
  const c = centroidOf(fp);
  let n = newell(fp);
  const ec = centroidOf(all);
  if (dot(n, sub(c, ec)) < 0) n = [-n[0], -n[1], -n[2]]; // make outward
  return { c, dir: [-n[0], -n[1], -n[2]] };
}

/** Up to `max` sample points on an area tessellation (unique vertices). */
function areaSamples(a: Area | undefined, max: number): V[] {
  const p = a?.tess?.pos;
  if (!p) return [];
  const n = Math.floor(p.length / 3);
  const stride = Math.max(1, Math.ceil(n / max));
  const out: V[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i += stride) {
    const v: V = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
    const k = v.map((x) => x.toPrecision(6)).join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Triangle centroids + pressure direction for an SFA load on an area. */
function areaPressureSamples(ctx: Ctx, aid: Id, owners: Map<Id, Id[]>, max: number): { c: V; dir: V }[] {
  const a = ctx.model.areas.get(aid);
  const t = a?.tess;
  if (!t?.pos || !t.idx) return [];
  // area normal sign relative to the (first) owning volume: outward = +normal unless flipped
  let flip = false;
  const vo = owners.get(aid)?.[0];
  if (vo !== undefined) {
    const v = ctx.model.volus.get(vo);
    const i = v?.areas.indexOf(aid) ?? -1;
    flip = i >= 0 && !!v?.areaFlip?.[i];
  }
  const ntri = Math.floor(t.idx.length / 3);
  const stride = Math.max(1, Math.ceil(ntri / max));
  const out: { c: V; dir: V }[] = [];
  const P = t.pos;
  for (let k = 0; k < ntri; k += stride) {
    const tri = [t.idx[k * 3], t.idx[k * 3 + 1], t.idx[k * 3 + 2]].map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]] as V);
    if (tri.some((q) => !okVec(q))) continue;
    let n = newell(tri);
    if (len(n) === 0) continue;
    if (flip) n = [-n[0], -n[1], -n[2]];
    out.push({ c: centroidOf(tri), dir: [-n[0], -n[1], -n[2]] });
  }
  return out;
}

function buildBCs(ctx: Ctx) {
  const m = ctx.model;
  if (!ctx.layers.bc || ctx.ghost) {
    return;
  }
  const L = ctx.layers;
  const meshLoads = L.node || L.elem;
  const solidLoads = !meshLoads && (L.kp || L.line || L.area || L.volu);
  // D,ALL only implies rotations when the model has elements with rotational DOFs.
  let rotDofs = false;
  for (const et of m.etypes?.values() ?? []) if (et?.category === 'beam' || et?.category === 'shell') rotDofs = true;
  const gs = new GlyphSets(rotDofs);

  if (meshLoads) {
    const lastF = new Map<string, { target: Id; lab: string; value: number }>();
    for (const r of m.bcs ?? []) {
      if (!r) continue;
      if (r.kind === 'D') {
        const i = ctx.nodes.idx(r.target);
        if (i >= 0) gs.addD(`N${r.target}`, ctx.nodes.p(i), r.lab);
      } else if (r.kind === 'F') {
        lastF.set(`${r.target}|${(r.lab ?? '').toUpperCase()}`, r);
      } else if (r.kind === 'SF') {
        if ((r.lab ?? '').toUpperCase() !== 'PRES' || !Number.isFinite(r.value) || r.value === 0) continue;
        const e = m.elems.get(r.target);
        if (!e || !Array.isArray(e.nodes)) continue;
        const f = elementFace(ctx, e, r.face ?? 1);
        if (!f) continue;
        const s = Math.sign(r.value);
        gs.addP(f.c, [f.dir[0] * s, f.dir[1] * s, f.dir[2] * s]);
      }
    }
    for (const r of lastF.values()) {
      const i = ctx.nodes.idx(r.target);
      if (i >= 0) gs.addF(ctx.nodes.p(i), r.lab, r.value);
    }
  } else if (solidLoads) {
    const owners = areaOwners(m);
    const lastF = new Map<string, { entity: Id; lab: string; value: number }>();
    for (const r of m.solidLoads ?? []) {
      if (!r) continue;
      switch (r.cmd) {
        case 'DK': {
          const k = m.kps.get(r.entity)?.xyz;
          if (okVec(k)) gs.addD(`K${r.entity}`, k, r.lab);
          break;
        }
        case 'DL': {
          const l = m.lines.get(r.entity);
          if (!l) break;
          const pts = linePts(ctx, l);
          const stride = Math.max(1, Math.ceil(pts.length / 12));
          for (let i = 0; i < pts.length; i += stride) gs.addD(`L${r.entity}:${i}`, pts[i], r.lab);
          break;
        }
        case 'DA': {
          const pts = areaSamples(m.areas.get(r.entity), 40);
          pts.forEach((p, i) => gs.addD(`A${r.entity}:${i}`, p, r.lab));
          break;
        }
        case 'FK':
          lastF.set(`${r.entity}|${(r.lab ?? '').toUpperCase()}`, r);
          break;
        case 'SFA': {
          if ((r.lab ?? '').toUpperCase() !== 'PRES' || !Number.isFinite(r.value) || r.value === 0) break;
          const s = Math.sign(r.value);
          for (const smp of areaPressureSamples(ctx, r.entity, owners, 24)) {
            gs.addP(smp.c, [smp.dir[0] * s, smp.dir[1] * s, smp.dir[2] * s]);
          }
          break;
        }
      }
    }
    for (const r of lastF.values()) {
      const k = m.kps.get(r.entity)?.xyz;
      if (okVec(k)) gs.addF(k, r.lab, r.value);
    }
  }

  const D = ctx.diag;
  ctx.stats.dGlyphs = addInstanced(ctx, 'bc-D', Glyph.constraintCone(), ctx.glyphMat(COLORS.bcD), gs.d.pos, gs.d.dir, D * 0.025);
  ctx.stats.rotGlyphs = addInstanced(ctx, 'bc-D-rot', Glyph.rotationGlyph(), ctx.glyphMat(COLORS.bcRot), gs.rot.pos, gs.rot.dir, D * 0.025);
  ctx.stats.fGlyphs = addInstanced(ctx, 'bc-F', Glyph.arrow(), ctx.glyphMat(COLORS.force), gs.f.pos, gs.f.dir, D * 0.04);
  ctx.stats.mGlyphs = addInstanced(ctx, 'bc-M', Glyph.momentArrow(), ctx.glyphMat(COLORS.moment), gs.m.pos, gs.m.dir, D * 0.04);
  ctx.stats.sfGlyphs = addInstanced(ctx, 'bc-SF', Glyph.arrow(), ctx.glyphMat(COLORS.pressure), gs.sf.pos, gs.sf.dir, D * 0.03);

  // ACEL: one green arrow at the bbox min corner pointing along gravity (-acel).
  const a = m.acel;
  if (okVec(a) && (a[0] !== 0 || a[1] !== 0 || a[2] !== 0)) {
    const box = !ctx.bbox.isEmpty() ? ctx.bbox : !ctx.modelBox.isEmpty() ? ctx.modelBox : null;
    const corner = box ? box.min.clone() : new THREE.Vector3();
    const g = new THREE.Vector3(-a[0], -a[1], -a[2]).normalize();
    const Lg = D * 0.08;
    const tip = corner.clone().addScaledVector(g, Lg);
    const pos = new F32(3);
    const dir = new F32(3);
    pos.p3(tip.x, tip.y, tip.z);
    dir.p3(g.x, g.y, g.z);
    addInstanced(ctx, 'acel', Glyph.arrow(), ctx.glyphMat(COLORS.acel), pos, dir, Lg);
    ctx.labels.push({ text: 'g', pos: [corner.x, corner.y, corner.z], color: COLORS.acel, kind: 'acel' });
  }
}
