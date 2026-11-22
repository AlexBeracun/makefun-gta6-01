// The police: interceptor cars that chase and ram, foot cops that run the player
// down (and shoot at 3+ stars), and — at 3 stars and up — the SBP helicopter.
// The helicopter keeps the heat on: while it is overhead the wanted level does not
// decay, so a 3-star chase has to be lost on the ground, not waited out.
import { CARS, WORLD_H, WORLD_W } from './config.js';
import { angleLerp, clamp, dist, pick, range } from './random.js';

export function spawnPoliceCar(ctx) {
  const { state, rng } = ctx;
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

export function spawnCop(ctx) {
  const { state, rng } = ctx;
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

export function spawnHeli(ctx) {
  const { state, rng } = ctx;
  const a = rng() * Math.PI * 2;
  const heli = {
    x: state.player.x + Math.cos(a) * 420,
    y: state.player.y + Math.sin(a) * 420,
    z: 300, angle: a, speed: 0, leaving: false,
  };
  state.heli = heli;
  state.toast = 'SBP helicopter overhead — lose the heat on the ground!';
  state.toastTimer = 3;
  return heli;
}

export function policeCount(ctx) {
  const { state } = ctx;
  let cars = 0;
  for (const c of state.cars) if (c.police) cars += 1;
  return { cars, cops: state.cops.length };
}

export function maintainPolice(ctx) {
  const { state } = ctx;
  const want = state.wanted;
  const have = policeCount(ctx);
  const wantCars = want === 0 ? 0 : Math.min(want, 4);
  const wantCops = want >= 2 ? Math.min(want - 1, 3) : 0;
  if (wantCars > have.cars) spawnPoliceCar(ctx);
  if (wantCops > have.cops) spawnCop(ctx);
  // Despawn far-away police when the heat is gone.
  if (want === 0) {
    state.cars = state.cars.filter((c) => !c.police || dist(c.x, c.y, state.player.x, state.player.y) < 900);
    state.cops = [];
  }
}

export function maintainHeli(ctx) {
  const { state } = ctx;
  if (state.wanted >= 3 && !state.heli) spawnHeli(ctx);
  if (state.wanted === 0 && state.heli) state.heli.leaving = true;
}

export function stepHeli(ctx, dt) {
  const { state } = ctx;
  const heli = state.heli;
  if (!heli) return;
  const p = state.player;
  // Hover ahead of the player, so the helicopter is in the chase camera's frame
  // and its searchlight rakes forward onto them.
  const tx = p.x + Math.cos(p.angle) * 220;
  const ty = p.y + Math.sin(p.angle) * 220;
  const d = dist(heli.x, heli.y, tx, ty);
  if (heli.leaving) {
    // Fly away from the city and leave.
    const a = Math.atan2(heli.y - p.y, heli.x - p.x);
    heli.x += Math.cos(a) * 420 * dt;
    heli.y += Math.sin(a) * 420 * dt;
    heli.z += 60 * dt;
    heli.angle = a;
    if (d > 1100) state.heli = null;
    return;
  }
  // Hover ahead of the player, searchlight on them.
  const want = 260;
  heli.angle = Math.atan2(p.y - heli.y, p.x - heli.x);
  const ma = Math.atan2(ty - heli.y, tx - heli.x);
  const speed = d > 120 ? 460 : 300;
  heli.x += Math.cos(ma) * speed * dt;
  heli.y += Math.sin(ma) * speed * dt;
  heli.z += (want + Math.sin(state.elapsed * 1.3) * 12 - heli.z) * Math.min(1, 2 * dt);
  heli.x = clamp(heli.x, 150, WORLD_W);
  heli.y = clamp(heli.y, 50, WORLD_H);
}

export function stepPolice(ctx, dt) {
  const { state, rng, dist: d2, clamp: cl, pushOutOfBuildings, addParticles } = ctx;
  const p = state.player;
  for (const car of state.cars) {
    if (!car.police) continue;
    const targetAngle = Math.atan2(p.y - car.y, p.x - car.x);
    car.angle = angleLerp(car.angle, targetAngle, cl(2.2 * dt, 0, 1));
    const d = d2(car.x, car.y, p.x, p.y);
    const wantSpeed = d > 120 ? car.def.speed : car.def.speed * 0.55;
    car.speed += cl(wantSpeed - car.speed, -400 * dt, 320 * dt);
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
      car.x = cl(p.x + Math.cos(a) * 550, 350, WORLD_W - 200);
      car.y = cl(p.y + Math.sin(a) * 550, 250, WORLD_H - 200);
    }
  }
  for (const cop of state.cops) {
    const d = d2(cop.x, cop.y, p.x, p.y);
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
