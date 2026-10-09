// Shared toon materials and procedurally painted canvas textures.
// Everything is cached so chunks of the city can be rebuilt endlessly without
// allocating new GPU resources.
import * as THREE from 'three';

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
 * Cached toon material.
 * @param {number|string} color
 * @param {object} [opts] { emissive, emissiveIntensity, map, transparent, opacity, glow, nightGlow }
 */
export function toon(color, opts = {}) {
  const key = `${color}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? ''}|${opts.map?.uuid ?? ''}|${opts.emissiveMap?.uuid ?? ''}|${opts.opacity ?? ''}|${opts.nightGlow ?? ''}|${opts.side ?? ''}`;
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshToonMaterial({
    color,
    gradientMap: getGradient(),
    map: opts.map ?? null,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    emissiveMap: opts.emissiveMap ?? null,
    transparent: opts.opacity !== undefined && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  if (opts.nightGlow !== undefined) {
    // Materials that light up after dark: store day/night intensities.
    m.userData.dayGlow = opts.emissiveIntensity ?? 0;
    m.userData.nightGlow = opts.nightGlow;
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

export function setNight(isNight) {
  for (const m of glowMaterials) {
    m.emissiveIntensity = isNight ? m.userData.nightGlow : m.userData.dayGlow;
  }
}

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------
const texCache = new Map();
function canvasTex(key, w, h, draw, { repeat = null, srgb = true } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  texCache.set(key, t);
  return t;
}

// Deterministic tiny PRNG so textures look the same every session.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Building facade with a window grid. Returns { map, emissiveMap }.
 * style: 'glass' | 'brick' | 'stone' | 'dark'
 */
export function facade(style, base, seed = 1) {
  const key = `facade-${style}-${base}-${seed}`;
  if (texCache.has(key)) return texCache.get(key);
  const cols = style === 'brick' ? 4 : 6;
  const rows = style === 'brick' ? 6 : 12;
  const W = 256;
  const H = 512;
  const r = rng(seed * 977 + cols);
  const lit = [];
  const map = canvasTex(key + '-map', W, H, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    if (style === 'brick') {
      g.globalAlpha = 0.18;
      g.fillStyle = '#000';
      for (let y = 0; y < H; y += 8) {
        for (let x = (y / 8) % 2 ? 0 : 8; x < W; x += 16) g.fillRect(x, y, 1, 8);
        g.fillRect(0, y, W, 1);
      }
      g.globalAlpha = 1;
    }
    if (style === 'glass') {
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, 'rgba(255,255,255,0.25)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(255,255,255,0.15)');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
    const cw = W / cols;
    const rh = H / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const isLit = r() < 0.45;
        lit.push(isLit);
        const px = x * cw + cw * 0.18;
        const py = y * rh + rh * 0.2;
        const ww = cw * 0.64;
        const wh = rh * (style === 'glass' ? 0.7 : 0.58);
        if (style === 'glass') {
          g.fillStyle = r() < 0.5 ? '#a8d8ff' : '#7fb6e8';
          g.fillRect(x * cw + 2, y * rh + 2, cw - 4, rh - 3);
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(x * cw + 2, y * rh + 2, (cw - 4) * 0.35, rh - 3);
        } else {
          g.fillStyle = style === 'dark' ? '#3a4660' : '#2c3e57';
          g.fillRect(px - 2, py - 2, ww + 4, wh + 4);
          g.fillStyle = r() < 0.5 ? '#9cc9f0' : '#bfe0ff';
          g.fillRect(px, py, ww, wh);
          g.fillStyle = 'rgba(255,255,255,0.4)';
          g.fillRect(px, py, ww * 0.3, wh);
          if (style === 'brick') {
            g.fillStyle = 'rgba(255,255,255,0.55)';
            g.fillRect(px - 3, py + wh + 2, ww + 6, 4); // sill
          }
        }
      }
    }
  });
  const emissiveMap = canvasTex(key + '-em', W, H, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    const cw = W / cols;
    const rh = H / rows;
    let i = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (lit[i++]) {
          g.fillStyle = i % 3 ? '#ffd27a' : '#fff1c4';
          if (style === 'glass') g.fillRect(x * cw + 2, y * rh + 2, cw - 4, rh - 3);
          else g.fillRect(x * cw + cw * 0.18, y * rh + rh * 0.2, cw * 0.64, rh * 0.58);
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
  return canvasTex('track', 128, 128, (g, w, h) => {
    g.fillStyle = '#6b5a4a';
    g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = r() < 0.5 ? '#7d6b5a' : '#5a4a3c';
      g.fillRect(r() * w, r() * h, 3, 3);
    }
    g.fillStyle = '#4a3324';
    for (let y = 4; y < h; y += 32) g.fillRect(8, y, w - 16, 14); // ties
  }, { repeat: [1, 8] });
}

export function paverTex(base = '#c9b9a0') {
  return canvasTex('paver-' + base, 128, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 2;
    for (let y = 0; y < h; y += 16) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      for (let x = (y / 16) % 2 ? 0 : 16; x < w; x += 32) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 16);
        g.stroke();
      }
    }
  }, { repeat: [3, 12] });
}

