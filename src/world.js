// Procedural Chicago: neighbourhood chunks, the skyline backdrop, sky,
// lighting and special-event dressing (night, snow, St. Patrick's, game day).
import * as THREE from 'three';
import { G, mesh, box, cyl, sphere, bake, disposeObject } from './geo.js';
import {
  toon, basic, facadeTiled, trackTex, paverTex, asphaltTex, grassTex, waterTex, brickTex, awningTex,
  shopSignTex, marqueeTex, verticalChicagoTex, setNight, waterNormalTex, STYLE,
} from './materials.js';
import { Q } from './quality.js';
import {
  makeLampPost, makeTwinLamp, makeBusShelter, makeMailbox, makeFlowerPlanter, makeTree, makeParkedBike,
  makeBalustrade, makeRailing, makeWaterTaxi, makeTourBoat, makePennantString, makeFan, makeTrain, makeBench,
} from './models.js';
import {
  getChrome, cloudGate, crownFountain, buckinghamFountain, pritzkerPavilion, artInstituteLions, marinaCity,
  ferrisWheel, sailboat, lifeguardStand, zooGiraffes, picasso, rooftopBleachers, oldScoreboard, streetSign,
  busker, pigeons,
} from './landmarks.js';
import { STREETS } from './chicago.js';

export const LANE_W = 2.4;
export const LANES = [-LANE_W, 0, LANE_W];
export const CHUNK_LEN = 30;
export const SECTION_LEN = 750; // metres per neighbourhood
const AHEAD = 270;

export const THEMES = [
  { id: 'loop', name: 'The Loop', tag: 'Race the "L" between the skyscrapers' },
  { id: 'millennium', name: 'Millennium Park', tag: 'The Bean, Crown Fountain & Buckingham Fountain' },
  { id: 'riverwalk', name: 'The Riverwalk', tag: 'Bridges, boats and the Chicago River' },
  { id: 'wrigley', name: 'Wrigleyville', tag: 'Game day energy on Clark & Addison' },
  { id: 'lincoln', name: 'Lincoln Park', tag: 'Lakefront trail with skyline views' },
];

export function themeIndexAt(dist) {
  return Math.floor(Math.max(0, dist) / SECTION_LEN) % THEMES.length;
}

export const EVENTS = {
  day: { name: 'Sunny Day', icon: '☀️' },
  night: { name: 'Night Run', icon: '🌙' },
  snow: { name: 'Winter Storm', icon: '❄️' },
  stpats: { name: "St. Patrick's Day", icon: '☘️' },
  gameday: { name: 'Cubs Game Day', icon: '⚾' },
};

export function autoEvent(date = new Date()) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = date.getHours();
  if (m === 3 && d >= 10 && d <= 20) return 'stpats';
  if (m === 12 || m <= 2) return 'snow';
  if (h >= 19 || h < 6) return 'night';
  if (m >= 4 && m <= 9 && (date.getDay() === 0 || date.getDay() === 6)) return 'gameday';
  return 'day';
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}
function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

const STATIONS = ['Clark/Lake', 'State/Lake', 'Washington/Wabash', 'Adams/Wabash', 'Quincy', 'LaSalle/Van Buren', 'Harold Washington Library', 'Merchandise Mart'];
const SHOPS = [
  ['PIZZA', '#c0392b'], ['TAVERN', '#1d3557'], ['HOT DOGS', '#e9a400'], ['SPORTS BAR', '#0e3386'],
  ['ITALIAN BEEF', '#2f6b2f'], ['RECORDS', '#6a3fa0'], ['BAGELS', '#b5651d'], ['DINER', '#d6336c'],
  ['TACOS', '#e8590c'], ['COFFEE', '#6f4e37'], ['POPCORN', '#e03131'], ['BOOKS', '#2b8a3e'],
];

export class World {
  constructor(scene, quality = 'high', renderer = null) {
    this.scene = scene;
    this.quality = quality;
    this.pmrem = renderer && Q.pbr ? new THREE.PMREMGenerator(renderer) : null;
    this.chunks = new Map();
    this.animated = [];
    this.event = 'day';
    this.time = 0;
    this.nextChunk = 0;
    this.stations = []; // CTA stations ahead, for the "Doors closing" announcement

    this.root = new THREE.Group();
    scene.add(this.root);

    this.setupLights();
    this.buildSky();
    this.buildSkyline();
    this.buildSnow();
    this.applyEvent('day');
  }

  // -------------------------------------------------------------------------
  setupLights() {
    // cool sky fill from above, warm bounce from the pavement below
    this.hemi = new THREE.HemisphereLight(0xa9d2ff, 0x8a6a4a, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe0b0, 2.2);
    this.sun.position.set(-12, 30, 10);
    this.sun.castShadow = Q.shadows;
    const s = this.sun.shadow;
    s.mapSize.set(Q.shadowSize, Q.shadowSize);
    // Tight frustum around the runner = crisp shadows
    s.camera.left = -12;
    s.camera.right = 12;
    s.camera.top = 26;
    s.camera.bottom = -10;
    s.camera.near = 1;
    s.camera.far = 80;
    s.bias = -0.0008;
    s.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    // Glow that follows the runner at night.
    this.playerLight = new THREE.PointLight(0xffe2a8, 0, 18, 1.6);
    this.scene.add(this.playerLight);
    this.scene.fog = new THREE.Fog(0xbfe3ff, 60, 230);
  }

  applyEvent(ev) {
    this.event = ev;
    const night = ev === 'night';
    const snow = ev === 'snow';
    const SKY = {
      night: ['#050a22', '#1b2350', '#3d3b70', '#ffffff', 0.0],
      snow: ['#93a7c2', '#cfd8e4', '#eef2f7', '#ffffff', 0.15],
      stpats: ['#0f6ad8', '#5fb8ff', '#d8f7e6', '#fff6d8', 1.0],
      gameday: ['#0a48b8', '#3f9bff', '#cfe6ff', '#fff3cf', 1.0],
      day: ['#0a48b8', '#3f9bff', '#cfe6ff', '#fff3cf', 1.0],
    }[ev] || ['#0a48b8', '#3f9bff', '#cfe6ff', '#fff3cf', 1.0];
    const u = this.skyDome.material.uniforms;
    u.uTop.value.set(SKY[0]);
    u.uMid.value.set(SKY[1]);
    u.uBottom.value.set(SKY[2]);
    u.uSunColor.value.set(SKY[3]);
    u.uSunGlow.value = SKY[4];
    this.scene.background = new THREE.Color(SKY[2]);
    this.updateEnvironment(SKY);
    this.scene.fog.color.set(night ? 0x1d2148 : snow ? 0xdfe6ee : ev === 'stpats' ? 0xd6f5e6 : 0xcfe9ff);
    this.scene.fog.near = snow ? 30 : 60;
    this.scene.fog.far = snow ? 160 : 240;
    // With an environment map providing ambient light, the hemi light is a fill.
    this.hemi.intensity = night ? 0.6 : (snow ? 1.3 : 1.15) * (this.pmrem ? 0.45 : 1);
    this.hemi.color.set(night ? 0x6b7bd6 : 0xa9d2ff);
    this.sun.intensity = (night ? 0.35 : snow ? 1.2 : 2.3) * (this.pmrem ? 1.25 : 1);
    // golden-hour key light; moonlight at night
    this.sun.color.set(night ? 0x8fa2ff : snow ? 0xf2f4ff : 0xffdcaa);
    STYLE.uRimColor.value.set(night ? 0x7f9cff : snow ? 0xe8f0ff : ev === 'stpats' ? 0xc8ffd8 : 0xbfe0ff);
    STYLE.uRimStrength.value = night ? 0.4 : 0.26;
    STYLE.uFill.value.set(night ? 0x2a3866 : 0x4a5468);
    this.playerLight.intensity = night ? 25 : 0;
    setNight(night);
    this.snow.visible = snow;
    this.stars.visible = night;
    this.moon.visible = night;
    this.sunDisc.visible = !night && !snow;
    const water = ev === 'stpats' ? '#19c25a' : night ? '#173a6b' : '#2f8fd8';
    const lake = ev === 'stpats' ? '#2fbf6a' : night ? '#14305a' : '#3aa0e8';
    if (Q.pbr) {
      this.waterMat.color.set(water).multiplyScalar(0.55);
      this.lakeMat.color.set(lake).multiplyScalar(0.55);
    } else {
      this.waterMat.map = waterTex(water);
      this.waterMat.needsUpdate = true;
      this.lakeMat.map = waterTex(lake);
      this.lakeMat.needsUpdate = true;
    }
    for (const m of this.skylineMats) m.color.copy(m.userData.base).multiplyScalar(night ? 0.45 : 1);
    getChrome().color.set(night ? 0x6f7a99 : 0xdfe6ee);
    for (const m of this.skylineWin) m.opacity = night ? 1 : 0;
  }

