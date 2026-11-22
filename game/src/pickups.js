// Street pickups: cash, health and ammo left around the city. Walk or drive over
// one to collect it; new street cash trickles in while the player roams.
import { WORLD_H, WORLD_W } from './config.js';
import { range, rangeInt } from './random.js';
import { EVENT_PICKUP } from './world-events.js';

export function spawnPickup(ctx, kind, x, y, amount) {
  const { state, rng } = ctx;
  state.pickups.push({ kind, x, y, amount: amount || 0, active: true, bob: rng() * 6 });
}

export function stepPickups(ctx, dt) {
  const { state, rng, dist, spawnPickup: spawn } = ctx;
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
    spawn(ctx, 'cash', range(rng, 400, WORLD_W - 200), range(rng, 250, WORLD_H - 200), rangeInt(rng, 25, 100));
  }
  return events;
}
