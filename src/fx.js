// Pooled particle bursts: coin sparkles, power-up rings and obstacle "poofs".
import * as THREE from 'three';
import { G } from './geo.js';
import { toon, basic } from './materials.js';

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.pool = [];
    this.rings = [];
  }

  get(mat, geo) {
    let p = this.pool.pop();
    if (!p) {
      p = new THREE.Mesh(geo, mat);
      p.userData.v = new THREE.Vector3();
    } else {
      p.geometry = geo;
      p.material = mat;
    }
    p.visible = true;
    this.scene.add(p);
    return p;
  }

  burst(pos, { color = 0xffd34d, n = 8, speed = 5, size = 0.12, life = 0.5, gravity = 10, shape = 'box', up = 3 } = {}) {
    const mat = shape === 'spark' ? basic(color) : toon(color);
    const geo = shape === 'sphere' ? G.sphere(6, 4) : G.box();
    for (let i = 0; i < n; i++) {
      const p = this.get(mat, geo);
      p.position.copy(pos);
      p.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      const a = Math.random() * Math.PI * 2;
      p.userData.v.set(Math.cos(a) * speed * Math.random(), up + Math.random() * speed, Math.sin(a) * speed * Math.random());
      p.userData.life = life * (0.6 + Math.random() * 0.6);
      p.userData.max = p.userData.life;
      p.userData.g = gravity;
      p.userData.s = p.scale.x;
      p.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.parts.push(p);
    }
  }

  ring(pos, color = 0xffffff) {
    const m = new THREE.Mesh(G.torus(0.5, 0.06, 24), basic(color, { opacity: 0.9, transparent: true }));
    m.material = m.material.clone();
    m.position.copy(pos);
    m.rotation.x = Math.PI / 2;
    m.userData.life = 0.45;
    this.scene.add(m);
    this.rings.push(m);
  }

  poof(pos, color = 0xdddddd) {
    this.burst(pos, { color, n: 14, speed: 6, size: 0.35, life: 0.6, gravity: 6, shape: 'sphere', up: 2 });
    this.burst(pos, { color: 0xffd34d, n: 6, speed: 7, size: 0.12, life: 0.4, shape: 'spark' });
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.userData.life -= dt;
      if (p.userData.life <= 0) {
        this.scene.remove(p);
        this.pool.push(p);
        this.parts.splice(i, 1);
        continue;
      }
      p.userData.v.y -= p.userData.g * dt;
      p.position.addScaledVector(p.userData.v, dt);
      p.rotation.x += dt * 6;
      p.scale.setScalar(p.userData.s * (p.userData.life / p.userData.max));
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.userData.life -= dt;
      const k = 1 - r.userData.life / 0.45;
      r.scale.setScalar(1 + k * 4);
      r.material.opacity = Math.max(0, 1 - k);
      if (r.userData.life <= 0) {
        this.scene.remove(r);
        r.material.dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.parts) {
      this.scene.remove(p);
      this.pool.push(p);
    }
    this.parts = [];
    for (const r of this.rings) {
      this.scene.remove(r);
      r.material.dispose();
    }
    this.rings = [];
  }
}
