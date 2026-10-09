// Stylised low-poly models for obstacles, pickups and street props.
// Everything faces +Z (towards the oncoming runner, who runs down -Z).
import * as THREE from 'three';
import { G, mesh, box, cyl, sphere, shadows } from './geo.js';
import {
  toon, basic, chicagoFlagTex, coinFaceTex, stripesTex, trainFrontTex, trainSideTex,
  shelterAdTex, marqueeTex, wFlagTex,
} from './materials.js';

const C = {
  orange: 0xff7a1a, white: 0xf7f7f2, red: 0xe63946, black: 0x23252b, steel: 0x8a96a3,
  darkSteel: 0x4a5561, wood: 0xa86b3c, darkWood: 0x6b4226, green: 0x2f9e44, blue: 0x2563c9,
  yellow: 0xffc61a, cream: 0xf3e9d2, chiBlue: 0x6ec6f0, chiRed: 0xe4002b, lampGreen: 0x1f3d2b,
};

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------
const coinGeo = {};
function getCoinGeo() {
  // One geometry + one material per coin: the caps sample the star face on the
  // left half of the texture atlas, the rim samples the solid gold right half.
  if (coinGeo.g) return coinGeo.g;
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
  const uv = g.attributes.uv;
  const seen = new Set();
  for (const grp of g.groups) {
    for (let i = grp.start; i < grp.start + grp.count; i++) {
      const vi = g.index.getX(i);
      if (seen.has(vi)) continue;
      seen.add(vi);
      if (grp.materialIndex === 0) uv.setXY(vi, 0.8, 0.5);
      else uv.setX(vi, uv.getX(vi) * 0.5);
    }
  }
  g.clearGroups();
  g.userData.shared = true;
  coinGeo.g = g;
  return g;
}

export function makeCoin(green = false) {
  const m = new THREE.Mesh(getCoinGeo(), basic(0xffffff, { map: coinFaceTex(green) }));
  m.rotation.x = Math.PI / 2;
  m.scale.set(0.9, 0.14, 0.9);
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export function makePizza() {
  const g = new THREE.Group();
  const crust = toon(0xd99a4e);
  const cheese = toon(0xffcf4a);
  const pep = toon(0xc0392b);
  const w = mesh(G.wedge(Math.PI / 4), cheese, 0, 0, 0, 0.9, 0.12, 0.9);
  w.rotation.y = -Math.PI / 8 + Math.PI;
  g.add(w);
  // crust rim along the arc (torus arc lies in XZ after the inner tilt)
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.1, 6, 8, Math.PI / 4), crust);
  arc.rotation.x = Math.PI / 2;
  const arcG = new THREE.Group();
  arcG.rotation.y = (5 * Math.PI) / 8;
  arcG.add(arc);
  g.add(arcG);
  for (const [x, z] of [[0, -0.45], [0.12, -0.7], [-0.12, -0.68], [0, -0.25]]) {
    g.add(mesh(G.cyl(10), pep, x, 0.08, z, 0.2, 0.05, 0.2));
  }
  g.rotation.x = 1.1; // tip down, toppings facing the runner
  const holder = new THREE.Group();
  g.position.y = -0.2;
  holder.add(g);
  return holder;
}

export function makeHotDog() {
  const g = new THREE.Group();
  const bun = toon(0xe8b06a);
  const dog = toon(0xb5452d);
  const relish = toon(0x2fd14a);
  const mustard = toon(0xffd400);
  const b = mesh(G.capsule(), bun, 0, -0.08, 0, 0.42, 0.42, 0.32);
  b.rotation.z = Math.PI / 2;
  g.add(b);
  const d = mesh(G.capsule(), dog, 0, 0.06, 0, 0.22, 0.5, 0.22);
  d.rotation.z = Math.PI / 2;
  g.add(d);
  const r = box(relish, 0.7, 0.05, 0.1, 0, 0.18, 0);
  g.add(r);
  for (let i = -2; i <= 2; i++) g.add(box(mustard, 0.08, 0.04, 0.16, i * 0.14, 0.2, 0));
  g.add(mesh(G.cyl(8), toon(0xff3b30), 0.2, 0.2, 0.05, 0.12, 0.06, 0.12)); // tomato
  g.add(mesh(G.cone(6), toon(0x7bc043), -0.2, 0.22, 0.04, 0.08, 0.2, 0.08)); // sport pepper
  g.children.at(-1).rotation.z = Math.PI / 2;
  g.rotation.x = 0.7; // tilt the toppings towards the runner
  const holder = new THREE.Group();
  holder.add(g);
  return holder;
}

