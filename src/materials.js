// Shared materials and procedurally painted canvas textures.
// On medium/high quality every material is physically based (it reflects the
// sky environment and gets normal-mapped relief); on low it falls back to cheap
// cartoon shading. Everything is cached so chunks of the city can be rebuilt
// endlessly without allocating new GPU resources.
import * as THREE from 'three';
import { Q } from './quality.js';

// ---------------------------------------------------------------------------
// Aerial perspective: replace three's flat distance fog, engine-wide, with one
// that warms toward the sun and thins as you look up. Tower bases melt into the
// haze while their crowns stay crisp, which gives the city real depth.
THREE.ShaderChunk.fog_pars_vertex += '\n#ifdef USE_FOG\nvarying vec3 vFogDir;\n#endif\n';
THREE.ShaderChunk.fog_vertex += '\n#ifdef USE_FOG\nvFogDir = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;\n#endif\n';
THREE.ShaderChunk.fog_pars_fragment += '\n#ifdef USE_FOG\nvarying vec3 vFogDir;\n#endif\n';
THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 fogDirN = normalize( vFogDir );
  float sunward = pow( max( dot( fogDirN, normalize( vec3( -0.5, 0.25, -0.83 ) ) ), 0.0 ), 5.0 );
  vec3 hazeColor = mix( fogColor, fogColor * vec3( 1.22, 1.04, 0.82 ), sunward );
  fogFactor *= mix( 1.0, 0.55, smoothstep( 0.0, 0.45, fogDirN.y ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeColor, fogFactor );
#endif
`;

let gradientMap = null;
function getGradient() {
  if (gradientMap) return gradientMap;
  // 4-step ramp gives the chunky cartoon shading.
  const data = new Uint8Array([90, 90, 90, 255, 160, 160, 160, 255, 220, 220, 220, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const matCache = new Map();
/** Night-sensitive materials (glowing windows, bulbs, signs). */
export const glowMaterials = new Set();

/**
 * Stylized shading shared by every physically based material: a sky-tinted
 * fresnel rim that makes silhouettes pop (the signature of stylized AAA
 * games), plus a soft terminator so shadows fall off gently instead of
 * snapping to black. Uniforms are shared, so changing the mood is instant.
 */
export const STYLE = {
  uRimColor: { value: new THREE.Color(0.75, 0.88, 1.0) },
  uRimStrength: { value: 0.26 },
  uRimPower: { value: 2.6 },
  uFill: { value: new THREE.Color(0.32, 0.38, 0.5) },
};

function stylize(shader) {
  shader.uniforms.uRimColor = STYLE.uRimColor;
  shader.uniforms.uRimStrength = STYLE.uRimStrength;
  shader.uniforms.uRimPower = STYLE.uRimPower;
  shader.uniforms.uFill = STYLE.uFill;
  shader.uniforms.uRimBoost = { value: this.userData.rimBoost ?? 1 };
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRimStrength; uniform float uRimPower; uniform vec3 uFill; uniform float uRimBoost;')
    .replace(
      '#include <opaque_fragment>',
      `{
        vec3 vdir = normalize(vViewPosition);
        float ndv = saturate(dot(normal, vdir));
        float rim = pow(1.0 - ndv, uRimPower) * uRimStrength * uRimBoost;
        // soft cool fill lifts the shadow side so it reads as coloured, not black
        float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        outgoingLight += diffuseColor.rgb * uFill * (1.0 - smoothstep(0.0, 0.06, lum)) * 0.25;
        outgoingLight += uRimColor * rim * (0.6 + 0.4 * diffuseColor.rgb);
      }
      #include <opaque_fragment>`,
    );
}

// Under filmic tone mapping glows need more energy to read (and to bloom).
const GLOW_BOOST = 1.5;

/**
 * Cached scene material (the name is historical: on low quality it is a toon
 * material, otherwise a MeshStandardMaterial).
 * @param {number|string} color
 * @param {object} [opts] { emissive, emissiveIntensity, map, emissiveMap, normalMap, opacity, side,
 *   nightGlow, roughness, metalness, env, normalScale }
 */
