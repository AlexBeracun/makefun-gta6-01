// The game's rules and state, with no drawing and no browser in it: the city, the
// player on foot and by car, traffic, pedestrians, police, the wanted system,
// missions, combat, pickups and the save. step() advances one fixed step and returns
// what happened as bit flags, so the caller can react (sound, toasts) without the
// world knowing about screens.
//
// The simulation itself lives in focused modules — city, traffic, pedestrians,
// police, missions, pickups, combat, player, save — each taking a small ctx object
// (the state, the seeded rng and the helpers it needs). This file owns the state,
// the geometry helpers, and the step() that calls each module in order.
import {
  CARS, MAX_WANTED, PLACES, ROAD_W, TAXI_FARE, WANTED_DECAY_SECONDS, WORLD_H, WORLD_W,
} from './config.js';
import { clamp, dist, mulberry32, range } from './random.js';
import { buildCity, ROAD_XS, ROAD_YS } from './city.js';
import { randomRoadPoint, spawnTrafficCar, stepTraffic } from './traffic.js';
import { spawnPed, stepPeds } from './pedestrians.js';
import {
  maintainHeli, maintainPolice, policeCount, spawnCop, spawnPoliceCar, stepHeli, stepPolice,
} from './police.js';
import { currentStep, missionDef, startMission, stepMission } from './missions.js';
import { spawnPickup, stepPickups } from './pickups.js';
import { stepBullets } from './combat.js';
import {
  nearestCar, stepEnterExit, stepPlayerCar, stepPlayerOnFoot, stepServices,
} from './player.js';
import { applySave, loadGame, saveGame } from './save.js';
import {
  EVENT_BUSTED, EVENT_CRASH, EVENT_MISSION_DONE, EVENT_MISSION_FAIL, EVENT_WASTED,
} from './world-events.js';

export {
  EVENT_BUSTED, EVENT_CRASH, EVENT_MISSION_DONE, EVENT_MISSION_FAIL, EVENT_WASTED,
} from './world-events.js';
export {
  EVENT_CASH, EVENT_MISSION_START, EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT, EVENT_WANTED,
} from './world-events.js';

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
    heli: null, // the SBP helicopter, overhead at 3+ stars
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

  function addWanted(n) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, MAX_WANTED);
    state.heatTimer = 0;
    state.decayTimer = 0;
    return state.wanted > before;
  }

  // The one handle every simulation module gets: the state, the seeded rng, and
  // the helpers it needs. Modules never touch the DOM or the screen.
  const ctx = {
    state, rng,
    dist, clamp, range,
    buildingAt, pushOutOfBuildings, onRoad,
    addParticles, addWanted,
    spawnTrafficCar, spawnPed, spawnPoliceCar, spawnCop, spawnPickup,
    missionDef, nearestCar,
  };

  function reset() {
    state.elapsed = 0;
    state.clock = 9.5;
    state.player = makePlayer(1150, 1000);
    state.cars = [];
    state.peds = [];
    state.cops = [];
    state.heli = null;
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
    buildCity(ctx);
    for (let i = 0; i < 26; i += 1) spawnTrafficCar(ctx);
    for (let i = 0; i < 34; i += 1) spawnPed(ctx);
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
    spawnPickup(ctx, 'cash', 1250, 1050, 50);
    spawnPickup(ctx, 'health', 2650, 1520, 50);
    spawnPickup(ctx, 'ammo', 1750, 760, 24);
    spawnPickup(ctx, 'cash', 2900, 800, 75);
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

  function stepTaxi(dt) {
    if (state.mission) return;
    state.fareTimer -= dt;
    if (!state.fare && state.fareTimer <= 0 && state.player.inCar) {
      const ped = spawnPed(ctx,
        clamp(state.player.x + range(rng, -300, 300), 300, WORLD_W - 200),
        clamp(state.player.y + range(rng, -300, 300), 250, WORLD_H - 200),
      );
      ped.state = 'wait';
      ped.waitTimer = 45;
      ped.fare = true;
      const dest = randomRoadPoint(ctx);
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

    if (p.inCar) events |= stepPlayerCar(ctx, dt, c);
    else events |= stepPlayerOnFoot(ctx, dt, c);
    // Services first: pressing E at the Spray Shop resprays the car instead of
    // exiting it (the shop needs the player in the car, the exit would eat the press).
    const serviceEvents = stepServices(ctx, dt, c);
    events |= serviceEvents;
    if (!serviceEvents) events |= stepEnterExit(ctx, c);

    // Health regen when calm.
    if (state.wanted === 0 && state.damageTimer > 10 && p.health > 0 && p.health < 100) {
      p.health = Math.min(100, p.health + 2 * dt);
    }
    // Wrecked car: smoke.
    if (p.inCar && p.inCar.hp < 40 && rng() < dt * 6) {
      addParticles(p.inCar.x, p.inCar.y - 10, '#555555', 1, 40);
    }

    stepTraffic(ctx, dt);
    stepPolice(ctx, dt);
    stepHeli(ctx, dt);
    stepPeds(ctx, dt);
    events |= stepBullets(ctx, dt);
    events |= stepCarCollisions(dt);
    events |= stepPickups(ctx, dt);
    events |= stepMission(ctx, dt);
    stepTaxi(dt);

    // Wanted decay: quiet for a while and no police close by — and never while
    // the helicopter is overhead.
    if (state.wanted > 0) {
      state.heatTimer += dt;
      const nearPolice = state.cars.some((car) => car.police && dist(car.x, car.y, p.x, p.y) < 500)
        || state.cops.some((cop) => dist(cop.x, cop.y, p.x, p.y) < 400)
        || !!state.heli;
      if (state.heatTimer > WANTED_DECAY_SECONDS && !nearPolice) {
        state.decayTimer += dt;
        if (state.decayTimer > 8) {
          state.wanted -= 1;
          state.decayTimer = 0;
          state.heatTimer = 0;
        }
      }
    }
    maintainPolice(ctx);
    maintainHeli(ctx);

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
    state.heli = null;
    state.cars = state.cars.filter((c) => !c.police);
    state.wanted = 0;
    state.gameOver = null;
    state.overTimer = 0;
    state.cam.x = p.x;
    state.cam.y = p.y;
  }

  reset();
  return {
    state, reset, step, respawn,
    save: () => saveGame(state),
    load: () => loadGame(),
    applySave: (data) => applySave(state, data),
    startMission: (index) => startMission(ctx, index),
    missionDef: () => missionDef(ctx),
    currentStep: () => currentStep(ctx),
    nearestCar: (x, y, maxDist) => nearestCar(ctx, x, y, maxDist),
    onRoad,
    policeCount: () => policeCount(ctx),
    addWanted,
  };
}