export function makeFlag() {
  const g = new THREE.Group();
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7, 6, 1), toon(0xffffff, { map: chicagoFlagTex(), side: THREE.DoubleSide }));
  flag.position.set(0.55, 0.2, 0);
  // gentle wave baked into the geometry
  const pos = flag.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 4) * 0.06);
  flag.geometry.computeVertexNormals();
  g.add(flag);
  g.add(cyl(toon(C.darkSteel), 0.04, 1.4, 0, -0.1, 0));
  g.add(sphere(toon(C.yellow), 0.07, 0, 0.62, 0));
  g.position.x = -0.4;
  const h = new THREE.Group();
  h.add(g);
  return h;
}

export function makeCoffee() {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(14, 0.34, 0.26), toon(0xf4efe6), 0, 0, 0, 1, 0.9, 1));
  g.add(mesh(G.cyl(14, 0.35, 0.35), toon(0x6f4e37), 0, 0.02, 0, 1, 0.3, 1)); // sleeve
  g.add(mesh(G.cyl(14, 0.37, 0.37), toon(0x3b2a20), 0, 0.48, 0, 1, 0.08, 1)); // lid
  g.add(mesh(G.cyl(14, 0.3, 0.37), toon(0x3b2a20), 0, 0.56, 0, 1, 0.08, 1));
  // tiny skyline on the sleeve
  const sk = toon(0x2b3a55);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI - Math.PI / 2;
    g.add(box(sk, 0.06, 0.1 + (i % 3) * 0.06, 0.02, Math.sin(a) * 0.35, 0.05, Math.cos(a) * 0.35));
  }
  // steam
  const steam = toon(0xffffff, { opacity: 0.7 });
  g.add(sphere(steam, 0.08, 0.05, 0.78, 0), sphere(steam, 0.06, -0.06, 0.92, 0));
  return g;
}

export function makeShamrock() {
  const g = new THREE.Group();
  const leaf = toon(0x23c552, { emissive: 0x0b5e22, emissiveIntensity: 0.6 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const l = new THREE.Group();
    l.add(sphere(leaf, 0.22, -0.11, 0, 0), sphere(leaf, 0.22, 0.11, 0, 0));
    l.add(mesh(G.cone(4), leaf, 0, -0.16, 0, 0.42, 0.3, 0.2));
    l.children[2].rotation.z = Math.PI;
    l.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0);
    l.rotation.z = a - Math.PI / 2;
    l.scale.z = 0.4;
    g.add(l);
  }
  g.add(mesh(G.cyl(6), toon(0x1b8a3a), 0.1, -0.45, 0, 0.06, 0.5, 0.06));
  g.children.at(-1).rotation.z = 0.4;
  return g;
}

export const PICKUPS = {
  pizza: { make: makePizza, color: '#ffcf4a', icon: '🍕', name: 'Deep-Dish Pizza', desc: '2× score' },
  hotdog: { make: makeHotDog, color: '#ff7043', icon: '🌭', name: 'Chicago Hot Dog', desc: 'Speed boost (hold the ketchup)' },
  flag: { make: makeFlag, color: '#6ec6f0', icon: '🛡️', name: 'Chicago Flag', desc: 'Shield' },
  coffee: { make: makeCoffee, color: '#a47148', icon: '☕', name: 'Coffee', desc: 'Coin magnet' },
  shamrock: { make: makeShamrock, color: '#23c552', icon: '☘️', name: 'Lucky Shamrock', desc: 'Extra life' },
  popcorn: { make: makePopcorn, color: '#ffb000', icon: '🍿', name: 'Chicago Mix', desc: 'Cheese + caramel = bonus coins' },
};

export function makePopcorn() {
  // A tin of Chicago Mix: half cheese corn, half caramel corn.
  const g = new THREE.Group();
  g.add(mesh(G.cyl(16), toon(0xffffff, { map: stripesTex('#0e3386', '#ffffff', 6) }), 0, 0, 0, 0.8, 0.7, 0.8));
  g.add(mesh(G.cyl(16), toon(0xc8102e), 0, 0.37, 0, 0.84, 0.06, 0.84));
  const cheese = toon(0xffa51f);
  const caramel = toon(0xb5651d);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4;
    const r = 0.1 + (i % 4) * 0.08;
    g.add(sphere(i % 2 ? cheese : caramel, 0.11, Math.cos(a) * r, 0.45 + (i % 3) * 0.07, Math.sin(a) * r));
  }
  return g;
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------
export function makeFestivalBanner(text = 'BLUES FEST') {
  // Millennium Park festival banner strung low across the path - slide.
  const g = new THREE.Group();
  const pole = toon(0x2b2f36);
  g.add(box(pole, 0.14, 3.2, 0.14, -1.15, 1.6, 0), box(pole, 0.14, 3.2, 0.14, 1.15, 1.6, 0));
  const sign = new THREE.Mesh(G.box(), [toon(0x0e3386), toon(0x0e3386), toon(0x0e3386), toon(0x0e3386),
    basic(0xffffff, { map: marqueeTex(text, { bg: '#0e3386', fg: '#ffd34d', bulbs: false, font: 'bold 58px "Arial Black", Impact, sans-serif' }) }),
    basic(0xffffff, { map: marqueeTex(text, { bg: '#0e3386', fg: '#ffd34d', bulbs: false, font: 'bold 58px "Arial Black", Impact, sans-serif' }) })]);
  sign.scale.set(2.3, 0.9, 0.08);
  sign.position.set(0, 1.85, 0);
  g.add(sign);
  [-0.9, -0.3, 0.3, 0.9].forEach((x, i) => {
    const p = mesh(G.cone(3), toon(i % 2 ? 0xe4002b : 0x6ec6f0), x, 1.25, 0, 0.3, 0.3, 0.04);
    p.rotation.z = Math.PI;
    g.add(p);
  });
  return shadows(g);
}