export function toon(color, opts = {}) {
  const normalMap = opts.normalMap ?? null;
  const bump = opts.map ? BUMP.get(opts.map) : undefined;
  const key = `${color}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? ''}|${opts.map?.uuid ?? ''}|${opts.emissiveMap?.uuid ?? ''}|${opts.opacity ?? ''}|${opts.nightGlow ?? ''}|${opts.side ?? ''}|${opts.roughness ?? ''}|${opts.metalness ?? ''}|${normalMap?.uuid ?? ''}|${opts.env ?? ''}|${opts.rim ?? ''}`;
  let m = matCache.get(key);
  if (m) return m;
  const boost = Q.pbr ? GLOW_BOOST : 1;
  const common = {
    color,
    map: opts.map ?? null,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: (opts.emissiveIntensity ?? 1) * (opts.nightGlow !== undefined ? boost : Q.pbr ? 1.4 : 1),
    emissiveMap: opts.emissiveMap ?? null,
    transparent: opts.opacity !== undefined && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  };
  if (Q.pbr) {
    m = new THREE.MeshStandardMaterial({
      ...common,
      roughness: opts.roughness ?? 0.78,
      metalness: opts.metalness ?? 0,
      envMapIntensity: opts.env ?? 1,
      normalMap,
      normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
      bumpMap: bump ? opts.map : null,
      bumpScale: bump ? bump * 0.35 : 1,
    });
    m.userData.rimBoost = opts.rim ?? 1;
    m.onBeforeCompile = stylize;
    m.customProgramCacheKey = () => 'stylized-v1';
  } else {
    m = new THREE.MeshToonMaterial({ ...common, gradientMap: getGradient() });
  }
  if (opts.nightGlow !== undefined) {
    // Materials that light up after dark: store day/night intensities.
    m.userData.dayGlow = (opts.emissiveIntensity ?? 0) * boost;
    m.userData.nightGlow = opts.nightGlow * boost;
    glowMaterials.add(m);
  }
  matCache.set(key, m);
  return m;
}

/** Unlit material for things that should always look bright (signs, bulbs). */
const basicCache = new Map();
export function basic(color, opts = {}) {
  const key = `${color}|${opts.map?.uuid ?? ''}|${opts.opacity ?? ''}|${opts.side ?? ''}`;
  let m = basicCache.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({
    color,
    map: opts.map ?? null,
    transparent: opts.opacity !== undefined && opts.opacity < 1 || !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    fog: opts.fog ?? true,
    depthWrite: opts.depthWrite ?? true,
  });
  basicCache.set(key, m);
  return m;
}

/** Additive glow sprites (lamp halos, light pools) that only show after dark. */
const nightOnly = new Set();
export function nightGlowMat(color = 0xffd27a, strength = 1) {
  const key = `nightglow-${color}-${strength}`;
  let m = basicCache.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(strength),
    map: glowTex(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });
  m.visible = false;
  nightOnly.add(m);
  basicCache.set(key, m);
  return m;
}

export function setNight(isNight) {
  for (const m of glowMaterials) {
    m.emissiveIntensity = isNight ? m.userData.nightGlow : m.userData.dayGlow;
  }
  for (const m of nightOnly) m.visible = isNight;
}

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------
const texCache = new Map();
/**
 * Surface relief is derived on the GPU from each painted texture (bump mapping
 * reads the colour map itself), so no pixels are ever read back on the CPU.
 * Bump strength per texture lives here rather than in texture.userData, which
 * three deep-copies through JSON on every clone.
 */
const BUMP = new WeakMap();

function canvasTex(key, w, h, draw, { repeat = null, srgb = true, bump = 0 } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Q.anisotropy;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  if (bump && Q.pbr) BUMP.set(t, bump);
  texCache.set(key, t);
  return t;
}

