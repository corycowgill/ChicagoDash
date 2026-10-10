// Procedural obstacle / coin / power-up rows with fairness rules:
// every row keeps at least one passable lane, trains reserve their lanes, and
// oncoming traffic only spawns where its path is clear.
import { LANES, THEMES, themeIndexAt, SECTION_LEN } from './world.js';
import * as M from './models.js';
import { bake, disposeObject } from './geo.js';
import { FESTIVALS } from './chicago.js';
import * as THREE from 'three';
import { glowTex } from './materials.js';

const BEAM_GEO = new THREE.CylinderGeometry(0.28, 0.5, 6, 16, 1, true);
let beamTexture = null;
function beamTex() {
  if (beamTexture) return beamTexture;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0.9)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  beamTexture = new THREE.CanvasTexture(c);
  return beamTexture;
}

export const ACTIVATE_DIST = 75; // moving hazards start rolling this far ahead
const RAMP_LEN = 7;

const OBST = {
  barricade: { make: M.makeBarricade, kind: 'jump', y1: 1.05, depth: 0.5 },
  sawhorse: { make: M.makeSawhorse, kind: 'jump', y1: 1.1, depth: 0.6 },
  cones: { make: M.makeConeRow, kind: 'jump', y1: 0.85, depth: 0.7 },
  trash: { make: M.makeTrashCan, kind: 'jump', y1: 1.1, depth: 0.9 },
  bench: { make: M.makeBench, kind: 'jump', y1: 1.0, depth: 0.8 },
  hedge: { make: M.makeHedge, kind: 'jump', y1: 0.95, depth: 0.8 },
  bar: { make: () => M.makeOverheadBar('construction'), kind: 'slide', y0: 1.15, depth: 0.4 },
  girder: { make: () => M.makeOverheadBar('girder'), kind: 'slide', y0: 1.25, depth: 0.6 },
  branch: { make: M.makeFallenBranch, kind: 'slide', y0: 1.35, depth: 0.6 },
  cart: { make: M.makeHotDogCart, kind: 'block', depth: 1.5 },
  planter: { make: M.makePlanterBlock, kind: 'block', depth: 1.5 },
  tourists: { make: M.makePedestrianGroup, kind: 'block', depth: 0.8 },
  banner: { make: () => M.makeFestivalBanner(FESTIVALS[(Math.random() * FESTIVALS.length) | 0]), kind: 'slide', y0: 1.3, depth: 0.3 },
  drummers: { make: M.makeBucketDrummers, kind: 'block', depth: 1.4, sfx: 'buckets' },
  dibs: { make: M.makeDibsChair, kind: 'jump', y1: 1.05, depth: 0.9 },
  bike: { make: () => M.makeBike([0x2b9bff, 0x2b9bff, 0x39b54a, 0xff6b6b][(Math.random() * 4) | 0]), kind: 'block', depth: 1.6, speed: 6 },
};

const THEME_OBS = {
  loop: { jump: ['barricade', 'sawhorse', 'cones'], slide: ['bar'], block: [], trains: true },
  millennium: { jump: ['bench', 'cones', 'barricade'], slide: ['banner'], block: ['drummers', 'tourists'] },
  riverwalk: { jump: ['bench', 'cones', 'sawhorse'], slide: ['girder'], block: ['planter', 'tourists'] },
  wrigley: { jump: ['trash', 'sawhorse', 'barricade', 'cones'], slide: ['bar'], block: ['cart'] },
  lincoln: { jump: ['hedge', 'bench', 'cones'], slide: ['branch'], block: ['bike', 'bike', 'tourists'] },
};

const POWER_WEIGHTS = { pizza: 26, coffee: 22, flag: 20, hotdog: 18, popcorn: 14, shamrock: 7 };

function pick(a) {
  return a[(Math.random() * a.length) | 0];
}
function weighted(w) {
  let tot = 0;
  for (const k in w) tot += w[k];
  let r = Math.random() * tot;
  for (const k in w) {
    if ((r -= w[k]) <= 0) return k;
  }
  return Object.keys(w)[0];
}

