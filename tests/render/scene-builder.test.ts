import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createEmptyModel } from '../../src/model/state';
import type { ElemCategory, ElemShape, ModelState, Vec3 } from '../../src/model/types';
import { beamAxes, buildScene, resolveLayers, sectionProfile } from '../../src/render/scene-builder';
import { extractExteriorFaces, SOLID_CODE } from '../../src/render/topology';
import { defaultDisplay, type DisplayOptions } from '../../src/render/types';
import { cycleColor, ANSYS_CYCLE } from '../../src/render/colors';

const ENAMES: Record<ElemCategory, string> = {
  solid: 'SOLID185', shell: 'SHELL181', beam: 'BEAM188', link: 'LINK180', spring: 'COMBIN14', mass: 'MASS21', surf: 'SURF154',
};

function addNode(m: ModelState, id: number, xyz: Vec3) {
  m.nodes.set(id, { id, xyz });
  m.sel.node.add(id);
}

function addEtype(m: ModelState, id: number, category: ElemCategory) {
  m.etypes.set(id, { id, ename: ENAMES[category], category, keyopts: {} });
}

function addElem(m: ModelState, id: number, shape: ElemShape, nodes: number[], type = 1, secnum = 1) {
  m.elems.set(id, { id, nodes, shape, type, mat: 1, real: 1, secnum, esys: 0 });
  m.sel.elem.add(id);
}

/** nx x 1 x 1 row of unit hexes along X. */
function hexRow(nx: number): ModelState {
  const m = createEmptyModel();
  addEtype(m, 1, 'solid');
  const nid = (i: number, j: number, k: number) => 1 + i + (nx + 1) * (j + 2 * k);
  for (let k = 0; k <= 1; k++) for (let j = 0; j <= 1; j++) for (let i = 0; i <= nx; i++) addNode(m, nid(i, j, k), [i, j, k]);
  for (let i = 0; i < nx; i++) {
    addElem(m, i + 1, 'hex', [
      nid(i, 0, 0), nid(i + 1, 0, 0), nid(i + 1, 1, 0), nid(i, 1, 0),
      nid(i, 0, 1), nid(i + 1, 0, 1), nid(i + 1, 1, 1), nid(i, 1, 1),
    ]);
  }
  return m;
}

function display(over: Partial<DisplayOptions> = {}): DisplayOptions {
  return { ...defaultDisplay(), ...over };
}

function instCount(g: THREE.Group, name: string): number {
  const o = g.getObjectByName(name) as THREE.InstancedMesh | undefined;
  return o ? o.count : 0;
}

function vertexCount(g: THREE.Group, name: string): number {
  const o = g.getObjectByName(name) as THREE.Mesh | undefined;
  return o ? (o.geometry.getAttribute('position')?.count ?? 0) : 0;
}

