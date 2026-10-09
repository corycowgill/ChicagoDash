// Persistent progress: coins, high scores, unlocks, upgrades, achievements and
// daily challenges. Stored in localStorage; every access is guarded so the game
// still works (just without persistence) in private windows or sandboxes.
const KEY = 'chicago-dash-save-v1';

const DEFAULT = () => ({
  v: 1,
  coins: 0,
  highScore: 0,
  bestDistance: 0,
  totalCoins: 0,
  totalDistance: 0,
  runs: 0,
  unlocked: { kid: true },
  selected: 'kid',
  outfits: { kid: [0], explorer: [0], southside: [0], bear: [0] },
  outfitSel: { kid: 0, explorer: 0, southside: 0, bear: 0 },
  upgrades: { pizza: 0, hotdog: 0, coffee: 0, flag: 0 },
  stats: { pizza: 0, hotdog: 0, flag: 0, coffee: 0, shamrock: 0, flagSaves: 0, trainRoofs: 0, nightDist: 0, snowDist: 0, stpatsDist: 0, gamedayDist: 0 },
  achievements: {},
  daily: { date: '', progress: {}, done: {} },
  settings: { sound: true, music: true, quality: 'auto', event: 'auto' },
  tutorialSeen: false,
});

function merge(base, data) {
  for (const k of Object.keys(data || {})) {
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && typeof data[k] === 'object') merge(base[k], data[k]);
    else base[k] = data[k];
  }
  return base;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(DEFAULT(), JSON.parse(raw));
  } catch {
    /* storage unavailable */
  }
  return DEFAULT();
}

export function persist(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable */
  }
}

export function resetSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return DEFAULT();
}

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------
export const UPGRADES = {
  pizza: { name: 'Deep-Dish Pizza', icon: '🍕', base: 10, per: 2, unit: 's', desc: '2× score lasts longer' },
  hotdog: { name: 'Chicago Hot Dog', icon: '🌭', base: 5, per: 1, unit: 's', desc: 'Speed boost lasts longer' },
  coffee: { name: 'Coffee Magnet', icon: '☕', base: 10, per: 2, unit: 's', desc: 'Magnet lasts longer' },
  flag: { name: 'Flag Shield', icon: '🛡️', base: 15, per: 4, unit: 's', desc: 'Shield lasts longer' },
};
export const MAX_UPGRADE = 5;
export const upgradeCost = (lvl) => 250 * (lvl + 1) + 150 * lvl * lvl;
export const powerDuration = (save, id) => UPGRADES[id].base + UPGRADES[id].per * (save.upgrades[id] || 0);
export const OUTFIT_COST = 300;

