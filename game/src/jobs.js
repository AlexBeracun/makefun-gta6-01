// SOLMAR HEAT — courier jobs and vigilante bounties.
// Two ways to earn outside the story: run parcels for the courier depot, and
// hunt the marked suspect cars the police radio calls out. A courier run is a
// chain of drops against one clock; a bounty is a demolition job — smash the
// suspect's car until it is scrap and the reward lands. Both pay through the
// progression rank, so a higher rank means a fatter envelope.
//
// The module owns its own slice of state (state.jobs) and is stepped every
// frame by the world. It never touches the DOM: it returns event flags and
// writes toasts, and the caller turns those into sound.
import { PLACES } from './config.js';
import { EVENT_CASH, EVENT_JOB } from './world-events.js';
import { clamp, dist, pick, range } from './random.js';

// Where parcels go: the marina, the hotel, the deli, the bank, the docks.
const DROP_SPOTS = [
  { x: 2700, y: 2280, name: 'Marina Pier' },
  { x: 2900, y: 700, name: 'Grand Solmar hotel' },
  { x: 1330, y: 620, name: 'Palm Row Deli' },
  { x: 2250, y: 1150, name: 'Harbor Bank' },
  { x: 600, y: 2350, name: 'South Docks' },
  { x: 3100, y: 2100, name: 'Safehouse' },
  { x: 420, y: 1150, name: 'Beach Bar' },
  { x: 900, y: 1750, name: 'Spray Shop' },
];

const COURIER_DROPS = 3;
const COURIER_TIME = 150;
const COURIER_BASE_PAY = 220;
const BOUNTY_BASE_PAY = 650;
const BOUNTY_COOLDOWN = 45;

export function createJobs() {
  return {
    courier: null, // { drops: [{x,y,name,done}], left, timer, pay }
    bounty: null, // { car, pay, marker }
    bountyTimer: 0,
    done: 0, // courier runs finished
    bountiesDone: 0,
    earned: 0,
  };
}

// Rank pay scales the envelope: rank 0 pays base, each rank adds 25%.
export function rankPay(base, rank) {
  return Math.round(base * (1 + 0.25 * (rank || 0)));
}

function pickDrops(rng, count) {
  const pool = DROP_SPOTS.slice();
  const drops = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const spot = pick(rng, pool);
    pool.splice(pool.indexOf(spot), 1);
    drops.push({ x: spot.x, y: spot.y, name: spot.name, done: false });
  }
  return drops;
}

export function startCourier(ctx) {
  const { state, rng } = ctx;
  const jobs = state.jobs;
  if (!jobs || jobs.courier) return false;
  const rank = state.prog ? state.prog.rank : 0;
  const drops = pickDrops(rng, COURIER_DROPS);
  jobs.courier = {
    drops,
    left: drops.length,
    timer: COURIER_TIME,
    pay: rankPay(COURIER_BASE_PAY, rank) * drops.length,
    startedAt: state.elapsed,
  };
  state.toast = `Courier run: ${drops.length} drops in ${COURIER_TIME}s — ${drops[0].name} first. Pay $${jobs.courier.pay}.`;
  state.toastTimer = 5;
  return true;
}

export function cancelCourier(ctx) {
  const { state } = ctx;
  const jobs = state.jobs;
  if (!jobs || !jobs.courier) return false;
  jobs.courier = null;
  state.toast = 'Courier run dropped.';
  state.toastTimer = 3;
  return true;
}

// The current drop target, for the HUD arrow and the minimap.
export function courierTarget(state) {
  const job = state.jobs && state.jobs.courier;
  if (!job) return null;
  const next = job.drops.find((d) => !d.done);
  return next || null;
}

export function jobTarget(state) {
  const c = courierTarget(state);
  if (c) return { x: c.x, y: c.y, label: `Drop the parcel at ${c.name}` };
  const b = state.jobs && state.jobs.bounty;
  if (b && b.car) return { x: b.car.x, y: b.car.y, label: 'Smash the suspect car!' };
  return null;
}

function finishCourier(ctx, events) {
  const { state } = ctx;
  const jobs = state.jobs;
  const job = jobs.courier;
  jobs.courier = null;
  jobs.done += 1;
  let pay = job.pay;
  // On-time bonus: every 10 seconds left on the clock adds 5% to the pay.
  const bonus = Math.round(pay * 0.05 * Math.floor(job.timer / 10));
  pay += bonus;
  if (state.prog && state.prog.combo > 1) pay = Math.round(pay * state.prog.combo);
  state.player.money += pay;
  state.stats.cashEarned += pay;
  jobs.earned += pay;
  state.toast = `Courier run complete! +$${pay}${bonus > 0 ? ` (includes $${bonus} speed bonus)` : ''}`;
  state.toastTimer = 4;
  if (state.prog) {
    state.prog.xp += 60;
    state.prog.jobsDone = (state.prog.jobsDone || 0) + 1;
  }
  return events | EVENT_JOB | EVENT_CASH;
}