describe('exterior face extraction', () => {
  it('two hexes sharing a face have 10 exterior faces', () => {
    const s = buildScene(hexRow(2), { display: display(), role: 'yours' });
    expect(s.stats.solidCells).toBe(2);
    expect(s.stats.exteriorFaces).toBe(10);
    // 10 quads -> 20 triangles -> 60 vertices
    expect(vertexCount(s.group, 'elem-solid-fill')).toBe(60);
    // unique exterior edges of a 2x1x1 box made of two cubes: 12 + 8 (shared ring counted once) = 20
    const edges = s.group.getObjectByName('elem-solid-edges') as THREE.LineSegments;
    expect(edges.geometry.getAttribute('position').count / 2).toBe(20);
    s.dispose();
  });

  it('a single tet has 4 exterior faces', () => {
    const m = createEmptyModel();
    addEtype(m, 1, 'solid');
    addNode(m, 1, [0, 0, 0]);
    addNode(m, 2, [1, 0, 0]);
    addNode(m, 3, [0, 1, 0]);
    addNode(m, 4, [0, 0, 1]);
    addElem(m, 1, 'tet', [1, 2, 3, 4]);
    const s = buildScene(m, { display: display(), role: 'yours' });
    expect(s.stats.exteriorFaces).toBe(4);
    expect(vertexCount(s.group, 'elem-solid-fill')).toBe(12);
  });

  it('matches faces numerically regardless of node id magnitude / order', () => {
    // two tets sharing face (10, 200, 3000)
    const shape = new Uint8Array([SOLID_CODE.tet, SOLID_CODE.tet]);
    const corners = new Int32Array([10, 200, 3000, 7, -1, -1, -1, -1, 3000, 200, 10, 99999, -1, -1, -1, -1]);
    const ext = extractExteriorFaces(shape, corners, 2, 8);
    expect(ext.count).toBe(6);
  });

  it('degenerate hex (wedge stored as hex with K=L, O=P) merges with a neighbouring wedge', () => {
    const m = createEmptyModel();
    addEtype(m, 1, 'solid');
    const pts: Vec3[] = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 0], [1, 1, 1]];
    pts.forEach((p, i) => addNode(m, i + 1, p));
    // wedge A: b(1,2,3) t(4,5,6) as degenerate hex
    addElem(m, 1, 'hex', [1, 2, 3, 3, 4, 5, 6, 6]);
    // wedge B: b(2,7,3) t(5,8,6), shares quad 2-3-6-5 with A
    addElem(m, 2, 'wedge', [2, 7, 3, 5, 8, 6]);
    const s = buildScene(m, { display: display(), role: 'yours' });
    expect(s.stats.exteriorFaces).toBe(8);
  });

  it('skips elements that reference missing nodes', () => {
    const m = hexRow(1);
    addElem(m, 99, 'hex', [1, 2, 3, 4, 500, 501, 502, 503]);
    const s = buildScene(m, { display: display(), role: 'yours' });
    expect(s.stats.solidCells).toBe(1);
    expect(s.stats.skippedElems).toBe(1);
    expect(s.stats.exteriorFaces).toBe(6);
  });

  it('unselected elements form their own faint shell', () => {
    const m = hexRow(2);
    m.sel.elem.delete(2);
    const s = buildScene(m, { display: display(), role: 'yours' });
    expect(s.group.getObjectByName('elem-solid-fill')).toBeTruthy();
    expect(s.group.getObjectByName('elem-solid-fill-unselected')).toBeTruthy();
    expect(s.stats.exteriorFaces).toBe(12);
  });

  it('wireframe hides the fill but keeps edges', () => {
    const s = buildScene(hexRow(2), { display: display({ wireframe: true }), role: 'yours' });
    expect(s.group.getObjectByName('elem-solid-fill')).toBeUndefined();
    expect(s.group.getObjectByName('elem-solid-edges')).toBeTruthy();
  });

  it('builds 50k hexes quickly', () => {
    const n = 37; // 37^3 = 50653
    const m = createEmptyModel();
    addEtype(m, 1, 'solid');
    const nid = (i: number, j: number, k: number) => 1 + i + (n + 1) * (j + (n + 1) * k);
    for (let k = 0; k <= n; k++) for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) addNode(m, nid(i, j, k), [i, j, k]);
    let id = 1;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      addElem(m, id++, 'hex', [
        nid(i, j, k), nid(i + 1, j, k), nid(i + 1, j + 1, k), nid(i, j + 1, k),
        nid(i, j, k + 1), nid(i + 1, j, k + 1), nid(i + 1, j + 1, k + 1), nid(i, j + 1, k + 1),
      ]);
    }
    buildScene(m, { display: display(), role: 'yours' }).dispose(); // warm-up JIT
    const s = buildScene(m, { display: display(), role: 'yours' });
    expect(s.stats.exteriorFaces).toBe(6 * n * n);
    // generous bound for CI noise; typically well under 100 ms
    expect(s.stats.buildMs).toBeLessThan(400);
    s.dispose();
  });
});

