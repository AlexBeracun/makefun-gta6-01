// SOLMAR HEAT — written via write tool
// Car damage and repair: every car the player drives carries its own damage
// score, 0 (showroom fresh) to 100 (a smoking wreck). Hard stops and hard
// hits add damage, brushing against traffic adds a little more while the
// cars stay in contact, and a battered car is slower — top speed and
// acceleration sag to about 70% of normal at full damage — and starts
// smoking past 60. A car never dies from damage alone: it always keeps
// rolling, just worse.
//
// Repair happens at the Spray Shop (the garage by the south docks, the same
// place that clears wanted heat): drive close, press G, pay a fee that grows
// with the damage. Broke? The shop tells you what it would have cost and
// the car stays dented. Switching cars switches damage too — the score
// lives on the car, not on the player — and a freshly stolen car starts
// with only light wear.
import { PLACES } from './config.js';
import { clamp, dist } from './random.js';
import { EVENT_CASH, EVENT_CRASH } from './world-events.js';

// The garage door: close enough to the Spray Shop to hand the keys over.
export const REPAIR_RADIUS = 110;

// The repair bill: a flat call-out fee plus a per-point charge, so a
// fender-bender is cheap and a wreck costs real money.
export const REPAIR_BASE_COST = 50;
export const REPAIR_COST_PER_POINT = 3;

// Past this damage the car starts smoking.
export const SMOKE_DAMAGE = 60;

// How much performance is left at full damage: 0.7 means 70% of normal.
export const MIN_PERFORMANCE = 0.7;

// The opening slice: no previous car, no previous speed, no smoke yet.
export function createDamage() {
  return {
    prevSpeed: 0,
    prevCar: null,
    scrapeTimer: 0,
    smokeTimer: 0,
    repairs: 0,
    repairSpent: 0,
    worstDamage: 0,
  };
}

// The damage of a car, creating it lazily. A car the player has never driven
// starts with light wear — traffic cars a little more than parked ones, since
// they have been out on the road all day.
export function damageOf(car) {
  if (car.damage === undefined || car.damage === null) {
    car.damage = car.traffic ? 15 : 5;
  }
  return clamp(car.damage, 0, 100);
}

// Set a car's damage, clamped to the 0–100 scale.
export function setDamage(car, value) {
  car.damage = clamp(Math.round(value), 0, 100);
  return car.damage;
}

// Add damage to a car, returning the new score.
export function addDamage(car, amount) {
  return setDamage(car, damageOf(car) + amount);
}

// The performance factor for a damage score: 1.0 when fresh, sliding down
// to MIN_PERFORMANCE at 100 damage. Top speed and acceleration both scale
// by this, so a wreck feels tired without ever stalling.
export function damageFactor(damage) {
  return 1 - (1 - MIN_PERFORMANCE) * clamp(damage, 0, 100) / 100;
}

// The repair bill for a damage score: base fee plus per-point charge.
export function repairCost(damage) {
  return REPAIR_BASE_COST + Math.round(clamp(damage, 0, 100)) * REPAIR_COST_PER_POINT;
}

// True while the player's car is close enough to the Spray Shop to repair.
export function nearRepairShop(state) {
  const p = state.player;
  return dist(p.x, p.y, PLACES.sprayShop.x, PLACES.sprayShop.y) < REPAIR_RADIUS;
}

// Try to repair the player's car. Called only when G is pressed: near the
// shop with damage and enough cash, the car comes back spotless and the fee
// is paid; near the shop without damage, the shop says so; broke, it names
// the price; anywhere else, it points the player at the shop.
function tryRepair(ctx) {
  const { state } = ctx;
  const p = state.player;
  const car = p.inCar;
  if (!car) return 0;
  if (!nearRepairShop(state)) {
    state.toast = 'Repairs happen at the Spray Shop — drive there and press G.';
    state.toastTimer = 3;
    return 0;
  }
  const dmg = damageOf(car);
  if (dmg <= 0) {
    state.toast = 'This car is already spotless — no repairs needed.';
    state.toastTimer = 2;
    return 0;
  }
  const cost = repairCost(dmg);
  if (p.money < cost) {
    state.toast = `Repairs cost $${cost} — you only have $${Math.floor(p.money)}.`;
    state.toastTimer = 3;
    return 0;
  }
  p.money -= cost;
  setDamage(car, 0);
  const slice = state.damage;
  if (slice) {
    slice.repairs += 1;
    slice.repairSpent += cost;
  }
  state.toast = `Repaired — good as new ($${cost}).`;
  state.toastTimer = 3;
  return EVENT_CASH;
}

