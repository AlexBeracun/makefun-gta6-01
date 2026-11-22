// Traffic: the cars that are not the player's. They cruise the road grid, slow
// for the car ahead, sometimes turn at an intersection, and wrap around the city
// edges so the streets never run out. The streets are kept full: whenever the
// count drops, a new car spawns in.
import { CARS, WORLD_H, WORLD_W } from './config.js';
import { clamp, pick, range } from './random.js';
import { ROAD_XS, ROAD_YS } from './city.js';

export function spawnTrafficCar(ctx, nearX, nearY) {
  const { state, rng } = ctx;
  const def = pick(rng, CARS.filter((c) => c.id !== 'police'));
  const p = nearX === undefined ? randomRoadPoint(ctx) : { x: nearX, y: nearY, angle: rng() * Math.PI * 2 };
  const car = {
    def, x: p.x, y: p.y, angle: p.angle, speed: 0, targetSpeed: range(rng, 110, 170),
    color: def.color, traffic: true, police: false, driver: true,
    cruise: range(rng, 110, 170), turnAt: null, hp: 100, smoke: 0,
  };
  state.cars.push(car);
  return car;
}

export function randomRoadPoint(ctx) {
  const { rng } = ctx;
  const horizontal = rng() < 0.5;
  if (horizontal) {
    return { x: range(rng, 350, WORLD_W - 200), y: pick(rng, ROAD_YS), angle: rng() < 0.5 ? 0 : Math.PI };
  }
  return { x: pick(rng, ROAD_XS), y: range(rng, 250, WORLD_H - 200), angle: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
}

export function stepTraffic(ctx, dt) {
  const { state, rng, pushOutOfBuildings } = ctx;
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
  if (trafficCount < 24) spawnTrafficCar(ctx);
  if (state.peds.filter((p) => !p.dead).length < 26) ctx.spawnPed(ctx);
}
