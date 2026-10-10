// The four playable Chicago runners, built from primitives with a simple
// pivot rig so they can run, jump, slide and celebrate.
import * as THREE from 'three';
import { G, mesh, box, sphere, shadows, mergePlainChildren } from './geo.js';
import { toon, basic, signTex, chicagoFlagTex } from './materials.js';
import { Q } from './quality.js';

function letterTex(text, fg, bg = null, font = 'bold 96px "Arial Black", Impact, sans-serif', w = 128, h = 128) {
  return signTex(`letter-${text}-${fg}-${bg}-${w}`, w, h, (g) => {
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    } else g.clearRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 6);
  });
}

function pinstripeTex() {
  return signTex('pinstripe', 128, 128, (g, w, h) => {
    g.fillStyle = '#f8f8f4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#0e3386';
    for (let x = 4; x < w; x += 16) g.fillRect(x, 0, 3, h);
  });
}

export const CHARACTERS = [
  {
    id: 'kid',
    name: 'The Chicago Kid',
    blurb: 'Cubs-style cap, red hoodie and a whole lotta hustle.',
    cost: 0,
    outfits: [
      { name: 'Classic', hoodie: 0xe63946, pants: 0x3b6fb6, cap: 0x1d3f8f, logo: '#e63946', shoe: 0xffffff, accent: 0xe63946 },
      { name: 'Lakefront', hoodie: 0x2b9bff, pants: 0x2b3a55, cap: 0xe63946, logo: '#ffffff', shoe: 0xffd43b, accent: 0x2b9bff },
      { name: 'Midnight', hoodie: 0x2d2f36, pants: 0x1f2a44, cap: 0x2d2f36, logo: '#ffc61a', shoe: 0xffc61a, accent: 0xffc61a },
    ],
    stats: 'Balanced',
  },
  {
    id: 'explorer',
    name: 'The City Explorer',
    blurb: 'Flag cap, running kit, knows every shortcut.',
    cost: 500,
    outfits: [
      { name: 'Flag Day', hoodie: 0xdfe3ea, pants: 0x2d2f36, cap: 0xffffff, logo: '#e4002b', shoe: 0xffffff, accent: 0x6ec6f0 },
      { name: 'Sunset', hoodie: 0xff8c42, pants: 0x5f3dc4, cap: 0xffffff, logo: '#e4002b', shoe: 0xff5c8a, accent: 0xffd43b },
      { name: 'Green River', hoodie: 0x2fb344, pants: 0x1b5e20, cap: 0xffffff, logo: '#2fb344', shoe: 0xffffff, accent: 0xffffff },
    ],
    stats: 'Quick feet',
  },
  {
    id: 'southside',
    name: 'The South Side Runner',
    blurb: 'Shades on, hood up, CHI on the chest.',
    cost: 1500,
    outfits: [
      { name: 'Blackout', hoodie: 0x22242a, pants: 0x2b2d33, cap: 0x22242a, logo: '#ffffff', shoe: 0xffffff, accent: 0xe63946 },
      { name: 'Silver', hoodie: 0x9aa3ad, pants: 0x22242a, cap: 0x9aa3ad, logo: '#22242a', shoe: 0x22242a, accent: 0x22242a },
      { name: 'Royal', hoodie: 0x0e3386, pants: 0x22242a, cap: 0x0e3386, logo: '#ffc61a', shoe: 0xffc61a, accent: 0xffc61a },
    ],
    stats: 'Street smart',
  },
  {
    id: 'bear',
    name: 'The Cubs Bear',
    blurb: 'Furry, fearless and always in uniform.',
    cost: 3000,
    outfits: [
      { name: 'Home Whites', hoodie: 0xffffff, pants: 0xffffff, cap: 0x0e3386, logo: '#cc3433', shoe: 0x22242a, accent: 0x0e3386 },
      { name: 'Road Grays', hoodie: 0xb8bcc4, pants: 0xb8bcc4, cap: 0x0e3386, logo: '#ffffff', shoe: 0x0e3386, accent: 0x0e3386 },
      { name: 'Alt Blue', hoodie: 0x0e3386, pants: 0xffffff, cap: 0xcc3433, logo: '#ffffff', shoe: 0xcc3433, accent: 0xcc3433 },
    ],
    stats: 'Bear strength',
  },
];

