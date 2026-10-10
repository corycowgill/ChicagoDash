// Chicago landmarks and street life: the Bean, Crown Fountain, Buckingham
// Fountain, Pritzker Pavilion, the Art Institute lions, Marina City, the Navy
// Pier wheel, the Picasso, green street signs, pigeons, buskers and more.
import * as THREE from 'three';
import { G, mesh, box, cyl, sphere } from './geo.js';
import { toon, basic, signTex, wFlagTex } from './materials.js';
import { Q } from './quality.js';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---------------------------------------------------------------------------
// Chrome for the Bean and the Pavilion: a painted sky-and-skyline equirect map
// reflected by a Phong material (no PMREM needed).
let chromeMat = null;
export function getChrome() {
  if (chromeMat) return chromeMat;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0, '#2b7de9');
  sky.addColorStop(1, '#e8f4ff');
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#7f9a6a';
  g.fillRect(0, 128, 512, 128);
  g.fillStyle = '#c9c4ba';
  g.fillRect(0, 128, 512, 18);
  const r = rng(9);
  g.fillStyle = '#3c4a63';
  for (let x = 0; x < 512; x += 9) {
    const h = 10 + r() * 50 + (x > 200 && x < 230 ? 40 : 0);
    g.fillRect(x, 128 - h, 8, h);
  }
  const env = new THREE.CanvasTexture(c);
  env.mapping = THREE.EquirectangularReflectionMapping;
  env.colorSpace = THREE.SRGBColorSpace;
  chromeMat = Q.pbr
    ? new THREE.MeshStandardMaterial({ color: 0xeef2f6, metalness: 1, roughness: 0.05, envMapIntensity: 1.3 }) // reflects the live sky environment
    : new THREE.MeshPhongMaterial({ color: 0xdfe6ee, envMap: env, reflectivity: 0.92, shininess: 140, specular: 0xffffff });
  return chromeMat;
}

// ---------------------------------------------------------------------------
// Millennium Park
export function cloudGate() {
  // "The Bean": 168 polished steel plates welded into one seamless kidney.
  const g = new THREE.Group();
  const m = getChrome();
  g.add(mesh(G.sphere(32, 20), m, 0, 4.0, 0, 12, 4.8, 6.6));
  g.add(mesh(G.sphere(24, 16), m, -3.9, 1.9, 0, 5.2, 3.6, 6.0));
  g.add(mesh(G.sphere(24, 16), m, 3.9, 1.9, 0, 5.2, 3.6, 6.0));
  // plaza
  g.add(box(toon(0xd9d4ca), 24, 0.1, 16, 0, 0.05, 0));
  return g;
}

