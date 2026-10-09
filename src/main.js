// UI shell: menus, shop, challenges, HUD and the glue between Game and save data.
import { Game } from './game.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { CHARACTERS } from './characters.js';
import { THEMES, EVENTS, autoEvent, SECTION_LEN } from './world.js';
import { PICKUPS } from './models.js';
import {
  load, persist, resetSave, UPGRADES, MAX_UPGRADE, upgradeCost, powerDuration, OUTFIT_COST,
  dailyChallenges, ensureDaily, challengeProgress, commitDaily, ACHIEVEMENTS, checkAchievements,
} from './save.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const fmt = (n) => Math.floor(n).toLocaleString();

let save = load();
ensureDaily(save);
const audio = new Audio();
audio.sfxOn = save.settings.sound;
audio.musicOn = save.settings.music;
const input = new Input($('#touch-layer'));

let game;
let revives = 0;
let dailyDoneThisRun = new Set();

function activeEvent() {
  return save.settings.event === 'auto' ? autoEvent() : save.settings.event;
}

// ---------------------------------------------------------------------------
// Screen management
// ---------------------------------------------------------------------------
const SCREENS = ['loading', 'menu', 'runners', 'upgrades', 'challenges', 'trophies', 'settings', 'pause', 'over'];
function show(id) {
  for (const s of SCREENS) $('#' + s).classList.toggle('show', s === id);
  $('#hud').classList.toggle('hidden', !['hud', 'pause', 'over'].includes(id));
  input.enabled = id === 'hud';
  if (id === 'menu') refreshMenu();
  if (id === 'runners') refreshRunners();
  if (id === 'upgrades') refreshUpgrades();
  if (id === 'challenges') refreshChallenges();
  if (id === 'trophies') refreshTrophies();
  if (id === 'settings') refreshSettings();
  $$('.coins-live').forEach((e) => (e.textContent = fmt(save.coins)));
}

function commit() {
  persist(save);
  $$('.coins-live').forEach((e) => (e.textContent = fmt(save.coins)));
  $('#menu-coins').textContent = fmt(save.coins);
}

function popup(icon, title, sub) {
  const el = document.createElement('div');
  el.className = 'popup';
  el.innerHTML = `<span class="p-ico">${icon}</span><div>${title}<small>${sub}</small></div>`;
  $('#popups').appendChild(el);
  setTimeout(() => el.remove(), 4100);
}

