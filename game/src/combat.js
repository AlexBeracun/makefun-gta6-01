// SOLMAR HEAT — rewritten via write tool
// Combat: bullets in flight. A bullet dies on a building, wounds a cop, a
// pedestrian or a car when it hits one (the player's shots raise the wanted level),
// and wounds the player when a cop's shot lands.
import { EVENT_WANTED } from './world-events.js';

export function stepBullets(ctx, dt) {
  const { state, dist, buildingAt, addParticles, addWanted } = ctx;
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
