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
and try to finish all six story missions, ending with the Harbor Heist.

## Play

Open `game/index.html` in a desktop browser (or run `node serve.ts` and open
http://localhost:8080). No build step, no network request, no library — plain static
files, standard library only.

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

- **A city to explore** — 3,600 × 2,600 open world: beach and ocean, palm-lined roads,
  downtown towers, marina, docks, suburbs, parks, and a day/night cycle with lit windows.
- **On foot and by car** — 9 vehicles with their own speed, acceleration and handling;
  traffic cars drive the road grid and pedestrians walk the sidewalks (and flee gunfire).
- **Stealing cars** — pull a driver out of any car (the police notice) and take it.
- **Wanted system** — 0 to 5 stars. Police interceptors chase and ram you, foot cops
  chase, punch and (at 3+ stars) shoot. Lose the heat by hiding, or pay $200 at the
  Spray Shop for a respray. Get caught on foot and you're Busted; lose all health
  and you're Wasted.
- **6 story missions** — First Wheels, Sunset Courier, Beach Pickup, Heat Check,
  Dockside Deal, and the Harbor Heist finale, with a mission list, waypoint beacons,
  timers, and payouts.
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
- `game/src/world.js` — city generation, traffic, pedestrians, police, wanted system,
  missions, combat, pickups, save/load.
- `game/src/render.js` — top-down world rendering, HUD, minimap, menus.
- `game/src/shots.js` — the four staged screenshot scenes.
- `game/src/main.js` — boot, fixed-step loop, screens.
- `serve.ts` — tiny static server for local play.
- `take-screenshots.mjs` — takes the 4 real in-browser screenshots into `screenshots/`
  (needs `playwright-core` + a Chromium build; see `shots.json` for the scenes).
- `screenshots/` — 4 real renders of the game: title, golden-hour police chase,
  dockside mission on foot, night chase downtown.

## License

MIT — see `LICENSE`.
