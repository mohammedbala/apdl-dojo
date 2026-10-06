// Growable typed-array builders used by the scene builder (no per-entity objects).
import * as THREE from 'three';

export class F32 {
  a: Float32Array;
  n = 0;
  constructor(cap = 256) {
    this.a = new Float32Array(cap);
  }
  ensure(k: number) {
    if (this.n + k <= this.a.length) return;
    let c = this.a.length * 2;
    while (c < this.n + k) c *= 2;
    const b = new Float32Array(c);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
  p3(x: number, y: number, z: number) {
    if (this.n + 3 > this.a.length) this.ensure(3);
    const a = this.a;
    const n = this.n;
    a[n] = x;
    a[n + 1] = y;
    a[n + 2] = z;
    this.n = n + 3;
  }
  get length() {
    return this.n;
  }
  out(): Float32Array {
    return this.a.slice(0, this.n);
  }
}

export class U32 {
  a: Uint32Array;
  n = 0;
  constructor(cap = 256) {
    this.a = new Uint32Array(cap);
  }
  push(v: number) {
    if (this.n >= this.a.length) {
      const b = new Uint32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.n++] = v;
  }
  out(): Uint32Array {
    return this.a.slice(0, this.n);
  }
}

/** Non-indexed triangle soup with flat normals and per-vertex colours. */
export class TriSoup {
  pos = new F32(1024);
  nrm = new F32(1024);
  col = new F32(1024);
  get vertexCount() {
    return this.pos.n / 3;
  }
  /** Append a triangle with given normal and colour. Points are flat [x,y,z] arrays. */
  tri(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>, n: ArrayLike<number>, col: THREE.Color) {
    this.pos.p3(a[0], a[1], a[2]);
    this.pos.p3(b[0], b[1], b[2]);
    this.pos.p3(c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) {
      this.nrm.p3(n[0], n[1], n[2]);
      this.col.p3(col.r, col.g, col.b);
    }
  }
  /** Convex polygon (fan triangulated) with a flat normal. */
  poly(pts: ArrayLike<number>[], n: ArrayLike<number>, col: THREE.Color) {
    for (let i = 1; i + 1 < pts.length; i++) this.tri(pts[0], pts[i], pts[i + 1], n, col);
  }
  geometry(): THREE.BufferGeometry | null {
    if (this.pos.n === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.out(), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.out(), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.out(), 3));
    return g;
  }
}

/** Indexed triangle mesh with smooth (accumulated) normals and per-vertex colours. */
export class IndexedSoup {
  pos = new F32(1024);
  nrm = new F32(1024);
  col = new F32(1024);
  idx = new U32(1024);
  get vertexCount() {
    return this.pos.n / 3;
  }
  geometry(): THREE.BufferGeometry | null {
    if (this.idx.n === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.out(), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.out(), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.out(), 3));
    g.setIndex(new THREE.BufferAttribute(this.idx.out(), 1));
    return g;
  }
}

/** LineSegments buffer: pairs of vertices with per-vertex colours. */
export class SegSoup {
  pos = new F32(1024);
  col = new F32(1024);
  get segmentCount() {
    return this.pos.n / 6;
  }
  seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, c: THREE.Color) {
    this.pos.p3(ax, ay, az);
    this.pos.p3(bx, by, bz);
    this.col.p3(c.r, c.g, c.b);
    this.col.p3(c.r, c.g, c.b);
  }
  geometry(): THREE.BufferGeometry | null {
    if (this.pos.n === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.out(), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.out(), 3));
    return g;
  }
}

export class PointSoup {
  pos = new F32(256);
  col = new F32(256);
  pt(x: number, y: number, z: number, c?: THREE.Color) {
    this.pos.p3(x, y, z);
    if (c) this.col.p3(c.r, c.g, c.b);
  }
  geometry(): THREE.BufferGeometry | null {
    if (this.pos.n === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.out(), 3));
    if (this.col.n === this.pos.n) g.setAttribute('color', new THREE.BufferAttribute(this.col.out(), 3));
    return g;
  }
}