export function makeBucketDrummers() {
  // Street performers drumming on upturned plastic buckets - go around them.
  const g = new THREE.Group();
  const skins = [0x8d5524, 0xc68642, 0x5a3825];
  const shirts = [0xe63946, 0xffffff, 0x0e3386];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Group();
    p.add(mesh(G.cyl(12, 0.26, 0.22), toon(i === 1 ? 0xff7a1a : 0xf2f2f2), 0, 0.3, 0, 1, 0.6, 1)); // seat bucket
    p.add(mesh(G.capsule(), toon(shirts[i]), 0, 1.05, 0, 0.44, 0.45, 0.32));
    p.add(sphere(toon(skins[i]), 0.22, 0, 1.6, 0));
    p.add(mesh(G.cyl(12, 0.24, 0.2), toon(0xffffff), 0, 0.55, -0.55, 1, 0.5, 1)); // drum bucket
    p.add(mesh(G.cyl(12, 0.24, 0.2), toon(0xff7a1a), 0.45, 0.4, -0.45, 1, 0.4, 1));
    for (const x of [-0.18, 0.18]) {
      const st = box(toon(0xe8d5a8), 0.04, 0.04, 0.5, x, 1.0, -0.35);
      st.rotation.x = -0.6;
      p.add(st);
    }
    p.position.x = -0.7 + i * 0.7;
    p.rotation.y = Math.PI + (i - 1) * 0.3;
    g.add(p);
  }
  return shadows(g);
}

export function makeDibsChair() {
  // The sacred Chicago "dibs" lawn chair holding a shoveled parking spot - jump.
  const g = new THREE.Group();
  const frame = toon(0xb9c2cc);
  const web = toon(0xffffff, { map: stripesTex('#2f9e44', '#ffd43b', 6) });
  g.add(box(web, 0.9, 0.06, 0.8, 0, 0.5, 0));
  const back = box(web, 0.9, 0.8, 0.06, 0, 0.9, 0.42);
  back.rotation.x = -0.2;
  g.add(back);
  for (const x of [-0.45, 0.45]) {
    const l1 = box(frame, 0.05, 0.75, 0.05, x, 0.37, -0.3);
    l1.rotation.x = 0.3;
    const l2 = box(frame, 0.05, 0.75, 0.05, x, 0.37, 0.3);
    l2.rotation.x = -0.3;
    g.add(l1, l2, box(frame, 0.05, 0.05, 0.8, x, 0.72, 0));
  }
  // a snow heap and an orange cone keep it company
  g.add(mesh(G.hemi(), toon(0xf4f7fb), 0.75, 0, 0.2, 0.9, 0.8, 0.9));
  const cone = makeCone();
  cone.position.set(-0.75, 0, 0);
  cone.scale.setScalar(0.85);
  g.add(cone);
  return shadows(g);
}


export function makeBarricade() {
  // Orange/white striped construction barricade with warning lights — jump.
  const g = new THREE.Group();
  const stripe = toon(0xffffff, { map: stripesTex('#ff6a00', '#ffffff', 5) });
  const leg = toon(C.white);
  g.add(box(stripe, 2.0, 0.32, 0.12, 0, 0.82, 0));
  g.add(box(stripe, 2.0, 0.32, 0.12, 0, 0.36, 0));
  for (const x of [-0.85, 0.85]) {
    const l = box(leg, 0.1, 1.05, 0.1, x, 0.5, 0.15);
    l.rotation.x = 0.18;
    const l2 = box(leg, 0.1, 1.05, 0.1, x, 0.5, -0.15);
    l2.rotation.x = -0.18;
    g.add(l, l2);
    g.add(sphere(toon(0xffa500, { emissive: 0xff8800, emissiveIntensity: 0.6, nightGlow: 2 }), 0.09, x, 1.08, 0));
  }
  return shadows(g);
}

export function makeCone() {
  const g = new THREE.Group();
  const o = toon(C.orange);
  const w = toon(C.white);
  g.add(box(toon(0xd9480f), 0.75, 0.08, 0.75, 0, 0.04, 0));
  g.add(mesh(G.cyl(14, 0.08, 0.32), o, 0, 0.5, 0, 1, 0.9, 1));
  g.add(mesh(G.cyl(14, 0.19, 0.24), w, 0, 0.45, 0, 1.01, 0.14, 1.01));
  g.add(mesh(G.cyl(14, 0.12, 0.16), w, 0, 0.7, 0, 1.01, 0.1, 1.01));
  return shadows(g);
}