describe('BC glyphs', () => {
  it('one D cone per node per translational DOF, deduplicated; F arrows skip zero values', () => {
    const m = hexRow(1);
    for (const n of [1, 3, 5, 7]) {
      for (const lab of ['UX', 'UY', 'UZ']) m.bcs.push({ kind: 'D', target: n, lab, value: 0, src: 'D' });
    }
    m.bcs.push({ kind: 'D', target: 1, lab: 'UX', value: 0, src: 'D' }); // duplicate
    m.bcs.push({ kind: 'D', target: 2, lab: 'ALL', value: 0, src: 'D' }); // solid model -> UX UY UZ only
    m.bcs.push({ kind: 'F', target: 2, lab: 'FZ', value: -100, src: 'F' });
    m.bcs.push({ kind: 'F', target: 4, lab: 'FX', value: 50, src: 'F' });
    m.bcs.push({ kind: 'F', target: 6, lab: 'FY', value: 0, src: 'F' });
    m.bcs.push({ kind: 'F', target: 8, lab: 'MX', value: 5, src: 'F' });
    const s = buildScene(m, { display: display(), role: 'yours' });
    expect(instCount(s.group, 'bc-D')).toBe(4 * 3 + 3);
    expect(s.stats.dGlyphs).toBe(15);
    expect(s.stats.rotGlyphs).toBe(0);
    expect(instCount(s.group, 'bc-F')).toBe(2);
    expect(instCount(s.group, 'bc-M')).toBe(1);
  });

  it('F arrow points along the sign of the force with its tip at the node', () => {
    const m = hexRow(1);
    m.bcs.push({ kind: 'F', target: 8, lab: 'FZ', value: -10, src: 'F' });
    const s = buildScene(m, { display: display(), role: 'yours' });
    const inst = s.group.getObjectByName('bc-F') as THREE.InstancedMesh;
    const mat = new THREE.Matrix4();
    inst.getMatrixAt(0, mat);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    mat.decompose(p, q, sc);
    expect(p.toArray()).toEqual(m.nodes.get(8)!.xyz);
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    expect(dir.z).toBeCloseTo(-1);
  });

  it('pressure arrows sit on the element face centroid and point inward', () => {
    const m = hexRow(1);
    m.bcs.push({ kind: 'SF', target: 1, lab: 'PRES', value: 1, face: 6, src: 'SFE' });
    const s = buildScene(m, { display: display(), role: 'yours' });
    const inst = s.group.getObjectByName('bc-SF') as THREE.InstancedMesh;
    expect(inst.count).toBe(1);
    const mat = new THREE.Matrix4();
    inst.getMatrixAt(0, mat);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    mat.decompose(p, q, sc);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.5);
    expect(p.z).toBeCloseTo(1);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).z).toBeCloseTo(-1);
  });

  it('caps glyph instances at 20k by subsampling', () => {
    const m = createEmptyModel();
    for (let i = 1; i <= 25000; i++) {
      addNode(m, i, [i, 0, 0]);
      m.bcs.push({ kind: 'D', target: i, lab: 'UX', value: 0, src: 'D' });
    }
    const s = buildScene(m, { display: display(), role: 'yours' });
    expect(s.layers.node).toBe(true);
    expect(instCount(s.group, 'bc-D')).toBeLessThanOrEqual(20000);
    expect(instCount(s.group, 'bc-D')).toBeGreaterThan(10000);
  });

  it('ACEL draws one arrow pointing along gravity with a "g" label', () => {
    const m = hexRow(1);
    m.acel = [0, 0, 9.81];
    const s = buildScene(m, { display: display(), role: 'yours' });
    const inst = s.group.getObjectByName('acel') as THREE.InstancedMesh;
    expect(inst.count).toBe(1);
    const mat = new THREE.Matrix4();
    inst.getMatrixAt(0, mat);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    mat.decompose(p, q, sc);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).z).toBeCloseTo(-1);
    expect(s.labels.some((l) => l.text === 'g' && l.kind === 'acel')).toBe(true);
  });

  it('hides glyphs when show.bc is false', () => {
    const m = hexRow(1);
    m.bcs.push({ kind: 'D', target: 1, lab: 'UX', value: 0, src: 'D' });
    const d = display();
    d.show = { ...d.show, bc: false };
    const s = buildScene(m, { display: d, role: 'yours' });
    expect(s.group.getObjectByName('bc-D')).toBeUndefined();
  });
});

