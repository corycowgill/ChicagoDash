// Core runtime: renderer, runner physics, collisions, power-ups, camera.
import * as THREE from 'three';
import { World, LANES, THEMES, themeIndexAt, SECTION_LEN } from './world.js';
import { Spawner } from './spawner.js';
import { FX } from './fx.js';
import { buildCharacter } from './characters.js';
import { powerDuration } from './save.js';
import { PICKUPS, TRAIN_H } from './models.js';
import { G } from './geo.js';
import { CHEERS, OUCHES, pick } from './chicago.js';
import { Q, setQuality } from './quality.js';
import { Post } from './post.js';
import { basic, blobShadowTex } from './materials.js';

const GRAVITY = 40;
const JUMP_V = 12.6;
const SLIDE_TIME = 0.72;
const STAND_H = 1.75;
const SLIDE_H = 0.85;
const PLAYER_HW = 0.38;
const PLAYER_HD = 0.35;
const START_HEARTS = 2;

export class Game {
  constructor(canvas, save, audio, hooks) {
    this.canvas = canvas;
    this.save = save;
    this.audio = audio;
    this.hooks = hooks;
    this.state = 'menu';
    this.maxHearts = 3;
    this.event = 'day';

    const q = this.resolveQuality();
    this.quality = q;
    setQuality(q); // must happen before any geometry or material is built
    // With post-processing on, antialiasing comes from the MSAA render target.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !Q.post && q !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1));
    this.renderer.shadowMap.enabled = Q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = Q.pbr ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    Q.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 800);
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.flash = 0;
    this.world = new World(this.scene, q, this.renderer);
    this.spawner = new Spawner(this.scene);
    this.fx = new FX(this.scene);

    this.player = { z: 0, x: 0, lane: 1, laneFrom: 1, y: 0, vy: 0, grounded: true, slideT: 0, hearts: START_HEARTS, invuln: 0, coyote: 0, onTrain: null };
    this.powers = { pizza: 0, hotdog: 0, coffee: 0, flag: 0 };
    this.shieldMesh = new THREE.Mesh(G.sphere(32, 24), makeShieldMaterial());
    this.shieldMesh.scale.set(1.9, 2.4, 1.9);
    this.shieldMesh.visible = false;
    this.scene.add(this.shieldMesh);
    // Soft contact shadow that stays on the ground (and shrinks) as you jump.
    this.blob = new THREE.Mesh(G.plane(), basic(0xffffff, { map: blobShadowTex(), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 1;
    this.scene.add(this.blob);
    this.dustT = 0;
    this.twinkleT = 0;

    this.camPos = new THREE.Vector3(0, 4, 8);
    this.camLook = new THREE.Vector3(0, 1, -6);
    this.shake = 0;
    this.time = 0;
    this.distance = 0;
    this.setCharacter(save.selected, save.outfitSel[save.selected] || 0);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    this.frameTimes = [];
    this.loop = this.loop.bind(this);
    this.setupMenuScene();
    requestAnimationFrame(this.loop);
  }

  resolveQuality() {
    const s = this.save.settings.quality;
    if (s !== 'auto') return s;
    const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
    return mobile ? 'medium' : 'high';
  }

  setQuality(q) {
    this.save.settings.quality = q;
    // Shadow/antialias changes need a reload of the renderer; pixel ratio is live.
    const r = this.resolveQuality();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, r === 'high' ? 2 : r === 'medium' ? 1.5 : 1));
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
    this.camera.aspect = w / h;
    // Portrait phones: widen the view so all three lanes stay on screen.
    this.camera.fov = w / h < 0.8 ? 78 : w / h < 1.2 ? 70 : 62;
    this.camera.updateProjectionMatrix();
  }

  setCharacter(id, outfit = 0) {
    if (this.char) this.scene.remove(this.char.root);
    this.char = buildCharacter(id, outfit);
    this.scene.add(this.char.root);
    this.char.root.position.set(this.player.x, this.player.y, this.player.z);
  }