  // -------------------------------------------------------------------------
  /** Gradient sky dome with a sun glow; follows the camera. */
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color('#2479e8') },
        uMid: { value: new THREE.Color('#7cc4ff') },
        uBottom: { value: new THREE.Color('#fff0d0') },
        uSunColor: { value: new THREE.Color('#fff3cf') },
        uSunDir: { value: new THREE.Vector3(-0.45, 0.42, -0.79).normalize() },
        uSunGlow: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uBottom, uSunColor, uSunDir; uniform float uSunGlow;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 col = h > 0.03 ? mix(uMid, uTop, smoothstep(0.03, 0.55, h)) : mix(uBottom, uMid, smoothstep(-0.04, 0.03, h));
          float sd = max(dot(normalize(vDir), uSunDir), 0.0);
          col += uSunColor * (pow(sd, 24.0) * 0.18 + pow(sd, 256.0) * 0.8) * uSunGlow;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), mat);
    this.skyDome.frustumCulled = false;
    this.skyDome.userData.noAO = true;
    this.skyDome.renderOrder = -10;
    this.scene.add(this.skyDome);
  }

  /** Image-based lighting: bake the current sky (plus a skyline band) into a PMREM. */
  updateEnvironment(SKY) {
    if (!this.pmrem) return;
    const env = new THREE.Scene();
    const dome = this.skyDome.clone();
    dome.material = this.skyDome.material.clone();
    dome.material.uniforms = THREE.UniformsUtils.clone(this.skyDome.material.uniforms);
    dome.scale.setScalar(0.1);
    env.add(dome);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 24), new THREE.MeshBasicMaterial({ color: this.event === 'snow' ? 0xdfe4ea : 0x6f6a60 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    env.add(ground);
    const bmat = new THREE.MeshBasicMaterial({ color: this.event === 'night' ? 0x1a2036 : 0x5d6f88 });
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const h = 6 + ((i * 37) % 11) * 1.4;
      const b = new THREE.Mesh(new THREE.BoxGeometry(6, h, 6), bmat);
      b.position.set(Math.cos(a) * 50, h / 2 - 2, Math.sin(a) * 50);
      env.add(b);
    }
    const rt = this.pmrem.fromScene(env, 0.03);
    this.envRT?.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    env.traverse((o) => o.geometry?.dispose());
    void SKY;
  }

  // -------------------------------------------------------------------------
  buildSkyline() {
    // A far-off backdrop that travels with the runner so the skyline always
    // looms on the horizon. Materials ignore fog so it stays crisp.
    const g = new THREE.Group();
    this.skylineMats = [];
    this.skylineWin = [];
    const mk = (hex) => {
      const m = new THREE.MeshToonMaterial({ color: hex, fog: false });
      m.userData.base = new THREE.Color(hex);
      this.skylineMats.push(m);
      return m;
    };
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, fog: false });
    this.skylineWin.push(winMat);
    const dark = mk(0x3c4a63);
    const mid = mk(0x5e7591);
    const light = mk(0x8fa9c7);
    const silver = mk(0xb7c6d6);
    const white = mk(0xdfe7ef);
    const add = (mat, w, h, d, x, z, y0 = 0) => {
      const b = box(mat, w, h, d, x, y0 + h / 2, z);
      g.add(b);
      return b;
    };
    const winStrip = (w, h, x, z, y0 = 0) => {
      // a few lit window bands visible at night
      for (let y = y0 + 4; y < y0 + h - 2; y += 6) {
        const s = box(winMat, w * 1.01, 0.7, 0.2, x, y, z + 0.1);
        g.add(s);
      }
    };
    // Generic towers
    for (let i = 0; i < 46; i++) {
      const x = (i - 23) * 9 + rand(-3, 3);
      if (Math.abs(x) < 10) continue;
      const h = rand(25, 85) * (1 - Math.abs(x) / 320);
      const w = rand(6, 11);
      const z = rand(-30, 20);
      const m = pick([dark, mid, light, light, mid]);
      add(m, w, h, 6, x, z);
      if (Math.random() < 0.6) winStrip(w, h, x, z + 3);
      if (Math.random() < 0.3) add(m, w * 0.6, h * 0.25, 4, x, z, h);
    }
    // Willis-style tower: stacked black tubes + twin antennas
    const willis = mk(0x1f2633);
    const wx = -38;
    add(willis, 12, 120, 12, wx, -20);
    add(willis, 8, 145, 8, wx - 2, -20);
    add(willis, 4, 160, 4, wx + 2, -20);
    add(willis, 0.6, 22, 0.6, wx - 1, -20, 160);
    add(willis, 0.6, 18, 0.6, wx + 3, -20, 160);
    winStrip(12, 120, wx, -14);
    // Trump-style silver stepped tower
    add(silver, 10, 90, 8, 30, -10);
    add(silver, 7, 110, 6, 30, -10);
    add(silver, 4, 125, 4, 30, -10);
    add(silver, 0.5, 20, 0.5, 30, -10, 125);
    // Aon white slab
    add(white, 11, 128, 11, 6, -35);
    winStrip(11, 128, 6, -29.5);
    // Hancock tapered black + antennas
    const hancock = new THREE.Mesh(new THREE.CylinderGeometry(5, 8.5, 130, 4, 1), willis);
    hancock.rotation.y = Math.PI / 4;
    hancock.position.set(62, 65, -25);
    g.add(hancock);
    add(willis, 0.6, 24, 0.6, 60, -25, 130);
    add(willis, 0.6, 24, 0.6, 64, -25, 130);
    // Aqua-ish wavy
    add(mk(0x9fd3c7), 9, 80, 9, -70, 0);
    // 311 South Wacker crown
    add(mid, 10, 85, 10, -12, -5);
    const crown = new THREE.Mesh(G.cyl(16), mk(0xe8eef5));
    crown.scale.set(6, 12, 6);
    crown.position.set(-12, 91, -5);
    g.add(crown);

    // Merge the static towers into a few meshes (one per material).
    const towers = bake(g);
    g.clear();
    g.add(towers);

    // Navy Pier's Ferris wheel turning on the lakefront horizon. Its materials
    // are swapped for fog-free copies so it stays visible like the skyline.
    const fw = ferrisWheel();
    const swapped = new Map();
    fw.group.traverse((o) => {
      if (!o.isMesh) return;
      if (!swapped.has(o.material)) {
        const m = o.material.clone();
        m.fog = false;
        m.userData = { base: m.color.clone() };
        this.skylineMats.push(m);
        swapped.set(o.material, m);
      }
      o.material = swapped.get(o.material);
    });
    fw.group.position.set(118, 0, 10);
    fw.group.scale.setScalar(1.3);
    fw.group.rotation.y = -0.5;
    this.ferris = fw.wheel;
    g.add(fw.group);

    // Clouds
    const cloudMat = Q.pbr
      ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xb8c8e0, emissiveIntensity: 0.35, fog: false })
      : new THREE.MeshToonMaterial({ color: 0xffffff, fog: false });
    this.skylineMats.push(Object.assign(cloudMat, { userData: { base: new THREE.Color(0xffffff) } }));
    this.clouds = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 8; j++) {
        const r = rand(4, 9);
        c.add(mesh(G.foliage(j + i * 3), cloudMat, j * 4.2 - 15, rand(-1, 2.5) + (j > 1 && j < 6 ? 2 : 0), rand(-3, 3), r * 2, r * 1.6, r * 2));
      }
      c.position.set(rand(-220, 220), rand(120, 175), rand(-60, -20));
      c.scale.y = 0.55;
      this.clouds.add(c);
    }
    this.clouds = bake(this.clouds);
    g.add(this.clouds);

    // Sun / moon / stars
    this.sunDisc = new THREE.Mesh(G.sphere(), new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }));
    this.sunDisc.scale.setScalar(26);
    this.sunDisc.position.set(-150, 160, -80);
    g.add(this.sunDisc);
    this.moon = new THREE.Mesh(G.sphere(), new THREE.MeshBasicMaterial({ color: 0xf4f1d8, fog: false }));
    this.moon.scale.setScalar(16);
    this.moon.position.set(120, 170, -80);
    g.add(this.moon);
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 400; i++) sp.push(rand(-500, 500), rand(90, 320), rand(-120, -60));
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, fog: false, sizeAttenuation: false }));
    g.add(this.stars);

    // Water / lake materials (shared by chunks)
    if (Q.pbr) {
      // Glassy water: rippling normal map + sky reflections from the environment.
      const mkWater = (rx, ry) => {
        const n = waterNormalTex().clone();
        n.repeat.set(rx, ry);
        n.needsUpdate = true;
        return new THREE.MeshStandardMaterial({ color: 0x1d5f99, roughness: 0.06, metalness: 0.35, normalMap: n, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.4 });
      };
      this.waterMat = mkWater(8, 6);
      this.lakeMat = mkWater(30, 6);
    } else {
      this.waterMat = new THREE.MeshToonMaterial({ color: 0xffffff, map: waterTex('#2f8fd8') });
      this.lakeMat = new THREE.MeshToonMaterial({ color: 0xffffff, map: waterTex('#3aa0e8') });
    }

    g.position.y = -12;
    this.skyline = g;
    this.scene.add(g);
  }

  buildSnow() {
    const n = this.quality === 'low' ? 600 : 1500;
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = rand(-30, 30);
      p[i * 3 + 1] = rand(0, 25);
      p[i * 3 + 2] = rand(-80, 10);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.9 }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.scene.add(this.snow);
  }

  // -------------------------------------------------------------------------
  reset() {
    for (const c of this.chunks.values()) this.removeChunk(c);
    this.chunks.clear();
    for (const a of this.animated) this.removeAnimated(a);
    this.animated = [];
    this.stations = [];
    this.nextChunk = 0;
  }

  update(dt, playerZ, camera) {
    this.time += dt;
    // spawn ahead
    while (-this.nextChunk * CHUNK_LEN > playerZ - AHEAD) {
      this.spawnChunk(this.nextChunk++);
    }
    // remove behind
    for (const [i, c] of this.chunks) {
      if (-(i + 1) * CHUNK_LEN > playerZ + 25) {
        this.removeChunk(c);
        this.chunks.delete(i);
      }
    }
    // Moving scenery outlives its chunk; drop it once it is behind the runner.
    for (let k = this.animated.length - 1; k >= 0; k--) {
      const a = this.animated[k];
      a.update(dt, this.time, playerZ);
      if (a.obj.position.z - (a.tail ?? 0) > playerZ + 30) {
        this.removeAnimated(a);
        this.animated.splice(k, 1);
      }
    }
    this.skyline.position.z = playerZ - 330;
    this.clouds.position.x = (this.time * 2) % 80;
    this.ferris.rotation.z = this.time * 0.06;
    // water flow
    const wm = Q.pbr ? 'normalMap' : 'map';
    this.waterMat[wm].offset.set((this.time * 0.02) % 1, (this.time * 0.12) % 1);
    this.lakeMat[wm].offset.set((this.time * 0.025) % 1, (this.time * 0.01) % 1);
    this.skyDome.position.copy(camera.position);
    GRASS_TIME.value = this.time;
    // shadow camera follows the runner
    // a lower sun throws longer, more dramatic shadows
    this.sun.position.set(-16, 22, playerZ + 10);
    this.sun.target.position.set(0, 0, playerZ - 8);
    this.playerLight.position.set(0, 5, playerZ - 3);
    if (this.snow.visible) {
      const pos = this.snow.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - dt * (3 + (i % 5));
        let x = pos.getX(i) + Math.sin(this.time + i) * dt * 0.8;
        if (y < 0) y += 25;
        pos.setXY(i, x, y);
      }
      pos.needsUpdate = true;
      this.snow.position.set(0, 0, camera.position.z - 20);
    }
  }

  removeChunk(c) {
    this.root.remove(c.group);
    disposeObject(c.group);
  }

  removeAnimated(a) {
    this.root.remove(a.obj);
    disposeObject(a.obj);
  }

  spawnChunk(i) {
    const z0 = -i * CHUNK_LEN;
    const dist = i * CHUNK_LEN;
    const ti = themeIndexAt(dist);
    const theme = THEMES[ti].id;
    const local = Math.floor((dist % SECTION_LEN) / CHUNK_LEN); // chunk index within the section
    const g = new THREE.Group();
    const animated = [];
    const ctx = { g, animated, i, local, z0, post: [] };
    if (theme === 'loop') this.buildLoop(ctx);
    else if (theme === 'millennium') this.buildMillennium(ctx);
    else if (theme === 'riverwalk') this.buildRiverwalk(ctx);
    else if (theme === 'wrigley') this.buildWrigley(ctx);
    else this.buildLincoln(ctx);
    if (local === 0 && i > 0) this.buildGateway(ctx, THEMES[ti].name);
    this.addStreetLife(ctx, theme);
    if (this.event === 'gameday' && (theme === 'wrigley' || theme === 'loop') && i % 2 === 0) {
      const p = makePennantString(theme === 'loop' ? 9 : 15);
      p.position.z = -12;
      g.add(p);
    }
    const baked = bake(g);
    baked.position.z = z0;
    for (const o of ctx.post) baked.add(o); // instanced detail can't be merged
    this.root.add(baked);
    for (const a of animated) {
      a.obj.position.z += z0;
      this.root.add(a.obj);
      this.animated.push(a);
    }
    this.chunks.set(i, { group: baked });
  }

  // -------------------------------------------------------------------------
  // Shared builders
  ground(g, mat, width, x = 0, y = 0, len = CHUNK_LEN) {
    const p = mesh(G.plane(), mat, x, y, -len / 2, width, len, 1);
    p.rotation.x = -Math.PI / 2;
    p.receiveShadow = true;
    g.add(p);
    return p;
  }

  building(g, x, z, w, h, d, style, color, seed, baseY = 0, storefront = false) {
    // A handful of facade variants per colour keeps textures + materials shared;
    // the street-facing side (depth d) sets the window tiling.
    const f = facadeTiled(style, color, Math.abs(seed | 0) % 3, d, h);
    const mat = toon(0xffffff, { map: f.map, emissive: 0xffffff, emissiveMap: f.emissiveMap, emissiveIntensity: 0, nightGlow: 0.42, roughness: style === 'glass' || style === 'dark' ? 0.25 : 0.85, metalness: style === 'glass' || style === 'dark' ? 0.35 : 0 });
    const roof = toon(style === 'glass' ? 0x5c7896 : 0x6b6f78);
    const b = new THREE.Mesh(G.box(), [mat, mat, roof, roof, mat, mat]);
    b.scale.set(w, h, d);
    b.position.set(x, baseY + h / 2, z);
    g.add(b);
    // floor ledges, a darker street-level base, cornice and parapet
    if (style !== 'glass' && style !== 'dark') {
      const trim = toon(0xe9e2d0, { roughness: 0.9 });
      for (let y = 3.6; y < h - 2; y += 6.6) g.add(box(trim, w + 0.16, 0.22, d + 0.16, x, baseY + y, z));
      g.add(box(toon(0xe9e2d0), w + 0.5, 0.5, d + 0.5, x, baseY + h + 0.1, z));
      g.add(box(toon(0xcfc6b2), w + 0.3, 0.9, d + 0.3, x, baseY + h + 0.6, z));
      g.add(box(toon(0x6b6f78), w - 0.4, 0.95, d - 0.4, x, baseY + h + 0.62, z)); // roof deck inset
    } else {
      // curtain wall: metal fins at the corners and a crown
      const fin = toon(0xb7c3cf, { roughness: 0.3, metalness: 0.7 });
      for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) g.add(box(fin, 0.3, h, 0.3, x + dx, baseY + h / 2, z + dz));
      g.add(box(fin, w + 0.2, 0.6, d + 0.2, x, baseY + h + 0.3, z));
    }
    if (!storefront) g.add(box(toon(0x3a3d44, { roughness: 0.6 }), w + 0.12, Math.min(3.2, h * 0.2), d + 0.12, x, baseY + Math.min(1.6, h * 0.1), z));
    if (Math.random() < 0.4) g.add(box(toon(0x8a8f99), w * 0.3, 1.2, d * 0.3, x + rand(-w / 4, w / 4), baseY + h + 0.6, z)); // HVAC
    if (Math.random() < 0.25) {
      // rooftop water tower — very Chicago
      const tx = x + rand(-w / 4, w / 4);
      g.add(cyl(toon(0x8b5a2b), 0.9, 1.6, tx, baseY + h + 2.2, z));
      g.add(mesh(G.cone(10), toon(0x5c3b1e), tx, baseY + h + 3.4, z, 2.0, 0.8, 2.0));
      for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) g.add(box(toon(0x333333), 0.08, 1.4, 0.08, tx + dx, baseY + h + 0.7, z + dz));
    }
    return b;
  }

  buildGateway(ctx, name) {
    const { g } = ctx;
    const steel = toon(0x1d3557);
    const z = -4;
    g.add(box(steel, 0.5, 7.5, 0.5, -4.6, 3.75, z), box(steel, 0.5, 7.5, 0.5, 4.6, 3.75, z));
    g.add(box(steel, 9.8, 0.4, 0.5, 0, 7.4, z));
    const sign = new THREE.Mesh(G.plane(), basic(0xffffff, { map: marqueeTex(name.toUpperCase(), { sub: 'WELCOME TO', bg: '#c8102e', w: 512, h: 128, font: 'bold 54px "Arial Black", Impact, sans-serif' }) }));
    sign.scale.set(8, 2, 1);
    sign.position.set(0, 6.2, z + 0.3);
    g.add(sign);
    for (let x = -4; x <= 4; x += 1) g.add(sphere(toon(0xfff2a8, { emissive: 0xffe08a, emissiveIntensity: 0.5, nightGlow: 2.5 }), 0.1, x, 7.65, z + 0.2));
  }

  // -------------------------------------------------------------------------
  // THE LOOP — elevated tracks among skyscrapers
  buildLoop({ g, animated, i, local, z0 }) {
    const L = CHUNK_LEN;
    // gravel deck
    this.ground(g, toon(this.event === 'snow' ? 0xdfe3e8 : 0x7a6e62), 10);
    // three tracks
    const tie = toon(0xffffff, { map: trackTex() });
    const rail = toon(0xb9c2cc);
    for (const x of LANES) {
      this.ground(g, tie, 2.0, x, 0.01);
      g.add(box(rail, 0.1, 0.12, L, x - 0.55, 0.07, -L / 2), box(rail, 0.1, 0.12, L, x + 0.55, 0.07, -L / 2));
    }
    // elevated structure: green steel girders on each side
    const green = toon(0x2f4f3a);
    const greenDark = toon(0x203a2a);
    for (const s of [-1, 1]) {
      g.add(box(green, 0.5, 0.9, L, s * 5.2, 0.1, -L / 2));
      for (let z = 0; z < L; z += 5) {
        g.add(box(greenDark, 0.4, 0.9, 0.4, s * 5.2, 0.9, -z));
        g.add(box(greenDark, 0.6, 14, 0.6, s * 5.0, -7, -z)); // columns down to the street
        const brace = box(greenDark, 0.2, 3.5, 0.2, s * 4.4, -1.8, -z - 1.2);
        brace.rotation.z = s * 0.6;
        g.add(brace);
      }
      g.add(box(green, 0.12, 0.12, L, s * 5.2, 1.35, -L / 2)); // handrail
    }
    // the street far below
    this.ground(g, toon(0x55595f), 60, 0, -12);
    // outer tracks on extended deck, sometimes with a train racing alongside
    for (const s of [-1, 1]) {
      this.ground(g, toon(0x6e6458), 3.6, s * 7.3, -0.05);
      g.add(box(rail, 0.1, 0.12, L, s * 7.3 - 0.55, 0.02, -L / 2), box(rail, 0.1, 0.12, L, s * 7.3 + 0.55, 0.02, -L / 2));
      g.add(box(green, 0.4, 0.5, L, s * 9.3, 0.2, -L / 2));
    }
    if (i % 4 === 2) {
      // Always slower than the runner, so you overtake it.
      const s = Math.random() < 0.5 ? -1 : 1;
      const train = makeTrain(4, 11);
      train.rotation.y = Math.PI;
      train.position.set(s * 7.3, 0, -10);
      const speed = rand(8, 12.5);
      animated.push({
        obj: train,
        tail: 50,
        update(dt) {
          train.position.z -= dt * speed;
        },
      });
    }
    // skyscrapers rising from the street on both sides
    for (const s of [-1, 1]) {
      if (s === 1 && local === 12) {
        // Daley Plaza and its untitled Picasso, in place of a tower.
        const pic = picasso();
        pic.position.set(22, -6, -15);
        pic.scale.setScalar(1.25);
        g.add(pic);
        continue;
      }
      let z = 0;
      while (z < L) {
        const d = rand(8, 13);
        const w = rand(8, 13);
        const h = rand(22, 55);
        const style = pick(['glass', 'stone', 'glass', 'dark', 'brick']);
        const col = style === 'glass' ? pick(['#4a7fb5', '#5c8fc4', '#3d6d9e']) : style === 'brick' ? pick(['#9c4a33', '#b5653d']) : style === 'dark' ? '#2e3442' : pick(['#d9cdb4', '#c8bfae', '#e6dcc8']);
        this.building(g, s * (11 + w / 2 + rand(0, 3)), -z - d / 2, w, h, d, style, col, (i * 7 + z) | 0, -12);
        z += d + rand(0.5, 2);
      }
    }
    // Chicago Theatre marquee once per section
    if (local === 6) {
      const s = 1;
      const sign = new THREE.Mesh(G.box(), [toon(0xd4202a), toon(0xd4202a), toon(0xd4202a), toon(0xd4202a), basic(0xffffff, { map: verticalChicagoTex() }), basic(0xffffff, { map: verticalChicagoTex() })]);
      sign.scale.set(0.8, 9, 1.6);
      sign.rotation.y = Math.PI / 2;
      sign.position.set(s * 10.6, 6, -15);
      g.add(sign);
      g.add(box(toon(0xd9b45a), 0.8, 2.2, 7, s * 10.6, 0.6, -15));
    }
    // station sign
    if (local % 5 === 3) {
      const name = STATIONS[(i / 5 | 0) % STATIONS.length];
      this.stations.push({ z: z0 - 8, name });
      const t = signTexCached(name);
      for (const s of [-1, 1]) {
        g.add(box(toon(0x2b2f36), 0.12, 3.2, 0.12, s * 4.8, 1.6, -8));
        const p = new THREE.Mesh(G.plane(), basic(0xffffff, { map: t }));
        p.scale.set(2.4, 0.5, 1);
        p.position.set(s * 4.8, 3.0, -7.92);
        g.add(p);
        // platform canopy
        g.add(box(toon(0x8b2a2a), 2.2, 0.15, 10, s * 7.3, 3.8, -8));
      }
    }
  }

  // -------------------------------------------------------------------------
  // MILLENNIUM PARK — the Bean, Crown Fountain, Pritzker, Buckingham, the lions
  buildMillennium(ctx) {
    const { g, animated, i, local } = ctx;
    const L = CHUNK_LEN;
    // keep the lawn out of the landmark plazas
    if ([2, 5, 9, 13, 17].includes(local)) this.addGrass(ctx, -7.5, -4.6, 260);
    else this.addGrass(ctx, -40, -4.6, 1400);
    this.addGrass(ctx, 4.6, 10, 260, false);
    const snow = this.event === 'snow';
    this.ground(g, toon(0xffffff, { map: paverTex(snow ? '#eeeeee' : '#d8d4cc') }), 8.6);
    const grass = toon(0xffffff, { map: grassTex(snow ? '#e9eef3' : '#6cc04a') });
    this.ground(g, grass, 44, -26.3, -0.02);
    this.ground(g, grass, 6, 7.3, -0.02);
    // Michigan Avenue and its historic streetwall on the right
    this.ground(g, toon(0xffffff, { map: asphaltTex() }), 8, 14.3, -0.03);
    for (let z = 0; z < L; ) {
      const d = rand(8, 12);
      const h = rand(22, 58);
      this.building(g, 25 + rand(0, 2), -z - d / 2, 12, h, d, pick(['stone', 'stone', 'brick', 'glass']), pick(['#e6dcc8', '#d9cdb4', '#b5653d', '#5c8fc4']), (i * 5 + z) | 0, -0.03);
      z += d + 0.4;
    }
    for (let z = 5; z < L; z += 10) {
      const lamp = makeTwinLamp();
      lamp.position.set(4.8, 0, -z);
      g.add(lamp);
    }
    const landmark = [2, 5, 9, 13, 17].includes(local);
    if (local === 2) {
      const bean = cloudGate();
      bean.position.set(-14, 0, -15);
      bean.rotation.y = 0.25;
      g.add(bean);
      // tourists taking Bean selfies
      for (let k = 0; k < 6; k++) {
        const f = makeFan(pick([0xff6b6b, 0x4dabf7, 0xffd43b, 0x9775fa, 0x63e6be]));
        f.position.set(-14 + rand(-8, 8), 0, -15 + (k % 2 ? 6.5 : -6.5) + rand(-1, 1));
        f.rotation.y = f.position.z > -15 ? Math.PI : 0;
        g.add(f);
      }
    } else if (local === 5) {
      const cf = crownFountain(i);
      cf.position.set(-13, 0, -15);
      g.add(cf);
    } else if (local === 9) {
      const pp = pritzkerPavilion();
      pp.position.set(-52, 0, -15);
      g.add(pp);
    } else if (local === 13) {
      const bf = buckinghamFountain();
      bf.group.position.set(-20, 0, -15);
      g.add(bf.group);
      const jet = bf.jet;
      jet.position.set(-20, 5.6, -15);
      animated.push({ obj: jet, tail: 0, update(dt, t) { jet.scale.y = 11 + Math.sin(t * 1.3) * 3; } });
    } else if (local === 17) {
      const lions = artInstituteLions(this.event);
      lions.position.set(-9, 0, -15);
      lions.rotation.y = Math.PI;
      g.add(lions);
    }
    // benches, trees and picnics on the lawn
    for (let z = 3; z < L; z += 9) {
      const b = makeBench();
      b.position.set(-5.4, 0, -z);
      b.rotation.y = Math.PI / 2;
      g.add(b);
    }
    if (!landmark) {
      for (let z = 2; z < L; z += rand(5, 8)) {
        const t = makeTree(rand(1, 1.4), snow ? 0xe6eef5 : pick([0x3fae49, 0x4caf50, 0x2f9e44]));
        t.position.set(rand(-9, -22), 0, -z);
        g.add(t);
      }
      if (!snow) {
        // picnic blanket with two people
        const x = rand(-14, -24);
        const z = -rand(5, 25);
        g.add(box(toon(pick([0xe63946, 0x4dabf7, 0xffd43b])), 2.4, 0.04, 2.4, x, 0.03, z));
        for (const dx of [-0.6, 0.6]) {
          const f = makeFan(pick([0xffffff, 0xff8c42, 0x69db7c]));
          f.position.set(x + dx, -0.6, z);
          g.add(f);
        }
      }
    }
  }

  /** Green street signs at real intersections, plus pigeons and buskers. */
  addStreetLife({ g, animated, i, local }, theme) {
    if (local % 6 === 2) {
      const list = STREETS[theme];
      const [a, b, note] = list[Math.floor(i / 6) % list.length];
      const sign = streetSign(a, b, note || '');
      const x = { loop: -4.7, millennium: 4.6, riverwalk: 4.6, wrigley: -4.4, lincoln: 4.5 }[theme];
      sign.position.set(x, theme === 'wrigley' ? 0.18 : 0, -22);
      g.add(sign);
    }
    if (theme !== 'loop' && local % 4 === 1 && this.event !== 'snow') {
      const flock = pigeons(4 + (i % 3));
      const side = theme === 'riverwalk' ? 1 : Math.random() < 0.5 ? -1 : 1;
      flock.obj.position.set(side * rand(5.2, 6.5), theme === 'wrigley' ? 0.18 : 0, -rand(4, 26));
      animated.push(flock);
    }
    if (theme === 'riverwalk' && local % 6 === 4) {
      const m = busker(i % 2 ? 'sax' : 'guitar');
      m.position.set(6.6, 0, -18);
      m.rotation.y = Math.PI / 2;
      g.add(m);
    }
  }

  // -------------------------------------------------------------------------
  // RIVERWALK — river on the left, bridges overhead
  buildRiverwalk({ g, animated, i, local }) {
    const L = CHUNK_LEN;
    const snow = this.event === 'snow';
    this.ground(g, toon(0xffffff, { map: paverTex(snow ? '#e4e2de' : '#cdbfa6') }), 9);
    this.ground(g, toon(0xffffff, { map: paverTex(snow ? '#f2f2f2' : '#b8a888') }), 6, 7.5);
    // river wall + water
    g.add(box(toon(0xa59f94), 1.0, 2.0, L, -5.0, -0.95, -L / 2));
    const railing = makeRailing(L, 0x2b2f36);
    railing.position.set(-4.7, 0, -L / 2);
    g.add(railing);
    const water = mesh(G.plane(), this.waterMat, -30, -1.6, -L / 2, 50, L, 1);
    water.rotation.x = -Math.PI / 2;
    g.add(water);
    // far bank buildings across the river (Marina City's corncobs once a section)
    if (local === 7) {
      const mc = marinaCity();
      mc.position.set(-62, -1.6, -15);
      g.add(mc);
    } else for (let z = 0; z < L; z += 11) {
      const h = rand(18, 50);
      this.building(g, -60, -z - 5, 12, h, 10, pick(['glass', 'stone', 'brick']), pick(['#4a7fb5', '#d9cdb4', '#a2472f', '#5c8fc4']), i * 3 + z, -1.6);
    }
    // right side: planters, lamps, benches, then building facades
    for (let z = 3; z < L; z += 10) {
      const p = makeFlowerPlanter(2.2);
      p.position.set(5.6, 0, -z);
      g.add(p);
      const lamp = makeTwinLamp();
      lamp.position.set(4.8, 0, -z - 5);
      g.add(lamp);
    }
    for (let z = 0; z < L; ) {
      const d = rand(9, 13);
      const w = 10;
      const h = rand(14, 40);
      this.building(g, 15 + rand(0, 2), -z - d / 2, w, h, d, pick(['stone', 'glass', 'brick']), pick(['#e6dcc8', '#c8bfae', '#5c8fc4', '#b5653d']), i * 11 + z | 0);
      z += d + 0.6;
    }
    // bascule bridge every third chunk, spanning river and path
    if (local % 3 === 1) {
      const z = -14;
      const red = toon(0x8b2a2a);
      const redD = toon(0x6e1f1f);
      g.add(box(red, 60, 0.9, 6, -18, 7.5, z));
      g.add(box(toon(0x55595f), 60, 0.3, 5.8, -18, 8.05, z));
      for (const dz of [-2.9, 2.9]) {
        g.add(box(red, 60, 0.2, 0.25, -18, 9.4, z + dz));
        for (let x = -46; x <= 10; x += 2.4) {
          const d = box(redD, 0.15, 2.1, 0.15, x, 8.6, z + dz);
          d.rotation.z = (x / 2.4) % 2 ? 0.7 : -0.7;
          g.add(d);
        }
      }
      // bridge tender houses
      for (const bx of [-6.5, 8.5]) {
        g.add(box(toon(0xe8dcc4), 3, 11, 3, bx, 4.0, z + 5));
        g.add(mesh(G.cone(4), toon(0x5c6b5e), bx, 10.3, z + 5, 4.2, 2, 4.2));
        g.children.at(-1).rotation.y = Math.PI / 4;
        for (let y = 2; y < 9; y += 2.5) g.add(box(toon(0x2c3e57, { emissive: 0xffd27a, emissiveIntensity: 0, nightGlow: 0.8 }), 0.8, 1.2, 3.05, bx, y, z + 5));
      }
      // pillars on the riverbank
      g.add(box(toon(0xa59f94), 1.5, 9, 6, -5.6, 3, z));
      g.add(box(toon(0xa59f94), 1.5, 9, 6, 7.2, 3, z));
    }
    // boats
    if (i % 2 === 0) {
      // dir 1 = cruising the same way as the runner, -1 = oncoming
      const boat = Math.random() < 0.6 ? makeWaterTaxi() : makeTourBoat();
      const dir = Math.random() < 0.5 ? 1 : -1;
      boat.position.set(dir > 0 ? -10 : -16, -1.6, -rand(0, L));
      if (dir > 0) boat.rotation.y = Math.PI; // bow (+Z in the model) faces travel direction
      const sp = rand(4, 9);
      animated.push({
        obj: boat,
        tail: 10,
        update(dt, t) {
          boat.position.z -= dt * sp * dir;
          boat.position.y = -1.6 + Math.sin(t * 2 + sp) * 0.08;
        },
      });
    }
    if (this.event === 'stpats' && i % 2 === 1) {
      // green bunting across the path
      const p = makePennantString(10, [0x1fa64a, 0xffffff, 0xff8c1a]);
      p.position.set(0, 0, -6);
      g.add(p);
    }
  }

  // -------------------------------------------------------------------------
  // WRIGLEYVILLE — storefronts, the ballpark, game-day crowds
  buildWrigley({ g, animated, i, local }) {
    const L = CHUNK_LEN;
    this.ground(g, toon(0xffffff, { map: asphaltTex(), roughness: 0.92 }), 7.6);
    if (local % 4 === 2) {
      // zebra crosswalk and a stop line
      const paint = toon(0xf2efe4, { roughness: 0.55 });
      for (let x = -3.3; x <= 3.31; x += 0.82) g.add(box(paint, 0.5, 0.02, 3, x, 0.012, -26));
      g.add(box(paint, 7.4, 0.02, 0.35, 0, 0.012, -23.6));
    }
    // a manhole cover with the city seal ring
    const mh = rand(-2.6, 2.6);
    const mz = -rand(4, 22);
    g.add(cyl(toon(0x3a3c42, { metalness: 0.7, roughness: 0.5 }), 0.42, 0.03, mh, 0.012, mz, 24));
    g.add(mesh(G.torus(0.3, 0.025, 24), toon(0x2a2c30, { metalness: 0.7, roughness: 0.5 }), mh, 0.03, mz));
    g.children.at(-1).rotation.x = Math.PI / 2;
    const curb = toon(0xb9b2a5);
    const walk = toon(0xffffff, { map: paverTex(this.event === 'snow' ? '#f0f0f0' : '#d7d1c4') });
    for (const s of [-1, 1]) {
      g.add(box(curb, 0.3, 0.2, L, s * 3.95, 0.1, -L / 2));
      const w = mesh(G.plane(), walk, s * 6.0, 0.18, -L / 2, 4, L, 1);
      w.rotation.x = -Math.PI / 2;
      w.receiveShadow = true;
      g.add(w);
    }
    const isWrigley = local === 4 || local === 5;
    for (const s of [-1, 1]) {
      if (isWrigley && s === 1) {
        this.buildBallpark(g, local === 4);
        continue;
      }
      // storefront row
      let z = 0;
      while (z < L) {
        const w = rand(6, 8);
        const h = rand(9, 14);
        const brickCol = pick(['#a2472f', '#8f3b2a', '#b5653d', '#7a4a3a', '#c2a27a']);
        const x = s * (8 + 3);
        const b = this.building(g, x, -z - w / 2, 6, h, w, 'brick', brickCol, (i * 13 + z) | 0, 0.18, true);
        if (s === -1 && local >= 3 && local <= 6) {
          // rooftop seats looking into the ballpark across the street
          const rb = rooftopBleachers();
          rb.position.set(-9.6, h + 0.6, -z - w / 2);
          g.add(rb);
        }
        // ground floor shop
        const [label, col] = pick(SHOPS);
        const face = s * (8 - 0.04);
        g.add(box(toon(0x9cc9e8, { emissive: 0xffd27a, emissiveIntensity: 0, nightGlow: 0.7 }), 0.1, 2.2, w - 1.2, face, 1.4, -z - w / 2));
        g.add(box(toon(0x3b2a20), 0.12, 2.4, 0.9, face, 1.3, -z - w + 0.9)); // door
        const aw = mesh(G.box(), toon(0xffffff, { map: awningTex(col, '#ffffff') }), s * 7.5, 3.0, -z - w / 2, 1.2, 0.12, w - 0.6);
        aw.rotation.z = s * -0.45;
        g.add(aw);
        const sign = new THREE.Mesh(G.plane(), basic(0xffffff, { map: shopSignTex(label, col) }));
        sign.scale.set(w - 1.5, 0.8, 1);
        sign.rotation.y = -s * Math.PI / 2;
        sign.position.set(face - s * 0.03, 3.9, -z - w / 2);
        g.add(sign);
        z += w + 0.2;
      }
    }
    for (let z = 4; z < L; z += 12) {
      for (const s of [-1, 1]) {
        const lamp = makeLampPost({ banner: true, wflag: this.event === 'gameday' });
        lamp.position.set(s * 4.5, 0.18, -z);
        if (s < 0) lamp.rotation.y = Math.PI;
        g.add(lamp);
      }
    }
    if (Math.random() < 0.7) {
      const mb = makeMailbox();
      mb.position.set(-5.2, 0.18, -rand(6, 24));
      mb.rotation.y = Math.PI / 2;
      g.add(mb);
    }
    if (Math.random() < 0.6) {
      for (let k = 0; k < 3; k++) {
        const b = makeParkedBike();
        b.position.set(5.6, 0.18, -10 - k * 0.8);
        b.rotation.y = Math.PI / 2;
        g.add(b);
      }
    }
    if (Math.random() < 0.4) {
      const sh = makeBusShelter();
      sh.position.set(-6.2, 0.18, -20);
      sh.rotation.y = Math.PI / 2;
      g.add(sh);
    }
    if (this.event === 'gameday' || isWrigley) {
      // fans on the sidewalks
      const cols = [0x0e3386, 0x0e3386, 0xcc3433, 0xffffff];
      const n = this.event === 'gameday' ? 8 : 3;
      for (let k = 0; k < n; k++) {
        const f = makeFan(pick(cols));
        const s = Math.random() < 0.5 ? -1 : 1;
        f.position.set(s * rand(5, 7), 0.18, -rand(0, L));
        f.rotation.y = rand(-1, 1) + (s > 0 ? -Math.PI / 2 : Math.PI / 2);
        g.add(f);
      }
    }
  }

  buildBallpark(g, withSign) {
    const L = CHUNK_LEN;
    if (!withSign) {
      const sb = oldScoreboard(this.event);
      sb.position.set(13.5, 11.4, -15);
      g.add(sb);
    }
    const brick = toon(0xffffff, { map: brickTex('#9a3a2a') });
    const green = toon(0x1f5c3a);
    g.add(box(brick, 4, 8, L, 11, 4.1, -L / 2));
    // arched windows
    for (let z = 2; z < L; z += 3) {
      g.add(box(toon(0x1f3d2b), 0.1, 2.6, 1.8, 8.98, 3.2, -z));
    }
    // upper deck steel + green
    g.add(box(green, 6, 3, L, 13, 9.6, -L / 2));
    g.add(box(toon(0xe8eef5), 6.2, 0.3, L, 13, 11.2, -L / 2));
    for (let z = 0; z < L; z += 4) g.add(box(green, 0.3, 4, 0.3, 9.2, 10, -z));
    // light towers peeking above
    for (const z of [6, 22]) {
      g.add(box(toon(0x8a96a3), 0.4, 14, 0.4, 16, 13, -z));
      g.add(box(toon(0xe8eef5, { emissive: 0xffffff, emissiveIntensity: 0.2, nightGlow: 2 }), 3.5, 1.6, 0.4, 16, 20.5, -z));
    }
    if (withSign) {
      // The famous red marquee on its pole
      const red = toon(0xc8102e);
      g.add(box(toon(0x2b2f36), 0.35, 6, 0.35, 7.2, 3, -18));
      const sign = new THREE.Mesh(G.box(), [red, red, red, red,
        basic(0xffffff, { map: marqueeTex('WRIGLEY FIELD', { sub: 'HOME OF CHICAGO CUBS', w: 512, h: 160, font: 'bold 62px "Arial Black", Impact, sans-serif' }) }), red]);
      sign.scale.set(6, 2.2, 0.5);
      sign.position.set(7.2, 6.8, -17.5);
      g.add(sign);
      const sub = new THREE.Mesh(G.plane(), basic(0xffffff, { map: marqueeTex('GAME TODAY', { bg: '#0e3386', bulbs: false, font: 'bold 60px "Arial Black", Impact, sans-serif' }) }));
      sub.scale.set(4.4, 0.9, 1);
      sub.position.set(7.2, 5.1, -17.24);
      g.add(sub);
    }
  }

  // -------------------------------------------------------------------------
  // LINCOLN PARK — lakefront trail
  /**
   * Instanced grass tufts and wildflowers scattered over a lawn rectangle,
   * swaying in the lake breeze (vertex shader). Skipped on low quality.
   */
  addGrass(ctx, x0, x1, count, flowers = true) {
    if (!Q.pbr || this.event === 'snow') return;
    const n = Math.round(count * Q.particles);
    const tufts = new THREE.InstancedMesh(grassGeo(), grassMat(), n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      p.set(rand(x0, x1), 0, -rand(0, CHUNK_LEN));
      q.setFromAxisAngle(UP, rand(0, Math.PI * 2));
      const s = rand(0.8, 1.5);
      sc.set(s, s * rand(0.8, 1.3), s);
      tufts.setMatrixAt(k, m.compose(p, q, sc));
    }
    tufts.receiveShadow = true;
    ctx.post.push(tufts);
    if (!flowers) return;
    const fn = Math.round(n * 0.18);
    const fl = new THREE.InstancedMesh(G.sphere(6, 4), flowerMat(), fn);
    const cols = [0xffffff, 0xffd43b, 0xff6b9a, 0xc77dff, 0xff8c42];
    const c = new THREE.Color();
    for (let k = 0; k < fn; k++) {
      p.set(rand(x0, x1), rand(0.18, 0.3), -rand(0, CHUNK_LEN));
      sc.setScalar(rand(0.08, 0.13));
      fl.setMatrixAt(k, m.compose(p, q.identity(), sc));
      fl.setColorAt(k, c.set(cols[k % cols.length]));
    }
    ctx.post.push(fl);
  }

  buildLincoln(ctx) {
    const { g, animated, i, local } = ctx;
    const L = CHUNK_LEN;
    this.addGrass(ctx, 4.5, 24, 1300);
    this.addGrass(ctx, -8, -4.4, 300);
    this.ground(g, toon(0xe1d9c8), 8.2);
    const grass = toon(0xffffff, { map: grassTex(this.event === 'snow' ? '#e9eef3' : '#6cc04a') });
    this.ground(g, grass, 20, 14, -0.02);
    this.ground(g, grass, 4, -6, -0.02);
    // beach + lake on the left
    this.ground(g, toon(this.event === 'snow' ? 0xf2f2f2 : 0xf3dfa6), 10, -13, -0.05);
    const lake = mesh(G.plane(), this.lakeMat, -120, -0.3, -L / 2, 200, L, 1);
    lake.rotation.x = -Math.PI / 2;
    g.add(lake);
    // trail edge
    for (const s of [-1, 1]) g.add(box(toon(0xc7bda8), 0.2, 0.1, L, s * 4.15, 0.05, -L / 2));
    // trees
    for (let z = 2; z < L; z += rand(4, 7)) {
      const t = makeTree(rand(0.9, 1.4), this.event === 'snow' ? 0xe6eef5 : pick([0x3fae49, 0x4caf50, 0x2f9e44, 0x66bb6a]));
      t.position.set(rand(7, 18), 0, -z);
      g.add(t);
    }
    for (let z = 5; z < L; z += 15) {
      const t = makeTree(rand(0.8, 1.1), this.event === 'snow' ? 0xe6eef5 : 0x3fae49);
      t.position.set(-6.5, 0, -z);
      g.add(t);
      const lamp = makeLampPost({ banner: false });
      lamp.position.set(4.9, 0, -z - 7);
      g.add(lamp);
      const b = makeBench();
      b.position.set(5.6, 0, -z - 3);
      b.rotation.y = -Math.PI / 2;
      g.add(b);
    }
    // beach umbrellas
    if (this.event !== 'snow' && this.event !== 'night') {
      for (let k = 0; k < 2; k++) {
        const x = rand(-16, -10);
        const z = -rand(0, L);
        g.add(cyl(toon(0xdddddd), 0.04, 2, x, 1, z));
        g.add(mesh(G.cone(8), toon(pick([0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c])), x, 2.1, z, 2.2, 0.6, 2.2));
      }
    }
    // sailboats out on the lake, a lifeguard chair, and the zoo
    if (this.event !== 'snow') {
      const boat = sailboat();
      boat.position.set(-rand(30, 70), -0.3, -rand(0, L));
      boat.rotation.y = rand(-0.4, 0.4);
      const ph = rand(0, 6);
      animated.push({ obj: boat, tail: 0, update(dt, t) { boat.position.y = -0.3 + Math.sin(t * 1.6 + ph) * 0.12; boat.rotation.z = Math.sin(t * 1.1 + ph) * 0.06; } });
      if (local % 5 === 2) {
        const lg = lifeguardStand();
        lg.position.set(-13, 0, -12);
        g.add(lg);
      }
    }
    if (local === 14) {
      const zoo = zooGiraffes();
      zoo.position.set(14, 0, -14);
      g.add(zoo);
    }
    // Conservatory dome once per section
    if (local === 8) {
      const glass = toon(0xcfeeea, { opacity: 0.85 });
      g.add(box(toon(0xe8eef5), 12, 3, 8, 22, 1.5, -15));
      g.add(mesh(G.hemi(), glass, 22, 3, -15, 8, 7, 8));
      g.add(mesh(G.hemi(), glass, 17, 3, -15, 4, 4, 4), mesh(G.hemi(), glass, 27, 3, -15, 4, 4, 4));
    }
  }
}