describe('beams, springs, masses', () => {
  function beamModel(subtype: string, data: number[]): ModelState {
    const m = createEmptyModel();
    addEtype(m, 1, 'beam');
    m.secs.set(1, { id: 1, type: 'BEAM', subtype, data });
    for (let i = 0; i <= 3; i++) addNode(m, i + 1, [i, 0, 0]);
    for (let i = 0; i < 3; i++) addElem(m, i + 1, 'line', [i + 1, i + 2]);
    return m;
  }

  it('without ESHAPE beams are line segments', () => {
    const s = buildScene(beamModel('RECT', [0.2, 0.4]), { display: display(), role: 'yours' });
    const l = s.group.getObjectByName('elem-beam-lines') as THREE.LineSegments;
    expect(l.geometry.getAttribute('position').count).toBe(6);
    expect(s.group.getObjectByName('elem-beam-eshape')).toBeUndefined();
  });

  it('ESHAPE RECT extrudes a box per element (36 vertices each)', () => {
    const s = buildScene(beamModel('RECT', [0.2, 0.4]), { display: display({ eshape: true }), role: 'yours' });
    expect(vertexCount(s.group, 'elem-beam-eshape')).toBe(3 * 36);
    expect(s.group.getObjectByName('elem-beam-lines')).toBeUndefined();
    // B along local y (= global Y for a beam along X), H along z (= global Z)
    const bb = s.bbox;
    expect(bb.max.y - bb.min.y).toBeCloseTo(0.2);
    expect(bb.max.z - bb.min.z).toBeCloseTo(0.4);
  });

  it('ESHAPE CSOLID extrudes an 8-sided prism (84 vertices each)', () => {
    const s = buildScene(beamModel('CSOLID', [0.1]), { display: display({ eshape: true }), role: 'yours' });
    expect(vertexCount(s.group, 'elem-beam-eshape')).toBe(3 * 84);
  });

  it('beam axes: y = Z x x, or global Y when x is vertical', () => {
    const a = beamAxes([0, 0, 0], [1, 0, 0])!;
    expect(a.y.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 1, 0]);
    expect(a.z.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 0, 1]);
    const b = beamAxes([0, 0, 0], [0, 0, 2])!;
    expect(b.y).toEqual([0, 1, 0]);
    expect(sectionProfile({ id: 1, type: 'BEAM', subtype: 'I', data: [1, 1, 2, 0.1, 0.1, 0.05] })!.length).toBe(3);
  });

  it('springs become zig-zags, masses become cubes, coincident springs still draw', () => {
    const m = createEmptyModel();
    addEtype(m, 1, 'spring');
    addEtype(m, 2, 'mass');
    addNode(m, 1, [0, 0, 0]);
    addNode(m, 2, [0, 0, -1]);
    addNode(m, 3, [2, 0, 0]);
    addNode(m, 4, [2, 0, 0]);
    addElem(m, 1, 'line', [1, 2], 1);
    addElem(m, 2, 'line', [3, 4], 1);
    addElem(m, 3, 'point', [2], 2);
    const s = buildScene(m, { display: display(), role: 'yours' });
    const z = s.group.getObjectByName('elem-spring') as THREE.LineSegments;
    // 2 springs x (1 lead + 6 peaks + 1 lead + 1) = 2 x 9 segments
    expect(z.geometry.getAttribute('position').count / 2).toBe(18);
    expect(instCount(s.group, 'elem-mass')).toBe(1);
    expect(s.stats.springCells).toBe(2);
  });

  it('shells: flat by default, thickened prism with ESHAPE', () => {
    const m = createEmptyModel();
    addEtype(m, 1, 'shell');
    m.secs.set(1, { id: 1, type: 'SHELL', subtype: '', data: [0.1] });
    addNode(m, 1, [0, 0, 0]);
    addNode(m, 2, [1, 0, 0]);
    addNode(m, 3, [1, 1, 0]);
    addNode(m, 4, [0, 1, 0]);
    addElem(m, 1, 'quad', [1, 2, 3, 4]);
    const flat = buildScene(m, { display: display(), role: 'yours' });
    expect(vertexCount(flat.group, 'elem-shell-fill')).toBe(6);
    const thick = buildScene(m, { display: display({ eshape: true }), role: 'yours' });
    expect(vertexCount(thick.group, 'elem-shell-fill')).toBe(6 + 6 + 4 * 6);
    expect(thick.bbox.max.z - thick.bbox.min.z).toBeCloseTo(0.1);
  });
});

