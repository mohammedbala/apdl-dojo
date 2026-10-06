// Dev-only harness for the renderer: `npx vite`, then open /apdl-dojo/dev/render-demo.html
import type { ViewHint } from '../src/apdl/diagnostics';
import { createEmptyModel } from '../src/model/state';
import type { ElemCategory, ElemShape, ModelState, Vec3 } from '../src/model/types';
import { buildScene } from '../src/render/scene-builder';
import { Viewport, type DisplayOptions } from '../src/render/viewport';

// ---------------------------------------------------------------------------------------------
// hand-made solid model: BLOCK-like volumes with kps, lines, areas and tessellation

const FACES = [
  [0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5],
];

function block(m: ModelState, x: [number, number], y: [number, number], z: [number, number]) {
  const k0 = m.kps.size + 1;
  const corners: Vec3[] = [];
  for (let i = 0; i < 8; i++) {
    const p: Vec3 = [x[i & 1 ? 1 : 0], y[i & 2 ? 1 : 0], z[i & 4 ? 1 : 0]];
    corners.push(p);
    m.kps.set(k0 + i, { id: k0 + i, xyz: p });
    m.sel.kp.add(k0 + i);
  }
  const lineOf = new Map<string, number>();
  const lineId = (a: number, b: number): number => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    let id = lineOf.get(key);
    if (id === undefined) {
      id = m.lines.size + 1;
      lineOf.set(key, id);
      const [i, j] = a < b ? [a, b] : [b, a];
      const pa = corners[i], pb = corners[j];
      m.lines.set(id, {
        id, kps: [k0 + i, k0 + j], kind: 'straight', pts: [pa, pb],
        length: Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]),
      });
      m.sel.line.add(id);
    }
    const ln = m.lines.get(id)!;
    return ln.kps[0] === k0 + a ? id : -id;
  };
  const vid = m.volus.size + 1;
  const areaIds: number[] = [];
  const vpos: number[] = [];
  const vidx: number[] = [];
  const vtag: number[] = [];
  for (const f of FACES) {
    const aid = m.areas.size + 1;
    const pts = f.map((i) => corners[i]);
    const pos = new Float64Array(pts.flat());
    const idx = new Uint32Array([0, 1, 2, 0, 2, 3]);
    const c = pts.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4] as Vec3, [0, 0, 0] as Vec3);
    m.areas.set(aid, {
      id: aid, loops: [f.map((a, i) => lineId(a, f[(i + 1) % 4]))], surface: { kind: 'free' },
      tess: { pos, idx, tag: new Uint32Array([aid, aid]) }, area: 0, centroid: c,
    });
    m.sel.area.add(aid);
    areaIds.push(aid);
    const base = vpos.length / 3;
    vpos.push(...pts.flat());
    vidx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    vtag.push(aid, aid);
  }
  m.volus.set(vid, {
    id: vid, areas: areaIds, areaFlip: areaIds.map(() => false),
    tess: { pos: new Float64Array(vpos), idx: new Uint32Array(vidx), tag: new Uint32Array(vtag) },
    volume: (x[1] - x[0]) * (y[1] - y[0]) * (z[1] - z[0]),
    bbox: { min: [x[0], y[0], z[0]], max: [x[1], y[1], z[1]] },
    centroid: [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2],
  });
  m.sel.volu.add(vid);
}

// ---------------------------------------------------------------------------------------------
// mesh helpers

const ENAMES: Record<ElemCategory, string> = {
  solid: 'SOLID185', shell: 'SHELL181', beam: 'BEAM188', link: 'LINK180', spring: 'COMBIN14', mass: 'MASS21', surf: 'SURF154',
};

function node(m: ModelState, xyz: Vec3): number {
  const id = m.nodes.size + 1;
  m.nodes.set(id, { id, xyz });
  m.sel.node.add(id);
  return id;
}

function elem(m: ModelState, shape: ElemShape, nodes: number[], type: number, extra: Partial<{ mat: number; real: number; secnum: number }> = {}) {
  const id = m.elems.size + 1;
  m.elems.set(id, { id, nodes, shape, type, mat: extra.mat ?? 1, real: extra.real ?? 1, secnum: extra.secnum ?? 1, esys: 0 });
  m.sel.elem.add(id);
  return id;
}

function etype(m: ModelState, id: number, cat: ElemCategory) {
  m.etypes.set(id, { id, ename: ENAMES[cat], category: cat, keyopts: {} });
}

function hexGrid(m: ModelState, o: Vec3, size: Vec3, div: [number, number, number], type: number, mat: number) {
  const [nx, ny, nz] = div;
  const ids: number[][][] = [];
  for (let i = 0; i <= nx; i++) {
    ids.push([]);
    for (let j = 0; j <= ny; j++) {
      ids[i].push([]);
      for (let k = 0; k <= nz; k++) {
        ids[i][j].push(node(m, [o[0] + (size[0] * i) / nx, o[1] + (size[1] * j) / ny, o[2] + (size[2] * k) / nz]));
      }
    }
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    const n = (a: number, b: number, c: number) => ids[i + a][j + b][k + c];
    elem(m, 'hex', [n(0, 0, 0), n(1, 0, 0), n(1, 1, 0), n(0, 1, 0), n(0, 0, 1), n(1, 0, 1), n(1, 1, 1), n(0, 1, 1)], type, {
      mat: i < nx / 2 ? mat : mat + 1,
    });
  }
  return ids;
}

// ---------------------------------------------------------------------------------------------
// demo models