export function makeConeRow() {
  // Three cones spread across a lane read better at speed than a single one.
  const g = new THREE.Group();
  for (const x of [-0.65, 0, 0.65]) {
    const c = makeCone();
    c.position.x = x;
    c.scale.setScalar(x === 0 ? 1.15 : 1);
    g.add(c);
  }
  return g;
}

export function makeTrashCan() {
  const g = new THREE.Group();
  const body = toon(0x2d3136);
  g.add(mesh(G.cyl(14, 0.42, 0.36), body, 0, 0.5, 0, 1, 1, 1));
  g.add(mesh(G.cyl(14, 0.46, 0.46), toon(0x1c1f23), 0, 1.02, 0, 1, 0.08, 1));
  g.add(mesh(G.hemi(), toon(0x1c1f23), 0, 1.05, 0, 0.9, 0.25, 0.9));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    g.add(box(toon(0x3d434a), 0.05, 0.85, 0.05, Math.cos(a) * 0.4, 0.5, Math.sin(a) * 0.4));
  }
  const pair = new THREE.Group();
  const a = shadows(g);
  a.position.x = -0.45;
  const b = a.clone();
  b.position.x = 0.5;
  b.rotation.y = 0.6;
  pair.add(a, b);
  return pair;
}

export function makeSawhorse() {
  // Red/white road block on sawhorse legs — jump.
  const g = new THREE.Group();
  const stripe = toon(0xffffff, { map: stripesTex('#e63946', '#ffffff', 5) });
  g.add(box(stripe, 2.1, 0.4, 0.14, 0, 0.9, 0));
  const leg = toon(0xc9a27a);
  for (const x of [-0.85, 0.85]) {
    for (const s of [1, -1]) {
      const l = box(leg, 0.1, 1.05, 0.1, x, 0.48, s * 0.2);
      l.rotation.x = s * 0.35;
      g.add(l);
    }
  }
  return shadows(g);
}

export function makeOverheadBar(kind = 'construction') {
  // A tall frame with a striped beam at head height — must slide under.
  const g = new THREE.Group();
  const post = toon(kind === 'girder' ? 0x8b2a2a : 0x5d6670);
  if (kind === 'girder') {
    const steel = toon(0x8b2a2a);
    g.add(box(steel, 2.4, 0.9, 0.5, 0, 1.75, 0));
    for (let i = -2; i <= 2; i++) {
      const d = box(toon(0x6e1f1f), 0.08, 1.0, 0.52, i * 0.5, 1.75, 0);
      d.rotation.z = i % 2 ? 0.6 : -0.6;
      g.add(d);
    }
    g.add(box(steel, 0.3, 2.2, 0.4, -1.25, 1.1, 0), box(steel, 0.3, 2.2, 0.4, 1.25, 1.1, 0));
  } else {
    const stripe = toon(0xffffff, { map: stripesTex('#ffb400', '#222222', 6) });
    g.add(box(stripe, 2.3, 0.55, 0.16, 0, 1.62, 0));
    g.add(box(post, 0.14, 2.3, 0.14, -1.12, 1.15, 0), box(post, 0.14, 2.3, 0.14, 1.12, 1.15, 0));
    const sign = new THREE.Mesh(G.plane(), basic(0xffffff, { map: marqueeTex('LOW CLEARANCE', { bg: '#ffb400', fg: '#222', bulbs: false, font: 'bold 54px Arial, sans-serif' }) }));
    sign.scale.set(1.6, 0.4, 1);
    sign.position.set(0, 2.15, 0.02);
    g.add(sign);
    g.add(box(post, 2.3, 0.08, 0.1, 0, 2.38, 0));
    g.add(sphere(toon(0xff3b30, { emissive: 0xff0000, emissiveIntensity: 0.8, nightGlow: 2.5 }), 0.08, -1.12, 2.35, 0));
    g.add(sphere(toon(0xff3b30, { emissive: 0xff0000, emissiveIntensity: 0.8, nightGlow: 2.5 }), 0.08, 1.12, 2.35, 0));
  }
  return shadows(g);
}