// Deterministic tiny PRNG so textures look the same every session.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Building facade with a window grid. Returns { map, emissiveMap }; the map
 * carries an auto-generated normal map so window recesses, sills and mortar
 * catch the light.
 * style: 'glass' | 'brick' | 'stone' | 'dark'
 */
export function facade(style, base, seed = 1) {
  const key = `facade-${style}-${base}-${seed}`;
  if (texCache.has(key)) return texCache.get(key);
  const cols = style === 'brick' ? 4 : 6;
  const rows = style === 'brick' ? 6 : 12;
  const W = 512;
  const H = 1024;
  const r = rng(seed * 977 + cols);
  const lit = [];
  const cw = W / cols;
  const rh = H / rows;
  // Painted in 512x1024 design units onto a half-size canvas: 4x cheaper to
  // raster and still crisp on a building face with anisotropic filtering.
  const map = canvasTex(key + '-map', W / 2, H / 2, (g) => {
    g.scale(0.5, 0.5);
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // weathering: soft vertical streaks and grime near the bottom of each floor
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.04})`;
      g.fillRect(r() * W, r() * H, 2 + r() * 6, 30 + r() * 120);
    }
    if (style === 'brick') {
      for (let y = 0; y < H; y += 12) {
        for (let x = ((y / 12) % 2) * 12 - 12; x < W; x += 24) {
          g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.08})`;
          g.fillRect(x + 1, y + 1, 22, 10);
        }
      }
      g.fillStyle = 'rgba(40,20,10,0.35)';
      for (let y = 0; y < H; y += 12) {
        g.fillRect(0, y, W, 2);
        for (let x = ((y / 12) % 2) * 12; x < W; x += 24) g.fillRect(x, y, 2, 12);
      }
    } else if (style === 'stone') {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let y = 0; y < H; y += rh / 2) g.fillRect(0, y, W, 2);
    } else if (style === 'glass' || style === 'dark') {
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, 'rgba(255,255,255,0.22)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(255,255,255,0.12)');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const isLit = r() < 0.45;
        lit.push(isLit);
        if (style === 'glass' || style === 'dark') {
          // curtain wall: tinted panes, mullions, a spandrel band per floor
          const pane = style === 'dark' ? (r() < 0.5 ? '#2a3550' : '#33405e') : r() < 0.5 ? '#9fd0f5' : '#78acdc';
          g.fillStyle = pane;
          g.fillRect(x * cw + 3, y * rh + 3, cw - 6, rh * 0.78);
          const refl = g.createLinearGradient(x * cw, y * rh, x * cw + cw, y * rh + rh);
          refl.addColorStop(0, 'rgba(255,255,255,0.45)');
          refl.addColorStop(0.45, 'rgba(255,255,255,0.05)');
          refl.addColorStop(1, 'rgba(255,255,255,0.18)');
          g.fillStyle = refl;
          g.fillRect(x * cw + 3, y * rh + 3, cw - 6, rh * 0.78);
          g.fillStyle = style === 'dark' ? '#1a1f2b' : '#55708f';
          g.fillRect(x * cw, y * rh + rh * 0.8, cw, rh * 0.2); // spandrel
          g.fillRect(x * cw, y * rh, 3, rh); // mullion
        } else {
          const px = x * cw + cw * 0.2;
          const py = y * rh + rh * 0.2;
          const ww = cw * 0.6;
          const wh = rh * 0.56;
          // lintel, frame, glass, reflection, glazing bars, sill
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(px - 6, py - 10, ww + 12, 7);
          g.fillStyle = style === 'brick' ? '#efe6d6' : '#5a4a3a';
          g.fillRect(px - 4, py - 4, ww + 8, wh + 8);
          g.fillStyle = '#1d2a3c';
          g.fillRect(px, py, ww, wh);
          const gl = g.createLinearGradient(px, py, px + ww, py + wh);
          gl.addColorStop(0, r() < 0.5 ? '#a9d3f2' : '#c8e4fa');
          gl.addColorStop(1, '#4d7398');
          g.fillStyle = gl;
          g.fillRect(px + 2, py + 2, ww - 4, wh - 4);
          if (r() < 0.35) {
            g.fillStyle = r() < 0.5 ? '#e9dcc0' : '#d9e4ea'; // blinds half down
            g.fillRect(px + 2, py + 2, ww - 4, (wh - 4) * (0.3 + r() * 0.5));
          }
          g.fillStyle = style === 'brick' ? '#efe6d6' : '#5a4a3a';
          g.fillRect(px + ww / 2 - 2, py, 4, wh);
          g.fillRect(px, py + wh / 2 - 2, ww, 4);
          g.fillStyle = 'rgba(255,255,255,0.75)';
          g.fillRect(px - 8, py + wh + 4, ww + 16, 8);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(px - 8, py + wh + 12, ww + 16, 4);
        }
      }
    }
  }, { bump: 3 });
  const emissiveMap = canvasTex(key + '-em', W / 2, H / 2, (g) => {
    g.scale(0.5, 0.5);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    let i = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (lit[i++]) {
          g.fillStyle = i % 3 ? '#ffcf73' : i % 5 ? '#fff1c4' : '#bfe6ff';
          if (style === 'glass' || style === 'dark') g.fillRect(x * cw + 3, y * rh + 3, cw - 6, rh * 0.78);
          else g.fillRect(x * cw + cw * 0.2 + 2, y * rh + rh * 0.2 + 2, cw * 0.6 - 4, rh * 0.56 - 4);
        }
      }
    }
  });
  const out = { map, emissiveMap };
  texCache.set(key, out);
  return out;
}

