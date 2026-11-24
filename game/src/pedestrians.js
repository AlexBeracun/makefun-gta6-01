// SOLMAR HEAT — rewritten via write tool
// Pedestrians: they walk the sidewalks between random waypoints, flee from the
// player and from gunfire, and go down (then get back up) when hit. A pedestrian
// the player runs over raises the wanted level — the city notices.
import { WORLD_H, WORLD_W } from './config.js';
import { clamp, pick, range } from './random.js';

const PED_COLORS = ['#e8b4a0', '#c98a5a', '#8a5a3a', '#f2d0b8', '#6b4a2a'];
const PED_SHIRTS = ['#d94f4f', '#4f7fd0', '#4fd07a', '#e8c832', '#9b59d0', '#e8e4da', '#ff8c42', '#2ec4b6'];

export function spawnPed(ctx, nearX, nearY) {
  const { state, rng } = ctx;
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

export function stepPeds(ctx, dt) {
  const { state, rng, dist, clamp: cl, pushOutOfBuildings, addParticles, addWanted } = ctx;
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
        ped.tx = cl(ped.x + range(rng, -320, 320), 200, WORLD_W - 100);
        ped.ty = cl(ped.y + range(rng, -320, 320), 100, WORLD_H - 100);
      }
      const a = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
      ped.angle = a;
      ped.x += Math.cos(a) * ped.speed * dt;
      ped.y += Math.sin(a) * ped.speed * dt;
    }
    ped.x = cl(ped.x, 170, WORLD_W - 10);
    ped.y = cl(ped.y, 10, WORLD_H - 10);
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