function faceTex(seed) {
  return signTex('crownface' + seed, 128, 256, (g, w, h) => {
    g.fillStyle = '#c9e6ef';
    g.fillRect(0, 0, w, h);
    const skin = ['#f1c27d', '#8d5524', '#c68642', '#ffdbac'][seed % 4];
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(w / 2, h * 0.5, w * 0.42, h * 0.36, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1b1b1b';
    g.beginPath();
    g.arc(w * 0.34, h * 0.42, 7, 0, Math.PI * 2);
    g.arc(w * 0.66, h * 0.42, 7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#7a2a1a';
    g.lineWidth = 6;
    g.beginPath();
    if (seed % 2) g.arc(w / 2, h * 0.58, 20, 0.15 * Math.PI, 0.85 * Math.PI);
    else g.ellipse(w / 2, h * 0.62, 10, 13, 0, 0, Math.PI * 2); // mid-spout "o"
    g.stroke();
    // glass-block grid
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
}

export function crownFountain(seed = 0) {
  // Two glass-block towers showing Chicagoans' faces, a black granite pool
  // between them, and water spouting from the "mouth".
  const g = new THREE.Group();
  g.add(box(toon(0x1d1f24), 8, 0.12, 16, 0, 0.06, 0));
  g.add(mesh(G.plane(), toon(0x5c8fb0, { opacity: 0.75 }), 0, 0.14, 0, 7.6, 15.6, 1));
  g.children.at(-1).rotation.x = -Math.PI / 2;
  const glass = toon(0xd6eef5, { opacity: 0.9 });
  for (const [z, s] of [[-7, seed], [7, seed + 1]]) {
    g.add(box(glass, 3.2, 9, 1.6, 0, 4.5, z));
    const face = new THREE.Mesh(G.plane(), toon(0xffffff, { map: faceTex(s), emissive: 0xffffff, emissiveMap: faceTex(s), emissiveIntensity: 0.15, nightGlow: 0.9 }));
    face.scale.set(3.1, 6.2, 1);
    face.rotation.y = Math.PI / 2;
    face.position.set(1.62, 5, z);
    g.add(face);
    // spout arcing out of the mouth
    const water = toon(0xbfe9ff, { opacity: 0.6 });
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      g.add(sphere(water, 0.18, 1.8 + t * 2.4, 4.4 - t * t * 4.2, z));
    }
  }
  // kids splashing
  const cols = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c];
  for (let i = 0; i < 4; i++) {
    g.add(mesh(G.capsule(), toon(cols[i]), 1 + (i % 2), 0.55, -3 + i * 2, 0.28, 0.25, 0.22));
    g.add(sphere(toon(0xf1c27d), 0.14, 1 + (i % 2), 0.95, -3 + i * 2));
  }
  return g;
}

export function buckinghamFountain() {
  // Three tiers of pink Georgia marble and four bronze seahorses. Returns the
  // static group plus the centre jet so it can be animated.
  const g = new THREE.Group();
  const pink = toon(0xe3b3a6);
  const water = toon(0x8fd0f2, { opacity: 0.8 });
  g.add(cyl(pink, 10, 0.8, 0, 0.4, 0, 28));
  g.add(cyl(water, 9.6, 0.1, 0, 0.82, 0, 28));
  g.add(cyl(pink, 1.4, 2.6, 0, 1.6, 0, 16));
  g.add(cyl(pink, 5.2, 0.6, 0, 3.0, 0, 24));
  g.add(cyl(water, 4.9, 0.1, 0, 3.32, 0, 24));
  g.add(cyl(pink, 0.9, 2.2, 0, 4.2, 0, 14));
  g.add(cyl(pink, 2.8, 0.5, 0, 5.3, 0, 20));
  g.add(cyl(water, 2.6, 0.08, 0, 5.56, 0, 20));
  const bronze = toon(0x4f7f6a);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const s = new THREE.Group();
    s.add(mesh(G.capsule(), bronze, 0, 1.6, 0, 0.7, 0.9, 0.7));
    s.add(mesh(G.cone(6), bronze, 0, 2.9, -0.3, 0.6, 1.0, 0.6));
    s.children.at(-1).rotation.x = -0.6;
    s.position.set(Math.cos(a) * 7.6, 0.6, Math.sin(a) * 7.6);
    s.rotation.y = -a;
    g.add(s);
  }
  const jet = new THREE.Group();
  const jw = toon(0xe6f7ff, { opacity: 0.7 });
  jet.add(mesh(G.cyl(10, 0.15, 0.5), jw, 0, 0.5, 0, 1, 1, 1));
  jet.add(sphere(jw, 0.6, 0, 1, 0));
  jet.position.y = 5.6;
  return { group: g, jet };
}

export function pritzkerPavilion() {
  // Billowing stainless-steel ribbons over the stage plus the lawn trellis.
  const g = new THREE.Group();
  const m = getChrome();
  g.add(box(toon(0x8a8f99), 14, 1.4, 9, 0, 0.7, 0));
  for (let i = 0; i < 7; i++) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(4 + i * 0.7, 0.35, 6, 14, Math.PI * (0.7 + (i % 3) * 0.12)), m);
    arc.position.set(-4 + i * 1.3, 6 + (i % 2) * 1.5, -1 + (i % 3));
    arc.rotation.set(0.3 * (i % 2 ? 1 : -1), Math.PI / 2 + (i - 3) * 0.15, 0.4);
    g.add(arc);
  }
  // lawn trellis
  const pipe = toon(0xc9d1da);
  for (let k = 0; k < 4; k++) {
    g.add(box(pipe, 0.25, 0.25, 30, 12 + k * 8, 9, 0));
    g.add(cyl(pipe, 0.3, 9, 12 + k * 8, 4.5, 14, 8));
  }
  for (let k = -2; k <= 2; k++) g.add(box(pipe, 26, 0.25, 0.25, 24, 9, k * 6.5));
  return g;
}

