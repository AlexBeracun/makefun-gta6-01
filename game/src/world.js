// The game's rules and state, with no drawing and no browser in it: the city, the player
// on foot and by car, traffic, pedestrians, police, the wanted system, missions, combat,
// pickups and the save. step() advances one fixed step and returns what happened as bit
// flags, so the caller can react (sound, toasts) without the world knowing about screens.
import {
  CARS, COLORS, MAX_WANTED, MISSIONS, PLACES, ROAD_GAP, ROAD_W, SAVE_KEY,
  SPRAY_COST, TAXI_FARE, WANTED_DECAY_SECONDS, WORLD_H, WORLD_W,
} from './config.js';
import { angleLerp, clamp, dist, mulberry32, pick, range, rangeInt } from './random.js';

export const EVENT_CASH = 1;
export const EVENT_MISSION_DONE = 2;
export const EVENT_MISSION_FAIL = 4;
export const EVENT_BUSTED = 8;
export const EVENT_WASTED = 16;
export const EVENT_WANTED = 32;
export const EVENT_SHOT = 64;
export const EVENT_CRASH = 128;
export const EVENT_PICKUP = 256;
export const EVENT_PUNCH = 512;
export const EVENT_MISSION_START = 1024;

const ROAD_XS = [];
for (let x = 300; x <= WORLD_W - 150; x += ROAD_GAP) ROAD_XS.push(x);
const ROAD_YS = [];
for (let y = 200; y <= WORLD_H - 150; y += ROAD_GAP) ROAD_YS.push(y);

const PED_COLORS = ['#e8b4a0', '#c98a5a', '#8a5a3a', '#f2d0b8', '#6b4a2a'];
const PED_SHIRTS = ['#d94f4f', '#4f7fd0', '#4fd07a', '#e8c832', '#9b59d0', '#e8e4da', '#ff8c42', '#2ec4b6'];

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  return dist(cx, cy, nx, ny) < r;
}