function announceAchievements(list) {
  for (const a of list) {
    popup(a.icon, `Trophy: ${a.name}`, `${a.desc} · +${a.reward} coins`);
    audio.play('achieve');
  }
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
function refreshMenu() {
  ensureDaily(save);
  $('#menu-coins').textContent = fmt(save.coins);
  $('#menu-best').textContent = fmt(save.highScore);
  $('#menu-bestdist').textContent = fmt(save.bestDistance);
  const pending = dailyChallenges(save.daily.date).filter((c) => !save.daily.done[c.id]).length;
  $('#daily-badge').textContent = pending || '';
  const picker = $('#event-picker');
  picker.innerHTML = '';
  const auto = autoEvent();
  const opts = [['auto', `✨ Auto (${EVENTS[auto].name})`], ...Object.entries(EVENTS).map(([k, v]) => [k, `${v.icon} ${v.name}`])];
  for (const [k, label] of opts) {
    const b = document.createElement('button');
    b.className = 'chip' + (save.settings.event === k ? ' on' : '');
    b.textContent = label;
    b.onclick = () => {
      audio.unlock();
      audio.play('click');
      save.settings.event = k;
      commit();
      game.setEvent(activeEvent());
      game.showMenu();
      refreshMenu();
    };
    picker.appendChild(b);
  }
}

$('#btn-play').onclick = () => startRun();
$('#btn-settings').onclick = () => {
  audio.unlock();
  audio.play('click');
  show('settings');
};
$$('[data-open]').forEach((b) => (b.onclick = () => {
  audio.unlock();
  audio.play('click');
  show(b.dataset.open);
}));
$$('[data-back]').forEach((b) => (b.onclick = () => {
  audio.play('click');
  // restore the selected character if browsing a locked one
  game.setCharacter(save.selected, save.outfitSel[save.selected] || 0);
  show('menu');
}));

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------
let browseIdx = Math.max(0, CHARACTERS.findIndex((c) => c.id === save.selected));
let browseOutfit = save.outfitSel[save.selected] || 0;

function hex(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

function refreshRunners() {
  const c = CHARACTERS[browseIdx];
  const unlocked = !!save.unlocked[c.id];
  const owned = save.outfits[c.id] || [0];
  $('#runner-name').textContent = c.name;
  $('#runner-blurb').textContent = c.blurb;
  $('#runner-tag').textContent = unlocked ? (save.selected === c.id ? '✔ Selected' : 'Unlocked') : `🔒 ${fmt(c.cost)} coins`;
  $('#runner-dots').innerHTML = CHARACTERS.map((_, i) => `<i class="${i === browseIdx ? 'on' : ''}"></i>`).join('');
  const wrap = $('#runner-outfits');
  wrap.innerHTML = '';
  c.outfits.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (i === browseOutfit ? ' on' : '');
    const have = owned.includes(i);
    b.innerHTML = `<div class="sw"><i style="background:${hex(o.cap)}"></i><i style="background:${hex(o.hoodie)}"></i><i style="background:${hex(o.pants)}"></i></div>${o.name}${have ? '' : `<span class="lock">🔒 ${OUTFIT_COST}</span>`}`;
    b.onclick = () => {
      audio.play('click');
      browseOutfit = i;
      game.setCharacter(c.id, i);
      refreshRunners();
    };
    wrap.appendChild(b);
  });
  const act = $('#runner-action');
  act.disabled = false;
  if (!unlocked) {
    act.textContent = `Unlock for ${fmt(c.cost)} coins`;
    act.disabled = save.coins < c.cost;
  } else if (!owned.includes(browseOutfit)) {
    act.textContent = `Buy outfit · ${OUTFIT_COST} coins`;
    act.disabled = save.coins < OUTFIT_COST;
  } else if (save.selected === c.id && (save.outfitSel[c.id] || 0) === browseOutfit) {
    act.textContent = '✔ Ready to run';
  } else {
    act.textContent = 'Select';
  }
}