function makeModel(variant: 'yours' | 'target'): ModelState {
  const m = createEmptyModel();
  m.title = `demo ${variant}`;
  m.processor = 'PREP7';
  block(m, [0, 2], [0, 1], [0, 1]);
  block(m, variant === 'yours' ? [2, 3] : [2, 3.4], [0, 1], [0, variant === 'yours' ? 1.6 : 1.2]);

  etype(m, 1, 'solid');
  etype(m, 2, 'beam');
  etype(m, 3, 'spring');
  etype(m, 4, 'mass');
  etype(m, 5, 'shell');
  m.secs.set(1, { id: 1, type: 'BEAM', subtype: 'RECT', data: [0.12, 0.25] });
  m.secs.set(2, { id: 2, type: 'BEAM', subtype: 'CSOLID', data: [0.08] });
  m.secs.set(3, { id: 3, type: 'SHELL', subtype: '', data: [0.06] });
  m.reals.set(1, { id: 1, values: [1000] });

  // hex mesh beside the volumes
  const ids = hexGrid(m, [4.5, 0, 0], [2, 1, 1], [8, 4, 4], 1, 1);
  // fix the x = 4.5 face
  for (const row of ids[0]) for (const n of row) for (const lab of ['UX', 'UY', 'UZ']) {
    m.bcs.push({ kind: 'D', target: n, lab, value: 0, src: 'D' });
  }
  // pressure on top faces
  for (const e of m.elems.values()) {
    const zTop = Math.max(...e.nodes.map((n) => m.nodes.get(n)!.xyz[2]));
    if (zTop > 0.999 && e.id % 2 === 0) m.bcs.push({ kind: 'SF', target: e.id, lab: 'PRES', value: 1, face: 6, src: 'SFE' });
  }

  // beam frame: column + cantilever
  const b0 = node(m, [0, 2.5, 0]);
  let prev = b0;
  const col: number[] = [b0];
  for (let k = 1; k <= 4; k++) {
    const n = node(m, [0, 2.5, k * 0.6]);
    elem(m, 'line', [prev, n], 2, { secnum: 2 });
    prev = n;
    col.push(n);
  }
  for (let i = 1; i <= 6; i++) {
    const n = node(m, [i * 0.5, 2.5, 2.4]);
    elem(m, 'line', [prev, n], 2, { secnum: 1 });
    prev = n;
  }
  m.bcs.push({ kind: 'D', target: b0, lab: 'ALL', value: 0, src: 'D' });
  m.bcs.push({ kind: 'F', target: prev, lab: 'FZ', value: -500, src: 'F' });
  m.bcs.push({ kind: 'F', target: prev, lab: 'MY', value: 20, src: 'F' });

  // spring from the tip down to ground + mass at the tip; a coincident-node spring too
  const ground = node(m, [3, 2.5, 1.2]);
  elem(m, 'line', [prev, ground], 3, { real: 1 });
  m.bcs.push({ kind: 'D', target: ground, lab: 'UZ', value: 0, src: 'D' });
  elem(m, 'point', [prev], 4);
  const c1 = node(m, [1.5, 2.5, 2.4]);
  const c2 = node(m, [1.5, 2.5, 2.4]);
  elem(m, 'line', [c1, c2], 3);

  // a small shell plate
  const p = [node(m, [4.5, 2, 0]), node(m, [6.5, 2, 0]), node(m, [6.5, 3, 0]), node(m, [4.5, 3, 0])];
  elem(m, 'quad', p, 5, { secnum: 3 });

  m.acel = [0, 0, 9.81];
  return m;
}

// ---------------------------------------------------------------------------------------------
// mount

const host = document.getElementById('vp')!;
const vp = new Viewport(host, { mode: 'split' });
const yours = makeModel('yours');
const target = makeModel('target');
let hints: ViewHint[] = [];
let showTarget = true;

function stats() {
  const s = buildScene(yours, { display: vp.getDisplay(), role: 'yours' });
  document.getElementById('stats')!.textContent =
    `${yours.elems.size} elems, ${s.stats.exteriorFaces} ext faces, build ${s.stats.buildMs.toFixed(1)} ms`;
  s.dispose();
}

vp.setModel(yours, hints);
vp.setTarget(target);
vp.onModeChange = (mode) => console.log('[demo] mode ->', mode);
stats();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
$<HTMLSelectElement>('colorBy').onchange = (e) =>
  vp.setDisplay({ colorBy: (e.target as HTMLSelectElement).value as DisplayOptions['colorBy'] });
$<HTMLSelectElement>('plot').onchange = (e) => {
  const v = (e.target as HTMLSelectElement).value;
  hints = v ? [{ kind: 'plot', what: v as 'kp' }] : [];
  vp.setModel(yours, hints);
};
$<HTMLInputElement>('bc').onchange = (e) =>
  vp.setDisplay({ show: { ...vp.getDisplay().show, bc: (e.target as HTMLInputElement).checked } });
$<HTMLInputElement>('partial').onchange = (e) => {
  const on = (e.target as HTMLInputElement).checked;
  for (const id of yours.elems.keys()) if (id % 3 === 0) on ? yours.sel.elem.delete(id) : yours.sel.elem.add(id);
  for (const id of [2]) on ? yours.sel.volu.delete(id) : yours.sel.volu.add(id);
  vp.setModel(yours, hints);
};
$<HTMLButtonElement>('view').onclick = () => vp.setModel(yours, [...hints, { kind: 'view', dir: [1, 1, -1] }]);
$<HTMLButtonElement>('target').onclick = () => {
  showTarget = !showTarget;
  vp.setTarget(showTarget ? target : null);
};

// handy in the console
(window as unknown as { vp: Viewport }).vp = vp;