export const TRAIN_H = 2.7;
export function makeTrain(cars = 1, carLen = 11) {
  // CTA "L" car(s). The roof can be run on.
  const g = new THREE.Group();
  const side = toon(0xffffff, { map: trainSideTex() });
  const front = toon(0xffffff, { map: trainFrontTex() });
  const roof = toon(0xaab2bb);
  const under = toon(0x2b2f36);
  for (let c = 0; c < cars; c++) {
    const z = -c * (carLen + 0.4) - carLen / 2;
    const body = new THREE.Mesh(G.box(), [side, side, roof, under, front, front]);
    body.scale.set(2.1, TRAIN_H - 0.4, carLen);
    body.position.set(0, 0.4 + (TRAIN_H - 0.4) / 2, z);
    g.add(body);
    g.add(box(roof, 1.9, 0.12, carLen - 0.4, 0, TRAIN_H + 0.04, z));
    g.add(box(under, 1.7, 0.4, carLen - 1, 0, 0.22, z));
    for (const zz of [z + carLen / 2 - 1.6, z - carLen / 2 + 1.6]) {
      for (const x of [-0.75, 0.75]) {
        const w = mesh(G.cyl(10), under, x, 0.3, zz, 0.5, 0.18, 0.5);
        w.rotation.z = Math.PI / 2;
        g.add(w);
      }
    }
    // headlight glow
    if (c === 0) {
      const hl = toon(0xfff6c4, { emissive: 0xfff2a8, emissiveIntensity: 0.6, nightGlow: 3 });
      g.add(sphere(hl, 0.14, -0.66, 0.9, 0.01), sphere(hl, 0.14, 0.66, 0.9, 0.01));
    }
  }
  return shadows(g);
}

export function makeRamp(len = 6) {
  const g = new THREE.Group();
  const r = mesh(G.ramp(), toon(0x8a6d4f), 0, 0, 0, 2.0, TRAIN_H, len);
  g.add(r);
  // tread stripes
  const s = toon(0xffc61a);
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const st = box(s, 2.02, 0.05, 0.18, 0, t * TRAIN_H + 0.03, len / 2 - t * len);
    st.rotation.x = Math.atan2(TRAIN_H, len);
    g.add(st);
  }
  return shadows(g);
}

export function makeBench() {
  const g = new THREE.Group();
  const wood = toon(C.wood);
  const iron = toon(0x2b2f36);
  for (let i = 0; i < 3; i++) g.add(box(wood, 1.9, 0.08, 0.16, 0, 0.5, -0.2 + i * 0.18));
  for (let i = 0; i < 2; i++) g.add(box(wood, 1.9, 0.14, 0.06, 0, 0.75 + i * 0.2, -0.32));
  for (const x of [-0.8, 0.8]) {
    g.add(box(iron, 0.08, 0.5, 0.5, x, 0.25, -0.05), box(iron, 0.08, 0.6, 0.08, x, 0.8, -0.32));
  }
  return shadows(g);
}

export function makeHotDogCart() {
  // Big Wrigleyville vendor cart with umbrella — tall, change lanes.
  const g = new THREE.Group();
  g.add(box(toon(0xd7dde3), 1.9, 1.0, 1.4, 0, 0.85, 0));
  g.add(box(toon(0xffd400), 1.92, 0.25, 1.42, 0, 1.25, 0));
  const sign = new THREE.Mesh(G.plane(), basic(0xffffff, { map: marqueeTex('HOT DOGS', { bg: '#e63946', bulbs: false, font: 'bold 70px "Arial Black", Impact, sans-serif' }) }));
  sign.scale.set(1.7, 0.42, 1);
  sign.position.set(0, 0.8, 0.71);
  g.add(sign);
  for (const x of [-0.7, 0.7]) {
    const w = mesh(G.cyl(14), toon(0x222222), x, 0.3, 0.55, 0.6, 0.12, 0.6);
    w.rotation.z = Math.PI / 2;
    g.add(w);
  }
  g.add(cyl(toon(0x888888), 0.04, 1.6, 0, 2.0, 0));
  const umb = mesh(G.cone(8), toon(0xffffff, { map: stripesTex('#2563c9', '#ffd400', 4) }), 0, 2.85, 0, 2.6, 0.7, 2.6);
  g.add(umb);
  g.add(mesh(G.capsule(), toon(0xc8553d), 0.3, 1.45, 0, 0.18, 0.5, 0.18)); // giant dog prop
  g.children.at(-1).rotation.z = Math.PI / 2;
  return shadows(g);
}