export function asphaltTex() {
  return canvasTex('asphalt', 256, 256, (g, w, h) => {
    g.fillStyle = '#4b4f58';
    g.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() < 0.5 ? '#555a64' : '#43464e';
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    // dashed lane dividers at 1/3 and 2/3
    g.fillStyle = '#f5f1e0';
    for (let y = 0; y < h; y += 64) {
      g.fillRect(w / 3 - 3, y, 6, 36);
      g.fillRect((2 * w) / 3 - 3, y, 6, 36);
    }
  }, { repeat: [1, 6] });
}

export function grassTex(base = '#5cbf4a') {
  return canvasTex('grass-' + base, 128, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
      g.fillRect(r() * w, r() * h, 2, 4);
    }
  }, { repeat: [4, 10] });
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
  return canvasTex('train-front', 256, 256, (g, w, h) => {
    g.fillStyle = '#c7ccd3';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b2735';
    g.fillRect(28, 50, 86, 90); // windows
    g.fillRect(142, 50, 86, 90);
    g.fillStyle = '#2c3e57';
    g.fillRect(0, 0, w, 36);
    g.fillStyle = '#ffb703';
    g.font = 'bold 28px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Loop', w / 2, 19);
    g.fillStyle = '#9aa3ad';
    g.fillRect(118, 50, 20, 170); // door seam
    g.fillStyle = '#fff6c4';
    g.beginPath();
    g.arc(40, 190, 13, 0, Math.PI * 2);
    g.arc(216, 190, 13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ff3b30';
    g.beginPath();
    g.arc(72, 190, 8, 0, Math.PI * 2);
    g.arc(184, 190, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e4002b';
    g.fillRect(0, 232, w, 10);
    g.fillStyle = '#4fa3e0';
    g.fillRect(0, 242, w, 10);
  });
}

export function trainSideTex() {
  return canvasTex('train-side', 512, 128, (g, w, h) => {
    g.fillStyle = '#c7ccd3';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#b3b9c1';
    for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 1, h); // corrugation
    g.fillStyle = '#1b2735';
    for (let x = 20; x < w - 40; x += 70) g.fillRect(x, 24, 50, 40);
    g.fillStyle = '#9aa3ad';
    g.fillRect(w * 0.3, 20, 34, 92);
    g.fillRect(w * 0.7, 20, 34, 92);
    g.fillStyle = '#e4002b';
    g.fillRect(0, 100, w, 8);
    g.fillStyle = '#4fa3e0';
    g.fillRect(0, 108, w, 8);
  });
}

export function brickTex(base = '#a2472f') {
  return canvasTex('brick-' + base, 128, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    for (let y = 0; y < h; y += 8) {
      g.fillRect(0, y, w, 1);
      for (let x = (y / 8) % 2 ? 0 : 8; x < w; x += 16) g.fillRect(x, y, 1, 8);
    }
  }, { repeat: [2, 2] });
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