/** Build a rigged character. Returns { root, update(dt, state), setBlink(on) } */
export function buildCharacter(id, outfitIdx = 0) {
  const def = CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
  const o = def.outfits[outfitIdx] || def.outfits[0];
  const isBear = id === 'bear';
  const skinCol = { kid: 0xf1c27d, explorer: 0xffd3a8, southside: 0x8d5524, bear: 0x9c6b3e }[id];
  // Fabric is matte, skin has a soft sheen, sneakers and caps a little gloss.
  const skin = toon(skinCol, { roughness: isBear ? 0.95 : 0.55 });
  const hoodie = isBear && o.hoodie !== 0x0e3386 ? toon(o.hoodie === 0xffffff ? 0xffffff : o.hoodie, { map: pinstripeTex(), roughness: 0.9 }) : toon(o.hoodie, { roughness: 0.92 });
  const pants = toon(o.pants, { roughness: 0.9 });
  const shoe = toon(o.shoe, { roughness: 0.45 });
  const sole = toon(0xf2f2f2, { roughness: 0.6 });
  const accent = toon(o.accent, { roughness: 0.4 });
  const cap = toon(o.cap, { roughness: 0.7 });
  const dark = toon(0x1a1a1a, { roughness: 0.2 });
  const white = basic(0xffffff);

  const root = new THREE.Group();
  const body = new THREE.Group(); // tilts for slide / lean
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.82;
  body.add(hips);

  // Torso
  const torso = new THREE.Group();
  hips.add(torso);
  // Sculpted torso: a lathed hoodie that tapers from chest to waist, slightly
  // flattened front-to-back, with a ribbed hem band.
  const chest = mesh(G.lathe('torso', [[0.001, -0.04], [0.25, -0.03], [0.275, 0.04], [0.29, 0.2], [0.305, 0.38], [0.3, 0.5], [0.26, 0.6], [0.16, 0.67], [0.001, 0.69]], 28), hoodie, 0, 0, 0);
  chest.scale.set(1, 1, 0.74);
  torso.add(chest);
  const hem = mesh(G.torus(0.27, 0.03, 28), hoodie, 0, 0.0, 0);
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1, 0.74, 1);
  torso.add(hem);
  if (id === 'southside') {
    const chi = new THREE.Mesh(G.plane(), basic(0xffffff, { map: letterTex('CHI', o.logo, null, 'bold 60px "Arial Black", Impact, sans-serif'), transparent: true }));
    chi.scale.set(0.42, 0.42, 1);
    chi.position.set(0, 0.36, -0.23); // runner faces -Z, so the chest is the -Z side
    chi.rotation.y = Math.PI;
    torso.add(chi);
  } else if (isBear) {
    const c = new THREE.Mesh(G.plane(), basic(0xffffff, { map: letterTex('C', o.logo), transparent: true }));
    c.scale.set(0.28, 0.28, 1);
    c.position.set(-0.12, 0.42, -0.23);
    c.rotation.y = Math.PI;
    torso.add(c);
  } else if (id === 'explorer') {
    const f = new THREE.Mesh(G.plane(), basic(0xffffff, { map: chicagoFlagTex() }));
    f.scale.set(0.22, 0.14, 1);
    f.position.set(0.12, 0.46, -0.225);
    f.rotation.y = Math.PI;
    torso.add(f);
  }
  // Hood / collar
  if (id === 'southside') {
    // hood up handled on head
  } else if (!isBear) {
    const collar = mesh(G.torus(0.17, 0.06, 20), hoodie, 0, 0.64, 0.02);
    collar.rotation.x = Math.PI / 2;
    torso.add(collar);
    // the hood bunched down the back
    const hood = mesh(G.sphere(24, 16), hoodie, 0, 0.6, 0.2, 0.42, 0.3, 0.22);
    hood.rotation.x = -0.4;
    torso.add(hood);
    // drawstrings with aglets and a kangaroo pocket
    for (const x of [-0.07, 0.07]) {
      torso.add(mesh(G.cyl(8), toon(0xf4f4f4), x, 0.5, -0.2, 0.022, 0.2, 0.022));
      torso.add(mesh(G.cyl(8), toon(0xb9c2cc, { metalness: 0.7, roughness: 0.3 }), x, 0.39, -0.2, 0.03, 0.04, 0.03));
    }
    torso.add(mesh(G.rboxSized(0.36, 0.16, 0.05, 0.04), hoodie, 0, 0.16, -0.205));
  }
  // Backpack
  if (id === 'kid') {
    const pack = toon(0x23262d, { roughness: 0.7 });
    torso.add(mesh(G.rboxSized(0.42, 0.48, 0.2, 0.08), pack, 0, 0.36, 0.3));
    torso.add(mesh(G.rboxSized(0.32, 0.18, 0.08, 0.05), toon(0x353a44, { roughness: 0.7 }), 0, 0.24, 0.42));
    torso.add(mesh(G.rboxSized(0.3, 0.015, 0.02, 0.006), toon(0xb9c2cc, { metalness: 0.8, roughness: 0.3 }), 0, 0.33, 0.461)); // zipper
    for (const x of [-0.15, 0.15]) {
      const strap = mesh(G.rboxSized(0.06, 0.62, 0.03, 0.015), pack, x, 0.36, -0.2);
      strap.rotation.x = 0.05;
      torso.add(strap);
    }
    const patch = new THREE.Mesh(G.plane(), basic(0xffffff, { map: chicagoFlagTex() }));
    patch.scale.set(0.16, 0.1, 1);
    patch.position.set(0.1, 0.45, 0.402);
    torso.add(patch);
  }

  // Head
  const head = new THREE.Group();
  head.position.y = 0.95;
  torso.add(head);
  const headR = isBear ? 0.36 : 0.33;
  head.add(sphere(skin, headR, 0, 0, 0));
  const eyes = [];
  // eyes (face is -Z)
  if (id === 'southside') {
    head.add(box(dark, 0.5, 0.11, 0.06, 0, 0.04, -0.3));
    head.add(box(toon(0x444444), 0.04, 0.04, 0.3, -0.25, 0.04, -0.16), box(toon(0x444444), 0.04, 0.04, 0.3, 0.25, 0.04, -0.16));
    head.add(mesh(G.hemi(), cap, 0, 0.02, 0.03, 0.78, 0.75, 0.78)); // hood
    head.add(mesh(G.torus(0.3, 0.07, 14), cap, 0, 0, -0.06, 1, 1.05, 1));
  } else {
    // Stylized eyes: glossy sclera, coloured iris, pupil and two catch-lights.
    // Each eye is a group so it can blink.
    const irisCol = { kid: 0x6b3e1f, explorer: 0x2f8f5a, bear: 0x2a1a10 }[id] ?? 0x6b3e1f;
    const iris = toon(irisCol, { roughness: 0.15 });
    const sclera = toon(0xfbfbf7, { roughness: 0.2 });
    for (const x of [-0.12, 0.12]) {
      const eye = new THREE.Group();
      eye.position.set(x, 0.03, -headR + 0.035);
      eye.add(mesh(G.sphere(20, 16), sclera, 0, 0, 0, 0.17, 0.2, 0.12));
      eye.add(mesh(G.sphere(18, 14), iris, x * 0.08, -0.005, -0.05, 0.105, 0.12, 0.05));
      eye.add(mesh(G.sphere(14, 10), dark, x * 0.08, -0.005, -0.068, 0.055, 0.065, 0.03));
      eye.add(sphere(white, 0.016, x * 0.08 + 0.02, 0.025, -0.082));
      eye.add(sphere(white, 0.008, x * 0.08 - 0.015, -0.025, -0.08));
      head.add(eye);
      eyes.push(eye);
      if (!isBear) {
        const brow = mesh(G.rboxSized(0.1, 0.022, 0.03, 0.01), toon(id === 'explorer' ? 0x6b3e1f : 0x3b2a20), x, 0.12, -headR + 0.02);
        brow.rotation.z = x > 0 ? -0.15 : 0.15;
        head.add(brow);
      }
    }
    if (!isBear) {
      head.add(mesh(G.sphere(12, 10), skin, 0, -0.03, -headR - 0.01, 0.07, 0.06, 0.07)); // nose
      for (const x of [-headR, headR]) head.add(mesh(G.sphere(12, 10), skin, x, 0, 0.02, 0.09, 0.14, 0.07)); // ears
    }
  }
  // smile
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 10, Math.PI), toon(0x7a2a1a));
  smile.position.set(0, -0.1, -headR + 0.02);
  smile.rotation.z = Math.PI;
  head.add(smile);
  if (isBear) {
    head.add(sphere(toon(0xd9b38c), 0.16, 0, -0.08, -0.3)); // snout
    head.add(sphere(dark, 0.06, 0, -0.03, -0.45)); // nose
    head.add(sphere(skin, 0.12, -0.27, 0.27, 0), sphere(skin, 0.12, 0.27, 0.27, 0)); // ears
    head.add(sphere(toon(0xd9b38c), 0.06, -0.27, 0.27, -0.06), sphere(toon(0xd9b38c), 0.06, 0.27, 0.27, -0.06));
    smile.position.y = -0.17;
    smile.position.z = -0.4;
  }
  // Caps (kid, explorer, bear)
  if (id !== 'southside') {
    const capG = new THREE.Group();
    capG.add(mesh(G.hemi(), cap, 0, 0.05, 0, headR * 2.1, headR * 1.7, headR * 2.1));
    capG.add(mesh(G.sphere(10, 8), cap, 0, 0.05 + headR * 0.85, 0, 0.07, 0.04, 0.07)); // button
    for (let k = 0; k < 6; k++) {
      const seam = mesh(G.torus(headR * 1.04, 0.004, 24), toon(0x000000, { opacity: 0.25 }), 0, 0.05, 0);
      seam.rotation.set(Math.PI / 2, 0, (k / 6) * Math.PI);
      seam.rotation.order = 'ZXY';
      seam.scale.y = 0.8;
      if (Q.seg > 1) capG.add(seam);
    }
    capG.add(box(id === 'explorer' ? toon(0x6ec6f0) : cap, 0.42, 0.04, 0.3, 0, 0.07, -headR - 0.08)); // brim
    capG.children.at(-1).rotation.x = -0.15;
    const logo = new THREE.Mesh(G.plane(), id === 'explorer'
      ? basic(0xffffff, { map: chicagoFlagTex() })
      : basic(0xffffff, { map: letterTex('C', o.logo), transparent: true }));
    logo.scale.set(id === 'explorer' ? 0.3 : 0.22, id === 'explorer' ? 0.18 : 0.22, 1);
    logo.position.set(0, 0.2, -headR - 0.01);
    logo.rotation.set(-0.35, Math.PI, 0);
    capG.add(logo);
    capG.position.y = 0.05;
    capG.rotation.x = 0.08;
    head.add(capG);
    if (!isBear) {
      // hair peeking out
      head.add(mesh(G.sphere(), toon(id === 'explorer' ? 0x7a4a26 : 0x5a3b26, { roughness: 0.55 }), 0, 0.02, 0.12, headR * 2.05, headR * 1.6, headR * 1.8));
    }
    if (id === 'kid') {
      // a few tufts of hair poking out under the cap
      const hair = toon(0x5a3b26, { roughness: 0.55 });
      for (const [x, z, r] of [[-0.24, -0.12, 0.6], [0.24, -0.12, -0.6], [-0.27, 0.05, 0.9], [0.27, 0.05, -0.9]]) {
        const tuft = mesh(G.cone(10), hair, x, -0.04, z, 0.1, 0.16, 0.1);
        tuft.rotation.z = r;
        head.add(tuft);
      }
    }
    if (id === 'explorer') {
      const pony = new THREE.Group();
      pony.position.set(0, 0.05, 0.33);
      pony.add(mesh(G.capsule(), toon(0x6b3e1f), 0, -0.2, 0.05, 0.16, 0.18, 0.16));
      pony.children[0].rotation.x = -0.5;
      head.add(pony);
      head.userData.pony = pony;
    }
  }
  if (isBear) {
    // move ears outside cap
    head.children.forEach((c) => {
      if (Math.abs(c.position.x) === 0.27) c.position.y = 0.3;
    });
  }

  // Arms
  const arms = [];
  for (const s of [-1, 1]) {
    const side = s;
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.36, 0.55, 0);
    torso.add(shoulder);
    shoulder.add(mesh(G.capsule(), hoodie, 0, -0.2, 0, 0.17, 0.2, 0.17));
    const fore = new THREE.Group();
    fore.position.y = -0.38;
    shoulder.add(fore);
    fore.add(mesh(G.capsule(), id === 'southside' || id === 'explorer' ? hoodie : (isBear ? skin : hoodie), 0, -0.13, 0, 0.15, 0.16, 0.15));
    if (!isBear) {
      const cuff = mesh(G.torus(0.075, 0.025, 16), hoodie, 0, -0.26, 0);
      cuff.rotation.x = Math.PI / 2;
      fore.add(cuff);
    }
    // mitten hand with a thumb
    fore.add(mesh(G.sphere(16, 12), skin, 0, -0.34, 0, 0.21, 0.24, 0.18));
    fore.add(mesh(G.sphere(10, 8), skin, side * -0.07, -0.3, -0.05, 0.08, 0.11, 0.08));
    arms.push({ shoulder, fore, s });
  }
  // Legs
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.15, 0.02, 0);
    hips.add(hip);
    hip.add(mesh(G.capsule(), pants, 0, -0.2, 0, 0.21, 0.2, 0.21));
    const knee = new THREE.Group();
    knee.position.y = -0.4;
    hip.add(knee);
    knee.add(mesh(G.capsule(), isBear ? skin : pants, 0, -0.16, 0, 0.18, 0.2, 0.18));
    if (!isBear) {
      const roll = mesh(G.torus(0.088, 0.03, 16), pants, 0, -0.3, 0);
      roll.rotation.x = Math.PI / 2;
      knee.add(roll);
    }
    const foot = new THREE.Group();
    foot.position.y = -0.36;
    knee.add(foot);
    // rounded sneaker: upper, toe cap, midsole, swoosh stripe and laces
    foot.add(mesh(G.rboxSized(0.2, 0.15, 0.34, 0.06), shoe, 0, -0.02, -0.06));
    foot.add(mesh(G.sphere(14, 10), shoe, 0, -0.04, -0.21, 0.2, 0.12, 0.14));
    foot.add(mesh(G.rboxSized(0.22, 0.06, 0.38, 0.03), sole, 0, -0.1, -0.06));
    foot.add(mesh(G.rboxSized(0.215, 0.04, 0.2, 0.015), accent, 0, 0.0, -0.04));
    for (let k = 0; k < 3; k++) foot.add(mesh(G.rboxSized(0.1, 0.012, 0.025, 0.006), toon(0xffffff), 0, 0.058, -0.1 + k * 0.05));
    legs.push({ hip, knee, s });
  }
  shadows(root, true, false);
  // ~80 parts -> ~25 draw calls: merge each limb's solid-colour pieces.
  mergePlainChildren(root);

  let t = 0;
  let blink = false;
  const state = { root, body, hips, torso, head, arms, legs, def, outfit: o };

  let blinkT = 2 + Math.random() * 2;
  function update(dt, s) {
    t += dt * (s.mode === 'idle' ? 1 : s.runRate ?? 1);
    // blink every few seconds
    blinkT -= dt;
    const shut = blinkT < 0.12;
    if (blinkT < 0) blinkT = 2.2 + Math.random() * 2.5;
    for (const e of eyes) e.scale.y = shut ? 0.12 : 1;
    // squash & stretch: stretch on the way up, squash on landing
    const v = Math.max(-1, Math.min(1, s.vy ?? 0));
    let sy = 1 + (s.mode === 'jump' ? v * 0.1 : 0);
    if ((s.landT ?? 1) < 0.16) sy -= 0.16 * (1 - s.landT / 0.16);
    root.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    const ph = t * 11;
    body.rotation.set(0, 0, 0);
    body.position.set(0, 0, 0);
    torso.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    if (s.mode === 'run') {
      const bob = Math.abs(Math.sin(ph)) * 0.08;
      body.position.y = bob;
      torso.rotation.x = -0.18;
      torso.rotation.y = Math.sin(ph) * 0.12;
      body.rotation.z = (s.lean ?? 0) * 0.25;
      legs.forEach(({ hip, knee, s: side }) => {
        const p = Math.sin(ph + (side > 0 ? 0 : Math.PI));
        hip.rotation.x = p * 0.9;
        knee.rotation.x = -Math.max(0, -Math.cos(ph + (side > 0 ? 0 : Math.PI))) * 1.4 - 0.15;
      });
      arms.forEach(({ shoulder, fore, s: side }) => {
        const p = Math.sin(ph + (side > 0 ? Math.PI : 0));
        shoulder.rotation.x = p * 0.9;
        shoulder.rotation.z = side * 0.15;
        fore.rotation.x = 1.2;
      });
    } else if (s.mode === 'jump') {
      torso.rotation.x = -0.1;
      const tuck = Math.min(1, Math.max(0, s.jumpT ?? 0.5));
      legs.forEach(({ hip, knee, s: side }) => {
        hip.rotation.x = side > 0 ? 0.9 * tuck : -0.5 * tuck;
        knee.rotation.x = side > 0 ? -1.6 * tuck : -0.4;
      });
      arms.forEach(({ shoulder, fore, s: side }) => {
        shoulder.rotation.x = Math.PI * 0.85;
        shoulder.rotation.z = side * 0.5;
        fore.rotation.x = -0.3;
      });
    } else if (s.mode === 'slide') {
      body.rotation.x = 1.15; // lean back
      body.position.y = 0.05;
      body.position.z = -0.1;
      torso.rotation.x = -0.2;
      head.rotation.x = -0.6;
      legs.forEach(({ hip, knee, s: side }) => {
        hip.rotation.x = side > 0 ? 0.2 : 0.6;
        knee.rotation.x = side > 0 ? 0 : -0.9;
      });
      arms.forEach(({ shoulder, fore, s: side }) => {
        shoulder.rotation.x = -0.3;
        shoulder.rotation.z = side * 1.2;
        fore.rotation.x = -0.2;
      });
    } else if (s.mode === 'fall') {
      body.rotation.x = -1.4;
      body.position.y = 0.3;
      legs.forEach(({ hip, knee }) => {
        hip.rotation.x = 0.3;
        knee.rotation.x = -0.3;
      });
      arms.forEach(({ shoulder, fore, s: side }) => {
        shoulder.rotation.x = Math.PI;
        shoulder.rotation.z = side * 0.8;
        fore.rotation.x = 0;
      });
    } else if (s.mode === 'cheer') {
      const j = Math.abs(Math.sin(t * 6)) * 0.25;
      body.position.y = j;
      arms.forEach(({ shoulder, fore, s: side }) => {
        shoulder.rotation.x = Math.PI;
        shoulder.rotation.z = side * (0.4 + Math.sin(t * 12) * 0.2);
        fore.rotation.x = 0;
      });
      legs.forEach(({ hip, knee }) => {
        hip.rotation.x = 0;
        knee.rotation.x = 0;
      });
    } else {
      // idle
      body.position.y = Math.sin(t * 2.5) * 0.02;
      torso.rotation.y = Math.sin(t * 0.8) * 0.12;
      head.rotation.y = Math.sin(t * 0.6) * 0.3;
      legs.forEach(({ hip, knee, s: side }) => {
        hip.rotation.x = 0;
        hip.rotation.z = side * 0.04;
        knee.rotation.x = 0;
      });
      arms.forEach(({ shoulder, fore, s: side }) => {
        shoulder.rotation.x = Math.sin(t * 2 + side) * 0.06;
        shoulder.rotation.z = side * 0.12;
        fore.rotation.x = -0.25;
      });
    }
    if (head.userData.pony) head.userData.pony.rotation.x = Math.sin(ph * 0.5) * 0.3;
    root.visible = blink ? Math.floor(performance.now() / 90) % 2 === 0 : true;
  }

  return {
    ...state,
    update,
    setBlink(on) {
      blink = on;
      if (!on) root.visible = true;
    },
  };
}