describe('scene basics', () => {
  it('null and empty models return an empty group', () => {
    const a = buildScene(null, { display: display(), role: 'yours' });
    expect(a.group.children.length).toBe(0);
    expect(a.bbox.isEmpty()).toBe(true);
    const b = buildScene(createEmptyModel(), { display: display(), role: 'yours' });
    expect(b.group.children.length).toBe(0);
    expect(b.labels.length).toBe(0);
    b.dispose();
  });

  it('auto layers: elements if any exist, else geometry; plot hint wins', () => {
    const d = display();
    const m = hexRow(1);
    expect(resolveLayers(m, d)).toMatchObject({ elem: true, volu: false, kp: false });
    expect(resolveLayers(m, d, 'kp')).toMatchObject({ elem: false, kp: true });
    expect(resolveLayers(createEmptyModel(), d)).toMatchObject({ elem: false, volu: true, area: true, line: true, kp: true });
    expect(resolveLayers(m, { ...d, auto: false })).toMatchObject(d.show);
  });

  it('volumes, areas, lines, keypoints from tessellation with labels', () => {
    const m = createEmptyModel();
    const P: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];
    P.forEach((xyz, i) => { m.kps.set(i + 1, { id: i + 1, xyz }); m.sel.kp.add(i + 1); });
    for (let i = 0; i < 4; i++) {
      const a = P[i], b = P[(i + 1) % 4];
      m.lines.set(i + 1, { id: i + 1, kps: [i + 1, ((i + 1) % 4) + 1], kind: 'straight', pts: [a, b], length: 1 });
      m.sel.line.add(i + 1);
    }
    m.areas.set(1, {
      id: 1, loops: [[1, 2, 3, 4]], surface: { kind: 'free' }, area: 1, centroid: [0.5, 0.5, 0],
      tess: { pos: new Float64Array(P.flat()), idx: new Uint32Array([0, 1, 2, 0, 2, 3]) },
    });
    m.sel.area.add(1);
    const d = display();
    d.labels = { kp: true, line: true, area: true, volu: true, node: true, elem: true };
    const s = buildScene(m, { display: d, role: 'yours' });
    expect(s.group.getObjectByName('area-fill')).toBeTruthy();
    expect(s.group.getObjectByName('lines')).toBeTruthy();
    expect(s.group.getObjectByName('kps')).toBeTruthy();
    const texts = s.labels.map((l) => l.text);
    expect(texts).toEqual(expect.arrayContaining(['K1', 'K4', 'L1', 'L4', 'A1']));
    expect(s.labels.find((l) => l.text === 'A1')!.color).toBe(cycleColor(1));
    expect(cycleColor(11)).toBe(ANSYS_CYCLE[0]);
    expect(s.bbox.max.x).toBeCloseTo(1);
  });

  it('unselected geometry is drawn faint', () => {
    const m = createEmptyModel();
    m.kps.set(1, { id: 1, xyz: [0, 0, 0] });
    m.kps.set(2, { id: 2, xyz: [1, 0, 0] });
    m.sel.kp.add(1);
    const s = buildScene(m, { display: display(), role: 'yours' });
    const sel = s.group.getObjectByName('kps') as THREE.Points;
    const uns = s.group.getObjectByName('kps-unselected') as THREE.Points;
    expect(sel.geometry.getAttribute('position').count).toBe(1);
    expect(uns.geometry.getAttribute('position').count).toBe(1);
    expect((uns.material as THREE.PointsMaterial).opacity).toBeLessThan(0.5);
  });

  it('caps labels', () => {
    const m = createEmptyModel();
    for (let i = 1; i <= 2000; i++) addNode(m, i, [i, 0, 0]);
    const d = display();
    d.labels = { ...d.labels, node: true };
    const s = buildScene(m, { display: d, role: 'yours' });
    expect(s.labels.length).toBe(1500);
    expect(s.labelsCapped).toBe(true);
  });

  it('ghost role draws translucent, no labels or glyphs', () => {
    const m = hexRow(2);
    m.bcs.push({ kind: 'D', target: 1, lab: 'UX', value: 0, src: 'D' });
    const d = display();
    d.labels = { ...d.labels, elem: true };
    const s = buildScene(m, { display: d, role: 'ghost' });
    const fill = s.group.getObjectByName('elem-solid-fill') as THREE.Mesh;
    const mat = fill.material as THREE.Material;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.22);
    expect(mat.depthWrite).toBe(false);
    expect(s.labels.length).toBe(0);
    expect(s.group.getObjectByName('bc-D')).toBeUndefined();
  });

  it('never throws on malformed data', () => {
    const m = createEmptyModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad: any = m;
    bad.elems.set(1, { id: 1, nodes: null, shape: 'hex', type: 9 });
    bad.elems.set(2, { id: 2, nodes: [1], shape: 'weird', type: 9 });
    bad.areas.set(1, { id: 1, loops: [[99]], tess: { pos: new Float64Array([0, 0, 0]), idx: new Uint32Array([0, 5, 9]) } });
    bad.volus.set(1, { id: 1, areas: [1, 2], areaFlip: [], tess: null });
    bad.lines.set(1, { id: 1, kps: [7, 8], pts: [[0, 0, NaN]] });
    bad.bcs.push({ kind: 'D', target: 77, lab: 'UX', value: 0 }, { kind: 'SF', target: 1, lab: 'PRES', value: 1 });
    bad.acel = [0, 0, 0];
    expect(() => buildScene(m, { display: display(), role: 'yours' })).not.toThrow();
    expect(() => buildScene(m, { display: display({ eshape: true, wireframe: true }), role: 'target' })).not.toThrow();
  });
});
