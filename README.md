# Chicago Dash: Run the City

A colorful, fast-paced 3D endless runner through Chicago, built with Three.js and WebGL. You race along the "L" tracks in the Loop, down the Riverwalk, through Wrigleyville and out along the Lincoln Park lakefront. Along the way you dodge Chicago hazards and grab deep-dish pizza, hot dogs and coins.

## Play

The repo root is a working static site with no build step, like the other Hallucinated Games: serve it with any static file server (ES modules will not load from `file://`).

```bash
python -m http.server 8765    # then open http://localhost:8765/
```

Three.js (r170, MIT) is vendored in `vendor/three/` and resolved through an import map in `index.html`.

For development with hot reload, or a bundled build in `dist/`:

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # bundles Three.js, copies intro/ into dist/
```

### Deploying

**GitHub Pages:** in the repo on GitHub, open **Settings → Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, **Branch** to `main` and the folder to `/ (root)`, then click **Save**. The game goes live at `https://corycowgill.github.io/ChicagoDash/` within a minute or two. `.nojekyll` tells Pages to serve the files as-is.


**Render:** create a **Static Site** from this repo with a blank Build Command and Publish Directory `.`, the same as AlienDigger. Point it at whichever branch holds the game.

### Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Change lane | ← → or A D | Swipe left / right |
| Jump | ↑, W or Space | Swipe up or tap |
| Slide (or fast-fall in the air) | ↓ or S | Swipe down |
| Pause | P or Esc | ⏸ button |

## Features

- **Five neighborhoods**, each 750 m long. They cycle as you run, and a "Welcome to…" arch marks each change.
  - **The Loop**: elevated tracks on green steel, with skyscrapers rising from the street below, parked and oncoming CTA trains, the Chicago Theatre marquee and the Daley Plaza Picasso. Station signs trigger the CTA chime: "This is Clark/Lake. Doors closing." Run up ramps onto the train roofs and hop across them.
  - **Millennium Park**: the Bean, Crown Fountain's glass-block faces, Pritzker Pavilion's steel ribbons and trellis, Buckingham Fountain with its pulsing jet, and the Art Institute lions. The lions wear Cubs caps on Game Day, wreaths in the snow and green top hats on St. Patrick's Day. Watch for bucket drummers and festival banners.
  - **The Riverwalk**: the river, red bascule bridges with bridge-tender houses, Marina City's corncob towers, water taxis and tour boats, blues buskers, planters, benches and selfie-taking tourists.
  - **Wrigleyville**: brick storefronts (Italian beef, pizza, tavern…), the ballpark with its red marquee, the hand-turned scoreboard flying the W, rooftop bleachers full of fans, hot dog carts and trash cans.
  - **Lincoln Park**: the lakefront trail with a beach, lifeguard chairs, sailboats, the Lincoln Park Zoo giraffes, cyclists coming the other way, hedges, low branches and the Conservatory.
- **Street life everywhere**: green street signs at real intersections (State & Madison marks the center of the grid) and pigeons that scatter as you run by.
- **Chicago culture**:
  - Windy City gusts send newspapers flying and blow coins your way.
  - In a Winter Storm, lawn chairs hold shoveled spots ("dibs").
  - Chicago Mix popcorn (cheese + caramel) gives bonus coins.
  - Chicago sayings when you clear or hit things ("Ope!"), and a true Chicago fact on every loading screen and game over.
  - The soundtrack plays blues changes over a house beat.
- **The skyline is always on the horizon**: Willis, Trump, Aon, Hancock and 311 South Wacker style towers.
- **Power-ups**: 🍕 deep-dish pizza (2× score), 🌭 Chicago hot dog (speed boost that smashes through obstacles), 🛡️ Chicago flag (blocks one collision), ☕ coffee (coin magnet), ☘️ lucky shamrock (extra life), 🍿 Chicago Mix (bonus coins).
- **Obstacles**: some you jump (barricades, cones, trash cans, benches, hedges), some you slide under (low-clearance bars, bridge girders, branches) and some you go around (trains, hot dog carts, planters, tourists, bikes).
  - Hitting something head-on costs a heart. Swerving into its side just bounces you back.
  - You start with 2 hearts and can hold up to 3.
- **Fair procedural generation**: every row leaves at least one lane you can get through. Trains reserve their lanes, and oncoming trains and bikes only spawn where they have a clear path. Combo sequences (jump → slide → jump) and "gauntlets" (trains in every lane plus one ramp) show up as difficulty rises.
- **Special events**: ☀️ Sunny Day, 🌙 Night Run (lit windows, glowing lamps, stars), ❄️ Winter Storm (snowfall, snowy ground), ☘️ St. Patrick's Day (green river, green coins, more shamrocks) and ⚾ Cubs Game Day (pennants, W flags, crowds). "Auto" picks one from your local date and time.
- **Progression** (saved in `localStorage`):
  - Coins and a high score.
  - 4 unlockable runners (The Chicago Kid, The City Explorer, The South Side Runner, The Cubs Bear), each with 3 outfits.
  - Power-up duration upgrades.
  - 22 trophies.
  - 3 daily challenges, the same for everyone on a given date, with rewards paid automatically.
  - Spend coins to keep running after a crash.
- **Audio**: synthesized sound effects and a procedural chiptune loop that speeds up as you do. Everything is WebAudio, with no asset files.
- **Performance**:
  - Static scenery and obstacles are merged per material, which keeps each frame to a few hundred draw calls.
  - Textures are generated on canvas and cached.
  - Resolution drops automatically if the frame rate does.
  - Quality setting: High, Medium or Low (no shadows).

## Studio ident

The game opens with the Hallucinated Games intro. `intro/hallucinated-intro.js` is vendored from `gameCentral/intro/` so the game stays a self-contained deploy; re-copy that file to take an update. Click, tap or press any key to skip it, or add `?nointro` to the URL.

## Code tour

| File | What it does |
| --- | --- |
| `src/main.js` | UI shell: menus, runner shop, upgrades, daily challenges, trophies, HUD, run flow |
| `src/game.js` | Renderer, runner physics (lanes, jump, slide, ramps, train roofs), collisions, power-ups, camera |
| `src/spawner.js` | Obstacle, coin and power-up row generation and its fairness rules |
| `src/world.js` | Neighborhood chunk builders, skyline backdrop, sky and lighting, special events |
| `src/models.js` | Low-poly models for obstacles, pickups and street props |
| `src/landmarks.js` | Chicago landmarks and street life: the Bean, fountains, lions, Marina City, the Picasso, the Ferris wheel, street signs, pigeons |
| `src/chicago.js` | Chicago facts, sayings, real intersections and festival names |
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