export function createWorld(seed) {
  const rng = mulberry32(seed);
  const state = {
    elapsed: 0,
    clock: 9.5, // 09:30, a bright Solmar morning
    player: null,
    cars: [],
    peds: [],
    cops: [],
    bullets: [],
    pickups: [],
    particles: [],
    buildings: [],
    palms: [],
    parks: [],
    wanted: 0,
    heatTimer: 0,
    decayTimer: 0,
    missionIndex: 0,
    mission: null,
    missionTimer: 0,
    toast: '',
    toastTimer: 0,
    cam: { x: 0, y: 0 },
    storyDone: false,
    stats: { carsStolen: 0, missionsDone: 0, cashEarned: 0, pedsDown: 0 },
    fare: null, // active taxi fare {ped, destX, destY}
    fareTimer: 0,
    bustTimer: 0,
    damageTimer: 0,
    radio: 'SOLMAR FM 98.5',
    gameOver: null, // 'busted' | 'wasted'
    overTimer: 0,
  };

  function makePlayer(x, y) {
    return {
      x, y, angle: -Math.PI / 2, health: 100, money: 250, ammo: 24,
      inCar: null, speed: 0, punchCd: 0, shootCd: 0, invuln: 0,
      walkPhase: 0, moving: false,
    };
  }

  function districtAt(x, y) {
    if (x > 1950 && y < 1300) return 'downtown';
    if (x > 2400 && y > 1850) return 'industrial';
    if (x > 2400 && y >= 1300 && y < 1850) return 'houses';
    if (x < 900 && y > 1850) return 'park';
    return 'houses';
  }

  function buildCity() {
    state.buildings = [];
    state.palms = [];
    state.parks = [];
    for (let i = 0; i < ROAD_XS.length - 1; i += 1) {
      for (let j = 0; j < ROAD_YS.length - 1; j += 1) {
        const x0 = ROAD_XS[i] + ROAD_W / 2 + 14;
        const y0 = ROAD_YS[j] + ROAD_W / 2 + 14;
        const x1 = ROAD_XS[i + 1] - ROAD_W / 2 - 14;
        const y1 = ROAD_YS[j + 1] - ROAD_W / 2 - 14;
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const district = districtAt(cx, cy);
        if (district === 'park' && rng() < 0.7) {
          state.parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
          for (let p = 0; p < 6; p += 1) {
            state.palms.push({ x: range(rng, x0 + 20, x1 - 20), y: range(rng, y0 + 20, y1 - 20) });
          }
          continue;
        }
        if (district === 'downtown') {
          // One tall tower per block, sometimes two.
          const w = range(rng, 130, 200);
          const h = range(rng, 130, 200);
          state.buildings.push({
            x: cx - w / 2, y: cy - h / 2, w, h,
            color: pick(rng, COLORS.downtown), tall: true, floors: rangeInt(rng, 8, 18),
          });
          if (rng() < 0.4) {
            const w2 = range(rng, 80, 120);
            const h2 = range(rng, 80, 120);
            state.buildings.push({
              x: x0 + range(rng, 0, 60), y: y0 + range(rng, 0, 60), w: w2, h: h2,
              color: pick(rng, COLORS.downtown), tall: true, floors: rangeInt(rng, 5, 9),
            });
          }
        } else if (district === 'industrial') {
          const w = range(rng, 180, 280);
          const h = range(rng, 120, 180);
          state.buildings.push({
            x: cx - w / 2, y: cy - h / 2, w, h,
            color: pick(rng, COLORS.industrial), tall: false, floors: 1,
          });
        } else {
          // Two or three houses per block.
          const count = rangeInt(rng, 2, 3);
          for (let k = 0; k < count; k += 1) {
            const w = range(rng, 70, 130);
            const h = range(rng, 60, 110);
            const bx = range(rng, x0, Math.max(x0 + 1, x1 - w));
            const by = range(rng, y0, Math.max(y0 + 1, y1 - h));
            state.buildings.push({
              x: bx, y: by, w, h,
              color: pick(rng, COLORS.house), tall: false, floors: rangeInt(rng, 1, 2),
            });
          }
        }
      }
    }
    // Palm-lined beach road.
    for (let y = 260; y < WORLD_H - 100; y += 130) {
      state.palms.push({ x: 250 + range(rng, -14, 14), y: y + range(rng, -20, 20) });
      if (rng() < 0.5) state.palms.push({ x: 2050 + range(rng, -10, 10), y: y + range(rng, -20, 20) });
    }
  }

  function randomRoadPoint() {
    const horizontal = rng() < 0.5;
    if (horizontal) {
      return { x: range(rng, 350, WORLD_W - 200), y: pick(rng, ROAD_YS), angle: rng() < 0.5 ? 0 : Math.PI };
    }
    return { x: pick(rng, ROAD_XS), y: range(rng, 250, WORLD_H - 200), angle: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
  }

  function spawnTrafficCar(nearX, nearY) {
    const def = pick(rng, CARS.filter((c) => c.id !== 'police'));
    const p = nearX === undefined ? randomRoadPoint() : { x: nearX, y: nearY, angle: rng() * Math.PI * 2 };
    const car = {
      def, x: p.x, y: p.y, angle: p.angle, speed: 0, targetSpeed: range(rng, 110, 170),
      color: def.color, traffic: true, police: false, driver: true,
      cruise: range(rng, 110, 170), turnAt: null, hp: 100, smoke: 0,
    };
    state.cars.push(car);
    return car;
  }

  function spawnPed(nearX, nearY) {
    const x = nearX === undefined ? range(rng, 350, WORLD_W - 200) : nearX;
    const y = nearY === undefined ? range(rng, 250, WORLD_H - 200) : nearY;
    const ped = {
      x, y, angle: rng() * Math.PI * 2, speed: range(rng, 35, 60),
      skin: pick(rng, PED_COLORS), shirt: pick(rng, PED_SHIRTS),
      tx: x, ty: y, state: 'walk', hp: 50, fleeTimer: 0, dead: false, deadTimer: 0,
      fare: false, waitTimer: 0,
    };
    state.peds.push(ped);
    return ped;
  }

  function spawnPoliceCar() {
    const a = rng() * Math.PI * 2;
    const d = range(rng, 500, 700);
    const x = clamp(state.player.x + Math.cos(a) * d, 350, WORLD_W - 200);
    const y = clamp(state.player.y + Math.sin(a) * d, 250, WORLD_H - 200);
    const def = CARS.find((c) => c.id === 'police');
    const car = {
      def, x, y, angle: Math.atan2(state.player.y - y, state.player.x - x),
      speed: 100, targetSpeed: def.speed, color: pick(rng, ['#20242e', '#1c2733']),
      traffic: false, police: true, driver: true, cruise: def.speed, turnAt: null, hp: 100, smoke: 0,
    };
    state.cars.push(car);
    return car;
  }

  function spawnCop() {
    const a = rng() * Math.PI * 2;
    const d = range(rng, 260, 380);
    const cop = {
      x: clamp(state.player.x + Math.cos(a) * d, 350, WORLD_W - 200),
      y: clamp(state.player.y + Math.sin(a) * d, 250, WORLD_H - 200),
      angle: 0, speed: 150, hp: 100, shootCd: range(rng, 1, 2), punchCd: 0,
    };
    state.cops.push(cop);
    return cop;
  }

  function spawnPickup(kind, x, y, amount) {
    state.pickups.push({ kind, x, y, amount: amount || 0, active: true, bob: rng() * 6 });
  }

  function addParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = rng() * Math.PI * 2;
      const s = range(rng, speed * 0.3, speed);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: range(rng, 0.3, 0.8), maxLife: 0.8, color, size: range(rng, 2, 5),
      });
    }
  }

  function onRoad(x, y) {
    for (const rx of ROAD_XS) if (Math.abs(x - rx) < ROAD_W / 2 + 6) return true;
    for (const ry of ROAD_YS) if (Math.abs(y - ry) < ROAD_W / 2 + 6) return true;
    return false;
  }

  function buildingAt(x, y, r) {
    for (const b of state.buildings) {
      if (circleRect(x, y, r, b.x, b.y, b.w, b.h)) return b;
    }
    return null;
  }

  function pushOutOfBuildings(ent, r) {
    const b = buildingAt(ent.x, ent.y, r);
    if (!b) return false;
    const left = ent.x - (b.x - r);
    const right = (b.x + b.w + r) - ent.x;
    const top = ent.y - (b.y - r);
    const bottom = (b.y + b.h + r) - ent.y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) ent.x = b.x - r;
    else if (min === right) ent.x = b.x + b.w + r;
    else if (min === top) ent.y = b.y - r;
    else ent.y = b.y + b.h + r;
    return true;
  }

  function addWanted(n) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, MAX_WANTED);
    state.heatTimer = 0;
    state.decayTimer = 0;
    return state.wanted > before;
  }

  function missionDef() {
    // The active mission is the one the player is running, which is not always the
    // next unstarted one (the screenshot scenes start a later mission directly).
    return MISSIONS[state.mission ? state.mission.index : state.missionIndex] || null;
  }

  function currentStep() {
    const m = state.mission;
    if (!m) return null;
    return missionDef().steps[m.step];
  }

  function startMission(index) {
    const def = MISSIONS[index];
    if (!def) return;
    state.mission = { index, step: 0, collected: 0, passenger: false };
    state.missionTimer = def.timeLimit || 0;
    state.toast = `${def.title} — ${def.giver}: ${def.brief}`;
    state.toastTimer = 6;
    if (def.id === 'm3') {
      const ped = spawnPed(def.steps[0].x + 20, def.steps[0].y + 30);
      ped.state = 'wait';
      ped.waitTimer = 999;
      state.mission.ped = ped;
    }
    if (def.id === 'm4') addWanted(2);
    if (def.id === 'm6') state.missionTimer = 0;
  }

  function completeStep(events) {
    const m = state.mission;
    const def = missionDef();
    m.step += 1;
    if (m.step >= def.steps.length) {
      state.player.money += def.pay;
      state.stats.cashEarned += def.pay;
      state.stats.missionsDone += 1;
      state.missionIndex += 1;
      state.mission = null;
      state.toast = `Mission complete: ${def.title} — $${def.pay} earned!`;
      state.toastTimer = 5;
      if (state.missionIndex >= MISSIONS.length) {
        state.storyDone = true;
        state.toast = 'STORY COMPLETE — You own Solmar Bay now. Free roam: drive fares, dodge the heat!';
        state.toastTimer = 7;
      }
      return events | EVENT_MISSION_DONE;
    }
    return events;
  }

  function failMission(events) {
    const def = missionDef();
    state.mission = null;
    state.toast = `Mission failed: ${def.title}. Talk to ${def.giver} again — press M for missions.`;
    state.toastTimer = 5;
    return events | EVENT_MISSION_FAIL;
  }

  function policeCount() {
    let cars = 0;
    for (const c of state.cars) if (c.police) cars += 1;
    return { cars, cops: state.cops.length };
  }

  function maintainPolice() {
    const want = state.wanted;
    const have = policeCount();
    const wantCars = want === 0 ? 0 : Math.min(want, 4);
    const wantCops = want >= 2 ? Math.min(want - 1, 3) : 0;
    if (wantCars > have.cars) spawnPoliceCar();
    if (wantCops > have.cops) spawnCop();
    // Despawn far-away police when the heat is gone.
    if (want === 0) {
      state.cars = state.cars.filter((c) => !c.police || dist(c.x, c.y, state.player.x, state.player.y) < 900);
      state.cops = [];
    }
  }

  function reset() {
    state.elapsed = 0;
    state.clock = 9.5;
    state.player = makePlayer(1150, 1000);
    state.cars = [];
    state.peds = [];
    state.cops = [];
    state.bullets = [];
    state.pickups = [];
    state.particles = [];
    state.wanted = 0;
    state.heatTimer = 0;
    state.decayTimer = 0;
    state.missionIndex = 0;
    state.mission = null;
    state.missionTimer = 0;
    state.toast = '';
    state.toastTimer = 0;
    state.cam = { x: state.player.x, y: state.player.y };
    state.storyDone = false;
    state.stats = { carsStolen: 0, missionsDone: 0, cashEarned: 0, pedsDown: 0 };
    state.fare = null;
    state.fareTimer = 0;
    state.bustTimer = 0;
    state.damageTimer = 0;
    state.gameOver = null;
    state.overTimer = 0;
    buildCity();
    for (let i = 0; i < 26; i += 1) spawnTrafficCar();
    for (let i = 0; i < 34; i += 1) spawnPed();
    // Parked cars near the start so the first mission is easy to begin.
    const parked = [
      { def: 'sedan', x: 1150, y: 880 }, { def: 'coupe', x: 1330, y: 880 },
      { def: 'taxi', x: 900, y: 1330 }, { def: 'pickup', x: 1780, y: 1330 },
      { def: 'beach', x: 420, y: 700 }, { def: 'sport', x: 2250, y: 880 },
    ];
    for (const p of parked) {
      const def = CARS.find((c) => c.id === p.def);
      state.cars.push({
        def, x: p.x, y: p.y, angle: 0, speed: 0, targetSpeed: 0, color: def.color,
        traffic: false, police: false, driver: false, cruise: 0, turnAt: null, hp: 100, smoke: 0,
      });
    }
    spawnPickup('cash', 1250, 1050, 50);
    spawnPickup('health', 2650, 1520, 50);
    spawnPickup('ammo', 1750, 760, 24);
    spawnPickup('cash', 2900, 800, 75);
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (car.police) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function stepPlayerOnFoot(dt, c) {
    const p = state.player;
    let mx = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    let my = (c.down ? 1 : 0) - (c.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    p.moving = len > 0;
    if (len > 0) {
      mx /= len;
      my /= len;
      const speed = c.sprint ? 265 : 165;
      p.x += mx * speed * dt;
      p.y += my * speed * dt;
      p.angle = Math.atan2(my, mx);
      p.walkPhase += dt * (c.sprint ? 14 : 9);
    }
    p.x = clamp(p.x, 170, WORLD_W - 10);
    p.y = clamp(p.y, 10, WORLD_H - 10);
    pushOutOfBuildings(p, 13);
    if (p.punchCd > 0) p.punchCd -= dt;
    if (p.shootCd > 0) p.shootCd -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    // Punch.
    if (c.punch && p.punchCd <= 0) {
      p.punchCd = 0.45;
      const hx = p.x + Math.cos(p.angle) * 30;
      const hy = p.y + Math.sin(p.angle) * 30;
      let hit = false;
      for (const cop of state.cops) {
        if (dist(hx, hy, cop.x, cop.y) < 34) {
          cop.hp -= 34;
          cop.x += Math.cos(p.angle) * 26;
          cop.y += Math.sin(p.angle) * 26;
          hit = true;
        }
      }
      for (const ped of state.peds) {
        if (!ped.dead && dist(hx, hy, ped.x, ped.y) < 30) {
          ped.hp -= 50;
          ped.state = 'flee';
          ped.fleeTimer = 4;
          hit = true;
        }
      }
      if (hit) return EVENT_PUNCH;
    }
    // Shoot toward the mouse.
    if (c.shooting && p.shootCd <= 0 && p.ammo > 0 && c.shootX !== undefined) {
      p.shootCd = 0.28;
      p.ammo -= 1;
      const a = Math.atan2(c.shootY - p.y, c.shootX - p.x);
      p.angle = a;
      state.bullets.push({
        x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
        vx: Math.cos(a) * 720, vy: Math.sin(a) * 720, life: 0.9, fromPlayer: true,
      });
      addWanted(0);
      return EVENT_SHOT;
    }
    return 0;
  }

  function stepPlayerCar(dt, c) {
    const p = state.player;
    const car = p.inCar;
    const def = car.def;
    const throttle = (c.up ? 1 : 0) - (c.down ? 0.55 : 0);
    const steer = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    const handbrake = !!c.brake;
    if (throttle > 0) car.speed += def.accel * throttle * dt;
    else if (throttle < 0) car.speed += def.accel * throttle * dt * 0.9;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
    if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 700 * dt);
    car.speed = clamp(car.speed, -def.speed * 0.45, def.speed);
    // Drag at speed.
    car.speed -= car.speed * 0.12 * dt;
    const steerAmount = steer * def.turn * dt * clamp(Math.abs(car.speed) / 120, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.angle += steerAmount;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 170, WORLD_W - 10);
    car.y = clamp(car.y, 10, WORLD_H - 10);
    if (car.hitCd > 0) car.hitCd -= dt;
    if (pushOutOfBuildings(car, 20)) {
      // One hard hit a second at most: a car wedged on a corner is not shredded.
      if (Math.abs(car.speed) > 200 && car.hitCd <= 0) {
        car.hp -= 12;
        car.hitCd = 1;
        addParticles(car.x, car.y, '#888888', 8, 120);
      }
      car.speed *= 0.4;
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = car.speed;
    return 0;
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (!car.traffic) continue;
      // Slow for a car ahead.
      let ahead = null;
      for (const other of state.cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
        const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
        if (forward > 0 && forward < 90 && side < 26) ahead = other;
      }
      const target = ahead ? Math.min(car.cruise, ahead.speed) : car.cruise;
      car.speed += clamp(target - car.speed, -260 * dt, 180 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      // At an intersection, sometimes turn.
      const nearX = ROAD_XS.some((rx) => Math.abs(car.x - rx) < 14);
      const nearY = ROAD_YS.some((ry) => Math.abs(car.y - ry) < 14);
      if (nearX && nearY && rng() < 0.02) {
        const turns = [0, Math.PI / 2, -Math.PI / 2];
        car.angle += pick(rng, turns);
      }
      // Wrap around the city edges so traffic never runs out.
      if (car.x < 320) { car.x = 320; car.angle = 0; }
      if (car.x > WORLD_W - 160) { car.x = WORLD_W - 160; car.angle = Math.PI; }
      if (car.y < 220) { car.y = 220; car.angle = Math.PI / 2; }
      if (car.y > WORLD_H - 160) { car.y = WORLD_H - 160; car.angle = -Math.PI / 2; }
      if (pushOutOfBuildings(car, 18)) car.speed *= 0.5;
    }
    // Keep the streets full.
    let trafficCount = 0;
    for (const car of state.cars) if (car.traffic) trafficCount += 1;
    if (trafficCount < 24) spawnTrafficCar();
    if (state.peds.filter((p) => !p.dead).length < 26) spawnPed();
  }

  function stepPolice(dt) {
    const p = state.player;
    for (const car of state.cars) {
      if (!car.police) continue;
      const targetAngle = Math.atan2(p.y - car.y, p.x - car.x);
      car.angle = angleLerp(car.angle, targetAngle, clamp(2.2 * dt, 0, 1));
      const d = dist(car.x, car.y, p.x, p.y);
      const wantSpeed = d > 120 ? car.def.speed : car.def.speed * 0.55;
      car.speed += clamp(wantSpeed - car.speed, -400 * dt, 320 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (pushOutOfBuildings(car, 20)) car.speed *= 0.5;
      // Ram the player: one damaging hit a second at most, so a chase is a chase.
      if (car.ramCd > 0) car.ramCd -= dt;
      if (p.inCar && d < 52 && Math.abs(car.speed) > 120 && car.ramCd <= 0) {
        p.inCar.hp -= 8;
        car.ramCd = 1;
        car.speed *= 0.6;
        addParticles(car.x, car.y, '#ffcc00', 6, 100);
      } else if (!p.inCar && d < 30 && Math.abs(car.speed) > 60) {
        p.health -= 18;
        p.invuln = 0.6;
        p.x += Math.cos(car.angle) * 30;
        p.y += Math.sin(car.angle) * 30;
        car.speed *= 0.3;
      }
      if (d > 1400) {
        // Too far: teleport the chase back in.
        const a = rng() * Math.PI * 2;
        car.x = clamp(p.x + Math.cos(a) * 550, 350, WORLD_W - 200);
        car.y = clamp(p.y + Math.sin(a) * 550, 250, WORLD_H - 200);
      }
    }
    for (const cop of state.cops) {
      const d = dist(cop.x, cop.y, p.x, p.y);
      if (p.inCar) {
        // On foot cops cannot catch a car: they jog after it and give up far away.
        if (d > 700) {
          cop.x = p.x + range(rng, -200, 200);
          cop.y = p.y + range(rng, -200, 200);
        }
      }
      const a = Math.atan2(p.y - cop.y, p.x - cop.x);
      cop.angle = a;
      if (d > 30) {
        cop.x += Math.cos(a) * cop.speed * dt;
        cop.y += Math.sin(a) * cop.speed * dt;
      }
      pushOutOfBuildings(cop, 12);
      if (cop.shootCd > 0) cop.shootCd -= dt;
      if (cop.punchCd > 0) cop.punchCd -= dt;
      // Cops shoot at 3+ stars, punch up close.
      if (!p.inCar && state.wanted >= 3 && d < 420 && d > 90 && cop.shootCd <= 0) {
        cop.shootCd = range(rng, 1.2, 2.2);
        state.bullets.push({
          x: cop.x, y: cop.y,
          vx: Math.cos(a + range(rng, -0.12, 0.12)) * 620,
          vy: Math.sin(a + range(rng, -0.12, 0.12)) * 620,
          life: 0.9, fromPlayer: false,
        });
      }
      if (!p.inCar && d < 30 && cop.punchCd <= 0) {
        cop.punchCd = 0.9;
        if (p.invuln <= 0) {
          p.health -= 8;
          p.invuln = 0.4;
        }
      }
    }
    state.cops = state.cops.filter((cop) => cop.hp > 0);
  }

  function stepPeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.dead) {
        ped.deadTimer -= dt;
        continue;
      }
      if (ped.hp <= 0) {
        ped.dead = true;
        ped.deadTimer = 6;
        state.stats.pedsDown += 1;
        continue;
      }
      if (ped.state === 'wait') continue;
      if (ped.fleeTimer > 0) {
        ped.fleeTimer -= dt;
        const a = Math.atan2(ped.y - p.y, ped.x - p.x);
        ped.x += Math.cos(a) * 130 * dt;
        ped.y += Math.sin(a) * 130 * dt;
        ped.angle = a;
        if (ped.fleeTimer <= 0) ped.state = 'walk';
      } else {
        if (dist(ped.x, ped.y, ped.tx, ped.ty) < 24) {
          ped.tx = clamp(ped.x + range(rng, -320, 320), 200, WORLD_W - 100);
          ped.ty = clamp(ped.y + range(rng, -320, 320), 100, WORLD_H - 100);
        }
        const a = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
        ped.angle = a;
        ped.x += Math.cos(a) * ped.speed * dt;
        ped.y += Math.sin(a) * ped.speed * dt;
      }
      ped.x = clamp(ped.x, 170, WORLD_W - 10);
      ped.y = clamp(ped.y, 10, WORLD_H - 10);
      pushOutOfBuildings(ped, 11);
      // Player car hits a pedestrian.
      if (p.inCar && Math.abs(p.inCar.speed) > 60 && dist(ped.x, ped.y, p.x, p.y) < 34) {
        ped.hp = 0;
        ped.dead = true;
        ped.deadTimer = 6;
        state.stats.pedsDown += 1;
        addParticles(ped.x, ped.y, '#d94f4f', 10, 140);
        if (addWanted(1)) state.toast = 'Wanted level up! The SBP saw that.';
        state.toastTimer = 3;
      }
      // Gunfire nearby scares pedestrians.
      if (state.bullets.length > 0 && dist(ped.x, ped.y, p.x, p.y) < 300 && ped.fleeTimer <= 0) {
        ped.state = 'flee';
        ped.fleeTimer = 3;
      }
    }
    state.peds = state.peds.filter((ped) => !ped.dead || ped.deadTimer > 0);
  }

  function stepBullets(dt) {
    let events = 0;
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (buildingAt(b.x, b.y, 2)) {
        b.life = 0;
        addParticles(b.x, b.y, '#cccccc', 4, 80);
        continue;
      }
      if (b.fromPlayer) {
        for (const cop of state.cops) {
          if (dist(b.x, b.y, cop.x, cop.y) < 16) {
            cop.hp -= 34;
            b.life = 0;
            addParticles(b.x, b.y, '#d94f4f', 6, 100);
            if (addWanted(1)) events |= EVENT_WANTED;
          }
        }
        for (const ped of state.peds) {
          if (!ped.dead && dist(b.x, b.y, ped.x, ped.y) < 14) {
            ped.hp -= 50;
            b.life = 0;
            if (addWanted(1)) events |= EVENT_WANTED;
          }
        }
        for (const car of state.cars) {
          if (car !== state.player.inCar && dist(b.x, b.y, car.x, car.y) < 26) {
            car.hp -= 20;
            b.life = 0;
            addParticles(b.x, b.y, '#ffcc00', 5, 90);
          }
        }
      } else {
        const p = state.player;
        if (!p.inCar && p.invuln <= 0 && dist(b.x, b.y, p.x, p.y) < 14) {
          p.health -= 12;
          p.invuln = 0.3;
          b.life = 0;
          state.damageTimer = 0;
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
    return events;
  }

  function stepCarCollisions(dt) {
    const p = state.player;
    let events = 0;
    if (!p.inCar) return events;
    const car = p.inCar;
    if (car.crashCd > 0) car.crashCd -= dt;
    for (const other of state.cars) {
      if (other === car) continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d < 44 && d > 0.01) {
        const push = (44 - d) / 2;
        const nx = (car.x - other.x) / d;
        const ny = (car.y - other.y) / d;
        car.x += nx * push;
        car.y += ny * push;
        if (other.traffic || !other.driver) {
          other.x -= nx * push;
          other.y -= ny * push;
        }
        const impact = Math.abs(car.speed - other.speed);
        if (impact > 180 && car.crashCd <= 0) {
          car.hp -= 6;
          other.hp -= 6;
          car.crashCd = 1;
          car.speed *= 0.55;
          other.speed *= 0.5;
          addParticles(car.x, car.y, '#ffcc00', 8, 120);
          events |= EVENT_CRASH;
          if (other.traffic && other.driver) {
            other.driver = false;
            other.traffic = false;
            other.targetSpeed = 0;
            other.speed = 0;
          }
        }
      }
    }
    if (car.hp <= 0 && car.speed !== 0) {
      car.speed = 0;
      car.smoke = 999;
      state.toast = 'Your car is wrecked — steal another one!';
      state.toastTimer = 4;
    }
    return events;
  }

  function stepPickups(dt) {
    const p = state.player;
    let events = 0;
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      pk.bob += dt;
      if (dist(p.x, p.y, pk.x, pk.y) < 34) {
        pk.active = false;
        if (pk.kind === 'cash') {
          p.money += pk.amount;
          state.stats.cashEarned += pk.amount;
          state.toast = `+$${pk.amount} found on the street`;
        } else if (pk.kind === 'health') {
          p.health = Math.min(100, p.health + pk.amount);
          state.toast = 'Health restored';
        } else if (pk.kind === 'ammo') {
          p.ammo += pk.amount;
          state.toast = `+${pk.amount} pistol ammo`;
        }
        state.toastTimer = 2.5;
        events |= EVENT_PICKUP;
      }
    }
    state.pickups = state.pickups.filter((pk) => pk.active);
    // Trickle new street cash.
    if (state.pickups.length < 5 && rng() < dt * 0.05) {
      spawnPickup('cash', range(rng, 400, WORLD_W - 200), range(rng, 250, WORLD_H - 200), rangeInt(rng, 25, 100));
    }
    return events;
  }

  function stepMission(dt) {
    if (!state.mission) return 0;
    const m = state.mission;
    const def = missionDef();
    const step = def.steps[m.step];
    const p = state.player;
    let events = 0;
    if (state.missionTimer > 0) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) return failMission(events);
    }
    if (step.type === 'steal') {
      if (p.inCar) events = completeStep(events);
    } else if (step.type === 'goto') {
      if (dist(p.x, p.y, step.x, step.y) < step.radius) events = completeStep(events);
    } else if (step.type === 'pickup') {
      if (p.inCar && Math.abs(p.inCar.speed) < 70 && dist(p.x, p.y, step.x, step.y) < step.radius) {
        m.passenger = true;
        if (m.ped) {
          m.ped.dead = true;
          m.ped.deadTimer = 0;
        }
        state.toast = 'Tomas is in! Drive him to the Grand Solmar.';
        state.toastTimer = 3;
        events = completeStep(events);
      }
    } else if (step.type === 'wanted') {
      if (state.wanted >= step.stars) events = completeStep(events);
    } else if (step.type === 'clear') {
      if (state.wanted === 0) events = completeStep(events);
    } else if (step.type === 'collect') {
      if (dist(p.x, p.y, step.x, step.y) < step.radius) {
        m.collected += 1;
        if (def.id === 'm5' && state.wanted < 2) addWanted(2);
        if (def.id === 'm6') {
          p.money += 0; // the cash lands at the safehouse, not here
          state.toast = 'Cash grabbed! Run for the safehouse!';
          state.toastTimer = 3;
        }
        events = completeStep(events);
      }
    } else if (step.type === 'escape') {
      if (state.wanted === 0 && dist(p.x, p.y, step.x, step.y) < 110) events = completeStep(events);
      else if (state.wanted < step.stars && state.missionTimer <= 0) {
        // Keep the heat on until the player reaches the safehouse.
        addWanted(step.stars - state.wanted);
      }
    }
    return events;
  }

  function stepTaxi(dt) {
    if (state.mission) return;
    state.fareTimer -= dt;
    if (!state.fare && state.fareTimer <= 0 && state.player.inCar) {
      const ped = spawnPed(
        clamp(state.player.x + range(rng, -300, 300), 300, WORLD_W - 200),
        clamp(state.player.y + range(rng, -300, 300), 250, WORLD_H - 200),
      );
      ped.state = 'wait';
      ped.waitTimer = 45;
      ped.fare = true;
      const dest = randomRoadPoint();
      state.fare = { ped, destX: dest.x, destY: dest.y, stage: 'pickup' };
      state.fareTimer = 60;
    }
    if (state.fare) {
      const f = state.fare;
      const p = state.player;
      if (f.ped.dead || f.ped.waitTimer <= 0) {
        state.fare = null;
        state.fareTimer = 20;
        return;
      }
      f.ped.waitTimer -= dt;
      if (f.stage === 'pickup' && p.inCar && Math.abs(p.inCar.speed) < 70 && dist(p.x, p.y, f.ped.x, f.ped.y) < 90) {
        f.stage = 'drop';
        f.ped.dead = true;
        f.ped.deadTimer = 0;
        state.toast = 'Passenger aboard — drive to the marker for a fare.';
        state.toastTimer = 3;
      } else if (f.stage === 'drop' && dist(p.x, p.y, f.destX, f.destY) < 90) {
        p.money += TAXI_FARE;
        state.stats.cashEarned += TAXI_FARE;
        state.toast = `Fare complete — +$${TAXI_FARE}`;
        state.toastTimer = 3;
        state.fare = null;
        state.fareTimer = 25;
      }
    }
  }

  function stepServices(dt, c) {
    const p = state.player;
    if (!c.enter) return 0;
    // Spray Shop clears the wanted level.
    if (p.inCar && dist(p.x, p.y, PLACES.sprayShop.x, PLACES.sprayShop.y) < 110) {
      if (state.wanted > 0 && p.money >= SPRAY_COST) {
        p.money -= SPRAY_COST;
        state.wanted = 0;
        state.toast = `Resprayed — heat gone ($${SPRAY_COST}).`;
        state.toastTimer = 3;
        return EVENT_CASH;
      }
      if (state.wanted === 0) {
        state.toast = 'No heat to lose right now.';
        state.toastTimer = 2;
      }
    }
    if (!p.inCar && dist(p.x, p.y, PLACES.ammoShop.x, PLACES.ammoShop.y) < 80 && p.money >= AMMO_COST) {
      p.money -= AMMO_COST;
      p.ammo += 24;
      state.toast = `Bought 24 pistol rounds ($${AMMO_COST}).`;
      state.toastTimer = 3;
      return EVENT_CASH;
    }
    if (!p.inCar && dist(p.x, p.y, PLACES.hospital.x, PLACES.hospital.y) < 80 && p.money >= HEALTH_COST) {
      p.money -= HEALTH_COST;
      p.health = 100;
      state.toast = `Patched up at Solmar General ($${HEALTH_COST}).`;
      state.toastTimer = 3;
      return EVENT_CASH;
    }
    return 0;
  }

  function stepEnterExit(c) {
    const p = state.player;
    if (!c.enter) return 0;
    if (p.inCar) {
      const car = p.inCar;
      p.inCar = null;
      const a = car.angle + Math.PI / 2;
      p.x = car.x + Math.cos(a) * 34;
      p.y = car.y + Math.sin(a) * 34;
      pushOutOfBuildings(p, 13);
      return 0;
    }
    const car = nearestCar(p.x, p.y, 64);
    if (!car) return 0;
    if (car.driver && !car.police) {
      // Pull the driver out: they flee on foot.
      car.driver = false;
      car.traffic = false;
      const ped = spawnPed(car.x + 30, car.y + 30);
      ped.state = 'flee';
      ped.fleeTimer = 5;
      state.stats.carsStolen += 1;
      if (addWanted(1)) {
        state.toast = 'Car stolen! Wanted level up.';
        state.toastTimer = 3;
      }
    }
    p.inCar = car;
    car.speed = 0;
    return 0;
  }

  function step(dt, c) {
    let events = 0;
    if (state.gameOver) {
      state.overTimer -= dt;
      return events;
    }
    state.elapsed += dt;
    state.clock = (state.clock + dt * (24 / 900)) % 24;
    state.damageTimer += dt;
    const p = state.player;

    if (p.inCar) events |= stepPlayerCar(dt, c);
    else events |= stepPlayerOnFoot(dt, c);
    // Services first: pressing E at the Spray Shop resprays the car instead of
    // exiting it (the shop needs the player in the car, the exit would eat the press).
    const serviceEvents = stepServices(dt, c);
    events |= serviceEvents;
    if (!serviceEvents) events |= stepEnterExit(c);

    // Health regen when calm.
    if (state.wanted === 0 && state.damageTimer > 10 && p.health > 0 && p.health < 100) {
      p.health = Math.min(100, p.health + 2 * dt);
    }
    // Wrecked car: smoke.
    if (p.inCar && p.inCar.hp < 40 && rng() < dt * 6) {
      addParticles(p.inCar.x, p.inCar.y - 10, '#555555', 1, 40);
    }

    stepTraffic(dt);
    stepPolice(dt);
    stepPeds(dt);
    events |= stepBullets(dt);
    events |= stepCarCollisions(dt);
    events |= stepPickups(dt);
    events |= stepMission(dt);
    stepTaxi(dt);

    // Wanted decay: quiet for a while and no police close by.
    if (state.wanted > 0) {
      state.heatTimer += dt;
      const nearPolice = state.cars.some((car) => car.police && dist(car.x, car.y, p.x, p.y) < 500)
        || state.cops.some((cop) => dist(cop.x, cop.y, p.x, p.y) < 400);
      if (state.heatTimer > WANTED_DECAY_SECONDS && !nearPolice) {
        state.decayTimer += dt;
        if (state.decayTimer > 8) {
          state.wanted -= 1;
          state.decayTimer = 0;
          state.heatTimer = 0;
        }
      }
    }
    maintainPolice();

    // Busted: a cop holds you on foot.
    if (!p.inCar && state.cops.some((cop) => dist(cop.x, cop.y, p.x, p.y) < 26)) {
      state.bustTimer += dt;
      if (state.bustTimer > 1.2) {
        const lost = Math.floor(p.money * 0.15);
        p.money -= lost;
        state.wanted = 0;
        state.gameOver = 'busted';
        state.overTimer = 3;
        return events | EVENT_BUSTED;
      }
    } else {
      state.bustTimer = 0;
    }
    // Wasted.
    if (p.health <= 0) {
      const lost = Math.floor(p.money * 0.1);
      p.money -= lost;
      state.wanted = 0;
      state.gameOver = 'wasted';
      state.overTimer = 3;
      return events | EVENT_WASTED;
    }

    // Camera follows the player.
    const tx = p.x;
    const ty = p.y;
    state.cam.x += (tx - state.cam.x) * Math.min(1, 5 * dt);
    state.cam.y += (ty - state.cam.y) * Math.min(1, 5 * dt);

    if (state.toastTimer > 0) state.toastTimer -= dt;
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    return events;
  }

  function respawn() {
    const p = state.player;
    p.health = 100;
    p.x = PLACES.hospital.x;
    p.y = PLACES.hospital.y + 60;
    p.inCar = null;
    p.angle = -Math.PI / 2;
    state.cops = [];
    state.cars = state.cars.filter((c) => !c.police);
    state.wanted = 0;
    state.gameOver = null;
    state.overTimer = 0;
    state.cam.x = p.x;
    state.cam.y = p.y;
  }

  function save() {
    try {
      const p = state.player;
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: p.money, ammo: p.ammo, health: p.health,
        missionIndex: state.missionIndex, storyDone: state.storyDone,
        x: p.x, y: p.y, clock: state.clock, stats: state.stats,
      }));
    } catch {
      // Storage can be off: the save then lasts this visit only.
    }
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function applySave(data) {
    if (!data) return false;
    const p = state.player;
    p.money = data.money ?? 250;
    p.ammo = data.ammo ?? 24;
    p.health = data.health ?? 100;
    p.x = data.x ?? 1150;
    p.y = data.y ?? 1000;
    state.missionIndex = data.missionIndex ?? 0;
    state.storyDone = !!data.storyDone;
    state.clock = data.clock ?? 9.5;
    if (data.stats) state.stats = data.stats;
    state.cam.x = p.x;
    state.cam.y = p.y;
    return true;
  }

  reset();
  return {
    state, reset, step, respawn, save, load, applySave,
    startMission, missionDef, currentStep, nearestCar, onRoad,
    policeCount, addWanted,
  };
}
