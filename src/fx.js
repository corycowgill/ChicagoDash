// Pooled particle bursts: coin sparkles, power-up rings and obstacle "poofs".
import * as THREE from 'three';
import { G } from './geo.js';
import { toon, basic, sparkleTex, glowTex } from './materials.js';
import { Q } from './quality.js';

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.pool = [];
    this.rings = [];
    this.lines = [];
    this.linePool = [];
    this.lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparkleMat = new THREE.SpriteMaterial({ map: sparkleTex(), color: 0xfff2b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparkles = [];
    this.dusts = [];
  }

  /** Soft dust puff kicked up by sneakers. */
  dust(pos, n = 2, big = false) {
    if (!this.dustMat) this.dustMat = new THREE.SpriteMaterial({ map: glowTex(), color: 0xcfc4b0, transparent: true, depthWrite: false, opacity: 0.5 });
    const count = Math.max(1, Math.round(n * Q.particles));
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(this.dustMat.clone());
      s.position.copy(pos);
      s.userData = { v: new THREE.Vector3((Math.random() - 0.5) * (big ? 3 : 1), Math.random() * (big ? 1.2 : 0.6), Math.random() * 1.5), life: big ? 0.7 : 0.45, max: big ? 0.7 : 0.45, size: big ? 1.1 : 0.6 };
      s.scale.setScalar(0.2);
      this.scene.add(s);
      this.dusts.push(s);
    }
  }

  /** Four-point twinkle that pops and fades (coins, power-ups). */
  twinkle(pos, scale = 0.9) {
    const s = new THREE.Sprite(this.sparkleMat);
    s.position.copy(pos);
    s.userData.life = 0.35;
    s.userData.scale = scale;
    s.scale.setScalar(0.01);
    this.scene.add(s);
    this.sparkles.push(s);
  }

  /** Streaks rushing past the camera at high speed. intensity 0..1. */
  speedLines(dt, camera, intensity) {
    if (intensity > 0.02 && Math.random() < intensity * 1.6 * Q.particles) {
      let m = this.linePool.pop();
      if (!m) m = new THREE.Mesh(G.box(), this.lineMat);
      const a = Math.random() * Math.PI * 2;
      const r = 2.2 + Math.random() * 3.5;
      m.position.set(camera.position.x + Math.cos(a) * r, Math.max(0.3, camera.position.y - 1 + Math.sin(a) * r * 0.7), camera.position.z - 30 - Math.random() * 10);
      m.scale.set(0.025, 0.025, 2 + Math.random() * 3);
      this.scene.add(m);
      this.lines.push(m);
    }
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const m = this.lines[i];
      m.position.z += dt * 80;
      if (m.position.z > camera.position.z + 1) {
        this.scene.remove(m);
        this.linePool.push(m);
        this.lines.splice(i, 1);
      }
    }
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
      p.userData.keepSize = false;
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

  /** A sheet of newspaper (or a leaf) caught in a Windy City gust. */
  paper(pos, color = 0xf2efe6) {
    const p = this.get(basic(color, { side: THREE.DoubleSide }), G.plane());
    p.position.copy(pos);
    p.scale.set(0.5, 0.35, 1);
    p.userData.v.set(16 + Math.random() * 8, Math.random() * 2, (Math.random() - 0.5) * 3);
    p.userData.life = p.userData.max = 1.6;
    p.userData.g = 0.5;
    p.userData.s = 0.5;
    p.userData.keepSize = true;
    p.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.parts.push(p);
  }

  poof(pos, color = 0xdddddd) {
    this.burst(pos, { color, n: 14, speed: 6, size: 0.35, life: 0.6, gravity: 6, shape: 'sphere', up: 2 });
    this.burst(pos, { color: 0xffd34d, n: 6, speed: 7, size: 0.12, life: 0.4, shape: 'spark' });
  }

  update(dt) {
    for (let i = this.dusts.length - 1; i >= 0; i--) {
      const s = this.dusts[i];
      const u = s.userData;
      u.life -= dt;
      if (u.life <= 0) {
        this.scene.remove(s);
        s.material.dispose();
        this.dusts.splice(i, 1);
        continue;
      }
      const k = 1 - u.life / u.max;
      s.position.addScaledVector(u.v, dt);
      s.scale.setScalar(0.2 + u.size * k);
      s.material.opacity = 0.45 * (1 - k);
    }
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.userData.life -= dt;
      const k = s.userData.life / 0.35;
      s.scale.setScalar(Math.sin(k * Math.PI) * s.userData.scale);
      s.material.rotation = k * 2;
      if (s.userData.life <= 0) {
        this.scene.remove(s);
        this.sparkles.splice(i, 1);
      }
    }
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
      if (!p.userData.keepSize) p.scale.setScalar(p.userData.s * (p.userData.life / p.userData.max));
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
    for (const s of this.sparkles) this.scene.remove(s);
    this.sparkles = [];
    for (const s of this.dusts) {
      this.scene.remove(s);
      s.material.dispose();
    }
    this.dusts = [];
    for (const m of this.lines) {
      this.scene.remove(m);
      this.linePool.push(m);
    }
    this.lines = [];
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