// ---------------------------------------------------------------------------
// Daily challenges
// ---------------------------------------------------------------------------
export const DAILY_POOL = [
  { id: 'coins_day', text: 'Collect 500 coins today', goal: 500, metric: 'coins', scope: 'day', reward: 250 },
  { id: 'nohit2000', text: 'Run 2,000 m without crashing', goal: 2000, metric: 'noHitDist', scope: 'run', reward: 300 },
  { id: 'loop_full', text: 'Survive a full section of the Loop', goal: 750, metric: 'distance', scope: 'run', reward: 200 },
  { id: 'dist_3000', text: 'Run 3,000 m in a single run', goal: 3000, metric: 'distance', scope: 'run', reward: 300 },
  { id: 'pizza_5', text: 'Eat 5 deep-dish slices today', goal: 5, metric: 'pizza', scope: 'day', reward: 150 },
  { id: 'power_8', text: 'Grab 8 power-ups in one run', goal: 8, metric: 'powerups', scope: 'run', reward: 200 },
  { id: 'jumps_60', text: 'Jump 60 times today', goal: 60, metric: 'jumps', scope: 'day', reward: 150 },
  { id: 'slides_40', text: 'Slide 40 times today', goal: 40, metric: 'slides', scope: 'day', reward: 150 },
  { id: 'coins_run', text: 'Collect 250 coins in one run', goal: 250, metric: 'coins', scope: 'run', reward: 200 },
  { id: 'wrigley', text: 'Reach Wrigleyville (1,500 m)', goal: 1500, metric: 'distance', scope: 'run', reward: 250 },
  { id: 'roofs_10', text: 'Run on top of 10 "L" trains today', goal: 10, metric: 'trainRoofs', scope: 'day', reward: 200 },
  { id: 'score_20k', text: 'Score 20,000 points in one run', goal: 20000, metric: 'score', scope: 'run', reward: 250 },
  { id: 'dogs_4', text: 'Eat 4 Chicago hot dogs today', goal: 4, metric: 'hotdog', scope: 'day', reward: 150 },
];

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailyChallenges(dateKey = todayKey()) {
  let h = 0;
  for (const ch of dateKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = DAILY_POOL.slice();
  const out = [];
  while (out.length < 3) {
    h = (h * 1103515245 + 12345) >>> 0;
    const idx = h % pool.length;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export function ensureDaily(save) {
  const k = todayKey();
  if (save.daily.date !== k) save.daily = { date: k, progress: {}, done: {} };
}

export function challengeProgress(save, ch, run = null) {
  const base = save.daily.progress[ch.id] || 0;
  if (!run) return base;
  const v = run[ch.metric] || 0;
  return ch.scope === 'day' ? base + v : Math.max(base, v);
}

export function commitDaily(save, run) {
  for (const ch of dailyChallenges(save.daily.date)) {
    save.daily.progress[ch.id] = challengeProgress(save, ch, run);
  }
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
export const ACHIEVEMENTS = [
  { id: 'first_steps', icon: '👟', name: 'First Steps', desc: 'Run 100 m', reward: 50, test: (s, r) => r && r.distance >= 100 },
  { id: 'loop_survivor', icon: '🚇', name: 'Loop Survivor', desc: 'Make it through the entire Loop', reward: 150, test: (s, r) => r && r.distance >= 750 },
  { id: 'river_rat', icon: '🌉', name: 'River Rat', desc: 'Run the whole Riverwalk', reward: 200, test: (s, r) => r && r.distance >= 1500 },
  { id: 'tourist', icon: '🗺️', name: 'Tourist', desc: 'Visit all four neighbourhoods in one run', reward: 300, test: (s, r) => r && r.distance >= 2250 },
  { id: 'marathon', icon: '🏅', name: 'Chicago Marathon', desc: 'Run 5,000 m in one run', reward: 500, test: (s, r) => r && r.distance >= 5000 },
  { id: 'coin_collector', icon: '🪙', name: 'Coin Collector', desc: 'Collect 5,000 coins in total', reward: 300, test: (s) => s.totalCoins >= 5000 },
  { id: 'deep_dish', icon: '🍕', name: 'Deep-Dish Devotee', desc: 'Eat 50 slices of pizza', reward: 250, test: (s) => s.stats.pizza >= 50 },
  { id: 'no_ketchup', icon: '🌭', name: 'Hold the Ketchup', desc: 'Eat 25 Chicago hot dogs', reward: 250, test: (s) => s.stats.hotdog >= 25 },
  { id: 'lucky', icon: '☘️', name: 'Luck of the Irish', desc: 'Collect 10 shamrocks', reward: 200, test: (s) => s.stats.shamrock >= 10 },
  { id: 'shielded', icon: '🛡️', name: 'City of Big Shoulders', desc: 'Block 10 crashes with a flag shield', reward: 250, test: (s) => s.stats.flagSaves >= 10 },
  { id: 'rooftop', icon: '🚃', name: 'Rooftop Rider', desc: 'Run on top of 25 "L" trains', reward: 250, test: (s) => s.stats.trainRoofs >= 25 },
  { id: 'night_owl', icon: '🌙', name: 'Night Owl', desc: 'Run 2,000 m total on Night Runs', reward: 200, test: (s) => s.stats.nightDist >= 2000 },
  { id: 'snow_day', icon: '❄️', name: 'Polar Vortex', desc: 'Run 2,000 m total in Winter Storms', reward: 200, test: (s) => s.stats.snowDist >= 2000 },
  { id: 'green_river', icon: '💚', name: 'Green River', desc: "Run 1,000 m total on St. Patrick's Day", reward: 200, test: (s) => s.stats.stpatsDist >= 1000 },
  { id: 'fly_the_w', icon: '⚾', name: 'Fly the W', desc: 'Run 1,000 m total on Game Day', reward: 200, test: (s) => s.stats.gamedayDist >= 1000 },
  { id: 'high_score', icon: '🏆', name: 'Big Score', desc: 'Score 50,000 points in one run', reward: 400, test: (s, r) => r && r.score >= 50000 },
  { id: 'bear_down', icon: '🐻', name: 'Bear Down', desc: 'Unlock the Cubs Bear', reward: 300, test: (s) => !!s.unlocked.bear },
  { id: 'full_roster', icon: '👥', name: 'Full Roster', desc: 'Unlock every runner', reward: 500, test: (s) => ['kid', 'explorer', 'southside', 'bear'].every((c) => s.unlocked[c]) },
];

/** Returns newly earned achievements (and awards their coins). */
export function checkAchievements(save, run = null) {
  const earned = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id]) continue;
    if (a.test(save, run)) {
      save.achievements[a.id] = Date.now();
      save.coins += a.reward;
      earned.push(a);
    }
  }
  return earned;
}