export function makeBike(color = 0x2b9bff) {
  // Divvy-style bike with a rider; rides towards the player.
  const g = new THREE.Group();
  const frame = toon(color);
  const tire = toon(0x1c1c1c);
  for (const z of [0.55, -0.55]) {
    const w = mesh(G.torus(0.34, 0.05, 18), tire, 0, 0.36, z);
    w.rotation.y = Math.PI / 2;
    g.add(w);
  }
  const t1 = box(frame, 0.08, 0.08, 1.0, 0, 0.7, 0);
  const t2 = box(frame, 0.08, 0.6, 0.08, 0, 0.55, -0.15);
  t2.rotation.x = 0.3;
  g.add(t1, t2, box(frame, 0.5, 0.06, 0.06, 0, 1.0, 0.45), box(toon(0x333333), 0.18, 0.06, 0.3, 0, 0.92, -0.25));
  g.add(box(toon(0x6fcf3f), 0.36, 0.2, 0.3, 0, 0.82, 0.62)); // basket
  // rider
  const shirt = toon([0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c][Math.floor(Math.random() * 4)]);
  const skin = toon([0xf1c27d, 0xc68642, 0x8d5524, 0xffdbac][Math.floor(Math.random() * 4)]);
  g.add(mesh(G.capsule(), shirt, 0, 1.35, -0.1, 0.42, 0.42, 0.32));
  g.children.at(-1).rotation.x = 0.35;
  g.add(sphere(skin, 0.2, 0, 1.85, 0.08));
  g.add(mesh(G.hemi(), toon(0x2b2f36), 0, 1.9, 0.08, 0.44, 0.34, 0.44)); // helmet
  for (const x of [-0.13, 0.13]) {
    const leg = box(toon(0x2b3a55), 0.14, 0.6, 0.14, x, 0.75, -0.15);
    leg.rotation.x = x > 0 ? 0.5 : -0.3;
    g.add(leg);
  }
  return shadows(g);
}

export function makePlanterBlock() {
  // Riverwalk stone planter overflowing with flowers — tall, change lanes.
  const g = new THREE.Group();
  g.add(box(toon(0x8d8f94), 2.0, 1.2, 1.4, 0, 0.6, 0));
  g.add(box(toon(0xa7a9ad), 2.1, 0.12, 1.5, 0, 1.22, 0));
  const leaf = toon(0x3a9d3a);
  const cols = [0xff5c8a, 0xffd43b, 0xff8c42, 0xc77dff];
  for (let i = 0; i < 9; i++) {
    const x = -0.75 + (i % 3) * 0.75;
    const z = -0.4 + Math.floor(i / 3) * 0.4;
    g.add(sphere(leaf, 0.34, x, 1.45, z));
    g.add(sphere(toon(cols[i % 4]), 0.12, x + 0.1, 1.72, z + 0.12));
  }
  return shadows(g);
}

export function makePedestrianGroup() {
  // Tourists taking a selfie — tall, change lanes.
  const g = new THREE.Group();
  const shirts = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x9775fa, 0x63e6be];
  const skins = [0xf1c27d, 0xc68642, 0x8d5524, 0xffdbac];
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Group();
    const s = toon(shirts[(Math.random() * shirts.length) | 0]);
    p.add(mesh(G.capsule(), s, 0, 1.05, 0, 0.5, 0.6, 0.36));
    p.add(sphere(toon(skins[(Math.random() * skins.length) | 0]), 0.24, 0, 1.75, 0));
    p.add(box(toon(0x2b3a55), 0.16, 0.7, 0.16, -0.12, 0.35, 0), box(toon(0x2b3a55), 0.16, 0.7, 0.16, 0.12, 0.35, 0));
    if (i === 0) p.add(box(toon(0x111111), 0.12, 0.2, 0.02, 0.3, 1.9, 0.3)); // phone
    p.position.x = i ? 0.45 : -0.45;
    p.rotation.y = i ? -0.3 : 0.3;
    g.add(p);
  }
  return shadows(g);
}

export function makeHedge() {
  const g = new THREE.Group();
  const leaf = toon(0x2f8f3a);
  g.add(box(leaf, 2.0, 0.8, 0.8, 0, 0.4, 0));
  for (let i = -2; i <= 2; i++) g.add(sphere(leaf, 0.3, i * 0.4, 0.78, 0));
  return shadows(g);
}

export function makeFallenBranch() {
  // Lincoln Park: a big tree limb hanging across the path — slide.
  const g = new THREE.Group();
  const bark = toon(0x6b4226);
  const leaf = toon(0x3fae49);
  const limb = box(bark, 2.8, 0.35, 0.35, 0, 1.75, 0);
  limb.rotation.z = 0.08;
  g.add(limb);
  for (let i = -3; i <= 3; i++) g.add(sphere(leaf, 0.42, i * 0.42, 2.05 + (i % 2) * 0.15, 0));
  g.add(box(bark, 0.3, 2.4, 0.3, -1.35, 1.2, 0), box(bark, 0.3, 2.4, 0.3, 1.35, 1.2, 0));
  return shadows(g);
}

// ---------------------------------------------------------------------------
// Street props (static scenery, baked per chunk)
// ---------------------------------------------------------------------------
export function makeLampPost({ banner = true, wflag = false } = {}) {
  const g = new THREE.Group();
  const pole = toon(C.black);
  g.add(cyl(pole, 0.08, 4.2, 0, 2.1, 0));
  g.add(cyl(pole, 0.18, 0.3, 0, 0.15, 0));
  g.add(sphere(toon(0xfff2c0, { emissive: 0xffe08a, emissiveIntensity: 0.25, nightGlow: 2.2 }), 0.26, 0, 4.4, 0));
  g.add(mesh(G.cone(8), pole, 0, 4.72, 0, 0.3, 0.25, 0.3));
  if (banner) {
    const bm = toon(0xffffff, { map: wflag ? wFlagTex() : chicagoFlagTex(), side: THREE.DoubleSide });
    const b = new THREE.Mesh(G.plane(), bm);
    b.scale.set(0.6, wflag ? 0.45 : 0.9, 1);
    b.rotation.y = Math.PI / 2;
    b.position.set(0, 3.2, 0.36);
    g.add(b);
    g.add(box(pole, 0.04, 0.04, 0.7, 0, 3.66, 0.36));
  }
  return g;
}