// Advance damage one frame. The car the player sits in is the only one that
// wears: a sudden stop from speed, a crash flagged by the world step, and
// scraping along traffic all add damage, the speed is clamped to what the
// damage allows, and a smoking car puffs grey at the tail. The G key
// (edge-triggered in the control object) is the repair request.
export function stepDamage(ctx, dt, ctrl, events) {
  const { state } = ctx;
  const slice = state.damage;
  const p = state.player;
  if (!p.inCar) {
    if (slice) {
      slice.prevSpeed = 0;
      slice.prevCar = null;
    }
    return 0;
  }
  const car = p.inCar;
  let dmg = damageOf(car);
  if (slice && slice.prevCar !== car) {
    // A different car: its damage comes with it, and the speed baseline
    // restarts so the swap itself never counts as a crash.
    slice.prevSpeed = car.speed;
    slice.prevCar = car;
  }
  const prev = slice ? slice.prevSpeed : 0;
  const wasFast = Math.abs(prev);
  const nowFast = Math.abs(car.speed);

  // A sudden stop: shedding a lot of speed in one frame means something
  // solid got in the way. The harder the stop, the worse the dent.
  if (wasFast > 200 && wasFast - nowFast > 140) {
    dmg = addDamage(car, clamp((wasFast - nowFast - 140) / 20, 2, 12));
  }
  // A flagged crash: the world already decided this hit was real.
  if (events & EVENT_CRASH) {
    dmg = addDamage(car, 6);
  }
  // Scraping traffic: while touching another car and moving past it, the
  // paint wears a little every half second of contact.
  let touching = null;
  for (const other of state.cars) {
    if (other === car) continue;
    if (dist(car.x, car.y, other.x, other.y) < 46) {
      touching = other;
      break;
    }
  }
  if (touching && Math.abs(car.speed - touching.speed) > 40) {
    if (slice) {
      slice.scrapeTimer += dt;
      if (slice.scrapeTimer >= 0.5) {
        slice.scrapeTimer = 0;
        dmg = addDamage(car, 1);
      }
    }
  } else if (slice) {
    slice.scrapeTimer = 0;
  }
  if (slice) slice.worstDamage = Math.max(slice.worstDamage, dmg);

  // The car answers its damage: top speed and acceleration sag, and a
  // tired car drags a little even off the throttle. Never a stall — the
  // worst car in the game still does 70% of its normal pace.
  const factor = damageFactor(dmg);
  const top = car.def.speed * factor;
  car.speed = clamp(car.speed, -top * 0.45, top);
  car.speed -= car.speed * 0.1 * (dmg / 100) * dt;

  // Smoke past the threshold: grey puffs from under the hood, more often
  // the worse the damage is.
  if (dmg > SMOKE_DAMAGE) {
    if (slice) {
      slice.smokeTimer -= dt;
      if (slice.smokeTimer <= 0) {
        slice.smokeTimer = 0.45 - (dmg / 100) * 0.3;
        ctx.addParticles(car.x, car.y - 10, '#666666', 2, 50);
      }
    }
  }

  if (slice) slice.prevSpeed = car.speed;

  // G at the shop: repair. Anywhere else it is just a hint.
  if (ctrl && ctrl.repair) return tryRepair(ctx);
  return 0;
}

// One line for the pause screen: how beaten up the current car is, and what
// repairs have cost so far.
export function damageSummary(state) {
  const p = state.player;
  if (!p.inCar) return 'On foot — no car to damage.';
  const dmg = damageOf(p.inCar);
  const slice = state.damage;
  const spent = slice ? slice.repairSpent : 0;
  if (dmg <= 0) return `Car spotless · $${spent} spent on repairs`;
  return `Car damage ${dmg}% · $${spent} spent on repairs`;
}
