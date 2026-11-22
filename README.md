[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/AlexBeracun/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/AlexBeracun/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMAR HEAT

An original open-world crime game for the make.fun **gta6-01** bounty ("Make GTA 6"),
built in the spirit of GTA 6 with its own city, characters, vehicles, names and story —
nothing from Rockstar Games. Bounty page: https://make.fun/bounty/gta6-01

You are **Mara Solis**, a driver for hire in **Solmar Bay**: a sun-soaked coastal city
with a beach, a downtown of glass towers, a marina, docks and suburbs. Drive and walk
the streets, steal cars, run missions, take taxi fares, dodge the Solmar Bay Police —
and try to finish all ten story missions, ending with the King of Solmar finale.

## Play

Open `game/index.html` in a desktop browser (or run `node serve.ts` and open
http://localhost:8080). No build step, no network request — plain static files plus
three.js (vendored under `game/vendor/three/`) for the 3D world.

| Key | Action |
| --- | --- |
| W A S D / Arrows | Move on foot / drive |
| Shift | Sprint |
| E | Enter / steal a car, exit a car |
| Space | Handbrake in a car, punch on foot |
| Mouse click | Shoot (with pistol ammo) |
| M | Mission list |
| P / Esc | Pause |
| R | Get back out there after Busted / Wasted |

## What's in the game

- **A city to explore, in 3D** — 3,600 × 2,600 open world rendered with three.js:
  beach and ocean, palm-lined roads, downtown towers with lit windows at night,
  marina, docks, suburbs, parks, and a day/night cycle with a low golden-hour sun.
  A chase camera follows Mara on foot and behind the wheel.
- **On foot and by car** — 9 vehicles with their own speed, acceleration and handling;
  traffic cars drive the road grid and pedestrians walk the sidewalks (and flee gunfire).
- **Stealing cars** — pull a driver out of any car (the police notice) and take it.
- **Wanted system** — 0 to 5 stars. Police interceptors chase and ram you, foot cops
  chase, punch and (at 3+ stars) shoot, and at 3+ stars the SBP helicopter joins in
  overhead, its searchlight on you — while it is up, the heat does not decay. Lose
  the heat by hiding, or pay $200 at the Spray Shop for a respray. Get caught on
  foot and you're Busted; lose all health and you're Wasted.
- **10 story missions** — First Wheels, Sunset Courier, Beach Pickup, Heat Check,
  Dockside Deal, Harbor Heist, Rush Hour, Taxi King, Rosa's Revenge, and the
  King of Solmar finale, with a mission list, waypoint beacons, timers, and payouts.
- **Side work** — taxi fares ($150 a ride), street cash, health and ammo pickups,
  an ammo store and a hospital.
- **HUD + minimap** — money, health, ammo, wanted stars, clock and radio station,
  mission objective banner with distance arrow, and a live minimap of Solmar Bay.
- **Save** — progress autosaves after every mission (localStorage) and can be continued
  from the title screen.
- **Sound** — fully synthesised with WebAudio: engine hum, sirens, gunshots, pickups,
  mission jingles and a bassline radio loop. No audio files.

## Files

- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and
  writes `dossier.json` with the kit's vendored `vendor/makefun-game.ts`.
- `game/index.html` — the game shell.
- `game/src/config.js` — tuning, vehicles, missions, places.
- `game/src/random.js` — seeded RNG (deterministic city and screenshots).
- `game/src/input.js` — keyboard + mouse.
- `game/src/audio.js` — synthesised WebAudio sound.
- `game/src/world.js` — the game's rules and state, and the step() that calls each
  simulation module in order.
- `game/src/city.js` — the road grid and city generation (districts, towers, houses).
- `game/src/traffic.js` — traffic cars on the road grid.
- `game/src/pedestrians.js` — pedestrians walking, fleeing, going down.
- `game/src/police.js` — interceptor cars, foot cops, and the SBP helicopter.
- `game/src/missions.js` — the 10 story missions and their steps.
- `game/src/pickups.js` — street cash, health and ammo pickups.
- `game/src/combat.js` — bullets in flight.
- `game/src/player.js` — the player on foot and by car, services, getting in/out.
- `game/src/save.js` — the localStorage save.
- `game/src/world-events.js` — the event bit flags step() returns.
- `game/src/render.js` — 2D HUD, minimap, menus, and the call into the 3D renderer.
- `game/src/render3d.js` — the three.js world: city, cars, people, helicopter,
  beacon, chase camera, day/night light.
- `game/src/shots.js` — the four staged screenshot scenes.
- `game/src/main.js` — boot, fixed-step loop, screens.
- `serve.ts` — tiny static server for local play.
- `take-screenshots.mjs` — takes the 4 real in-browser screenshots into `screenshots/`
  (needs `playwright-core` + a Chromium build; see `shots.json` for the scenes).
- `screenshots/` — 4 real renders of the game: golden-hour police chase with the
  helicopter, night manhunt downtown, dockside mission on foot, beach cruise.

## License

MIT — see `LICENSE`.