function browse(delta) {
  audio.play('click');
  browseIdx = (browseIdx + delta + CHARACTERS.length) % CHARACTERS.length;
  const c = CHARACTERS[browseIdx];
  browseOutfit = save.outfitSel[c.id] || 0;
  game.setCharacter(c.id, browseOutfit);
  refreshRunners();
}
$('#runner-prev').onclick = () => browse(-1);
$('#runner-next').onclick = () => browse(1);
$('#runner-action').onclick = () => {
  const c = CHARACTERS[browseIdx];
  if (!save.unlocked[c.id]) {
    if (save.coins < c.cost) return;
    save.coins -= c.cost;
    save.unlocked[c.id] = true;
    audio.play('buy');
    popup('🎉', `${c.name} unlocked!`, 'Tap Select to run with them');
    announceAchievements(checkAchievements(save));
  } else if (!(save.outfits[c.id] || [0]).includes(browseOutfit)) {
    if (save.coins < OUTFIT_COST) return;
    save.coins -= OUTFIT_COST;
    (save.outfits[c.id] ||= [0]).push(browseOutfit);
    audio.play('buy');
  } else {
    save.selected = c.id;
    save.outfitSel[c.id] = browseOutfit;
    audio.play('click');
  }
  commit();
  refreshRunners();
};

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------
function refreshUpgrades() {
  const list = $('#upgrade-list');
  list.innerHTML = '';
  for (const [id, u] of Object.entries(UPGRADES)) {
    const lvl = save.upgrades[id] || 0;
    const maxed = lvl >= MAX_UPGRADE;
    const cost = upgradeCost(lvl);
    const row = document.createElement('div');
    row.className = 'row item';
    row.innerHTML = `<div class="ico">${u.icon}</div>
      <div><h5>${u.name}</h5><p>${u.desc} · now ${powerDuration(save, id)}${u.unit}</p>
      <div class="pips">${Array.from({ length: MAX_UPGRADE }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>`;
    const b = document.createElement('button');
    b.className = 'btn btn-small btn-primary';
    b.innerHTML = maxed ? 'MAX' : `<span class="reward"><span class="coin-ico"></span>${fmt(cost)}</span>`;
    b.disabled = maxed || save.coins < cost;
    b.onclick = () => {
      if (save.coins < cost || maxed) return;
      save.coins -= cost;
      save.upgrades[id] = lvl + 1;
      audio.play('buy');
      commit();
      refreshUpgrades();
    };
    row.appendChild(b);
    list.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Daily challenges
// ---------------------------------------------------------------------------
function refreshChallenges() {
  ensureDaily(save);
  const list = $('#challenge-list');
  list.innerHTML = '';
  for (const ch of dailyChallenges(save.daily.date)) {
    const prog = Math.min(ch.goal, challengeProgress(save, ch));
    const done = !!save.daily.done[ch.id];
    const row = document.createElement('div');
    row.className = 'row item' + (done ? ' done' : '');
    row.innerHTML = `<div class="ico">${done ? '✅' : '🎯'}</div>
      <div><h5>${ch.text}</h5><p>${fmt(prog)} / ${fmt(ch.goal)}${ch.scope === 'run' ? ' (best run)' : ''}</p>
      <div class="bar"><div style="width:${(prog / ch.goal) * 100}%"></div></div></div>
      <div class="reward"><span class="coin-ico"></span>${ch.reward}</div>`;
    list.appendChild(row);
  }
  const now = new Date();
  const mid = new Date(now);
  mid.setHours(24, 0, 0, 0);
  const h = Math.floor((mid - now) / 3600000);
  const m = Math.floor(((mid - now) % 3600000) / 60000);
  $('#daily-reset').textContent = `New challenges in ${h}h ${m}m · rewards are paid automatically`;
}

function checkDailyLive(run) {
  for (const ch of dailyChallenges(save.daily.date)) {
    if (save.daily.done[ch.id] || dailyDoneThisRun.has(ch.id)) continue;
    if (challengeProgress(save, ch, run) >= ch.goal) {
      dailyDoneThisRun.add(ch.id);
      save.daily.done[ch.id] = true;
      save.coins += ch.reward;
      persist(save);
      popup('📅', 'Daily challenge complete!', `${ch.text} · +${ch.reward} coins`);
      audio.play('achieve');
    }
  }
}

// ---------------------------------------------------------------------------
// Trophies
// ---------------------------------------------------------------------------
function refreshTrophies() {
  const got = ACHIEVEMENTS.filter((a) => save.achievements[a.id]).length;
  $('#trophy-count').textContent = `${got} / ${ACHIEVEMENTS.length}`;
  $('#trophy-list').innerHTML = ACHIEVEMENTS.map((a) => `<div class="trophy ${save.achievements[a.id] ? 'got' : ''}">
    <div class="t-ico">${a.icon}</div><b>${a.name}</b><small>${a.desc}</small><small>+${a.reward} coins</small></div>`).join('');
  const s = save.stats;
  const stats = [
    ['Runs', save.runs], ['Total distance', `${fmt(save.totalDistance)} m`], ['Total coins', fmt(save.totalCoins)],
    ['Pizza slices', s.pizza], ['Hot dogs', s.hotdog], ['Shamrocks', s.shamrock], ['Train roofs', s.trainRoofs], ['Shield saves', s.flagSaves],
  ];
  $('#stats').innerHTML = stats.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function refreshSettings() {
  $('#set-sound').checked = save.settings.sound;
  $('#set-music').checked = save.settings.music;
  $('#set-quality').value = save.settings.quality;
}
$('#set-sound').onchange = (e) => {
  save.settings.sound = audio.sfxOn = e.target.checked;
  commit();
};
$('#set-music').onchange = (e) => {
  save.settings.music = audio.musicOn = e.target.checked;
  if (!audio.musicOn) audio.stopMusic();
  commit();
};
$('#set-quality').onchange = (e) => {
  game.setQuality(e.target.value);
  commit();
};
$('#set-reset').onclick = (e) => {
  // Two-tap confirmation (native confirm() dialogs are blocked in some embeds).
  const btn = e.currentTarget;
  if (!btn.dataset.armed) {
    btn.dataset.armed = '1';
    btn.textContent = 'Tap again to reset';
    setTimeout(() => {
      delete btn.dataset.armed;
      btn.textContent = 'Reset save';
    }, 3000);
    return;
  }
  delete btn.dataset.armed;
  btn.textContent = 'Reset save';
  save = resetSave();
  ensureDaily(save);
  game.save = save;
  persist(save);
  browseIdx = 0;
  browseOutfit = 0;
  game.setCharacter('kid', 0);
  show('settings');
};

// ---------------------------------------------------------------------------
// Run flow
// ---------------------------------------------------------------------------
function startRun() {
  audio.unlock();
  audio.play('click');
  ensureDaily(save);
  revives = 0;
  dailyDoneThisRun = new Set();
  game.setCharacter(save.selected, save.outfitSel[save.selected] || 0);
  game.setEvent(activeEvent());
  game.start();
  input.consume();
  show('hud');
  hudCache = {};
  $('#toasts').innerHTML = '';
  if (audio.musicOn) audio.startMusic();
  const tut = $('#tutorial');
  if (!save.tutorialSeen || save.runs < 2) {
    tut.classList.remove('hidden');
    setTimeout(() => tut.classList.add('hidden'), 4500);
    save.tutorialSeen = true;
  } else tut.classList.add('hidden');
}

function togglePause() {
  if (!game) return;
  if (game.state === 'running') {
    game.pause(true);
    audio.stopMusic();
    show('pause');
  } else if (game.state === 'paused') {
    resume();
  }
}
function resume() {
  show('hud');
  game.pause(false);
  if (audio.musicOn) audio.startMusic();
}
input.onPause = togglePause;
$('#btn-pause').onclick = togglePause;
$('#btn-resume').onclick = resume;
$('#btn-quit').onclick = () => {
  finishRun(game.run);
  game.state = 'menu';
  game.showMenu();
  show('menu');
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game?.state === 'running') togglePause();
});

const reviveCost = () => 150 * Math.pow(2, revives);
function onGameOver(run) {
  audio.stopMusic();
  const best = Math.max(save.highScore, Math.floor(run.score));
  $('#over-title').textContent = pick(['Game Over', 'Wiped Out!', 'Ouch, Chicago!', 'Da Bears... fell']);
  $('#over-score').textContent = fmt(run.score);
  $('#over-dist').textContent = fmt(run.distance);
  $('#over-coins').textContent = fmt(run.coins);
  $('#over-best').textContent = fmt(best);
  $('#over-newbest').classList.toggle('hidden', !(run.score > save.highScore && save.highScore > 0));
  const reached = THEMES[Math.floor(run.distance / SECTION_LEN) % THEMES.length].name;
  $('#over-where').textContent = `Made it to ${reached} · ${run.neighborhoods} neighbourhood${run.neighborhoods > 1 ? 's' : ''}`;
  $('#over-daily').innerHTML = dailyChallenges(save.daily.date).map((ch) => {
    const p = Math.min(ch.goal, challengeProgress(save, ch, run));
    const done = save.daily.done[ch.id];
    return `<div class="mini ${done ? 'done' : ''}">${done ? '✅' : '🎯'} ${ch.text} — ${fmt(p)}/${fmt(ch.goal)}</div>`;
  }).join('');
  const rb = $('#btn-revive');
  const cost = reviveCost();
  const total = save.coins + run.coins;
  rb.classList.toggle('hidden', revives >= 3 || total < cost);
  rb.innerHTML = `<span class="reward">Keep running · <span class="coin-ico"></span>${fmt(cost)}</span>`;
  show('over');
}

function pick(a) {
  return a[(Math.random() * a.length) | 0];
}

$('#btn-revive').onclick = () => {
  const cost = reviveCost();
  // Coins from the current run can be spent too.
  const run = game.run;
  const fromRun = Math.min(run.coins, cost);
  if (save.coins + run.coins < cost) return;
  run.coins -= fromRun;
  run.spent = (run.spent || 0) + fromRun;
  save.coins -= cost - fromRun;
  revives++;
  commit();
  audio.play('life');
  game.revive();
  show('hud');
  if (audio.musicOn) audio.startMusic();
};

let finished = false;
function finishRun(run) {
  if (!run || finished) return;
  finished = true;
  save.runs++;
  save.coins += run.coins;
  save.totalCoins += run.coins + (run.spent || 0);
  save.totalDistance += Math.floor(run.distance);
  save.highScore = Math.max(save.highScore, Math.floor(run.score));
  save.bestDistance = Math.max(save.bestDistance, Math.floor(run.distance));
  for (const k of ['pizza', 'hotdog', 'shamrock', 'flagSaves', 'trainRoofs']) save.stats[k] += run[k] || 0;
  save.stats.flag += run.flagSaves || 0;
  const evKey = { night: 'nightDist', snow: 'snowDist', stpats: 'stpatsDist', gameday: 'gamedayDist' }[run.event];
  if (evKey) save.stats[evKey] += Math.floor(run.distance);
  checkDailyLive(run);
  commitDaily(save, run);
  announceAchievements(checkAchievements(save, run));
  persist(save);
}

$('#btn-again').onclick = () => {
  finishRun(game.run);
  startRun();
};
$('#btn-menu').onclick = () => {
  finishRun(game.run);
  game.showMenu();
  show('menu');
};

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
let hudCache = {};
let dailyCheckT = 0;
function setText(id, v) {
  if (hudCache[id] !== v) {
    hudCache[id] = v;
    document.getElementById(id).textContent = v;
  }
}
function onHud(g) {
  const run = g.run;
  setText('hud-coins', fmt(run.coins));
  setText('hud-dist', fmt(run.distance));
  setText('hud-score', fmt(run.score));
  const multOn = g.powers.pizza > 0;
  if (hudCache.mult !== multOn) {
    hudCache.mult = multOn;
    $('#hud-mult').classList.toggle('on', multOn);
  }
  const hearts = `${g.player.hearts}/${g.maxHearts}`;
  if (hudCache.hearts !== hearts) {
    hudCache.hearts = hearts;
    $('#hud-hearts').innerHTML = Array.from({ length: g.maxHearts }, (_, i) => `<span class="${i < g.player.hearts ? '' : 'empty'}">❤️</span>`).join('');
  }
  // power-up timers
  const active = Object.entries(g.powers).filter(([, t]) => t > 0);
  const key = active.map(([k]) => k).join(',');
  const wrap = $('#hud-powers');
  if (hudCache.powers !== key) {
    hudCache.powers = key;
    wrap.innerHTML = active.map(([k]) => `<div class="power" data-p="${k}"><span>${PICKUPS[k].icon}</span><div class="bar"><div></div></div></div>`).join('');
  }
  for (const [k, t] of active) {
    const el = wrap.querySelector(`[data-p="${k}"]`);
    if (!el) continue;
    const max = powerDuration(save, k);
    el.querySelector('.bar div').style.width = `${(t / max) * 100}%`;
    el.classList.toggle('low', t < 2);
  }
  dailyCheckT += 1;
  if (dailyCheckT % 30 === 0) checkDailyLive(run);
}

let bannerTimer;
function onTheme(theme, first) {
  $('#banner-sub').textContent = first ? 'STARTING IN' : 'NOW ENTERING';
  $('#banner-title').textContent = theme.name;
  $('#banner-tag').textContent = theme.tag;
  const b = $('#banner');
  b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('show'), 2600);
  if (!first) audio.play('achieve');
}