export function artInstituteLions(event) {
  // The bronze lions on Michigan Avenue - dressed up for the occasion.
  const g = new THREE.Group();
  const bronze = toon(0x5d8a72);
  const stone = toon(0xd8d1c0);
  for (const z of [-6, 6]) {
    const l = new THREE.Group();
    l.add(box(stone, 2.6, 2.2, 4.4, 0, 1.1, 0));
    l.add(mesh(G.capsule(), bronze, 0, 3.2, 0.3, 1.2, 1.2, 1.1));
    l.children.at(-1).rotation.x = Math.PI / 2;
    l.add(sphere(bronze, 0.95, 0, 4.0, -1.3)); // mane
    l.add(sphere(bronze, 0.6, 0, 4.0, -1.9)); // face
    for (const x of [-0.45, 0.45]) l.add(box(bronze, 0.35, 1.1, 0.35, x, 2.75, -1.3), box(bronze, 0.35, 1.1, 0.35, x, 2.75, 1.5));
    if (event === 'gameday') l.add(mesh(G.hemi(), toon(0x0e3386), 0, 4.75, -1.4, 1.1, 0.7, 1.1)); // Cubs cap
    if (event === 'snow') l.add(mesh(G.torus(0.8, 0.2, 14), toon(0x2f8f3a), 0, 3.6, -1.6)); // holiday wreath
    if (event === 'stpats') l.add(mesh(G.cyl(12, 0.45, 0.55), toon(0x1fa64a), 0, 5.0, -1.4, 1, 0.9, 1)); // green top hat
    l.position.z = z;
    l.rotation.y = -Math.PI / 2;
    g.add(l);
  }
  // Beaux-Arts facade behind them
  g.add(box(toon(0xe6dfcf), 4, 12, 30, 7, 6, 0));
  for (let z = -12; z <= 12; z += 3) g.add(cyl(toon(0xf2ece0), 0.4, 8, 4.7, 5, z, 10));
  g.add(box(toon(0xd2c9b4), 4.4, 1.2, 30.4, 6.8, 9.6, 0));
  const sign = new THREE.Mesh(G.plane(), basic(0xffffff, { map: signTex('artinst', 512, 64, (c, w, h) => {
    c.fillStyle = '#d2c9b4';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#3b3328';
    c.font = 'bold 40px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('THE ART INSTITUTE', w / 2, h / 2 + 2);
  }) }));
  sign.scale.set(12, 1.2, 1);
  sign.rotation.y = -Math.PI / 2;
  sign.position.set(4.58, 9.6, 0);
  g.add(sign);
  return g;
}

// ---------------------------------------------------------------------------
// River and lake
export function marinaCity() {
  // The corncob towers: scalloped balconies over a spiral parking garage.
  const g = new THREE.Group();
  const conc = toon(0xe8e4dc);
  const garage = toon(0xb9b3a8);
  for (const x of [0, 13]) {
    g.add(cyl(toon(0x8a8f99), 3.4, 60, x, 30, 0, 14));
    for (let y = 1; y < 60; y += 2.6) {
      g.add(mesh(G.cyl(16), y < 20 ? garage : conc, x, y, 0, 11, 0.45, 11));
    }
    g.add(cyl(conc, 4.6, 1.2, x, 60.5, 0, 16));
  }
  return g;
}

export function ferrisWheel() {
  // Navy Pier's wheel. Returns the rotating part separately.
  const g = new THREE.Group();
  const white = toon(0xf4f4f4);
  const wheel = new THREE.Group();
  wheel.add(mesh(G.torus(0.5, 0.012, 48), white, 0, 0, 0, 40, 40, 40));
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const s = box(white, 0.4, 20, 0.4, Math.cos(a) * 10, Math.sin(a) * 10, 0);
    s.rotation.z = a + Math.PI / 2;
    wheel.add(s);
    wheel.add(box(toon([0xe63946, 0x2563c9, 0xffc61a][i % 3]), 1.6, 1.6, 1.6, Math.cos(a) * 20, Math.sin(a) * 20, 0));
  }
  wheel.position.y = 24;
  g.add(wheel);
  for (const x of [-6, 6]) {
    const leg = box(white, 0.8, 26, 0.8, x * 0.5, 12, 0);
    leg.rotation.z = x > 0 ? 0.22 : -0.22;
    g.add(leg);
  }
  g.add(box(toon(0x8a6d4f), 60, 2, 10, 0, 1, 0)); // the pier
  return { group: g, wheel };
}

