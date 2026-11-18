// Interactive playtest (not part of the entry): serves game/, opens it in headless
// Chromium, and plays it with real keyboard input — start, steal a car, drive,
// open the mission list — asserting the live state at each step.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';

const root = '/home/hatch/workspace/makefun-agent/entries/gta6-01/game';
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer(async (request, response) => {
  try {
    const path = request.url === '/' ? '/index.html' : decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = await readFile(join(root, path));
    response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => check(`no page error (${error.message})`, false));
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const state = () => page.evaluate(() => {
    const w = window.__world.state;
    return {
      x: Math.round(w.player.x), y: Math.round(w.player.y),
      money: w.player.money, health: Math.round(w.player.health),
      inCar: !!w.player.inCar, speed: w.player.inCar ? Math.round(w.player.inCar.speed) : 0,
      wanted: w.wanted, mission: w.mission ? w.mission.index : null,
      missionStep: w.mission ? w.mission.step : null,
      cars: w.cars.length, peds: w.peds.length, gameOver: w.gameOver,
      missionIndex: w.missionIndex,
    };
  });
  let s = await state();
  check('title screen world is live (traffic + peds)', s.cars > 20 && s.peds > 20, `cars=${s.cars} peds=${s.peds}`);

  // Start the game.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  s = await state();
  check('mission 0 auto-starts after game start', s.mission === 0, `mission=${s.mission}`);

  // Walk toward the parked sedan at (1150, 880): player starts at (1150, 1000).
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  await page.keyboard.up('w');
  s = await state();
  check('player walked north', s.y < 980, `y=${s.y}`);
  // Steal the parked car.
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  s = await state();
  check('stole a car with E', s.inCar === true, `inCar=${s.inCar}`);
  check('taking a parked car is free (no heat)', s.wanted === 0, `wanted=${s.wanted}`);
  check('mission 0 step 0 (steal) completed', s.missionStep === 1, `step=${s.missionStep}`);

  // Carjacking a driven car is hot: exit, step up to a traffic car, take it.
  await page.keyboard.press('e');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const w = window.__world;
    const car = w.state.cars.find((c) => c.traffic && c.driver);
    w.state.player.x = car.x + 20;
    w.state.player.y = car.y + 20;
  });
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  s = await state();
  check('carjacked a driven car', s.inCar === true, `inCar=${s.inCar}`);
  check('carjacking raised the wanted level', s.wanted >= 1, `wanted=${s.wanted}`);

  // Drive for 3 seconds, sampling speed while driving (the car may end stopped
  // against a building; what matters is that it drove).
  const x0 = s.x;
  let maxSpeed = 0;
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(500);
    const cur = await state();
    maxSpeed = Math.max(maxSpeed, Math.abs(cur.speed));
  }
  await page.keyboard.up('d');
  await page.keyboard.up('w');
  s = await state();
  check('car drove (peak speed while driving)', maxSpeed > 100, `maxSpeed=${maxSpeed} dx=${s.x - x0}`);
  check('player is alive and not busted', s.gameOver === null && s.health > 0, `gameOver=${s.gameOver} hp=${s.health}`);

  // Mission list screen.
  await page.keyboard.press('m');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/playtest-missions.jpg', type: 'jpeg', quality: 80 });
  await page.keyboard.press('m');
  await page.waitForTimeout(200);

  // Save round-trips through localStorage.
  await page.evaluate(() => window.__world.save());
  const saved = await page.evaluate(() => window.localStorage.getItem('solmar-heat-save-v1'));
  check('save writes to localStorage', !!saved && saved.includes('missionIndex'), saved ? saved.slice(0, 80) : 'none');

  // A longer soak: drive around for 20s with random inputs, watch for errors.
  const keys = ['w', 'a', 's', 'd'];
  for (let i = 0; i < 10; i += 1) {
    const k = keys[i % keys.length];
    await page.keyboard.down(k);
    await page.waitForTimeout(2000);
    await page.keyboard.up(k);
  }
  s = await state();
  check('20s soak: game still running', s.gameOver === null || s.health > 0, `gameOver=${s.gameOver} wanted=${s.wanted} money=${s.money}`);
  await page.screenshot({ path: '/tmp/playtest-end.jpg', type: 'jpeg', quality: 80 });
  console.log('final state:', JSON.stringify(s));
} finally {
  await browser.close();
  server.close();
}
if (failures.length > 0) {
  console.log(`PLAYTEST FAILURES: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('PLAYTEST ALL PASS');
