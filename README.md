# Chicago Dash: Run the City

A colorful, fast-paced 3D endless runner through Chicago, built with Three.js and WebGL. You race along the "L" tracks in the Loop, down the Riverwalk, through Wrigleyville and out along the Lincoln Park lakefront. Along the way you dodge Chicago hazards and grab deep-dish pizza, hot dogs and coins.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build (static files in `dist/`, works from any host or sub-path):

```bash
npm run build
npm run preview
```

### Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Change lane | ← → or A D | Swipe left / right |
| Jump | ↑, W or Space | Swipe up or tap |
| Slide (or fast-fall in the air) | ↓ or S | Swipe down |
| Pause | P or Esc | ⏸ button |

## Features

- **Four neighborhoods**, each 750 m long. They cycle as you run, and a "Welcome to…" arch marks each change.
  - **The Loop**: elevated tracks on green steel, with skyscrapers rising from the street below, parked and oncoming CTA trains, station signs and the Chicago Theatre marquee. Run up ramps onto the train roofs and hop across them.
  - **The Riverwalk**: the river, red bascule bridges with bridge-tender houses, water taxis and tour boats, planters, benches and selfie-taking tourists.
  - **Wrigleyville**: brick storefronts (Italian beef, pizza, tavern…), the ballpark with its red marquee, hot dog carts, trash cans and fans.
  - **Lincoln Park**: the lakefront trail with a beach, the lake, trees, cyclists coming the other way, hedges, low branches and the Conservatory.
- **The skyline is always on the horizon**: Willis, Trump, Aon, Hancock and 311 South Wacker style towers.
- **Power-ups**: 🍕 deep-dish pizza (2× score), 🌭 Chicago hot dog (speed boost that smashes through obstacles), 🛡️ Chicago flag (blocks one collision), ☕ coffee (coin magnet), ☘️ lucky shamrock (extra life).
- **Obstacles**: some you jump (barricades, cones, trash cans, benches, hedges), some you slide under (low-clearance bars, bridge girders, branches) and some you go around (trains, hot dog carts, planters, tourists, bikes).
  - Hitting something head-on costs a heart. Swerving into its side just bounces you back.
  - You start with 2 hearts and can hold up to 3.
- **Fair procedural generation**: every row leaves at least one lane you can get through. Trains reserve their lanes, and oncoming trains and bikes only spawn where they have a clear path. Combo sequences (jump → slide → jump) and "gauntlets" (trains in every lane plus one ramp) show up as difficulty rises.
- **Special events**: ☀️ Sunny Day, 🌙 Night Run (lit windows, glowing lamps, stars), ❄️ Winter Storm (snowfall, snowy ground), ☘️ St. Patrick's Day (green river, green coins, more shamrocks) and ⚾ Cubs Game Day (pennants, W flags, crowds). "Auto" picks one from your local date and time.
- **Progression** (saved in `localStorage`):
  - Coins and a high score.
  - 4 unlockable runners (The Chicago Kid, The City Explorer, The South Side Runner, The Cubs Bear), each with 3 outfits.
  - Power-up duration upgrades.
  - 18 trophies.
  - 3 daily challenges, the same for everyone on a given date, with rewards paid automatically.
  - Spend coins to keep running after a crash.
- **Audio**: synthesized sound effects and a procedural chiptune loop that speeds up as you do. Everything is WebAudio, with no asset files.
- **Performance**:
  - Static scenery and obstacles are merged per material, which keeps each frame to a few hundred draw calls.
  - Textures are generated on canvas and cached.
  - Resolution drops automatically if the frame rate does.
  - Quality setting: High, Medium or Low (no shadows).

## Code tour

| File | What it does |
| --- | --- |
| `src/main.js` | UI shell: menus, runner shop, upgrades, daily challenges, trophies, HUD, run flow |
| `src/game.js` | Renderer, runner physics (lanes, jump, slide, ramps, train roofs), collisions, power-ups, camera |
| `src/spawner.js` | Obstacle, coin and power-up row generation and its fairness rules |
| `src/world.js` | Neighborhood chunk builders, skyline backdrop, sky and lighting, special events |
| `src/models.js` | Low-poly models for obstacles, pickups and street props |
| `src/characters.js` | The four rigged runners and their run, jump, slide and fall animations |
| `src/materials.js` | Toon materials and the procedurally painted canvas textures |
| `src/geo.js` | Cached primitive geometry and the `bake()` mesh-merging helper |
| `src/fx.js` | Pooled particle bursts |
| `src/audio.js` | WebAudio sound effects and music |
| `src/input.js` | Keyboard and swipe input |
| `src/save.js` | Save data, upgrades, achievements and daily challenge definitions |

In the browser console, `window.chicagoDash` exposes the running `Game` instance for debugging.

---

Fan-made game. It is not affiliated with or endorsed by the City of Chicago, the CTA or the Chicago Cubs.