export function sailboat() {
  const g = new THREE.Group();
  g.add(box(toon(0xffffff), 1.6, 0.6, 5, 0, 0.3, 0));
  g.add(cyl(toon(0x8a8f99), 0.08, 7, 0, 3.8, 0.4, 6));
  const sail = new THREE.Mesh(G.cone(3), toon([0xffffff, 0xe63946, 0x6ec6f0][(Math.random() * 3) | 0], { side: THREE.DoubleSide }));
  sail.scale.set(0.1, 6, 3.2);
  sail.position.set(0, 3.8, -0.8);
  g.add(sail);
  return g;
}

export function lifeguardStand() {
  const g = new THREE.Group();
  const w = toon(0xffffff);
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) g.add(box(w, 0.12, 2.4, 0.12, x, 1.2, z));
  g.add(box(toon(0xe63946), 1.6, 0.2, 1.6, 0, 2.4, 0));
  g.add(box(toon(0xe63946), 1.6, 1, 0.12, 0, 2.9, 0.75));
  g.add(cyl(toon(0xdddddd), 0.04, 2.4, 0.6, 3.6, 0.6));
  g.add(mesh(G.cone(8), toon(0xffd43b), 0.6, 4.8, 0.6, 2, 0.5, 2));
  return g;
}

export function zooGiraffes() {
  // Lincoln Park Zoo: free since 1868. Giraffes peeking over the fence.
  const g = new THREE.Group();
  const spot = toon(0xe0a050);
  const dark = toon(0x8a5a2b);
  for (let i = 0; i < 2; i++) {
    const a = new THREE.Group();
    a.add(box(spot, 1.2, 1.2, 2.4, 0, 2.6, 0));
    for (const [x, z] of [[-0.4, -0.9], [0.4, -0.9], [-0.4, 0.9], [0.4, 0.9]]) a.add(box(spot, 0.22, 2.2, 0.22, x, 1.1, z));
    const neck = box(spot, 0.4, 3.2, 0.4, 0, 4.4, -1.2);
    neck.rotation.x = -0.35;
    a.add(neck);
    a.add(box(spot, 0.5, 0.5, 1.0, 0, 6, -1.9));
    a.add(box(dark, 0.1, 0.4, 0.1, -0.15, 6.4, -1.7), box(dark, 0.1, 0.4, 0.1, 0.15, 6.4, -1.7));
    for (let k = 0; k < 6; k++) a.add(box(dark, 0.3, 0.3, 0.02, (k % 2 ? 0.61 : -0.61), 2.2 + (k % 3) * 0.35, -0.8 + k * 0.3));
    a.position.set(i * 3, 0, i * 4);
    a.rotation.y = i ? 2.2 : 1.2;
    g.add(a);
  }
  // fence + sign
  const fence = toon(0x2b2f36);
  g.add(box(fence, 0.1, 1.4, 12, -2.5, 0.7, 2));
  for (let z = -4; z <= 8; z += 1.5) g.add(box(fence, 0.12, 1.5, 0.12, -2.5, 0.75, z));
  const sign = new THREE.Mesh(G.plane(), basic(0xffffff, { map: signTex('zoo', 512, 96, (c, w, h) => {
    c.fillStyle = '#1f5c3a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    c.font = 'bold 44px Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('LINCOLN PARK ZOO', w / 2, h * 0.42);
    c.font = 'bold 24px Arial, sans-serif';
    c.fillText('FREE ADMISSION · SINCE 1868', w / 2, h * 0.78);
  }) }));
  sign.scale.set(4, 0.75, 1);
  sign.rotation.y = -Math.PI / 2;
  sign.position.set(-2.6, 2.2, -2);
  g.add(sign);
  g.add(box(fence, 0.12, 2.2, 0.12, -2.55, 1.1, -4), box(fence, 0.12, 2.2, 0.12, -2.55, 1.1, 0));
  return g;
}

// ---------------------------------------------------------------------------
// The Loop
export function picasso() {
  // The untitled Daley Plaza Picasso: rusty Cor-Ten steel, part baboon,
  // part Afghan hound, part woman. Kids slide down its base.
  const g = new THREE.Group();
  const rust = toon(0x8b4a2b);
  g.add(box(toon(0xb7b1a6), 30, 0.2, 24, 0, 0.1, 0)); // plaza
  g.add(box(rust, 3.6, 1.2, 6, 0, 0.6, 0));
  const head = new THREE.Mesh(G.cone(4), rust);
  head.scale.set(1.2, 12, 6);
  head.rotation.y = Math.PI / 4;
  head.position.set(0, 7, 0);
  g.add(head);
  for (const z of [-3.2, 3.2]) {
    const wing = mesh(G.torus(0.5, 0.08, 20), rust, 0, 8, z, 6, 9, 6);
    wing.rotation.y = Math.PI / 2;
    g.add(wing);
  }
  for (let i = -3; i <= 3; i++) g.add(box(rust, 0.08, 6, 0.08, 0, 7, i * 0.7)); // the "strings"
  return g;
}