/** Facade textures tiled to a building's size (clones share the GPU image). */
export function facadeTiled(style, base, seed, faceW, h) {
  const f = facade(style, base, seed);
  const rows = style === 'brick' ? 6 : 12;
  const cols = style === 'brick' ? 4 : 6;
  const ry = Math.max(0.5, Math.round((h / (rows * 3.3)) * 2) / 2);
  const rx = Math.max(0.5, Math.round((faceW / (cols * 2.2)) * 2) / 2);
  const key = `facade-tiled-${style}-${base}-${seed}-${rx}-${ry}`;
  if (texCache.has(key)) return texCache.get(key);
  const clone = (t) => {
    const c = t.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    if (BUMP.has(t)) BUMP.set(c, BUMP.get(t));
    return c;
  };
  const out = { map: clone(f.map), emissiveMap: clone(f.emissiveMap) };
  texCache.set(key, out);
  return out;
}

export function chicagoFlagTex() {
  return canvasTex('flag', 256, 160, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#6ec6f0';
    g.fillRect(0, h * 0.16, w, h * 0.13);
    g.fillRect(0, h * 0.71, w, h * 0.13);
    g.fillStyle = '#e4002b';
    for (let i = 0; i < 4; i++) star6(g, w * (0.2 + i * 0.2), h * 0.5, h * 0.14);
  });
}