// ---------------------------------------------------------------------------
// Instanced grass: three crossed blades with a dark-to-light gradient, swaying
// via a shared time uniform.
const UP = new THREE.Vector3(0, 1, 0);
const GRASS_TIME = { value: 0 };
let _grassGeo = null;
let _grassMat = null;
let _flowerMat = null;
function grassGeo() {
  if (_grassGeo) return _grassGeo;
  const pos = [];
  const col = [];
  // five short blades fanned around the centre: a soft, dense clump
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const cx = Math.cos(a) * 0.05;
    const cz = Math.sin(a) * 0.05;
    const tx = -Math.sin(a) * 0.035;
    const tz = Math.cos(a) * 0.035;
    const h = 0.2 + (k % 3) * 0.05;
    pos.push(cx - tx, 0, cz - tz, cx + tx, 0, cz + tz, cx * 3, h, cz * 3);
    col.push(0.2, 0.42, 0.12, 0.2, 0.42, 0.12, 0.55, 0.85, 0.32);
  }
  _grassGeo = new THREE.BufferGeometry();
  _grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  _grassGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  _grassGeo.computeVertexNormals();
  _grassGeo.userData.shared = true;
  return _grassGeo;
}
function grassMat() {
  if (_grassMat) return _grassMat;
  _grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 });
  _grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GRASS_TIME;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 2.2 + wp.x * 0.7 + wp.z * 0.5) * 0.08 + sin(uTime * 3.7 + wp.z) * 0.03;
        transformed.x += sway * position.y * 2.0;
        transformed.z += sway * position.y;`);
  };
  return _grassMat;
}
function flowerMat() {
  if (_flowerMat) return _flowerMat;
  _flowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x222222 });
  return _flowerMat;
}

const stationTexCache = new Map();
function signTexCached(name) {
  if (!stationTexCache.has(name)) {
    stationTexCache.set(name, marqueeTex(name, { bg: '#1b2735', fg: '#ffffff', bulbs: false, font: 'bold 50px Arial, sans-serif' }));
  }
  return stationTexCache.get(name);
}