// ---------------------------------------------------------------------------
// Wrigleyville
export function rooftopBleachers() {
  // The famous rooftop seats across from the ballpark.
  const g = new THREE.Group();
  const steel = toon(0x5d6670);
  for (let r = 0; r < 4; r++) g.add(box(toon(r % 2 ? 0x0e3386 : 0x1d4fc4), 4, 0.3, 6, -r * 0.9, 0.5 + r * 0.7, 0));
  g.add(box(steel, 0.2, 3.5, 0.2, -3, 1.75, -3), box(steel, 0.2, 3.5, 0.2, -3, 1.75, 3));
  const cols = [0x0e3386, 0xcc3433, 0xffffff];
  for (let i = 0; i < 8; i++) {
    const r = i % 4;
    g.add(sphere(toon(cols[i % 3]), 0.28, -r * 0.9, 1.1 + r * 0.7, -2 + Math.floor(i / 4) * 3));
    g.add(sphere(toon(0xf1c27d), 0.18, -r * 0.9, 1.5 + r * 0.7, -2 + Math.floor(i / 4) * 3));
  }
  return g;
}

export function oldScoreboard(event) {
  // Hand-turned green scoreboard with the flag pole flying a W.
  const g = new THREE.Group();
  const green = toon(0x1f5c3a);
  g.add(box(green, 1.2, 4, 12, 0, 2, 0));
  const tex = signTex('scoreboard', 512, 160, (c, w, h) => {
    c.fillStyle = '#1f5c3a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#f7f3e3';
    c.font = 'bold 22px Arial, sans-serif';
    c.textAlign = 'center';
    for (let col = 0; col < 10; col++) c.fillText(String(col + 1), 120 + col * 36, 24);
    const r = rng(77);
    for (let row = 0; row < 3; row++) {
      c.fillText(['NL', 'AL', 'CHI'][row], 50, 62 + row * 38);
      for (let col = 0; col < 10; col++) {
        c.fillStyle = '#16402a';
        c.fillRect(106 + col * 36, 40 + row * 38, 28, 30);
        c.fillStyle = '#f7f3e3';
        c.fillText(String((r() * 4) | 0), 120 + col * 36, 64 + row * 38);
      }
    }
  });
  const face = new THREE.Mesh(G.plane(), basic(0xffffff, { map: tex }));
  face.scale.set(11.6, 3.6, 1);
  face.rotation.y = -Math.PI / 2;
  face.position.set(-0.62, 2, 0);
  g.add(face);
  g.add(cyl(toon(0xdddddd), 0.08, 5, 0, 6.5, 0));
  // Fly the W - on game day it gets a second, bigger one.
  const flag = new THREE.Mesh(G.plane(), toon(0xffffff, { map: wFlagTex(), side: THREE.DoubleSide }));
  const big = event === 'gameday' ? 1.4 : 1;
  flag.scale.set(1.8 * big, 1.3 * big, 1);
  flag.rotation.y = Math.PI / 2;
  flag.position.set(0, 8.2, 0.95 * big);
  g.add(flag);
  return g;
}