function star6(g, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI / 6) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.5;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function star5(g, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

export function coinFaceTex(green = false) {
  // 256x128 atlas: star face on the left, rim colour on the right.
  return canvasTex('coin' + green, 256, 128, (g) => {
    const w = 128;
    g.fillStyle = green ? '#2d9c3a' : '#e8a200';
    g.fillRect(128, 0, 128, 128);
    const grad = g.createRadialGradient(w * 0.4, w * 0.35, 4, w / 2, w / 2, w / 2);
    grad.addColorStop(0, green ? '#b8ff9c' : '#fff3a0');
    grad.addColorStop(0.6, green ? '#3fbf3f' : '#ffc61a');
    grad.addColorStop(1, green ? '#1f7a2a' : '#d88a00');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
    g.strokeStyle = green ? '#145c1d' : '#b06a00';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(w / 2, w / 2, w * 0.4, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = green ? '#e9ffe0' : '#fff7c8';
    star5(g, w / 2, w / 2 + 3, w * 0.3);
    g.fillStyle = green ? '#2d9c3a' : '#f0a800';
    star5(g, w / 2, w / 2 + 3, w * 0.22);
  });
}

export function signTex(key, w, h, draw) {
  return canvasTex('sign-' + key, w, h, draw);
}

export function marqueeTex(text, { bg = '#c8102e', fg = '#fff4c2', bulbs = true, w = 512, h = 128, font = 'bold 64px "Arial Black", Impact, sans-serif', sub = null } = {}) {
  return canvasTex(`marquee-${text}-${bg}-${sub}`, w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd34d';
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    if (bulbs) {
      g.fillStyle = '#fff6b0';
      for (let x = 14; x < w - 8; x += 20) {
        g.beginPath();
        g.arc(x, 14, 4, 0, Math.PI * 2);
        g.arc(x, h - 14, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = font;
    if (sub) {
      g.fillText(text, w / 2, h * 0.38);
      g.font = 'bold 34px Arial, sans-serif';
      g.fillText(sub, w / 2, h * 0.72);
    } else {
      g.fillText(text, w / 2, h / 2 + 4);
    }
  });
}

export function verticalChicagoTex() {
  return canvasTex('vchicago', 96, 512, (g, w, h) => {
    g.fillStyle = '#d4202a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff3b0';
    for (let y = 10; y < h; y += 18) {
      g.beginPath();
      g.arc(8, y, 4, 0, Math.PI * 2);
      g.arc(w - 8, y, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#fff8dc';
    g.font = 'bold 62px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    'CHICAGO'.split('').forEach((ch, i) => g.fillText(ch, w / 2, 40 + i * 70));
  });
}

export function shelterAdTex() {
  return canvasTex('shelter-ad', 256, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#5fb4ff');
    grad.addColorStop(1, '#cbe8ff');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d3557';
    const r = rng(42);
    for (let x = 0; x < w; x += 18) {
      const bh = 40 + r() * 110;
      g.fillRect(x, h * 0.75 - bh, 15, bh);
    }
    g.fillRect(110, h * 0.75 - 175, 26, 175); // Willis-style
    g.fillRect(116, h * 0.75 - 200, 3, 25);
    g.fillRect(127, h * 0.75 - 200, 3, 25);
    g.fillStyle = '#0b3d91';
    g.fillRect(0, h * 0.75, w, h * 0.25);
    g.fillStyle = '#fff';
    g.font = 'bold 44px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.fillText('CHICAGO', w / 2, h * 0.93);
  });
}

export function waterTex(color = '#2f8fd8') {
  return canvasTex('water-' + color, 128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    const r = rng(7);
    for (let i = 0; i < 14; i++) {
      const x = r() * w;
      const y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 8, y - 4, x + 18, y);
      g.stroke();
    }
  }, { repeat: [6, 30] });
}

export function trackTex() {
  return canvasTex('track', 256, 256, (g, w, h) => {
    g.fillStyle = '#6b5a4a';
    g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let i = 0; i < 2600; i++) {
      const v = 70 + r() * 70;
      g.fillStyle = `rgb(${v + 20},${v + 8},${v - 6})`;
      g.beginPath();
      g.arc(r() * w, r() * h, 1 + r() * 2.2, 0, Math.PI * 2);
      g.fill();
    }
    for (let y = 8; y < h; y += 64) {
      // creosote ties with grain, bolts and tie plates
      g.fillStyle = '#3d2a1d';
      g.fillRect(10, y, w - 20, 28);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      for (let k = 0; k < 6; k++) g.fillRect(10, y + 3 + k * 4, w - 20, 1);
      g.fillStyle = '#2a2a2e';
      for (const x of [56, 182]) {
        g.fillRect(x - 14, y + 4, 28, 20);
        g.fillStyle = '#777';
        g.fillRect(x - 10, y + 7, 4, 4);
        g.fillRect(x + 6, y + 17, 4, 4);
        g.fillStyle = '#2a2a2e';
      }
    }
  }, { repeat: [1, 8], bump: 4 });
}

export function paverTex(base = '#c9b9a0') {
  return canvasTex('paver-' + base, 256, 256, (g, w, h) => {
    const c = new THREE.Color(base);
    const r = rng(base.length * 31);
    g.fillStyle = '#7d7466';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      for (let x = ((y / 32) % 2) * 32 - 32; x < w; x += 64) {
        const k = 0.9 + r() * 0.2;
        g.fillStyle = `rgb(${Math.min(255, c.r * 255 * k)},${Math.min(255, c.g * 255 * k)},${Math.min(255, c.b * 255 * k)})`;
        g.fillRect(x + 2, y + 2, 60, 28);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x + 2, y + 2, 60, 3);
        g.fillStyle = 'rgba(0,0,0,0.08)';
        for (let i = 0; i < 12; i++) g.fillRect(x + 2 + r() * 58, y + 2 + r() * 26, 2, 2);
      }
    }
  }, { repeat: [4, 14], bump: 3.5 });
}