  setEvent(ev) {
    this.event = ev;
    this.world.applyEvent(ev);
    this.post.setMood(ev);
    this.spawner.greenCoins = ev === 'stpats';
  }

  baseSpeedAt(d) {
    return 15 + 18 * (1 - Math.exp(-d / 3200));
  }

  // ---------------------------------------------------------------------------
  setupMenuScene() {
    this.world.reset();
    this.world.nextChunk = -2;
    this.spawner.reset();
    this.fx.clear();
    Object.assign(this.player, { z: 0, x: 0, lane: 1, laneFrom: 1, y: 0, vy: 0, grounded: true, slideT: 0, invuln: 0, onTrain: null });
    this.distance = 0;
    this.world.update(0, 0, this.camera);
    this.char.root.position.set(0, 0, 0);
    this.char.root.rotation.y = 0;
  }

  showMenu() {
    this.state = 'menu';
    this.char.setBlink(false);
    this.shieldMesh.visible = false;
    this.setupMenuScene();
  }

  start() {
    this.setupMenuScene();
    this.state = 'running';
    this.player.hearts = START_HEARTS;
    this.powers = { pizza: 0, hotdog: 0, coffee: 0, flag: 0 };
    this.speed = this.baseSpeedAt(0);
    this.lastTheme = 0;
    this.nextMilestone = 500;
    this.run = {
      distance: 0, coins: 0, score: 0, pizza: 0, hotdog: 0, powerups: 0, jumps: 0, slides: 0,
      noHitDist: 0, sinceHit: 0, trainRoofs: 0, flagSaves: 0, shamrock: 0, hits: 0, event: this.event,
      neighborhoods: 1, popcorn: 0, dibs: 0, gusts: 0,
    };
    this.roofsSeen = new Set();
    this.runTime = 0;
    this.nextGust = 30 + Math.random() * 20;
    this.gustT = 0;
    this.lastCheer = 0;
    this.dibsSeen = false;
    this.char.root.rotation.y = 0;
    this.hooks.onTheme?.(THEMES[0], true);
  }

  pause(on) {
    if (on && this.state === 'running') this.state = 'paused';
    else if (!on && this.state === 'paused') {
      this.state = 'running';
      this.clock.getDelta();
    }
  }

  // ---------------------------------------------------------------------------
  loop() {
    requestAnimationFrame(this.loop);
    let dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.time += dt;
    if (this.state === 'running') this.updateRun(dt);
    else if (this.state === 'dying') this.updateDying(dt);
    else if (this.state === 'menu') this.updateMenu(dt);
    if (this.state !== 'paused') {
      this.fx.update(dt, this.camera);
      this.shieldMesh.material.uniforms.uTime.value = this.time;
    }
    const running = this.state === 'running';
    this.fx.speedLines(dt, this.camera, running ? Math.min(1, Math.max(0, (this.speed - 24) / 10)) + (this.powers.hotdog > 0 ? 1 : 0) : 0);
    const speedFx = running ? Math.min(1, Math.max(0, (this.speed - 22) / 14)) * 0.55 + (this.powers.hotdog > 0 ? 0.8 : 0) : 0;
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.post.render(dt, speedFx, this.flash);
    this.adaptQuality(dt);
  }

