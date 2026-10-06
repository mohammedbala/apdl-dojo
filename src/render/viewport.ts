// Three.js viewport that renders a ModelState like ANSYS Mechanical APDL.
//
//   const vp = new Viewport(el);            // toolbar + triad overlay, render on demand
//   vp.setModel(result.model, result.viewHints);
//   vp.setTarget(targetModel); vp.setMode('split');

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { PlotWhat, ViewHint } from '../apdl/diagnostics';
import type { ModelState, Vec3 } from '../model/types';
import { BG_COLOR, COLORS } from './colors';
import { buildScene, type BuiltScene } from './scene-builder';
import {
  cloneDisplay, defaultDisplay, type DisplayOptions, type SceneRole, type ViewMode, type ViewPreset,
} from './types';

export type { DisplayOptions, ViewMode, ViewPreset } from './types';

type LabelKey = keyof DisplayOptions['labels'];
const LABEL_KEYS: LabelKey[] = ['kp', 'line', 'area', 'volu', 'node', 'elem'];

const PRESETS: Record<ViewPreset, Vec3> = {
  iso: [1, 1, 1],
  front: [0, -1, 0],
  back: [0, 1, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
};

const PNUM_KEYS: Record<string, LabelKey> = {
  KP: 'kp', KPOI: 'kp', LINE: 'line', AREA: 'area', VOLU: 'volu', NODE: 'node', ELEM: 'elem',
};
const PNUM_COLOR: Record<string, DisplayOptions['colorBy']> = {
  TYPE: 'type', MAT: 'mat', REAL: 'real', SEC: 'sec', SECN: 'sec',
};

const TRIAD_PX = 84;
const STYLE_ID = 'apdl-viewport-style';
const CSS = `
.avp-root{position:absolute;inset:0;pointer-events:none;font:11px/1.2 ui-monospace,'JetBrains Mono',Menlo,Consolas,monospace;color:#cbd5e1}
.avp-bar{position:absolute;top:6px;left:6px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;pointer-events:auto;
  background:rgba(13,17,26,.78);border:1px solid rgba(148,163,184,.18);border-radius:6px;padding:3px 4px;max-width:calc(100% - 12px)}
.avp-grp{display:flex;gap:2px}
.avp-sep{width:1px;align-self:stretch;background:rgba(148,163,184,.2);margin:0 2px}
.avp-btn{all:unset;cursor:pointer;padding:2px 6px;border-radius:4px;color:#cbd5e1;font:inherit;white-space:nowrap}
.avp-btn:hover{background:rgba(148,163,184,.16)}
.avp-btn.on{background:rgba(76,201,240,.22);color:#e0f7ff}
.avp-btn:focus-visible{outline:1px solid #4cc9f0}
.avp-cap{position:absolute;bottom:8px;transform:translateX(-50%);letter-spacing:.12em;font-weight:600;font-size:11px;
  padding:2px 8px;border-radius:4px;background:rgba(13,17,26,.7)}
.avp-div{position:absolute;top:0;bottom:0;left:50%;width:1px;background:rgba(148,163,184,.35)}
.avp-note{position:absolute;right:8px;bottom:8px;font-size:10px;color:#fbbf24;background:rgba(13,17,26,.7);padding:1px 6px;border-radius:4px}
.avp-lbl{font:10px/1 ui-monospace,'JetBrains Mono',Menlo,Consolas,monospace;white-space:nowrap;pointer-events:none;
  text-shadow:0 0 2px #000,0 0 3px #000}
`;

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

function isEmptyModel(m: ModelState | null): boolean {
  if (!m) return true;
  return m.kps.size + m.lines.size + m.areas.size + m.volus.size + m.nodes.size + m.elems.size === 0;
}

interface ScriptOverrides {
  labels: Partial<Record<LabelKey, boolean>>;
  eshape?: boolean;
  colorBy?: DisplayOptions['colorBy'];
}

export class Viewport {
  /** optional listener so the host page can react to toolbar changes */
  onModeChange?: (m: ViewMode) => void;

  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private scene = new THREE.Scene();
  private labelScene = new THREE.Scene();
  private ortho: THREE.OrthographicCamera;
  private persp: THREE.PerspectiveCamera;
  private camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private dirLight = new THREE.DirectionalLight(0xffffff, 1.7);
  private roots: Record<SceneRole, THREE.Group> = {
    yours: new THREE.Group(), target: new THREE.Group(), ghost: new THREE.Group(),
  };
  private built: Partial<Record<SceneRole, BuiltScene>> = {};
  private labelSource: BuiltScene | null = null;

  private model: ModelState | null = null;
  private target: ModelState | null = null;
  private mode: ViewMode;
  private user: DisplayOptions = defaultDisplay();
  private script: ScriptOverrides = { labels: {} };
  private plot: PlotWhat | null = null;

  /** ortho half-height (world units) at zoom 1 */
  private halfH = 1;
  private hasFitted = false;
  private lastViewSig = '';
  private lastBoxSig = '';

  private triadScene = new THREE.Scene();
  private triadCam = new THREE.OrthographicCamera(-1.45, 1.45, 1.45, -1.45, -10, 10);
  private triadDispose: (() => void)[] = [];

  private overlay: HTMLDivElement;
  private bar: HTMLDivElement | null = null;
  private buttons = new Map<string, HTMLButtonElement>();
  private capLeft: HTMLDivElement;
  private capRight: HTMLDivElement;
  private divider: HTMLDivElement;
  private capNote: HTMLDivElement;

  private ro: ResizeObserver | null = null;
  private raf = 0;
  private disposed = false;
  private onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor(container: HTMLElement, opts?: { toolbar?: boolean; mode?: ViewMode }) {
    this.container = container;
    this.mode = opts?.mode ?? 'yours';
    injectStyle();

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.style.overflow = 'hidden';
    if (container.tabIndex < 0) container.tabIndex = 0;
    container.style.outline = 'none';

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(new THREE.Color(BG_COLOR), 1);
    this.renderer.autoClear = false;
    const cv = this.renderer.domElement;
    cv.style.display = 'block';
    cv.style.width = '100%';
    cv.style.height = '100%';
    container.appendChild(cv);

    this.labelRenderer = new CSS2DRenderer();
    const ld = this.labelRenderer.domElement;
    ld.style.position = 'absolute';
    ld.style.top = '0';
    ld.style.left = '0';
    ld.style.pointerEvents = 'none';
    container.appendChild(ld);

    // cameras (Z up)
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
    this.persp = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
    this.ortho.up.set(0, 0, 1);
    this.persp.up.set(0, 0, 1);
    this.camera = this.user.projection === 'persp' ? this.persp : this.ortho;
    this.camera.position.set(1, 1, 1);
    this.scene.add(this.ortho, this.persp);

    // lights: hemisphere + directional riding on the camera so shading follows the view
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4150, 1.25);
    this.scene.add(hemi);
    this.attachLight();

    for (const r of Object.values(this.roots)) this.scene.add(r);

    this.controls = new OrbitControls(this.camera, cv);
    this.controls.screenSpacePanning = true;
    this.controls.enableDamping = false;
    this.controls.zoomToCursor = true;
    this.controls.addEventListener('change', () => this.requestRender());

    this.buildTriad();

    // overlay DOM
    this.overlay = document.createElement('div');
    this.overlay.className = 'avp-root';
    this.divider = document.createElement('div');
    this.divider.className = 'avp-div';
    this.capLeft = document.createElement('div');
    this.capLeft.className = 'avp-cap';
    this.capLeft.style.left = '25%';
    this.capLeft.style.color = '#4cc9f0';
    this.capLeft.textContent = 'TARGET';
    this.capRight = document.createElement('div');
    this.capRight.className = 'avp-cap';
    this.capRight.style.left = '75%';
    this.capRight.style.color = '#fbbf24';
    this.capRight.textContent = 'YOURS';
    this.capNote = document.createElement('div');
    this.capNote.className = 'avp-note';
    this.capNote.textContent = 'labels capped';
    this.overlay.append(this.divider, this.capLeft, this.capRight, this.capNote);
    if (opts?.toolbar !== false) this.buildToolbar();
    container.appendChild(this.overlay);

    container.addEventListener('keydown', this.onKey);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(container);
    }
    this.setView('iso');
    this.resize();
    this.refreshUi();
  }

  // ------------------------------------------------------------------------------------------
  // public API

  setModel(m: ModelState | null, hints?: ViewHint[]): void {
    const wasEmpty = isEmptyModel(this.model);
    this.model = m;
    let view: Vec3 | null = null;
    let auto = false;
    if (hints) ({ view, auto } = this.applyHints(hints));
    this.invalidate('yours');
    this.ensureBuilt();

    const nowEmpty = isEmptyModel(m);
    const boxSig = this.boxSig();
    const viewSig = view ? view.map((x) => +x.toFixed(6)).join(',') : '';
    if (!this.hasFitted || (wasEmpty && !nowEmpty)) {
      if (view) this.setViewDir(view);
      this.fit();
      this.hasFitted = !nowEmpty;
    } else if (view && viewSig !== this.lastViewSig) {
      this.setView(view);
    } else if (auto && boxSig !== this.lastBoxSig) {
      this.fit();
    }
    if (hints) this.lastViewSig = viewSig;
    this.lastBoxSig = boxSig;
    this.refreshUi();
    this.requestRender();
  }

  setTarget(m: ModelState | null): void {
    const prevMode = this.effectiveMode();
    this.target = m;
    this.invalidate('target');
    this.invalidate('ghost');
    this.ensureBuilt();
    // refit when the set of visible scenes changes (e.g. first target in split/ghost mode)
    if (this.effectiveMode() !== prevMode || (m && isEmptyModel(this.model))) this.fit();
    this.refreshUi();
    this.requestRender();
  }

  setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    const prev = this.effectiveMode();
    this.mode = mode;
    this.ensureBuilt();
    // keep the camera when flipping between single views (easier to compare); refit when the
    // pane aspect changes (split <-> single)
    if ((this.effectiveMode() === 'split') !== (prev === 'split')) this.fit();
    this.refreshUi();
    this.requestRender();
    this.onModeChange?.(mode);
  }

  getMode(): ViewMode {
    return this.mode;
  }

  /** Preset name or ANSYS /VIEW direction vector (camera placed along it from the focus). Refits. */
  setView(p: ViewPreset | Vec3): void {
    const d = typeof p === 'string' ? PRESETS[p] : p;
    if (!d) return;
    if (!this.setViewDir(d)) return;
    this.fit();
  }

  /** /AUTO: frame the bbox of everything visible. */
  fit(): void {
    const box = this.visibleBox();
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const center = box.getCenter(new THREE.Vector3());
    let r = box.min.distanceTo(box.max) / 2;
    if (!(r > 1e-12) || !Number.isFinite(r)) r = 1;
    const dir = this.currentDir();
    const aspect = this.paneAspect();
    const cam = this.camera;

    let focus = center.clone();
    let dist: number;
    if (cam instanceof THREE.OrthographicCamera) {
      dist = r * 8;
      cam.position.copy(center).addScaledVector(dir, dist);
      cam.lookAt(center);
      cam.updateMatrixWorld(true);
      const inv = cam.matrixWorldInverse;
      const v = new THREE.Vector3();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
        v.applyMatrix4(inv);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
        y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, 0);
      const cz = center.clone().applyMatrix4(inv).z;
      c.z = cz;
      focus = c.applyMatrix4(cam.matrixWorld);
      let hh = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / aspect) * 1.12;
      if (!(hh > r * 1e-6)) hh = r;
      this.halfH = hh;
      cam.zoom = 1;
      cam.near = 0;
      cam.far = dist + r * 20;
    } else {
      const vf = THREE.MathUtils.degToRad(cam.fov) / 2;
      const hf = Math.atan(Math.tan(vf) * aspect);
      dist = (r / Math.sin(Math.min(vf, hf))) * 1.08;
      cam.near = dist * 0.01;
      cam.far = dist * 20 + r * 4;
    }
    this.controls.target.copy(focus);
    cam.position.copy(focus).addScaledVector(dir, dist);
    this.updateFrustum(aspect);
    this.controls.update();
    this.requestRender();
  }

  setDisplay(o: Partial<DisplayOptions>): void {
    const prevProj = this.getDisplay().projection;
    const u = this.user;
    if (o.show) u.show = { ...u.show, ...o.show };
    if (o.labels) {
      u.labels = { ...u.labels, ...o.labels };
      for (const k of Object.keys(o.labels) as LabelKey[]) delete this.script.labels[k];
    }
    if (o.auto !== undefined) u.auto = o.auto;
    if (o.wireframe !== undefined) u.wireframe = o.wireframe;
    if (o.eshape !== undefined) {
      u.eshape = o.eshape;
      delete this.script.eshape;
    }
    if (o.colorBy !== undefined) {
      u.colorBy = o.colorBy;
      delete this.script.colorBy;
    }
    if (o.projection !== undefined) u.projection = o.projection;
    if (this.getDisplay().projection !== prevProj) this.switchProjection();
    this.invalidate();
    this.ensureBuilt();
    this.refreshUi();
    this.requestRender();
  }

  getDisplay(): DisplayOptions {
    const d = cloneDisplay(this.user);
    for (const k of LABEL_KEYS) {
      const v = this.script.labels[k];
      if (v !== undefined) d.labels[k] = v;
    }
    if (this.script.eshape !== undefined) d.eshape = this.script.eshape;
    if (this.script.colorBy !== undefined) d.colorBy = this.script.colorBy;
    return d;
  }

  resize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.labelRenderer.setSize(w, h);
    this.updateFrustum(this.paneAspect());
    this.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.container.removeEventListener('keydown', this.onKey);
    this.controls.dispose();
    for (const r of ['yours', 'target', 'ghost'] as SceneRole[]) this.invalidate(r);
    this.clearLabels();
    for (const f of this.triadDispose) f();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
    this.overlay.remove();
  }

  // ------------------------------------------------------------------------------------------
  // hints

  private applyHints(hints: ViewHint[]): { view: Vec3 | null; auto: boolean } {
    const script: ScriptOverrides = { labels: {} };
    let plot: PlotWhat | null = null;
    let view: Vec3 | null = null;
    let auto = false;
    for (const h of hints) {
      if (!h) continue;
      switch (h.kind) {
        case 'plot':
          plot = h.what;
          break;
        case 'pnum': {
          const w = String(h.what ?? '').toUpperCase();
          const key = PNUM_KEYS[w] ?? PNUM_KEYS[w.slice(0, 4)];
          if (key) script.labels[key] = !!h.on;
          else if (PNUM_COLOR[w]) {
            const c = PNUM_COLOR[w];
            if (h.on) script.colorBy = c;
            else if (script.colorBy === c) script.colorBy = 'entity';
          } else if (w === 'DEFA') {
            for (const k of LABEL_KEYS) script.labels[k] = false;
            script.colorBy = 'entity';
          }
          break;
        }
        case 'view':
          if (Array.isArray(h.dir) && h.dir.length >= 3) view = [h.dir[0], h.dir[1], h.dir[2]];
          break;
        case 'auto':
          auto = true;
          break;
        case 'eshape':
          script.eshape = !!h.on;
          break;
      }
    }
    this.script = script;
    this.plot = plot;
    return { view, auto };
  }

  // ------------------------------------------------------------------------------------------
  // scenes

  private effectiveMode(): ViewMode {
    return this.target ? this.mode : 'yours';
  }

  private rolesFor(mode: ViewMode): SceneRole[] {
    switch (mode) {
      case 'yours': return ['yours'];
      case 'target': return ['target'];
      case 'split': return ['target', 'yours'];
      case 'ghost': return ['ghost', 'yours'];
    }
  }

  private invalidate(role?: SceneRole) {
    const roles: SceneRole[] = role ? [role] : ['yours', 'target', 'ghost'];
    for (const r of roles) {
      const b = this.built[r];
      if (!b) continue;
      if (this.labelSource === b) this.clearLabels();
      this.roots[r].remove(b.group);
      b.dispose();
      delete this.built[r];
    }
  }

  private ensureBuilt() {
    const display = this.getDisplay();
    for (const r of this.rolesFor(this.effectiveMode())) {
      if (this.built[r]) continue;
      const model = r === 'yours' ? this.model : this.target;
      const b = buildScene(model, { display, role: r, plot: r === 'yours' ? this.plot : null });
      this.built[r] = b;
      this.roots[r].add(b.group);
    }
    this.syncLabels();
  }

  private visibleBox(): THREE.Box3 {
    const box = new THREE.Box3();
    for (const r of this.rolesFor(this.effectiveMode())) {
      const b = this.built[r];
      if (b && !b.bbox.isEmpty()) box.union(b.bbox);
    }
    return box;
  }

  private boxSig(): string {
    const b = this.visibleBox();
    if (b.isEmpty()) return '';
    return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((x) => x.toPrecision(5)).join(',');
  }

  // ------------------------------------------------------------------------------------------
  // labels

  private clearLabels() {
    // CSS2DObject removes its element from the DOM on 'removed'
    for (const c of [...this.labelScene.children]) this.labelScene.remove(c);
    this.labelSource = null;
  }

  private syncLabels() {
    const mode = this.effectiveMode();
    const src = mode === 'split' ? null : mode === 'target' ? this.built.target ?? null : this.built.yours ?? null;
    if (src === this.labelSource) {
      this.capNote.style.display = src?.labelsCapped ? '' : 'none';
      return;
    }
    this.clearLabels();
    this.labelSource = src;
    this.capNote.style.display = src?.labelsCapped ? '' : 'none';
    if (!src) return;
    for (const l of src.labels) {
      const el = document.createElement('div');
      el.className = 'avp-lbl';
      el.textContent = l.text;
      el.style.color = l.color;
      if (l.kind === 'acel') {
        el.style.fontSize = '12px';
        el.style.fontWeight = '700';
      }
      const o = new CSS2DObject(el);
      o.position.set(l.pos[0], l.pos[1], l.pos[2]);
      o.center.set(-0.15, 1.1);
      this.labelScene.add(o);
    }
  }

  // ------------------------------------------------------------------------------------------
  // camera

  private paneAspect(): number {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    return (this.effectiveMode() === 'split' ? w / 2 : w) / h;
  }

  private updateFrustum(aspect: number) {
    const o = this.ortho;
    o.left = -this.halfH * aspect;
    o.right = this.halfH * aspect;
    o.top = this.halfH;
    o.bottom = -this.halfH;
    o.updateProjectionMatrix();
    this.persp.aspect = aspect;
    this.persp.updateProjectionMatrix();
  }

  private currentDir(): THREE.Vector3 {
    const d = this.camera.position.clone().sub(this.controls?.target ?? new THREE.Vector3());
    if (d.lengthSq() < 1e-30 || !Number.isFinite(d.x)) return new THREE.Vector3(1, 1, 1).normalize();
    return d.normalize();
  }

  /** Orient the camera along d (from focus to eye) without refitting. Returns false for a zero vector. */
  private setViewDir(v: ArrayLike<number>): boolean {
    const d = new THREE.Vector3(+v[0] || 0, +v[1] || 0, +v[2] || 0);
    if (d.lengthSq() === 0) return false;
    d.normalize();
    // Up is +Z: nudge views along Z so OrbitControls stays well-defined and +Y reads "up" on screen.
    if (Math.abs(d.z) > 0.9995) {
      d.y -= 1e-3 * Math.sign(d.z);
      d.normalize();
    }
    const t = this.controls?.target ?? new THREE.Vector3();
    const dist = Math.max(this.camera.position.distanceTo(t), 1e-6);
    this.camera.position.copy(t).addScaledVector(d, dist);
    this.camera.lookAt(t);
    this.controls?.update();
    return true;
  }

  private attachLight() {
    this.dirLight.removeFromParent();
    this.dirLight.target.removeFromParent();
    this.dirLight.position.set(0.35, 0.55, 1);
    this.dirLight.target.position.set(0, 0, 0);
    this.camera.add(this.dirLight);
    this.camera.add(this.dirLight.target);
  }

  private switchProjection() {
    const want = this.getDisplay().projection === 'persp' ? this.persp : this.ortho;
    if (want === this.camera) return;
    const target = this.controls.target.clone();
    const dir = this.currentDir();
    const aspect = this.paneAspect();
    if (want instanceof THREE.PerspectiveCamera) {
      const visHalf = this.halfH / this.ortho.zoom;
      const dist = visHalf / Math.tan(THREE.MathUtils.degToRad(want.fov) / 2);
      want.position.copy(target).addScaledVector(dir, dist);
      want.near = dist * 0.01;
      want.far = dist * 40;
    } else {
      const dist = this.persp.position.distanceTo(target);
      this.halfH = dist * Math.tan(THREE.MathUtils.degToRad(this.persp.fov) / 2);
      want.zoom = 1;
      want.position.copy(target).addScaledVector(dir, Math.max(dist, this.halfH * 8));
      want.near = 0;
      want.far = want.position.distanceTo(target) + this.halfH * 40;
    }
    want.lookAt(target);
    this.camera = want;
    this.attachLight();
    this.controls.object = want;
    this.updateFrustum(aspect);
    this.controls.update();
  }

  // ------------------------------------------------------------------------------------------
  // rendering

  private requestRender() {
    if (this.disposed || this.raf) return;
    const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (f: FrameRequestCallback) => setTimeout(() => f(0), 16) as unknown as number;
    this.raf = raf(() => {
      this.raf = 0;
      this.render();
    });
  }

  private render() {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const r = this.renderer;
    const mode = this.effectiveMode();
    this.ensureBuilt();
    const show = (roles: SceneRole[]) => {
      for (const k of Object.keys(this.roots) as SceneRole[]) this.roots[k].visible = roles.includes(k);
    };
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    r.clear();

    if (mode === 'split') {
      const hw = Math.floor(w / 2);
      this.updateFrustum(hw / h);
      r.setScissorTest(true);
      show(['target']);
      r.setViewport(0, 0, hw, h);
      r.setScissor(0, 0, hw, h);
      r.render(this.scene, this.camera);
      show(['yours']);
      r.setViewport(hw, 0, w - hw, h);
      r.setScissor(hw, 0, w - hw, h);
      r.render(this.scene, this.camera);
      r.setScissorTest(false);
    } else {
      this.updateFrustum(w / h);
      show(this.rolesFor(mode));
      r.setViewport(0, 0, w, h);
      r.render(this.scene, this.camera);
    }

    // axis triad, bottom-left
    this.triadCam.quaternion.copy(this.camera.quaternion);
    this.triadCam.position.set(0, 0, 0);
    this.triadCam.updateMatrixWorld();
    const s = Math.min(TRIAD_PX, w, h);
    r.setScissorTest(true);
    r.setViewport(4, 4, s, s);
    r.setScissor(4, 4, s, s);
    r.clearDepth();
    r.render(this.triadScene, this.triadCam);
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);

    const ld = this.labelRenderer.domElement;
    if (mode === 'split' || this.labelScene.children.length === 0) {
      ld.style.display = 'none';
    } else {
      ld.style.display = '';
      this.labelRenderer.render(this.labelScene, this.camera);
    }
  }

  private buildTriad() {
    const axes: [THREE.Vector3, string, string][] = [
      [new THREE.Vector3(1, 0, 0), COLORS.axisX, 'X'],
      [new THREE.Vector3(0, 1, 0), COLORS.axisY, 'Y'],
      [new THREE.Vector3(0, 0, 1), COLORS.axisZ, 'Z'],
    ];
    for (const [dir, color, text] of axes) {
      const a = new THREE.ArrowHelper(dir, new THREE.Vector3(), 0.95, new THREE.Color(color).getHex(), 0.28, 0.16);
      this.triadScene.add(a);
      this.triadDispose.push(() => a.dispose());
      const tex = textTexture(text, color);
      if (tex) {
        const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
        const sp = new THREE.Sprite(mat);
        sp.position.copy(dir).multiplyScalar(1.22);
        sp.scale.set(0.42, 0.42, 1);
        this.triadScene.add(sp);
        this.triadDispose.push(() => { tex.dispose(); mat.dispose(); });
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // toolbar & keyboard

  private buildToolbar() {
    const bar = document.createElement('div');
    bar.className = 'avp-bar';
    const group = (items: [string, string, string, () => void][]) => {
      const g = document.createElement('div');
      g.className = 'avp-grp';
      for (const [key, label, title, fn] of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'avp-btn';
        b.textContent = label;
        b.title = title;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          fn();
        });
        this.buttons.set(key, b);
        g.appendChild(b);
      }
      bar.appendChild(g);
      return g;
    };
    const sep = () => {
      const s = document.createElement('div');
      s.className = 'avp-sep';
      bar.appendChild(s);
      return s;
    };
    const modes = group([
      ['m:yours', 'Yours', 'Your model', () => this.setMode('yours')],
      ['m:target', 'Target', 'Target model', () => this.setMode('target')],
      ['m:split', 'Split', 'Target left, yours right', () => this.setMode('split')],
      ['m:ghost', 'Ghost', 'Target as translucent ghost under yours', () => this.setMode('ghost')],
    ]);
    modes.dataset.role = 'modes';
    const modeSep = sep();
    modeSep.dataset.role = 'modes';
    group([
      ['v:iso', 'Iso', 'Isometric view (1)', () => this.setView('iso')],
      ['v:front', 'Front', 'Front view, from -Y (2)', () => this.setView('front')],
      ['v:top', 'Top', 'Top view, from +Z (3)', () => this.setView('top')],
      ['v:right', 'Right', 'Right view, from +X (4)', () => this.setView('right')],
    ]);
    sep();
    group([['fit', 'Fit', '/AUTO: fit to window (F)', () => this.fit()]]);
    sep();
    group([
      ['wire', 'Wire', 'Wireframe (W)', () => this.setDisplay({ wireframe: !this.getDisplay().wireframe })],
      ['eshape', 'ESHAPE', '/ESHAPE: show beam sections and shell thickness', () =>
        this.setDisplay({ eshape: !this.getDisplay().eshape })],
      ['labels', 'Labels', 'Toggle entity numbers (/PNUM) for the visible layers', () => this.toggleLabels()],
      ['proj', 'Ortho', 'Toggle orthographic / perspective projection', () =>
        this.setDisplay({ projection: this.getDisplay().projection === 'ortho' ? 'persp' : 'ortho' })],
    ]);
    this.bar = bar;
    this.overlay.appendChild(bar);
  }

  private toggleLabels() {
    const d = this.getDisplay();
    const any = LABEL_KEYS.some((k) => d.labels[k]);
    const labels = { kp: false, line: false, area: false, volu: false, node: false, elem: false };
    if (!any) {
      const layers = this.built.yours?.layers;
      if (layers) for (const k of LABEL_KEYS) labels[k] = !!layers[k];
    }
    this.setDisplay({ labels });
  }

  private refreshUi() {
    const mode = this.effectiveMode();
    const hasTarget = !!this.target;
    const d = this.getDisplay();
    if (this.bar) {
      for (const el of this.bar.querySelectorAll<HTMLElement>('[data-role="modes"]')) {
        el.style.display = hasTarget ? '' : 'none';
      }
      for (const m of ['yours', 'target', 'split', 'ghost'] as ViewMode[]) {
        this.buttons.get(`m:${m}`)?.classList.toggle('on', mode === m);
      }
      this.buttons.get('wire')?.classList.toggle('on', d.wireframe);
      this.buttons.get('eshape')?.classList.toggle('on', d.eshape);
      this.buttons.get('labels')?.classList.toggle('on', LABEL_KEYS.some((k) => d.labels[k]));
      const p = this.buttons.get('proj');
      if (p) p.textContent = d.projection === 'ortho' ? 'Ortho' : 'Persp';
    }
    const split = mode === 'split';
    this.divider.style.display = split ? '' : 'none';
    this.capRight.style.display = split ? '' : 'none';
    this.capLeft.style.display = split || mode === 'target' || mode === 'ghost' ? '' : 'none';
    this.capLeft.textContent = mode === 'ghost' ? 'GHOST: TARGET' : 'TARGET';
    this.capLeft.style.left = split ? '25%' : '50%';
    this.capNote.style.display = this.labelSource?.labelsCapped ? '' : 'none';
  }

  private handleKey(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && t !== this.container && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    switch (e.key) {
      case '1': this.setView('iso'); break;
      case '2': this.setView('front'); break;
      case '3': this.setView('top'); break;
      case '4': this.setView('right'); break;
      case 'f': case 'F': this.fit(); break;
      case 'w': case 'W': this.setDisplay({ wireframe: !this.getDisplay().wireframe }); break;
      default: return;
    }
    e.preventDefault();
  }
}

function textTexture(text: string, color: string): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.font = 'bold 44px ui-monospace, Menlo, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