export class Spawner {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = [];
    this.pickups = [];
    this.coinPool = { gold: [], green: [] };
    this.nextId = 1;
    this.reset();
  }

  reset() {
    for (const o of this.obstacles) this.disposeObstacle(o);
    for (const p of this.pickups) this.releasePickup(p);
    this.obstacles = [];
    this.pickups = [];
    this.nextRow = 45;
    this.rows = [];
    this.laneLast = [-99, -99, -99];
    this.trainUntil = [-99, -99, -99];
    this.lastPower = 0;
  }

  // ---------------------------------------------------------------------------
  update(dt, g) {
    const dist = g.distance;
    const ahead = 230;
    while (this.nextRow < dist + ahead) {
      const d = this.nextRow;
      const gap = this.genRow(d, g);
      this.nextRow = d + gap;
    }
    this.rows = this.rows.filter((r) => r.d > dist - 40);

    const pz = g.player.z;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (o.speed) {
        if (!o.active && pz - o.zFront < ACTIVATE_DIST) {
          o.active = true;
          if (o.type === 'train') g.audio.play('horn');
          if (o.type === 'bike') g.audio.play('bell');
        }
        if (o.active) {
          const dz = o.speed * dt;
          o.zFront += dz;
          o.zBack += dz;
          o.obj.position.z += dz;
          if (o.type === 'bike') o.obj.children.forEach((c) => c.geometry?.type === 'TorusGeometry' && (c.rotation.x -= dt * 10));
        }
      }
      if (o.sfx && !o.sfxDone && pz - o.zFront < 40) {
        o.sfxDone = true;
        g.audio.play(o.sfx);
      }
      if (o.zBack > pz + 14) {
        this.disposeObstacle(o);
        this.obstacles.splice(i, 1);
      }
    }
    const t = performance.now() / 1000;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.z > pz + 8) {
        this.releasePickup(p);
        this.pickups.splice(i, 1);
        continue;
      }
      p.obj.rotation.y = t * (p.type === 'coin' ? 3.2 : 2) + p.phase;
      if (p.type !== 'coin') {
        p.obj.position.y = p.y + Math.sin(t * 3 + p.phase) * 0.15;
        const ex = p.obj.userData.extras;
        if (ex) {
          ex[0].scale.setScalar(2 + Math.sin(t * 5 + p.phase) * 0.35);
          ex[0].position.copy(p.obj.position);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  genRow(d, g) {
    const themeId = THEMES[themeIndexAt(d)].id;
    const T = THEME_OBS[themeId];
    const diff = Math.min(1, d / 5000);
    const speed = g.baseSpeedAt(d);
    const minGap = speed * 0.62 + 7;
    const gap = minGap + Math.random() * (16 - diff * 9);

    // Keep the neighbourhood gateway arch clear.
    const intoSection = d % SECTION_LEN;
    if (intoSection < 10 && d > 100) {
      this.coinLine(1, d - 4, 6, 0.8);
      return gap;
    }

    const busy = [0, 1, 2].map((l) => this.trainUntil[l] > d - 3);
    const free = [0, 1, 2].filter((l) => !busy[l]);

    if (T.trains && free.length === 3 && Math.random() < 0.38 + diff * 0.12) {
      return this.trainPattern(d, g, diff, speed) + gap * 0.4;
    }

    // Breather row with just coins.
    if (Math.random() < 0.12 - diff * 0.08) {
      if (free.length) this.coinLine(pick(free), d - 6, 7, 0.8);
      this.rows.push({ d, pass: new Set(free) });
      return gap;
    }

    // Special combo: three quick rows in alternating lanes.
    if (free.length === 3 && diff > 0.25 && Math.random() < 0.08) {
      return this.comboPattern(d, T, speed);
    }

    const r = Math.random();
    let n = r < 0.62 - diff * 0.4 ? 1 : r < 0.94 - diff * 0.2 ? 2 : 3;
    n = Math.min(n, free.length);
    const lanes = free.slice().sort(() => Math.random() - 0.5).slice(0, n);
    const kinds = [null, null, null];
    for (const l of lanes) {
      const k = Math.random();
      kinds[l] = k < 0.46 ? 'jump' : k < 0.74 || !T.block.length ? 'slide' : 'block';
    }
    // At least one passable lane among the non-train lanes.
    const passable = () => free.filter((l) => kinds[l] !== 'block');
    if (!passable().length) kinds[lanes[0]] = 'jump';

    const pass = new Set(passable());
    for (const l of lanes) {
      let type = pick(T[kinds[l]]);
      // After a snowstorm, shoveled spots get claimed with a lawn chair.
      if (kinds[l] === 'jump' && g.event === 'snow' && themeId !== 'loop' && Math.random() < 0.4) type = 'dibs';
      if (OBST[type].speed && !this.canMove(l, d, OBST[type].speed, speed)) {
        type = pick(T.jump);
        kinds[l] = 'jump';
        pass.add(l);
      }
      this.addObstacle(type, l, d);
    }
    this.rows.push({ d, pass });

    // Coins: follow a passable lane (arc over jumps, low under bars).
    const coinLane = pick([...pass]);
    if (coinLane !== undefined && Math.random() < 0.85) {
      if (kinds[coinLane] === 'jump') this.coinArc(coinLane, d);
      else if (kinds[coinLane] === 'slide') this.coinLine(coinLane, d - 4, 4, 0.55);
      else this.coinLine(coinLane, d - 7, 6, 0.8);
    }
    this.maybePower(d + 5, pass, g);
    return gap;
  }

  comboPattern(d, T, speed) {
    // jump → slide → jump down a single open lane, the others walled off
    const open = (Math.random() * 3) | 0;
    const step = Math.max(11, speed * 0.75);
    const seq = ['jump', 'slide', 'jump'];
    seq.forEach((k, i) => {
      const dd = d + i * step;
      this.addObstacle(pick(T[k]), open, dd);
      for (const l of [0, 1, 2]) {
        if (l !== open) {
          if (T.block.length && !OBST[T.block[0]].speed) this.addObstacle(T.block[0], l, dd);
          else this.addObstacle(pick(T.jump), l, dd);
        }
      }
      this.rows.push({ d: dd, pass: new Set([open]) });
      if (k === 'jump') this.coinArc(open, dd);
      else this.coinLine(open, dd - 3, 3, 0.55);
    });
    return step * 2 + speed * 0.7 + 10;
  }

  trainPattern(d, g, diff, speed) {
    const r = Math.random();
    const cars = () => (Math.random() < 0.45 + diff * 0.3 ? 2 : 1);
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    let end = d;
    const pass = new Set([0, 1, 2]);
    if (r < 0.18 && diff > 0.15) {
      // Gauntlet: all three lanes have trains, one ramp up.
      const rampLane = lanes[0];
      for (const l of [0, 1, 2]) {
        const start = l === rampLane ? d : d + RAMP_LEN + Math.random() * 3;
        end = Math.max(end, this.addTrain(l, start, l === rampLane ? 2 : cars() + 1, l === rampLane));
        if (l !== rampLane) pass.delete(l);
      }
      this.roofCoins(rampLane, d, end);
    } else if (r < 0.55) {
      // Two trains side by side, third lane open (often with a hurdle).
      const [a, b, c] = lanes;
      const ramp = Math.random() < 0.6;
      end = Math.max(this.addTrain(a, d, cars(), ramp), this.addTrain(b, d + Math.random() * 6, cars(), false));
      pass.delete(b);
      if (!ramp) pass.delete(a);
      if (Math.random() < 0.5) {
        const T = THEME_OBS.loop;
        const k = Math.random() < 0.6 ? 'jump' : 'slide';
        this.addObstacle(pick(T[k]), c, d + 8);
        if (k === 'jump') this.coinArc(c, d + 8);
        else this.coinLine(c, d + 4, 4, 0.55);
      } else this.coinLine(c, d, 8, 0.8);
      if (ramp) this.roofCoins(a, d, d + RAMP_LEN + 11);
    } else if (r < 0.8) {
      // Oncoming train in one lane + maybe a parked one.
      const mv = lanes[0];
      if (this.canMove(mv, d, 10, speed)) {
        this.addTrain(mv, d, 1, false, 10);
        pass.delete(mv);
        if (Math.random() < 0.5 + diff * 0.3) {
          end = this.addTrain(lanes[1], d + 4, cars(), Math.random() < 0.5);
          pass.delete(lanes[1]);
        }
        this.coinLine(lanes[2], d - 4, 8, 0.8);
      } else {
        end = this.addTrain(mv, d, cars(), true);
        this.roofCoins(mv, d, end);
      }
    } else {
      // Single parked train with a ramp — free coins on the roof.
      const l = lanes[0];
      end = this.addTrain(l, d, cars(), true);
      this.roofCoins(l, d, end);
      this.coinLine(lanes[1], d + 4, 6, 0.8);
    }
    this.rows.push({ d, pass });
    this.maybePower(end + 4, new Set([0, 1, 2].filter((l) => this.trainUntil[l] < end)), g);
    return Math.max(12, (end - d) * 0.35);
  }

  /** Oncoming hazards need their lane clear for the distance they will travel. */
  canMove(l, d, vt, speed) {
    const travel = (vt * ACTIVATE_DIST) / (speed + vt) + 8;
    if (this.laneLast[l] > d - travel) return false;
    for (const r of this.rows) {
      if (r.d > d - travel - 10 && r.d <= d) {
        const p = [...r.pass].filter((x) => x !== l);
        if (!p.length) return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  addObstacle(type, lane, d) {
    const def = OBST[type];
    // Static models are merged per material: far fewer draw calls. Bikes keep
    // their parts so the wheels can spin.
    const obj = def.speed ? def.make() : bake(def.make());
    const x = LANES[lane];
    obj.position.set(x, 0, -d);
    this.scene.add(obj);
    const o = {
      id: this.nextId++,
      type,
      kind: 'solid',
      obj,
      lane,
      x,
      halfW: 0.95,
      zFront: -d + def.depth / 2,
      zBack: -d - def.depth / 2,
      y0: def.y0 ?? 0,
      y1: def.kind === 'slide' ? 4.5 : def.kind === 'block' ? 3.2 : def.y1,
      speed: def.speed || 0,
      active: false,
      jumpable: def.kind === 'jump',
      sfx: def.sfx || null,
    };
    this.obstacles.push(o);
    this.laneLast[lane] = Math.max(this.laneLast[lane], d);
    return o;
  }

  addTrain(lane, d, cars, ramp, speed = 0) {
    const carLen = 11;
    const len = cars * carLen + (cars - 1) * 0.4;
    const x = LANES[lane];
    let start = d;
    if (ramp) {
      const r = bake(M.makeRamp(RAMP_LEN));
      r.position.set(x, 0, -(d + RAMP_LEN / 2));
      this.scene.add(r);
      this.obstacles.push({ id: this.nextId++, type: 'ramp', kind: 'ramp', obj: r, lane, x, halfW: 1.0, zFront: -d, zBack: -d - RAMP_LEN, top: M.TRAIN_H, y0: 0, y1: 0, speed: 0 });
      start = d + RAMP_LEN;
    }
    const obj = bake(M.makeTrain(cars, carLen));
    obj.position.set(x, 0, -start);
    this.scene.add(obj);
    this.obstacles.push({
      id: this.nextId++, type: 'train', kind: 'train', obj, lane, x, halfW: 1.05,
      zFront: -start, zBack: -start - len, top: M.TRAIN_H, y0: 0, y1: M.TRAIN_H, speed, active: false,
    });
    const end = start + len;
    this.trainUntil[lane] = Math.max(this.trainUntil[lane], end + 2);
    this.laneLast[lane] = Math.max(this.laneLast[lane], end);
    return end;
  }

  disposeObstacle(o) {
    this.scene.remove(o.obj);
    disposeObject(o.obj);
  }

  removeObstacle(o) {
    const i = this.obstacles.indexOf(o);
    if (i >= 0) this.obstacles.splice(i, 1);
    this.disposeObstacle(o);
  }

  // ---------------------------------------------------------------------------
  coinLine(lane, d0, n, y) {
    for (let i = 0; i < n; i++) this.addCoin(lane, d0 + i * 2.3, y);
  }

  coinArc(lane, d) {
    for (let i = -3; i <= 3; i++) {
      const k = i / 3.6;
      this.addCoin(lane, d + i * 1.7, 0.9 + 1.5 * (1 - k * k));
    }
  }

  roofCoins(lane, d, end) {
    // up the ramp then along the roof(s)
    for (let i = 1; i < 4; i++) this.addCoin(lane, d + i * 1.9, 0.8 + (M.TRAIN_H * (i * 1.9)) / RAMP_LEN);
    for (let z = d + RAMP_LEN + 1; z < end - 1; z += 2.3) this.addCoin(lane, z, M.TRAIN_H + 0.8);
  }

  addCoin(lane, d, y) {
    const green = this.greenCoins;
    const pool = green ? this.coinPool.green : this.coinPool.gold;
    let obj = pool.pop();
    if (!obj) obj = M.makeCoin(green);
    obj.visible = true;
    obj.position.set(LANES[lane], y, -d);
    this.scene.add(obj);
    this.pickups.push({ type: 'coin', obj, x: LANES[lane], y, z: -d, phase: d * 0.3, green });
    this.laneLast[lane] = Math.max(this.laneLast[lane], d);
  }

  maybePower(d, pass, g) {
    if (d - this.lastPower < 120 || !pass.size) return;
    if (Math.random() > 0.16) return;
    const w = { ...POWER_WEIGHTS };
    if (g.event === 'stpats') w.shamrock = 22;
    if (g.player.hearts >= g.maxHearts) w.shamrock = 0;
    const type = weighted(w);
    const lane = pick([...pass]);
    const obj = bake(M.PICKUPS[type].make());
    obj.position.set(LANES[lane], 1.1, -d);
    obj.scale.setScalar(1.25);
    this.scene.add(obj);
    // A coloured aura and a tall light beam make power-ups readable from afar.
    const col = new THREE.Color(M.PICKUPS[type].color);
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
    aura.scale.setScalar(2.2);
    aura.position.set(LANES[lane], 1.1, -d);
    const beam = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color: col, map: beamTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.55 }));
    beam.position.set(LANES[lane], 3.4, -d);
    this.scene.add(aura, beam);
    obj.userData.extras = [aura, beam];
    this.pickups.push({ type, obj, x: LANES[lane], y: 1.1, z: -d, phase: Math.random() * 6 });
    this.lastPower = d;
    this.laneLast[lane] = Math.max(this.laneLast[lane], d);
  }

  releasePickup(p) {
    this.scene.remove(p.obj);
    for (const e of p.obj.userData.extras || []) {
      this.scene.remove(e);
      e.material.dispose();
    }
    if (p.type === 'coin') {
      p.obj.scale.setScalar(1);
      (p.green ? this.coinPool.green : this.coinPool.gold).push(p.obj);
    } else disposeObject(p.obj);
  }

  removePickup(p) {
    const i = this.pickups.indexOf(p);
    if (i >= 0) this.pickups.splice(i, 1);
    this.releasePickup(p);
  }
}