export function asphaltTex() {
  return canvasTex('asphalt', 512, 512, (g, w, h) => {
    g.fillStyle = '#4b4f58';
    g.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let i = 0; i < 6000; i++) {
      const v = 60 + r() * 40;
      g.fillStyle = `rgb(${v},${v + 3},${v + 10})`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    // patched sections, oil stains and hairline cracks
    for (let i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(30,32,38,0.35)';
      g.fillRect(r() * w, r() * h, 40 + r() * 80, 20 + r() * 60);
    }
    for (let i = 0; i < 6; i++) {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
      gr.addColorStop(0, 'rgba(20,20,25,0.35)');
      gr.addColorStop(1, 'rgba(20,20,25,0)');
      g.save();
      g.translate(r() * w, r() * h);
      g.fillStyle = gr;
      g.fillRect(-30, -30, 60, 60);
      g.restore();
    }
    g.strokeStyle = 'rgba(15,15,20,0.6)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      let x = r() * w;
      let y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * 40;
        y += (r() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // dashed lane dividers at 1/3 and 2/3
    g.fillStyle = '#f2ecd8';
    for (let y = 0; y < h; y += 128) {
      g.fillRect(w / 3 - 5, y, 10, 72);
      g.fillRect((2 * w) / 3 - 5, y, 10, 72);
    }
  }, { repeat: [1, 3], bump: 2.5 });
}

export function grassTex(base = '#5cbf4a') {
  return canvasTex('grass-' + base, 256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 3500; i++) {
      const light = r() < 0.5;
      g.strokeStyle = light ? 'rgba(255,255,230,0.12)' : 'rgba(0,30,0,0.14)';
      g.lineWidth = 1;
      const x = r() * w;
      const y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4);
      g.stroke();
    }
    for (let i = 0; i < 18; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(255,220,60,0.8)'; // clover & dandelions
      g.beginPath();
      g.arc(r() * w, r() * h, 1.5, 0, Math.PI * 2);
      g.fill();
    }
  }, { repeat: [4, 8], bump: 2 });
}

export function stripesTex(a = '#e63946', b = '#ffffff', n = 6) {
  return canvasTex(`stripes-${a}-${b}-${n}`, 256, 64, (g, w, h) => {
    g.fillStyle = b;
    g.fillRect(0, 0, w, h);
    g.fillStyle = a;
    const sw = w / n;
    for (let i = -1; i < n + 1; i++) {
      g.beginPath();
      g.moveTo(i * sw, h);
      g.lineTo(i * sw + sw / 2, h);
      g.lineTo(i * sw + sw / 2 + h, 0);
      g.lineTo(i * sw + h, 0);
      g.fill();
    }
  });
}

