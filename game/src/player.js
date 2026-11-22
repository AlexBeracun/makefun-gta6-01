// The player: on foot (walk, sprint, punch, shoot toward the mouse) and by car
// (throttle, steering, handbrake), plus getting in and out of cars and the city
// services — the Spray Shop that clears heat, the Ammo Store and Solmar General.
import {
  AMMO_COST, HEALTH_COST, PLACES, SPRAY_COST, WORLD_H, WORLD_W,
} from './config.js';
import { clamp, dist } from './random.js';
import { EVENT_CASH, EVENT_PUNCH, EVENT_SHOT } from './world-events.js';

export function nearestCar(ctx, x, y, maxDist) {
  const { state } = ctx;
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

export function stepPlayerOnFoot(ctx, dt, c) {
  const { state, clamp: cl, pushOutOfBuildings, addWanted } = ctx;
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
  p.x = cl(p.x, 170, WORLD_W - 10);
  p.y = cl(p.y, 10, WORLD_H - 10);
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

export function stepPlayerCar(ctx, dt, c) {
  const { state, clamp: cl, pushOutOfBuildings, addParticles } = ctx;
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
  car.speed = cl(car.speed, -def.speed * 0.45, def.speed);
  // Drag at speed.
  car.speed -= car.speed * 0.12 * dt;
  const steerAmount = steer * def.turn * dt * cl(Math.abs(car.speed) / 120, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += steerAmount;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = cl(car.x, 170, WORLD_W - 10);
  car.y = cl(car.y, 10, WORLD_H - 10);
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

export function stepServices(ctx, dt, c) {
  const { state, dist: d2 } = ctx;
  const p = state.player;
  if (!c.enter) return 0;
  // Spray Shop clears the wanted level.
  if (p.inCar && d2(p.x, p.y, PLACES.sprayShop.x, PLACES.sprayShop.y) < 110) {
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
  if (!p.inCar && d2(p.x, p.y, PLACES.ammoShop.x, PLACES.ammoShop.y) < 80 && p.money >= AMMO_COST) {
    p.money -= AMMO_COST;
    p.ammo += 24;
    state.toast = `Bought 24 pistol rounds ($${AMMO_COST}).`;
    state.toastTimer = 3;
    return EVENT_CASH;
  }
  if (!p.inCar && d2(p.x, p.y, PLACES.hospital.x, PLACES.hospital.y) < 80 && p.money >= HEALTH_COST) {
    p.money -= HEALTH_COST;
    p.health = 100;
    state.toast = `Patched up at Solmar General ($${HEALTH_COST}).`;
    state.toastTimer = 3;
    return EVENT_CASH;
  }
  return 0;
}

export function stepEnterExit(ctx, c) {
  const { state, pushOutOfBuildings, spawnPed, addWanted } = ctx;
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
  const car = nearestCar(ctx, p.x, p.y, 64);
  if (!car) return 0;
  if (car.driver && !car.police) {
    // Pull the driver out: they flee on foot.
    car.driver = false;
    car.traffic = false;
    const ped = spawnPed(ctx, car.x + 30, car.y + 30);
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