export function makeTwinLamp() {
  const g = new THREE.Group();
  const pole = toon(C.black);
  g.add(cyl(pole, 0.09, 3.6, 0, 1.8, 0));
  g.add(box(pole, 1.0, 0.07, 0.07, 0, 3.4, 0));
  const bulb = toon(0xfff2c0, { emissive: 0xffe08a, emissiveIntensity: 0.25, nightGlow: 2.2 });
  for (const x of [-0.5, 0, 0.5]) g.add(sphere(bulb, 0.2, x, x === 0 ? 3.85 : 3.6, 0));
  return g;
}

export function makeBusShelter() {
  const g = new THREE.Group();
  const frame = toon(0x2b2f36);
  const glass = toon(0xbfe3ff, { opacity: 0.45 });
  g.add(box(frame, 3.0, 0.12, 1.4, 0, 2.55, 0));
  for (const x of [-1.45, 1.45]) g.add(box(frame, 0.08, 2.5, 0.08, x, 1.25, -0.6), box(frame, 0.08, 2.5, 0.08, x, 1.25, 0.6));
  g.add(box(glass, 2.9, 2.2, 0.04, 0, 1.3, -0.62));
  const ad = new THREE.Mesh(G.plane(), toon(0xffffff, { map: shelterAdTex(), emissive: 0xffffff, emissiveIntensity: 0.15, nightGlow: 0.8 }));
  ad.scale.set(1.3, 1.9, 1);
  ad.position.set(1.42, 1.3, 0);
  ad.rotation.y = Math.PI / 2;
  g.add(ad);
  const ad2 = ad.clone();
  ad2.rotation.y = -Math.PI / 2;
  ad2.position.x = 1.48;
  g.add(ad2);
  g.add(box(toon(C.wood), 2.0, 0.08, 0.4, -0.3, 0.5, -0.4));
  return g;
}

export function makeMailbox() {
  const g = new THREE.Group();
  const b = toon(0x1f4fa8);
  g.add(box(b, 0.6, 0.9, 0.55, 0, 0.75, 0));
  g.add(mesh(G.cyl(14), b, 0, 1.2, 0, 0.6, 0.55, 0.55));
  g.children.at(-1).rotation.x = Math.PI / 2;
  g.add(box(toon(0x222222), 0.08, 0.3, 0.08, -0.22, 0.15, 0), box(toon(0x222222), 0.08, 0.3, 0.08, 0.22, 0.15, 0));
  g.add(box(toon(0xffffff), 0.3, 0.2, 0.01, 0, 0.9, 0.28));
  return g;
}

export function makeFlowerPlanter(w = 1.6) {
  const g = new THREE.Group();
  g.add(box(toon(0x3b3f45), w, 0.7, 0.7, 0, 0.35, 0));
  const leaf = toon(0x3a9d3a);
  const cols = [0xff5c8a, 0xffd43b, 0xff8c42, 0xffffff, 0xc77dff];
  const n = Math.round(w / 0.4);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.2 + i * (w - 0.4) / Math.max(1, n - 1);
    g.add(sphere(leaf, 0.25, x, 0.8, 0));
    g.add(sphere(toon(cols[i % cols.length]), 0.1, x + 0.08, 1.0, 0.1));
  }
  return g;
}

export function makeTree(scale = 1, leafColor = 0x3fae49) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(8, 0.14, 0.2), toon(0x6b4226), 0, 1.0, 0, 1, 2.0, 1));
  const leaf = toon(leafColor);
  g.add(sphere(leaf, 1.0, 0, 2.6, 0), sphere(leaf, 0.75, 0.6, 2.2, 0.2), sphere(leaf, 0.7, -0.55, 2.3, -0.2), sphere(leaf, 0.6, 0, 3.3, 0));
  g.scale.setScalar(scale);
  return g;
}

export function makeParkedBike() {
  const b = makeBike(0x2b9bff);
  // strip the rider (torso, head, helmet, two legs)
  b.children.splice(b.children.length - 5, 5);
  return b;
}