export function trainFrontTex() {
  return canvasTex('train-front', 512, 512, (g, w, h) => {
    const body = g.createLinearGradient(0, 0, w, 0);
    body.addColorStop(0, '#aeb5be');
    body.addColorStop(0.5, '#d9dee4');
    body.addColorStop(1, '#aeb5be');
    g.fillStyle = body;
    g.fillRect(0, 0, w, h);
    // destination sign
    g.fillStyle = '#1b2735';
    g.fillRect(0, 0, w, 74);
    g.fillStyle = '#ffb703';
    g.font = 'bold 50px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Loop', w / 2, 38);
    // windshield panes with rubber gaskets and reflections
    for (const x of [44, 284]) {
      g.fillStyle = '#0f1620';
      g.beginPath();
      g.roundRect(x - 6, 96, 196, 196, 18);
      g.fill();
      const gl = g.createLinearGradient(x, 100, x + 184, 288);
      gl.addColorStop(0, '#3d5875');
      gl.addColorStop(0.45, '#1a2737');
      gl.addColorStop(1, '#2b4058');
      g.fillStyle = gl;
      g.beginPath();
      g.roundRect(x, 102, 184, 184, 14);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.moveTo(x + 20, 110); g.lineTo(x + 90, 110); g.lineTo(x + 30, 270); g.lineTo(x + 10, 270);
      g.fill();
    }
    g.fillStyle = '#8b939c';
    g.fillRect(236, 96, 40, 340); // door seam
    // lamps, number plate and bumper stripes
    for (const [x, c, r] of [[80, '#fff6c4', 26], [432, '#fff6c4', 26], [144, '#ff3b30', 15], [368, '#ff3b30', 15]]) {
      g.fillStyle = '#2b2f36';
      g.beginPath(); g.arc(x, 380, r + 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = c;
      g.beginPath(); g.arc(x, 380, r, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ffffff';
    g.fillRect(206, 320, 100, 40);
    g.fillStyle = '#1b2735';
    g.font = 'bold 30px Arial, sans-serif';
    g.fillText('3241', 256, 341);
    g.fillStyle = '#e4002b';
    g.fillRect(0, 456, w, 22);
    g.fillStyle = '#4fa3e0';
    g.fillRect(0, 478, w, 22);
    g.fillStyle = '#2b2f36';
    g.fillRect(0, 500, w, 12);
  }, { bump: 1.5 });
}

export function trainSideTex() {
  return canvasTex('train-side', 1024, 256, (g, w, h) => {
    const body = g.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, '#e1e5ea');
    body.addColorStop(0.55, '#c3c9d0');
    body.addColorStop(1, '#9ea6af');
    g.fillStyle = body;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.07)';
    for (let x = 0; x < w; x += 8) g.fillRect(x, 150, 2, h - 150); // fluted lower panels
    // windows with gaskets and interior silhouettes
    for (let x = 40; x < w - 80; x += 140) {
      if (Math.abs(x + 50 - w * 0.33) < 70 || Math.abs(x + 50 - w * 0.69) < 70) continue;
      g.fillStyle = '#0f1620';
      g.beginPath(); g.roundRect(x - 4, 40, 108, 84, 10); g.fill();
      const gl = g.createLinearGradient(x, 44, x + 100, 120);
      gl.addColorStop(0, '#4a6a8c');
      gl.addColorStop(1, '#1b2a3c');
      g.fillStyle = gl;
      g.beginPath(); g.roundRect(x, 44, 100, 76, 8); g.fill();
      g.fillStyle = 'rgba(20,25,35,0.6)';
      g.beginPath(); g.arc(x + 35, 120, 16, Math.PI, 0); g.arc(x + 72, 120, 14, Math.PI, 0); g.fill(); // riders
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(x + 8, 48, 16, 68);
    }
    // doors: two leaves, windows, rubber edges
    for (const cx of [w * 0.33, w * 0.69]) {
      g.fillStyle = '#9aa2ab';
      g.fillRect(cx - 54, 30, 108, 206);
      g.fillStyle = '#2b2f36';
      g.fillRect(cx - 2, 30, 4, 206);
      for (const dx of [-44, 8]) {
        g.fillStyle = '#1b2a3c';
        g.beginPath(); g.roundRect(cx + dx, 46, 36, 90, 6); g.fill();
      }
    }
    // CTA-style stripes and the car number
    g.fillStyle = '#e4002b';
    g.fillRect(0, 200, w, 14);
    g.fillStyle = '#4fa3e0';
    g.fillRect(0, 214, w, 14);
    g.fillStyle = '#1b2735';
    g.font = 'bold 26px Arial, sans-serif';
    g.fillText('3241', w - 110, 176);
  }, { bump: 1.5 });
}

