// Post-processing: HDR render (with MSAA) -> bloom -> grade (vignette, colour,
// edge speed-blur, hit flash) -> filmic tone mapping + sRGB output.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

/** Ground-truth AO that ignores sprites, transparent glows and the sky dome. */
class StylizedAOPass extends GTAOPass {
  overrideVisibility() {
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      cache.set(o, o.visible);
      if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO || (o.isMesh && !Array.isArray(o.material) && o.material.transparent)) o.visible = false;
    });
  }

  // AO is soft by nature: compute it at half resolution.
  setSize(w, h) {
    super.setSize(Math.max(1, Math.round(w * 0.5)), Math.max(1, Math.round(h * 0.5)));
  }
}
import { Q } from './quality.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSpeed: { value: 0 },
    uVignette: { value: 0.35 },
    uSaturation: { value: 1.12 },
    uContrast: { value: 1.06 },
    uTint: { value: new THREE.Color(1.0, 0.985, 0.95) },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 0.15, 0.1) },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uSharpen: { value: 0.28 },
    uSunPos: { value: new THREE.Vector2(0.3, 0.8) },
    uRays: { value: 0 },
    uRayColor: { value: new THREE.Color(1.0, 0.86, 0.62) },
    uShadowTone: { value: new THREE.Color(0.96, 0.98, 1.05) },
    uHighTone: { value: new THREE.Color(1.05, 1.0, 0.94) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSpeed, uVignette, uSaturation, uContrast, uFlash, uSharpen, uRays;
    uniform vec2 uTexel, uSunPos;
    uniform vec3 uRayColor;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    uniform vec3 uTint, uFlashColor, uShadowTone, uHighTone;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - vec2(0.5, 0.46);
      float edge = length(dir);
      vec3 col;
      if (uSpeed > 0.002) {
        // radial blur that leaves the centre (the runner) sharp
        float s = uSpeed * 0.09 * smoothstep(0.12, 0.7, edge);
        col = vec3(0.0);
        for (int i = 0; i < 8; i++) col += texture2D(tDiffuse, vUv - dir * s * float(i) / 7.0).rgb;
        col /= 8.0;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
        // contrast-adaptive style sharpening: restores crispness lost to MSAA
        vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb;
        vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
        vec3 e = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb;
        vec3 w = texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb;
        vec3 mn = min(col, min(min(n, s), min(e, w)));
        vec3 mx = max(col, max(max(n, s), max(e, w)));
        vec3 amt = clamp(min(mn, 1.0 - mx) / max(mx, 0.001), 0.0, 1.0);
        col += (col * 4.0 - n - s - e - w) * uSharpen * sqrt(amt) * 0.25;
      }
      // god rays: march toward the sun, gathering bright sky/cloud pixels;
      // buildings in the way are dark, so they cast visible shafts
      if (uRays > 0.01) {
        vec2 toSun = uSunPos - vUv;
        float jitter = hash(vUv * 1000.0);
        vec3 shafts = vec3(0.0);
        float decay = 1.0;
        for (int i = 0; i < 20; i++) {
          vec2 p = vUv + toSun * ((float(i) + jitter) / 20.0) * 0.85;
          vec3 c = texture2D(tDiffuse, clamp(p, 0.001, 0.999)).rgb;
          float lum2 = dot(c, vec3(0.299, 0.587, 0.114));
          shafts += max(lum2 - 0.85, 0.0) * decay;
          decay *= 0.93;
        }
        float fall = 1.0 - smoothstep(0.0, 0.9, length(toSun * vec2(1.6, 1.0)));
        col += uRayColor * shafts * 0.09 * uRays * fall;
      }
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = max((col - 0.18) * uContrast + 0.18, 0.0);
      // cinematic split-tone: cool shadows, warm highlights
      float hl = smoothstep(0.0, 0.35, l);
      col *= mix(uShadowTone, uHighTone, hl);
      col *= uTint;
      col *= mix(1.0, smoothstep(0.95, 0.25, edge), uVignette);
      col = mix(col, uFlashColor * (0.4 + l), uFlash * smoothstep(0.2, 0.75, edge));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = Q.post;
    if (!this.enabled) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: Q.msaa });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    if (Q.ao) {
      this.ao = new StylizedAOPass(scene, camera, size.x, size.y);
      this.ao.blendIntensity = 0.85;
      this.ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.5, scale: 1.2, samples: 12, distanceFallOff: 1 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.composer.addPass(this.ao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * Q.bloomScale, size.y * Q.bloomScale), 0.45, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  setSize(w, h) {
    if (!this.enabled) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.grade.uniforms.uTexel.value.set(1 / (w * this.renderer.getPixelRatio()), 1 / (h * this.renderer.getPixelRatio()));
    this.bloom.setSize(w * this.renderer.getPixelRatio() * Q.bloomScale, h * this.renderer.getPixelRatio() * Q.bloomScale);
  }

  /** Per-event look: night gets stronger bloom, snow is cooler, etc. */
  setMood(ev) {
    if (!this.enabled) return;
    const u = this.grade.uniforms;
    this.bloom.strength = ev === 'night' ? 0.55 : 0.35;
    this.bloom.threshold = ev === 'night' ? 0.85 : 0.95;
    this.bloom.radius = ev === 'night' ? 0.45 : 0.55;
    u.uTint.value.set(...({ night: [0.92, 0.96, 1.08], snow: [0.95, 1.0, 1.06], stpats: [0.98, 1.03, 0.97] }[ev] || [1.0, 0.985, 0.95]));
    u.uSaturation.value = ev === 'snow' ? 1.0 : 1.15;
    u.uShadowTone.value.set(...(ev === 'night' ? [0.9, 0.95, 1.12] : [0.96, 0.98, 1.05]));
    u.uHighTone.value.set(...(ev === 'night' ? [1.08, 1.0, 0.9] : ev === 'snow' ? [1.0, 1.0, 1.0] : [1.05, 1.0, 0.94]));
    u.uVignette.value = ev === 'night' ? 0.55 : 0.35;
  }

  /** Screen-space sun position (0..1) and how strongly to draw shafts. */
  setSun(x, y, strength) {
    if (!this.enabled) return;
    const u = this.grade.uniforms;
    u.uSunPos.value.set(x, y);
    u.uRays.value += (strength - u.uRays.value) * 0.1;
  }

  render(dt, speedFx = 0, flash = 0) {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const u = this.grade.uniforms;
    u.uSpeed.value += (speedFx - u.uSpeed.value) * Math.min(1, dt * 4);
    u.uFlash.value = flash;
    this.composer.render(dt);
  }

  /** Shed the expensive passes on slow devices (first steps of adaptive quality). */
  disableBloom() {
    if (this.ao?.enabled) {
      this.ao.enabled = false;
      return true;
    }
    if (this.enabled && this.bloom.enabled) {
      this.bloom.enabled = false;
      return true;
    }
    return false;
  }

  /** Toggle the expensive passes (used by the game's two-way adaptive quality). */
  setPasses(ao, bloom) {
    if (!this.enabled) return;
    if (this.ao) this.ao.enabled = ao;
    this.bloom.enabled = bloom;
  }
}