function onToast(text, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = text;
  const wrap = $('#toasts');
  wrap.appendChild(t);
  while (wrap.children.length > 3) wrap.firstChild.remove();
  setTimeout(() => t.remove(), 1400);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function boot() {
  try {
    game = new Game($('#game'), save, audio, {
      consumeInput: () => input.consume(),
      onHud,
      onTheme,
      onToast,
      onGameOver: (run) => {
        finished = false;
        onGameOver(run);
      },
    });
  } catch (err) {
    console.error(err);
    $('#loading').innerHTML = '<div class="card"><h2>WebGL needed</h2><p>Chicago Dash needs a browser with WebGL enabled. Try the latest Chrome, Edge, Firefox or Safari.</p></div>';
    return;
  }
  game.setEvent(activeEvent());
  game.showMenu();
  // Make sure a new run resets the "finished" guard.
  const origStart = game.start.bind(game);
  game.start = () => {
    finished = false;
    origStart();
  };
  window.chicagoDash = game; // handy for debugging in the console
  setTimeout(() => show('menu'), 300);
  // First interaction unlocks audio on mobile.
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Enter' || e.code === 'Space') && $('#menu').classList.contains('show')) {
      e.preventDefault(); // don't also "click" a focused menu button
      startRun();
    } else if (e.code === 'Enter' && $('#over').classList.contains('show')) {
      e.preventDefault();
      $('#btn-again').click();
    }
  });
}

boot();
