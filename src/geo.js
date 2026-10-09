// Geometry helpers: cached primitive geometries + tiny mesh builders, and a
// "bake" utility that merges static meshes per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

export const G = {
  box: () => cached('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (seg = 12, top = 0.5, bottom = 0.5) =>
    cached(`cyl-${seg}-${top}-${bottom}`, () => new THREE.CylinderGeometry(top, bottom, 1, seg)),
  sphere: (w = 14, h = 10) => cached(`sph-${w}-${h}`, () => new THREE.SphereGeometry(0.5, w, h)),
  hemi: () => cached('hemi', () => new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
  cone: (seg = 12) => cached(`cone-${seg}`, () => new THREE.ConeGeometry(0.5, 1, seg)),
  plane: () => cached('plane', () => new THREE.PlaneGeometry(1, 1)),
  torus: (r = 0.5, t = 0.12, seg = 16) => cached(`torus-${r}-${t}-${seg}`, () => new THREE.TorusGeometry(r, t, 8, seg)),
  capsule: () => cached('capsule', () => new THREE.CapsuleGeometry(0.5, 1, 4, 10)),
  wedge: (theta = Math.PI / 4) =>
    cached(`wedge-${theta}`, () => new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, 0, theta)),
  ramp: () =>
    cached('ramp', () => {
      // Unit right-triangle prism: rises from z=+0.5 (y=0) to z=-0.5 (y=1).
      const s = new THREE.Shape();
      s.moveTo(0.5, 0);
      s.lineTo(-0.5, 0);
      s.lineTo(-0.5, 1);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      g.rotateY(-Math.PI / 2);
      return g;
    }),
};

/** Create a mesh from a cached geometry, positioned and scaled. */
export function mesh(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}

export function box(mat, w, h, d, x = 0, y = 0, z = 0) {
  return mesh(G.box(), mat, x, y, z, w, h, d);
}

export function cyl(mat, r, h, x = 0, y = 0, z = 0, seg = 12) {
  return mesh(G.cyl(seg), mat, x, y, z, r * 2, h, r * 2);
}

export function sphere(mat, r, x = 0, y = 0, z = 0) {
  return mesh(G.sphere(), mat, x, y, z, r * 2, r * 2, r * 2);
}

export function shadows(obj, cast = true, receive = false) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

/**
 * Merge every mesh under `group` into one mesh per material.
 * Returns a new Group containing the merged meshes (geometry owned by the group).
 */
export function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const tmp = new THREE.Matrix4();
  const add = (mat, g, o) => {
    const key = mat.uuid + (o.receiveShadow ? 'r' : '') + (o.castShadow ? 'c' : '');
    if (!buckets.has(key)) buckets.set(key, { mat, geos: [], cast: o.castShadow, recv: o.receiveShadow });
    buckets.get(key).geos.push(g);
  };
  group.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    tmp.multiplyMatrices(inv, o.matrixWorld);
    g.applyMatrix4(tmp);
    if (!Array.isArray(o.material)) {
      g.clearGroups();
      add(o.material, g, o);
      return;
    }
    // Multi-material mesh: split it into one geometry per material group.
    for (const grp of g.groups) {
      const mat = o.material[grp.materialIndex];
      if (!mat) continue;
      const sub = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const attr = g.attributes[name];
        const sz = attr.itemSize;
        sub.setAttribute(name, new THREE.BufferAttribute(attr.array.slice(grp.start * sz, (grp.start + grp.count) * sz), sz));
      }
      add(mat, sub, o);
    }
    g.dispose();
  });
  const out = new THREE.Group();
  out.position.copy(group.position);
  out.rotation.copy(group.rotation);
  for (const { mat, geos, cast, recv } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = cast;
    m.receiveShadow = recv;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    out.add(m);
  }
  out.userData.baked = true;
  return out;
}

/** Dispose geometries that are not shared/cached. */
export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
  });
}