export function brickTex(base = '#a2472f') {
  return canvasTex('brick-' + base, 256, 256, (g, w, h) => {
    const c = new THREE.Color(base);
    const r = rng(17);
    g.fillStyle = '#cfc5b4';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      for (let x = ((y / 16) % 2) * 16 - 16; x < w; x += 32) {
        const k = 0.82 + r() * 0.3;
        g.fillStyle = `rgb(${c.r * 255 * k},${c.g * 255 * k},${c.b * 255 * k})`;
        g.fillRect(x + 2, y + 2, 29, 13);
      }
    }
  }, { repeat: [2, 2], bump: 3 });
}

export function awningTex(a, b) {
  return canvasTex(`awning-${a}-${b}`, 128, 32, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect((i * w) / 8, 0, w / 8, h);
    }
  });
}

export function shopSignTex(text, bg, fg = '#ffffff') {
  return canvasTex(`shop-${text}-${bg}`, 256, 64, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = 'bold 34px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

export function wFlagTex() {
  return canvasTex('w-flag', 128, 96, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#0e3386';
    g.font = 'bold 84px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('W', w / 2, h / 2 + 4);
  });
}

export function skyTex(top, mid, bottom) {
  return canvasTex(`sky-${top}-${mid}-${bottom}`, 2, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, top);
    grad.addColorStop(0.55, mid);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/** Soft radial glow (halos, lamp light pools, power-up auras). */
export function glowTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTex(`glow-${inner}-${outer}`, 128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, inner);
    gr.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
  });
}

/** Soft contact shadow under characters and obstacles. */
export function blobShadowTex() {
  return canvasTex('blob', 128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
  });
}

/** Four-point twinkle for coin and power-up sparkles. */
export function sparkleTex() {
  return canvasTex('sparkle', 64, 64, (g, w) => {
    const c = w / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,240,180,0.6)');
    gr.addColorStop(1, 'rgba(255,240,180,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(c, 0); g.lineTo(c + 3, c); g.lineTo(c, w); g.lineTo(c - 3, c); g.closePath();
    g.moveTo(0, c); g.lineTo(c, c - 3); g.lineTo(w, c); g.lineTo(c, c + 3); g.closePath();
    g.fill();
  });
}

/** Tileable ripple normal map for the river and the lake. */
export function waterNormalTex() {
  const key = 'water-normal';
  if (texCache.has(key)) return texCache.get(key);
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const r = rng(21);
  const waves = Array.from({ length: 9 }, () => ({ kx: Math.round((r() - 0.5) * 12), ky: Math.round((r() - 0.5) * 12) || 1, a: 0.3 + r() * 0.7, p: r() * 6.28 }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const wv of waves) {
        const ph = ((wv.kx * x + wv.ky * y) / size) * Math.PI * 2 + wv.p;
        const d = Math.cos(ph) * wv.a;
        dx += d * wv.kx * 0.08;
        dy += d * wv.ky * 0.08;
      }
      const len = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      img.data[o] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[o + 1] = (-dy / len * 0.5 + 0.5) * 255;
      img.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Q.anisotropy;
  texCache.set(key, t);
  return t;
}