  adaptQuality(dt) {
    // If the device struggles, quietly drop resolution.
    if (this.state !== 'running') return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 120) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    const pr = this.renderer.getPixelRatio();
    if (avg > 1 / 40 && this.post.disableBloom()) return;
    if (avg > 1 / 40 && pr > 0.75) {
      this.renderer.setPixelRatio(Math.max(0.75, pr - 0.25));
      this.resize();
    }
  }

  updateMenu(dt) {
    this.char.update(dt, { mode: 'idle' });
    this.char.root.rotation.y = Math.PI + Math.sin(this.time * 0.4) * 0.35;
    const a = this.time * 0.08;
    const narrow = this.camera.aspect < 0.8;
    if (narrow) {
      // Portrait: runner sits in the gap between the logo and the buttons.
      this.camera.position.set(Math.sin(a) * 0.8, 1.6, 5.4);
      this.camera.lookAt(0, 1.05, 0);
    } else {
      this.camera.position.set(Math.sin(a) * 1.2 + 0.6, 1.7, 4.6);
      this.camera.lookAt(-0.9, 1.25, 0);
    }
    this.world.update(dt, 0, this.camera);
  }

  updateDying(dt) {
    this.dyingT += dt;
    this.char.update(dt, { mode: 'fall' });
    const p = this.player;
    this.camera.position.lerp(new THREE.Vector3(p.x + 3.5, p.y + 3, p.z + 5.5), dt * 2);
    this.camera.lookAt(p.x, p.y + 0.6, p.z);
    if (this.dyingT > 1.3 && !this.overSent) {
      this.overSent = true;
      this.state = 'over';
      this.hooks.onGameOver?.(this.run);
    }
  }

  // ---------------------------------------------------------------------------
  handleInput(actions) {
    const p = this.player;
    for (const a of actions) {
      if (a === 'left' || a === 'right') {
        const nl = Math.max(0, Math.min(2, p.lane + (a === 'left' ? -1 : 1)));
        if (nl !== p.lane) {
          p.laneFrom = p.lane;
          p.lane = nl;
          this.audio.play('lane');
        }
      } else if (a === 'jump') {
        if (p.grounded || p.coyote > 0) {
          p.vy = JUMP_V;
          p.grounded = false;
          p.coyote = 0;
          p.slideT = 0;
          this.run.jumps++;
          this.audio.play('jump');
        }
      } else if (a === 'slide') {
        if (!p.grounded) p.vy = Math.min(p.vy, -24); // fast-fall
        if (p.slideT <= 0) {
          this.run.slides++;
          this.audio.play('slide');
        }
        p.slideT = SLIDE_TIME;
      }
    }
  }

  updateRun(dt) {
    const p = this.player;
    const run = this.run;
    this.handleInput(this.hooks.consumeInput());

    // timers
    for (const k in this.powers) if (this.powers[k] > 0) this.powers[k] = Math.max(0, this.powers[k] - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.slideT > 0 && p.grounded) p.slideT -= dt;
    p.coyote = Math.max(0, p.coyote - dt);

    // speed
    const target = this.baseSpeedAt(this.distance) * (this.powers.hotdog > 0 ? 1.45 : 1);
    this.speed += (target - this.speed) * Math.min(1, dt * 2.5);
    const ds = this.speed * dt;
    p.z -= ds;
    this.distance += ds;
    run.distance = this.distance;
    run.sinceHit += ds;
    run.noHitDist = Math.max(run.noHitDist, run.sinceHit);
    const mult = this.powers.pizza > 0 ? 2 : 1;
    run.score += ds * mult;

    // lateral
    const prevX = p.x;
    const tx = LANES[p.lane];
    p.x += (tx - p.x) * Math.min(1, dt * 15);
    if (Math.abs(tx - p.x) < 0.01) p.x = tx;

    // vertical with train roofs + ramps
    const ground = this.groundAt(p.x, p.z);
    if (p.grounded) {
      if (ground.h >= p.y - 0.05) p.y = ground.h; // walk up ramps
      else {
        p.grounded = false; // ran off a roof
        p.coyote = 0.1;
      }
    }
    if (!p.grounded) {
      p.vy -= GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y <= ground.h && p.vy <= 0) {
        p.y = ground.h;
        p.vy = 0;
        p.grounded = true;
        this.audio.play('land');
        this.fx.dust(new THREE.Vector3(p.x, p.y + 0.05, p.z), 6, true);
      }
    }
    if (p.grounded && ground.train && !this.roofsSeen.has(ground.train.id)) {
      this.roofsSeen.add(ground.train.id);
      run.trainRoofs++;
    }

    this.spawner.update(dt, this);
    this.world.update(dt, p.z, this.camera);
    this.collide(prevX);
    this.collectPickups(dt);
    if (this.state !== 'running') return;

    // neighbourhood transitions + milestones
    const ti = themeIndexAt(this.distance);
    if (ti !== this.lastTheme) {
      this.lastTheme = ti;
      run.neighborhoods++;
      this.hooks.onTheme?.(THEMES[ti], false);
    }
    if (this.distance >= this.nextMilestone) {
      this.hooks.onToast?.(`${this.nextMilestone.toLocaleString()} m!`, 'milestone');
      this.nextMilestone += 500;
    }

    // CTA station announcements as you roll through the Loop
    const st = this.world.stations;
    while (st.length && st[0].z > p.z) {
      const s = st.shift();
      this.audio.play('chime');
      this.hooks.onToast?.(`🔔 This is ${s.name}. Doors closing.`, 'milestone');
    }

    // Windy City gusts: newspapers fly and the wind blows coins your way
    this.runTime += dt;
    if (this.runTime > this.nextGust) {
      this.nextGust = this.runTime + 40 + Math.random() * 25;
      this.gustT = 3.5;
      run.gusts++;
      this.audio.play('wind');
      this.hooks.onToast?.('🌬️ Windy City gust! Coins blowin\' your way', 'power');
    }
    if (this.gustT > 0) {
      this.gustT -= dt;
      if (Math.random() < 0.6) {
        const leaf = THEMES[ti].id === 'lincoln' || THEMES[ti].id === 'millennium';
        this.fx.paper(new THREE.Vector3(p.x - 9, 1 + Math.random() * 4, p.z - 4 - Math.random() * 12), leaf && Math.random() < 0.5 ? 0xe8a23a : 0xf2efe6);
      }
    }

    // character + camera
    const mode = !p.grounded ? 'jump' : p.slideT > 0 ? 'slide' : 'run';
    this.char.update(dt, { mode, runRate: this.speed / 16, lean: (tx - p.x) * -0.4, jumpT: Math.min(1, Math.abs(p.vy) / JUMP_V) });
    this.char.root.position.set(p.x, p.y, p.z);
    this.blob.position.set(p.x, ground.h + 0.03, p.z);
    const lift = Math.max(0, p.y - ground.h);
    this.blob.scale.setScalar(Math.max(0.4, 1.3 - lift * 0.25));
    this.blob.material.opacity = Math.max(0.25, 1 - lift * 0.3);
    // sneakers kick up dust; sliding throws sparks
    this.dustT -= dt;
    if (p.grounded && this.dustT <= 0) {
      this.dustT = p.slideT > 0 ? 0.03 : 0.08;
      const at = new THREE.Vector3(p.x + (Math.random() - 0.5) * 0.4, p.y + 0.05, p.z + 0.3);
      if (p.slideT > 0) this.fx.burst(at, { color: 0xffb347, n: 2, speed: 2.5, size: 0.06, life: 0.25, gravity: 9, shape: 'spark', up: 1.5 });
      else this.fx.dust(at, 1);
    }
    // coins ahead twinkle now and then
    this.twinkleT -= dt;
    if (this.twinkleT <= 0) {
      this.twinkleT = 0.12;
      const ahead = this.spawner.pickups.filter((it) => it.z < p.z && it.z > p.z - 35);
      if (ahead.length) {
        const it = ahead[(Math.random() * ahead.length) | 0];
        this.fx.twinkle(new THREE.Vector3(it.obj.position.x + (Math.random() - 0.5) * 0.4, it.obj.position.y + 0.3, it.obj.position.z), it.type === 'coin' ? 0.9 : 1.6);
      }
    }
    this.char.setBlink(p.invuln > 0 && this.powers.hotdog <= 0);
    this.shieldMesh.visible = this.powers.flag > 0;
    if (this.shieldMesh.visible) {
      this.shieldMesh.position.set(p.x, p.y + (p.slideT > 0 && p.grounded ? 0.5 : 1.0), p.z);
      // flicker when the shield is about to run out
      if (this.powers.flag < 2 && Math.sin(this.time * 30) < 0) this.shieldMesh.visible = false;
    }
    if (this.powers.hotdog > 0 && Math.random() < 0.5) {
      this.fx.burst(new THREE.Vector3(p.x + (Math.random() - 0.5), p.y + 0.3, p.z + 0.6), { color: 0xffb347, n: 1, speed: 1, size: 0.18, life: 0.3, gravity: 0, shape: 'spark', up: 0.5 });
    }
    this.updateCamera(dt);
    this.audio.intensity = Math.min(1, (this.speed - 15) / 18);
    this.hooks.onHud?.(this);
  }

  updateCamera(dt) {
    const p = this.player;
    const narrow = this.camera.aspect < 0.8;
    const back = narrow ? 7.6 : 6.4;
    const up = narrow ? 4.2 : 3.6;
    const boost = this.powers.hotdog > 0 ? 1.2 : 0;
    const desired = new THREE.Vector3(p.x * 0.7, up + p.y * 0.55, p.z + back + boost);
    this.camPos.lerp(desired, Math.min(1, dt * 8));
    this.camPos.z = p.z + back + boost; // never lag behind on z
    this.camLook.set(p.x * 0.8, 1.3 + p.y * 0.6, p.z - 7);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    const baseFov = this.camera.aspect < 0.8 ? 78 : this.camera.aspect < 1.2 ? 70 : 62;
    const fov = baseFov + (this.speed - 15) * 0.25 + boost * 6;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this.camLook);
  }

  /** Ground height under the runner: 0, a ramp slope, or a train roof. */
  groundAt(x, z) {
    let h = 0;
    let train = null;
    for (const o of this.spawner.obstacles) {
      if (o.kind !== 'train' && o.kind !== 'ramp') continue;
      if (Math.abs(x - o.x) > o.halfW + PLAYER_HW * 0.5) continue;
      if (z > o.zFront + PLAYER_HD || z < o.zBack - PLAYER_HD) continue;
      if (o.kind === 'train') {
        // only counts as ground if we are already up there
        if (this.player.y >= o.top - 0.6 && o.top > h) {
          h = o.top;
          train = o;
        }
      } else {
        const t = Math.min(1, Math.max(0, (o.zFront - z) / (o.zFront - o.zBack)));
        const rh = t * o.top;
        if (rh > h) h = rh;
      }
    }
    return { h, train };
  }

  collide(prevX) {
    const p = this.player;
    const h = p.slideT > 0 && p.grounded ? SLIDE_H : STAND_H;
    const pzF = p.z + PLAYER_HD;
    const pzB = p.z - PLAYER_HD;
    for (const o of this.spawner.obstacles) {
      if (o.kind === 'ramp' || o.hit) continue;
      if (o.zBack > pzF || o.zFront < pzB) continue;
      if (Math.abs(p.x - o.x) > o.halfW + PLAYER_HW) continue;
      if (o.kind === 'train') {
        if (p.y >= o.top - 0.6) continue; // running on the roof
      } else if (p.y >= o.y1 || p.y + h <= o.y0) {
        if (!o.cleared) {
          o.cleared = true;
          this.onClear(o);
        }
        continue;
      }

      // Swerving into something from the side just bounces you back.
      const wasInLane = Math.abs(prevX - o.x) <= o.halfW + PLAYER_HW - 0.05;
      if (!wasInLane) {
        if (this.time - (o.bumpAt ?? -1) > 0.4) this.bump();
        o.bumpAt = this.time;
        continue;
      }
      this.crash(o);
      return;
    }
  }

  /** Jumped or slid past something cleanly: dibs bookkeeping and the odd cheer. */
  onClear(o) {
    if (o.type === 'dibs') {
      this.run.dibs++;
      if (!this.dibsSeen) {
        this.dibsSeen = true;
        this.hooks.onToast?.('Dibs! Never move the chair.', 'milestone');
        return;
      }
    }
    if (this.time - this.lastCheer > 8 && Math.random() < 0.12) {
      this.lastCheer = this.time;
      this.hooks.onToast?.(pick(CHEERS), 'milestone');
    }
  }

  bump() {
    const p = this.player;
    p.lane = p.laneFrom;
    this.shake = Math.max(this.shake, 0.35);
    this.audio.play('bump');
  }

  crash(o) {
    const p = this.player;
    const pos = new THREE.Vector3(o.x, 1, o.zFront);
    if (this.powers.hotdog > 0 || p.invuln > 0) {
      if (o.kind !== 'train') {
        o.hit = true;
        this.fx.poof(pos);
        this.spawner.removeObstacle(o);
      }
      return;
    }
    if (this.powers.flag > 0) {
      this.powers.flag = 0;
      this.run.flagSaves++;
      p.invuln = 1.2;
      this.shake = 0.5;
      this.audio.play('shield');
      this.fx.burst(new THREE.Vector3(p.x, p.y + 1, p.z), { color: 0x6ec6f0, n: 18, speed: 7, size: 0.2, shape: 'spark' });
      this.clearAhead(o);
      this.hooks.onToast?.('Shield saved you!', 'power');
      return;
    }
    p.hearts--;
    this.flash = 0.85;
    this.run.hits++;
    this.run.sinceHit = 0;
    this.shake = 0.9;
    this.audio.play('hit');
    if (p.hearts <= 0) {
      this.die();
      return;
    }
    p.invuln = 2.0;
    this.speed *= 0.7;
    this.clearAhead(o);
    this.hooks.onToast?.(pick(OUCHES), 'hit');
  }

  /** After a non-fatal crash, clear the hazard (and its row) so the runner can recover. */
  clearAhead(o) {
    const p = this.player;
    for (const ob of [...this.spawner.obstacles]) {
      const ahead = p.z - ob.zFront;
      if (ob === o || (ob.lane === p.lane && ahead > -2 && ahead < 14 && ob.kind !== 'ramp')) {
        if (ob.kind === 'train' && ob !== o) continue;
        this.fx.poof(new THREE.Vector3(ob.x, 1, Math.min(ob.zFront, p.z - 1)));
        this.spawner.removeObstacle(ob);
      }
    }
  }

  die() {
    this.state = 'dying';
    this.dyingT = 0;
    this.overSent = false;
    this.char.setBlink(false);
    this.shieldMesh.visible = false;
    this.audio.play('over');
  }

  /** Spend coins to keep going after a fatal crash. */
  revive() {
    const p = this.player;
    p.hearts = 1;
    p.invuln = 2.5;
    p.y = 0;
    p.vy = 0;
    p.grounded = true;
    p.slideT = 0;
    // Clear everything just ahead so the restart is fair.
    for (const ob of [...this.spawner.obstacles]) {
      const ahead = p.z - ob.zBack;
      if (ahead > -2 && p.z - ob.zFront < 40) this.spawner.removeObstacle(ob);
    }
    this.speed = this.baseSpeedAt(this.distance) * 0.8;
    this.state = 'running';
    this.clock.getDelta();
  }

  collectPickups(dt) {
    const p = this.player;
    const cy = p.y + (p.slideT > 0 && p.grounded ? 0.45 : 0.9);
    const magnet = this.powers.coffee > 0 || this.gustT > 0;
    for (let i = this.spawner.pickups.length - 1; i >= 0; i--) {
      const it = this.spawner.pickups[i];
      if (it.z > p.z + 2 || it.z < p.z - 24) continue;
      if (magnet && it.type === 'coin' && it.z < p.z + 1 && p.z - it.z < 16) {
        // fly toward the runner
        const k = Math.min(1, dt * 12);
        it.x += (p.x - it.x) * k;
        it.y += (cy - it.y) * k;
        it.z += (p.z - it.z) * k * 0.9;
        it.obj.position.set(it.x, it.y, it.z);
      }
      const dx = Math.abs(it.x - p.x);
      const dz = Math.abs(it.z - p.z);
      const dy = Math.abs(it.y - cy);
      if (dx < 0.85 && dz < 0.9 && dy < 1.25) {
        this.collect(it);
        this.spawner.removePickup(it);
      }
    }
  }

  collect(it) {
    const p = this.player;
    const run = this.run;
    const pos = new THREE.Vector3(it.x, it.y, it.z);
    if (it.type === 'coin') {
      const mult = this.powers.pizza > 0 ? 2 : 1;
      run.coins++;
      run.score += 10 * mult;
      this.audio.play('coin');
      this.fx.burst(pos, { color: it.green ? 0x5cff7a : 0xffe066, n: 4, speed: 3, size: 0.09, life: 0.3, shape: 'spark', up: 2 });
      return;
    }
    run.powerups++;
    const def = PICKUPS[it.type];
    this.fx.ring(new THREE.Vector3(p.x, p.y + 1, p.z), new THREE.Color(def.color).getHex());
    this.fx.burst(pos, { color: new THREE.Color(def.color).getHex(), n: 14, speed: 6, size: 0.16, shape: 'spark' });
    if (it.type === 'shamrock') {
      run.shamrock++;
      if (p.hearts < this.maxHearts) p.hearts++;
      else run.score += 500;
      this.audio.play('life');
      this.hooks.onToast?.('☘️ Extra life!', 'power');
      return;
    }
    if (it.type === 'popcorn') {
      // Chicago Mix: instant bonus, no timer
      const mult = this.powers.pizza > 0 ? 2 : 1;
      run.popcorn++;
      run.coins += 15;
      run.score += 250 * mult;
      this.audio.play('popcorn');
      this.fx.burst(new THREE.Vector3(p.x, p.y + 1.4, p.z), { color: 0xffa51f, n: 16, speed: 5, size: 0.14, shape: 'sphere', up: 4 });
      this.hooks.onToast?.('🍿 Chicago Mix! +15 coins', 'power');
      return;
    }
    if (it.type === 'pizza') run.pizza++;
    if (it.type === 'hotdog') run.hotdog++;
    this.powers[it.type] = powerDuration(this.save, it.type);
    if (it.type === 'hotdog') this.shake = 0.2;
    this.audio.play('power');
    this.hooks.onToast?.(`${def.icon} ${def.name}: ${def.desc}!`, 'power');
  }
}

export { TRAIN_H, SECTION_LEN };

/** Shimmering force-field bubble for the Chicago flag shield. */
function makeShieldMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x6ec6f0) }, uStar: { value: new THREE.Color(0xff3b4f) } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec4 wp = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-wp.xyz); vP = position;
        gl_Position = projectionMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform vec3 uStar;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        float rim = pow(1.0 - abs(dot(vN, vV)), 2.2);
        float bands = 0.5 + 0.5 * sin(vP.y * 28.0 - uTime * 5.0);
        float hex = step(0.92, abs(sin(vP.x * 22.0 + uTime) * sin(vP.y * 22.0) * sin(vP.z * 22.0 - uTime)));
        vec3 col = uColor * (rim * 1.6 + bands * 0.12) + uStar * hex * 0.6;
        gl_FragColor = vec4(col, rim * 0.9 + 0.08 + hex * 0.3);
      }`,
  });
}