function stepCourier(ctx, dt, events) {
  const { state, dist: d2 } = ctx;
  const jobs = state.jobs;
  const job = jobs.courier;
  if (!job) return events;
  job.timer -= dt;
  if (job.timer <= 0) {
    jobs.courier = null;
    state.toast = 'Courier run failed — out of time.';
    state.toastTimer = 4;
    return events | EVENT_JOB;
  }
  const p = state.player;
  const next = job.drops.find((d) => !d.done);
  if (!next) return finishCourier(ctx, events);
  if (d2(p.x, p.y, next.x, next.y) < 90) {
    next.done = true;
    job.left -= 1;
    if (job.left <= 0) return finishCourier(ctx, events);
    const following = job.drops.find((d) => !d.done);
    state.toast = `Drop done — ${job.left} left. Next: ${following.name}.`;
    state.toastTimer = 3;
    return events | EVENT_JOB;
  }
  return events;
}

// A bounty suspect: pick a driven traffic car far from the player, mark it,
// and pay when its health hits zero. The world damages suspect cars through
// collisions and bullets; this module only watches the health.
export function spawnBounty(ctx) {
  const { state, rng } = ctx;
  const jobs = state.jobs;
  if (!jobs || jobs.bounty || jobs.bountyTimer > 0) return null;
  const p = state.player;
  const candidates = state.cars.filter((c) => c.traffic && c.driver
    && dist(c.x, c.y, p.x, p.y) > 500 && c.hp > 50);
  if (candidates.length === 0) return null;
  const car = pick(rng, candidates);
  car.bounty = true;
  car.hp = Math.min(car.hp, 100);
  const rank = state.prog ? state.prog.rank : 0;
  jobs.bounty = { car, pay: rankPay(BOUNTY_BASE_PAY, rank) };
  state.toast = 'Vigilante bounty: smash the marked suspect car! $' + jobs.bounty.pay + ' on the hood.';
  state.toastTimer = 5;
  return jobs.bounty;
}

function stepBounty(ctx, dt, events) {
  const { state } = ctx;
  const jobs = state.jobs;
  if (jobs.bountyTimer > 0) jobs.bountyTimer -= dt;
  const b = jobs.bounty;
  if (!b) return events;
  // Suspect car left the world: the bounty lapses quietly.
  if (!state.cars.includes(b.car)) {
    jobs.bounty = null;
    return events;
  }
  if (b.car.hp <= 0) {
    const pay = b.pay;
    state.player.money += pay;
    state.stats.cashEarned += pay;
    jobs.earned += pay;
    jobs.bountiesDone += 1;
    jobs.bounty = null;
    jobs.bountyTimer = BOUNTY_COOLDOWN;
    state.toast = `Bounty collected! Suspect car wrecked — +$${pay}`;
    state.toastTimer = 4;
    if (state.prog) {
      state.prog.xp += 80;
      state.prog.bountiesDone = (state.prog.bountiesDone || 0) + 1;
    }
    return events | EVENT_JOB | EVENT_CASH;
  }
  return events;
}

// J takes a job: at the depot it starts a courier run, anywhere else it
// cancels an active run. Bounties arrive on their own timer.
export function handleJobKey(ctx) {
  const { state, dist: d2 } = ctx;
  const jobs = state.jobs;
  if (!jobs) return 0;
  const p = state.player;
  const depot = PLACES.courierDepot;
  if (jobs.courier) return cancelCourier(ctx) ? EVENT_JOB : 0;
  if (depot && d2(p.x, p.y, depot.x, depot.y) < 130) {
    return startCourier(ctx) ? EVENT_JOB : 0;
  }
  state.toast = 'No courier work here — go to the Courier Depot (D on the map) and press J.';
  state.toastTimer = 3;
  return 0;
}

export function stepJobs(ctx, dt) {
  const { state } = ctx;
  if (!state.jobs) return 0;
  let events = 0;
  events = stepCourier(ctx, dt, events);
  events = stepBounty(ctx, dt, events);
  // A new bounty drifts in on its own every so often while the player roams.
  if (!state.jobs.bounty && state.jobs.bountyTimer <= 0 && state.elapsed > 30) {
    const chance = dt / 40;
    if (ctx.rng() < chance) spawnBounty(ctx);
  }
  return events;
}

// How far along the active courier run is, 0..1, for a progress bar.
export function courierProgress(state) {
  const job = state.jobs && state.jobs.courier;
  if (!job) return 0;
  const done = job.drops.filter((d) => d.done).length;
  return clamp(done / job.drops.length, 0, 1);
}
