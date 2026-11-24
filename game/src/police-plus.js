// SOLMAR HEAT — police escalation: roadblocks, undercover units, 5-star speed.
// The wanted ladder used to top out at more cars and a helicopter. This module
// adds the higher rungs: at three stars the SBP blocks the roads ahead of the
// player, at four stars plain-looking cars join the chase, and at five stars
// every police car runs twelve percent faster. Roadblocks are physical — a
// line of stopped cars the player has to drive around or smash through — and
// they are stored in state.policePlus so the renderer can draw them.
import { CARS } from './config.js';
import { clamp, dist, pick, range } from './random.js';

export const FIVE_STAR_SPEED_BOOST = 1.12;
export const ROADBLOCK_MIN_WANTED = 3;
export const UNDERCOVER_MIN_WANTED = 4;
export const ROADBLOCK_COOLDOWN = 25;

export function createPolicePlus() {
  return {
    blocks: [], // {x, y, angle, cars: [...], timer}
    blockCooldown: 0,
    undercover: [], // police cars in plain clothes
    fiveStarActive: false,
  };
}

export function policeSpeedFactor(state) {
  return state.wanted >= 5 ? FIVE_STAR_SPEED_BOOST : 1;
}

function blockSpot(ctx) {
  const { state, rng } = ctx;
  const p = state.player;
  // Ahead of the player, on their heading, so the block is something they
  // actually have to deal with instead of a dot on the far side of town.
  const ahead = range(rng, 350, 500);
  const x = clamp(p.x + Math.cos(p.angle) * ahead, 350, 3400);
  const y = clamp(p.y + Math.sin(p.angle) * ahead, 250, 2400);
  return { x, y, angle: p.angle + Math.PI / 2 };
}

export function spawnRoadblock(ctx) {
  const { state, rng } = ctx;
  const plus = state.policePlus;
  if (!plus || plus.blockCooldown > 0) return null;
  const spot = blockSpot(ctx);
  const def = CARS.find((c) => c.id === 'police');
  const cars = [];
  for (const off of [-52, 0, 52]) {
    const car = {
      def,
      x: spot.x + Math.cos(spot.angle) * off,
      y: spot.y + Math.sin(spot.angle) * off,
      angle: spot.angle, speed: 0, targetSpeed: 0,
      color: pick(rng, ['#20242e', '#1c2733']),
      traffic: false, police: true, driver: true, cruise: 0, turnAt: null,
      hp: 100, smoke: 0, roadblock: true,
    };
    state.cars.push(car);
    cars.push(car);
  }
  plus.blocks.push({ x: spot.x, y: spot.y, angle: spot.angle, cars, timer: 30 });
  plus.blockCooldown = ROADBLOCK_COOLDOWN;
  state.toast = 'Roadblock ahead! The SBP has sealed the road.';
  state.toastTimer = 4;
  return plus.blocks[plus.blocks.length - 1];
}

export function spawnUndercover(ctx) {
  const { state, rng } = ctx;
  const plus = state.policePlus;
  if (!plus) return null;
  const p = state.player;
  const a = rng() * Math.PI * 2;
  const def = pick(rng, CARS.filter((c) => c.id !== 'police' && c.id !== 'taxi'));
  const car = {
    def,
    x: clamp(p.x + Math.cos(a) * 550, 350, 3400),
    y: clamp(p.y + Math.sin(a) * 550, 250, 2400),
    angle: Math.atan2(p.y - (p.y + Math.sin(a) * 550), p.x - (p.x + Math.cos(a) * 550)),
    speed: 100, targetSpeed: def.speed, color: def.color,
    traffic: false, police: true, driver: true, cruise: def.speed, turnAt: null,
    hp: 100, smoke: 0, undercover: true,
  };
  state.cars.push(car);
  plus.undercover.push(car);
  state.toast = 'Undercover unit in the chase — watch the plain cars!';
  state.toastTimer = 3;
  return car;
}

// A roadblock car sits still until the heat dies or its timer runs out.
export function stepPolicePlus(ctx, dt) {
  const { state } = ctx;
  const plus = state.policePlus;
  if (!plus) return;
  if (plus.blockCooldown > 0) plus.blockCooldown -= dt;
  plus.fiveStarActive = state.wanted >= 5;
  // Spawn a roadblock at 3 stars, at most one live at a time.
  if (state.wanted >= ROADBLOCK_MIN_WANTED && plus.blocks.length === 0) {
    spawnRoadblock(ctx);
  }
  // One undercover car joins at 4 stars.
  if (state.wanted >= UNDERCOVER_MIN_WANTED && plus.undercover.length === 0) {
    spawnUndercover(ctx);
  }
  // Clean up dead blocks: timer out, heat gone, or every car wrecked.
  for (const block of plus.blocks) {
    block.timer -= dt;
    block.cars = block.cars.filter((c) => state.cars.includes(c) && c.hp > 0);
  }
  plus.blocks = plus.blocks.filter((b) => b.timer > 0 && b.cars.length > 0 && state.wanted >= 2);
  plus.undercover = plus.undercover.filter((c) => state.cars.includes(c) && c.hp > 0 && state.wanted >= 3);
  // When the heat is fully gone, every block car goes back to being a cop
  // that can despawn with the rest.
  if (state.wanted === 0) {
    for (const block of plus.blocks) {
      for (const c of block.cars) c.roadblock = false;
    }
    plus.blocks = [];
    for (const c of plus.undercover) c.undercover = false;
    plus.undercover = [];
  }
}

// The player smashing into a roadblock car: it slows them hard and costs hp.
export function roadblockHit(state) {
  const p = state.player;
  if (!p.inCar || !state.policePlus) return false;
  for (const block of state.policePlus.blocks) {
    for (const c of block.cars) {
      if (dist(p.inCar.x, p.inCar.y, c.x, c.y) < 50) {
        p.inCar.speed *= 0.35;
        p.inCar.hp -= 4;
        return true;
      }
    }
  }
  return false;
}
