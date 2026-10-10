// Post-processing: HDR render (with MSAA) -> bloom -> grade (vignette, colour,
// edge speed-blur, hit flash) -> filmic tone mapping + sRGB output.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
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
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSpeed, uVignette, uSaturation, uContrast, uFlash;
    uniform vec3 uTint, uFlashColor;
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
      }
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = max((col - 0.18) * uContrast + 0.18, 0.0);
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
    u.uSaturation.value = ev === 'snow' ? 1.0 : 1.12;
    u.uVignette.value = ev === 'night' ? 0.55 : 0.35;
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

  /** Drop bloom on slow devices (first step of adaptive quality). */
  disableBloom() {
    if (this.enabled && this.bloom.enabled) {
      this.bloom.enabled = false;
      return true;
    }
    return false;
  }
}