export function makeBalustrade(len = 6) {
  const g = new THREE.Group();
  const stone = toon(0xe8dcc4);
  g.add(box(stone, 0.4, 0.16, len, 0, 1.0, 0));
  g.add(box(stone, 0.45, 0.2, len, 0, 0.1, 0));
  for (let z = -len / 2 + 0.3; z < len / 2; z += 0.5) g.add(mesh(G.cyl(8, 0.07, 0.13), stone, 0, 0.55, z, 1, 0.8, 1));
  return g;
}

export function makeRailing(len = 6, color = 0x2b2f36) {
  const g = new THREE.Group();
  const m = toon(color);
  g.add(box(m, 0.08, 0.08, len, 0, 1.0, 0), box(m, 0.05, 0.05, len, 0, 0.55, 0));
  for (let z = -len / 2; z <= len / 2; z += 1.5) g.add(box(m, 0.07, 1.0, 0.07, 0, 0.5, z));
  return g;
}

export function makeWaterTaxi() {
  const g = new THREE.Group();
  const hull = toon(0xffc61a);
  g.add(box(toon(0x1d3557), 2.6, 0.6, 7, 0, 0.1, 0));
  g.add(box(hull, 2.7, 0.7, 7.2, 0, 0.7, 0));
  g.add(mesh(G.cone(4), hull, 0, 0.7, 4.0, 1.9, 1.6, 0.7));
  g.children.at(-1).rotation.x = Math.PI / 2;
  g.children.at(-1).rotation.y = Math.PI / 4;
  g.add(box(toon(0xfff7d6), 2.3, 1.1, 5, 0, 1.6, -0.3));
  const win = toon(0x2a5d8f, { emissive: 0xffd27a, emissiveIntensity: 0, nightGlow: 0.8 });
  for (let z = -2.4; z <= 1.8; z += 0.85) {
    g.add(box(win, 2.32, 0.5, 0.6, 0, 1.7, z));
  }
  g.add(box(hull, 2.4, 0.12, 5.2, 0, 2.2, -0.3));
  const sign = new THREE.Mesh(G.plane(), basic(0xffffff, { map: marqueeTex('CHICAGO WATER TAXI', { bg: '#ffc61a', fg: '#1d3557', bulbs: false, font: 'bold 44px Arial, sans-serif' }) }));
  sign.scale.set(4, 0.45, 1);
  sign.rotation.y = Math.PI / 2;
  sign.position.set(1.36, 0.75, 0);
  g.add(sign);
  const s2 = sign.clone();
  s2.rotation.y = -Math.PI / 2;
  s2.position.x = -1.36;
  g.add(s2);
  return g;
}

export function makeTourBoat() {
  const g = new THREE.Group();
  g.add(box(toon(0x1d3557), 3, 0.6, 9, 0, 0.1, 0));
  g.add(box(toon(0xffffff), 3.1, 0.9, 9.2, 0, 0.8, 0));
  g.add(box(toon(0xe8eef5), 2.8, 0.9, 6, 0, 1.7, -0.5));
  g.add(box(toon(0x2a5d8f), 2.82, 0.4, 5.6, 0, 1.75, -0.5));
  // passengers on the top deck
  const cols = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x9775fa];
  for (let i = 0; i < 6; i++) g.add(sphere(toon(cols[i % 4]), 0.22, -0.9 + (i % 3) * 0.9, 2.4, -2 + Math.floor(i / 3) * 2.5));
  return g;
}

export function makePennantString(width = 14, cols = [0x0e3386, 0xcc3433, 0xffffff]) {
  // Bunting spanning the street (game day blue/red/white by default).
  const g = new THREE.Group();
  const n = Math.floor(width / 0.8);
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + i * 0.8 + 0.4;
    const sag = Math.cos((x / width) * Math.PI) * -0.6;
    const p = mesh(G.cone(3), toon(cols[i % 3], { side: THREE.DoubleSide }), x, 6.2 + sag, 0, 0.5, 0.6, 0.06);
    p.rotation.z = Math.PI;
    g.add(p);
  }
  g.add(box(toon(0x333333), width, 0.03, 0.03, 0, 6.45, 0));
  return g;
}

export function makeFan(color) {
  const g = new THREE.Group();
  const skins = [0xf1c27d, 0xc68642, 0x8d5524, 0xffdbac];
  g.add(mesh(G.capsule(), toon(color), 0, 1.05, 0, 0.48, 0.6, 0.34));
  g.add(sphere(toon(skins[(Math.random() * 4) | 0]), 0.23, 0, 1.72, 0));
  g.add(mesh(G.hemi(), toon(0x0e3386), 0, 1.8, 0, 0.48, 0.3, 0.48));
  g.add(box(toon(0x2b3a55), 0.15, 0.7, 0.15, -0.12, 0.35, 0), box(toon(0x2b3a55), 0.15, 0.7, 0.15, 0.12, 0.35, 0));
  const arm = box(toon(color), 0.12, 0.6, 0.12, 0.3, 1.6, 0);
  arm.rotation.z = -0.4;
  g.add(arm);
  return g;
}

export { C as COLORS };