// ---------------------------------------------------------------------------
// Street life
const SIGN_W = 512;
export function streetSign(a, b, note = '') {
  // Chicago's green street-name blades on a pole, two streets crossing.
  const g = new THREE.Group();
  g.add(cyl(toon(0x5d6670), 0.06, 3.6, 0, 1.8, 0, 8));
  const blade = (text) => basic(0xffffff, { map: signTex('street-' + text + note, SIGN_W, 96, (c, w, h) => {
    c.fillStyle = '#0b7a3e';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 4;
    c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = '#ffffff';
    c.font = 'bold 50px "Arial Narrow", Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 3);
  }), side: THREE.DoubleSide });
  const s1 = new THREE.Mesh(G.plane(), blade(a));
  s1.scale.set(1.9, 0.36, 1);
  s1.position.set(0, 3.5, 0);
  g.add(s1);
  const s2 = new THREE.Mesh(G.plane(), blade(b));
  s2.scale.set(1.9, 0.36, 1);
  s2.rotation.y = Math.PI / 2;
  s2.position.set(0, 3.1, 0);
  g.add(s2);
  if (note) {
    const n = new THREE.Mesh(G.plane(), basic(0xffffff, { map: signTex('note-' + note, SIGN_W, 64, (c, w, h) => {
      c.fillStyle = '#6e1f1f';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff';
      c.font = 'bold 28px Arial, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(note, w / 2, h / 2 + 2);
    }), side: THREE.DoubleSide }));
    n.scale.set(1.9, 0.24, 1);
    n.position.set(0, 2.7, 0);
    g.add(n);
  }
  return g;
}

export function busker(kind = 'sax') {
  // Riverwalk blues: a sax player or a guitarist with an open case for tips.
  const g = new THREE.Group();
  g.add(mesh(G.capsule(), toon(0x2b2f36), 0, 1.05, 0, 0.5, 0.6, 0.36));
  g.add(sphere(toon(0x8d5524), 0.24, 0, 1.75, 0));
  g.add(mesh(G.cyl(12, 0.3, 0.3), toon(0x1a1a1a), 0, 2.0, 0, 1, 0.1, 1)); // hat brim
  g.add(mesh(G.cyl(12, 0.18, 0.2), toon(0x1a1a1a), 0, 2.15, 0, 1, 0.3, 1));
  g.add(box(toon(0x2b3a55), 0.15, 0.7, 0.15, -0.12, 0.35, 0), box(toon(0x2b3a55), 0.15, 0.7, 0.15, 0.12, 0.35, 0));
  if (kind === 'sax') {
    const sax = mesh(G.cyl(8, 0.06, 0.14), toon(0xd4a017), 0, 1.25, -0.32, 1, 0.9, 1);
    sax.rotation.x = 0.4;
    g.add(sax);
  } else {
    g.add(box(toon(0xa0522d), 0.5, 0.6, 0.12, 0.05, 1.1, -0.3));
    g.add(box(toon(0x6b4226), 0.08, 0.9, 0.06, 0.4, 1.35, -0.3));
  }
  g.add(box(toon(0x6b1f1f), 0.9, 0.12, 0.5, 0.2, 0.06, -0.9)); // open case
  g.add(sphere(toon(0xffc61a), 0.06, 0.1, 0.15, -0.9), sphere(toon(0x8fbf6f), 0.07, 0.35, 0.15, -0.85));
  return g;
}

/** A flock of pigeons that scatters when the runner gets close. */
export function pigeons(n = 5) {
  const g = new THREE.Group();
  const birds = [];
  const body = toon(0x8a8f99);
  const neck = toon(0x4f7f6a);
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group();
    b.add(mesh(G.sphere(8, 6), body, 0, 0.18, 0, 0.22, 0.2, 0.34));
    b.add(sphere(neck, 0.08, 0, 0.32, -0.14));
    const wl = box(body, 0.32, 0.03, 0.18, -0.16, 0.22, 0);
    const wr = box(body, 0.32, 0.03, 0.18, 0.16, 0.22, 0);
    b.add(wl, wr);
    b.position.set((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6);
    b.rotation.y = Math.random() * 6;
    b.userData = { wl, wr, v: new THREE.Vector3(), flying: false, phase: Math.random() * 6 };
    birds.push(b);
    g.add(b);
  }
  let scattered = false;
  return {
    obj: g,
    tail: 0,
    update(dt, t, pz) {
      if (!scattered && g.position.z - pz > -12) {
        scattered = true;
        for (const b of birds) {
          b.userData.flying = true;
          b.userData.v.set((Math.random() - 0.5) * 4 + Math.sign(g.position.x) * 3, 4 + Math.random() * 3, (Math.random() - 0.5) * 4);
        }
      }
      for (const b of birds) {
        const u = b.userData;
        if (u.flying) {
          b.position.addScaledVector(u.v, dt);
          const f = Math.sin(t * 30 + u.phase) * 0.9;
          u.wl.rotation.z = f;
          u.wr.rotation.z = -f;
        } else {
          b.position.y = Math.abs(Math.sin(t * 6 + u.phase)) * 0.02; // pecking bob
        }
      }
    },
  };
}
