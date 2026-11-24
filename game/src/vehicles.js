// SOLMAR HEAT — nitro, vehicle handling and the traffic pool.
// Three things about cars, in one place. Nitro: hold Shift in a car to burn
// the meter for a burst of speed; the meter refills when you are not burning
// it. Handling: a bike is quick and twitchy, a limo is long and lazy, a haul
// truck is heavy and slow to turn — each vehicle kind scales accel, turn and
// top speed differently. Traffic pool: the cars on the street change with the
// player's rank, so the city feels richer as the player climbs.
import { CARS } from './config.js';
import { clamp, pick } from './random.js';

export const NITRO_MAX = 100;
export const NITRO_DRAIN = 45; // meter per second while burning
export const NITRO_REGEN = 14; // meter per second while coasting
export const NITRO_BOOST = 1.45; // top-speed multiplier while burning

export function createVehicles() {
  return {
    nitro: NITRO_MAX,
    burning: false,
    nitroUsed: 0,
    boosts: 0,
  };
}

// Handling per vehicle kind: accel, turn and top-speed multipliers.
export const HANDLING = {
  bike: { accel: 1.25, turn: 1.35, top: 1.08, label: 'Bike' },
  limo: { accel: 0.8, turn: 0.7, top: 0.92, label: 'Limo' },
  truck: { accel: 0.65, turn: 0.6, top: 0.85, label: 'Truck' },
  car: { accel: 1, turn: 1, top: 1, label: 'Car' },
};

export function vehicleKind(def) {
  if (!def) return 'car';
  if (def.id === 'bike') return 'bike';
  if (def.id === 'limo') return 'limo';
  if (def.id === 'truck') return 'truck';
  return 'car';
}

export function handlingFor(def) {
  return HANDLING[vehicleKind(def)] || HANDLING.car;
}

export function nitroActive(state) {
  const v = state.vehicles;
  return !!v && v.burning && v.nitro > 0;
}

// Step the nitro meter. Returns true while the player is burning nitro.
export function stepNitro(ctx, dt, wantNitro, inCar) {
  const { state } = ctx;
  const v = state.vehicles;
  if (!v) return false;
  if (wantNitro && inCar && v.nitro > 1) {
    v.burning = true;
    v.nitro = Math.max(0, v.nitro - NITRO_DRAIN * dt);
    v.nitroUsed += NITRO_DRAIN * dt;
    if (v.nitro <= 0) v.burning = false;
    return true;
  }
  v.burning = false;
  v.nitro = Math.min(NITRO_MAX, v.nitro + NITRO_REGEN * dt);
  return false;
}

// Top speed for a car right now: its base, handling, nitro and rain grip.
export function effectiveTopSpeed(state, def) {
  const h = handlingFor(def);
  let top = def.speed * h.top;
  if (nitroActive(state)) top *= NITRO_BOOST;
  return top;
}

// The traffic pool by rank: rookies see beaters, kings see the good stuff.
const POOL_BY_RANK = [
  ['sedan', 'taxi', 'van', 'beach'],
  ['sedan', 'taxi', 'van', 'beach', 'pickup', 'coupe'],
  ['sedan', 'taxi', 'pickup', 'coupe', 'muscle', 'beach'],
  ['coupe', 'muscle', 'sport', 'pickup', 'sedan'],
  ['sport', 'muscle', 'coupe', 'limo', 'bike'],
];

export function trafficPool(rank) {
  const idx = clamp(rank || 0, 0, POOL_BY_RANK.length - 1);
  return POOL_BY_RANK[idx];
}

export function pickTrafficDef(rng, rank) {
  const pool = trafficPool(rank).map((id) => CARS.find((c) => c.id === id)).filter(Boolean);
  if (pool.length === 0) return CARS[0];
  return pick(rng, pool);
}

// Rare spawns: at rank 3+ the limo and the bike start appearing in traffic.
export function rareSpawnChance(rank) {
  return (rank || 0) >= 3 ? 0.06 : 0;
}
