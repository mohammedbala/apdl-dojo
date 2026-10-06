// Unit glyph geometries. All point along +Y with their tip at the origin, length 1.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Constraint cone: apex at origin, base at y = -1. */
export function constraintCone(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.32, 1, 10, 1);
  g.translate(0, -0.5, 0);
  return g;
}

/** Rotational constraint: two stacked 4-sided cones, apex at origin. */
export function rotationGlyph(): THREE.BufferGeometry {
  const a = new THREE.ConeGeometry(0.3, 0.5, 4, 1);
  a.translate(0, -0.25, 0);
  const b = new THREE.ConeGeometry(0.3, 0.5, 4, 1);
  b.translate(0, -0.75, 0);
  const g = mergeGeometries([a, b]) ?? a;
  if (g !== a) a.dispose();
  b.dispose();
  return g;
}

function stripToNonIndexedCompatible(gs: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  // mergeGeometries requires all geometries to agree on index presence and attribute sets.
  return gs.map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    if (out !== g) g.dispose();
    out.deleteAttribute('uv');
    return out;
  });
}

/** Arrow: shaft y in [-1,-0.28], head y in [-0.28, 0] with apex at origin. */
export function arrow(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8, 1);
  shaft.translate(0, -0.64, 0);
  const head = new THREE.ConeGeometry(0.11, 0.28, 12, 1);
  head.translate(0, -0.14, 0);
  const parts = stripToNonIndexedCompatible([shaft, head]);
  const g = mergeGeometries(parts) ?? parts[0];
  for (const p of parts) if (p !== g) p.dispose();
  return g;
}

/** Moment arrow: shaft with two heads (ANSYS double-headed moment vector). */
export function momentArrow(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8, 1);
  shaft.translate(0, -0.64, 0);
  const h1 = new THREE.ConeGeometry(0.11, 0.24, 12, 1);
  h1.translate(0, -0.12, 0);
  const h2 = new THREE.ConeGeometry(0.11, 0.24, 12, 1);
  h2.translate(0, -0.34, 0);
  const parts = stripToNonIndexedCompatible([shaft, h1, h2]);
  const g = mergeGeometries(parts) ?? parts[0];
  for (const p of parts) if (p !== g) p.dispose();
  return g;
}

/** Unit cube centred on the origin. */
export function cube(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}
