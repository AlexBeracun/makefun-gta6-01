// SOLMAR HEAT — street races and ambushes.
// Two things that find the player instead of waiting for a mission. A street
// race starts itself when the player rolls up to the Race Start line: five
// checkpoints around the city against one rival car, and the winner takes the
// purse. An ambush finds the player when the heat climbs: at two stars or
// more, three shooters step out of the crowd and open fire until they are
// dealt with. Both live in state.race and state.ambush and are stepped every
// frame by the world.
import { PLACES } from './config.js';
import { EVENT_CASH, EVENT_RACE } from './world-events.js';
import { clamp, dist, pick, range } from './random.js';

export const RACE_CHECKPOINTS = 5;
export const RACE_BASE_PAY = 1000;
export const RACE_START_RADIUS = 110;
export const AMBUSH_SHOOTERS = 3;
export const AMBUSH_MIN_WANTED = 2;
export const AMBUSH_COOLDOWN = 60;

const RACE_ROUTE = [
  { x: 2250, y: 700, name: 'Downtown' },
  { x: 2900, y: 1600, name: 'East End' },
  { x: 1800, y: 2280, name: 'South Docks' },
  { x: 600, y: 1150, name: 'Beachfront' },
  { x: 1330, y: 620, name: 'Palm Row' },
];

export function createRace() {
  return {
    active: false,
    checkpoint: 0,
    checkpoints: [],
    rival: null,
    rivalCp: 0,
    pay: 0,
    startedAt: 0,
    wins: 0,
    losses: 0,
    cooldown: 0,
  };
}

export function createAmbush() {
  return {
    active: false,
    shooters: [], // {x, y, hp, shootCd, angle}
    cooldown: 0,
    survived: 0,
  };
}

export function raceTarget(state) {
  const race = state.race;
  if (!race || !race.active) return null;
  const cp = race.checkpoints[race.checkpoint];
  if (!cp) return null;
  return { x: cp.x, y: cp.y, label: `Race checkpoint ${race.checkpoint + 1}/${RACE_CHECKPOINTS}` };
}

export function ambushTarget(state) {
  const amb = state.ambush;
  if (!amb || !amb.active || amb.shooters.length === 0) return null;
  const s = amb.shooters[0];
  return { x: s.x, y: s.y, label: 'Ambush! Deal with the shooters' };
}

function spawnRival(ctx) {
  const { state, rng } = ctx;
  const start = PLACES.raceStart;
  const def = { id: 'rival', name: 'Rival GT', color: '#d02090', speed: 540, accel: 400, turn: 3.0, len: 44, wid: 21 };
  const car = {
    def, x: start.x + 60, y: start.y + 40, angle: 0, speed: 0,
    targetSpeed: def.speed, color: def.color, traffic: false, police: false,
    driver: true, cruise: def.speed * 0.85, turnAt: null, hp: 100, smoke: 0,
    rival: true,
  };
  state.cars.push(car);
  return car;
}

export function startRace(ctx) {
  const { state } = ctx;
  const race = state.race;
  if (!race || race.active || race.cooldown > 0) return false;
  const rank = state.prog ? state.prog.rank : 0;
  race.active = true;
  race.checkpoint = 0;
  race.checkpoints = RACE_ROUTE.map((c) => ({ ...c }));
  race.rival = spawnRival(ctx);
  race.rivalCp = 0;
  race.pay = Math.round(RACE_BASE_PAY * (1 + 0.25 * rank));
  race.startedAt = state.elapsed;
  state.toast = `Street race! ${RACE_CHECKPOINTS} checkpoints against the rival — $${race.pay} to the winner.`;
  state.toastTimer = 5;
  return true;
}

function finishRace(ctx, won, events) {
  const { state } = ctx;
  const race = state.race;
  race.active = false;
  race.cooldown = 20;
  if (race.rival) {
    race.rival.rival = false;
    race.rival.traffic = true;
    race.rival = null;
  }
  if (won) {
    race.wins += 1;
    let pay = race.pay;
    if (state.prog && state.prog.combo > 1) pay = Math.round(pay * state.prog.combo);
    state.player.money += pay;
    state.stats.cashEarned += pay;
    state.toast = `Race won! +$${pay}`;
    state.toastTimer = 4;
    if (state.prog) {
      state.prog.xp += 120;
      state.prog.racesWon += 1;
    }
    return events | EVENT_RACE | EVENT_CASH;
  }
  race.losses += 1;
  state.toast = 'Race lost — the rival took the purse.';
  state.toastTimer = 4;
  return events | EVENT_RACE;
}

function stepRival(ctx, dt) {
  const { state, dist: d2 } = ctx;
  const race = state.race;
  const rival = race.rival;
  if (!rival || !state.cars.includes(rival)) return;
  const cp = race.checkpoints[race.rivalCp];
  if (!cp) return;
  // The rival drives at its checkpoint; on arrival it moves to the next.
  if (d2(rival.x, rival.y, cp.x, cp.y) < 95) {
    race.rivalCp += 1;
    if (race.rivalCp >= RACE_CHECKPOINTS) return;
    return;
  }
  const want = Math.atan2(cp.y - rival.y, cp.x - rival.x);
  let diff = want - rival.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  rival.angle += clamp(diff, -2.6 * dt, 2.6 * dt);
  const top = rival.def.speed * (0.78 + 0.04 * (state.prog ? state.prog.rank : 0));
  rival.speed += clamp(top - rival.speed, -320 * dt, 300 * dt);
  rival.x += Math.cos(rival.angle) * rival.speed * dt;
  rival.y += Math.sin(rival.angle) * rival.speed * dt;
}

function stepRace(ctx, dt, events) {
  const { state, dist: d2 } = ctx;
  const race = state.race;
  if (race.cooldown > 0) race.cooldown -= dt;
  if (!race.active) {
    // Rolling up to the start line with a car starts the race by itself.
    const start = PLACES.raceStart;
    if (start && state.player.inCar && d2(state.player.x, state.player.y, start.x, start.y) < RACE_START_RADIUS) {
      if (startRace(ctx)) return events | EVENT_RACE;
    }
    return events;
  }
  stepRival(ctx, dt);
  const cp = race.checkpoints[race.checkpoint];
  if (cp && d2(state.player.x, state.player.y, cp.x, cp.y) < 95) {
    race.checkpoint += 1;
    if (race.checkpoint >= RACE_CHECKPOINTS) {
      return finishRace(ctx, true, events);
    }
    state.toast = `Checkpoint ${race.checkpoint}/${RACE_CHECKPOINTS} — next: ${race.checkpoints[race.checkpoint].name}`;
    state.toastTimer = 3;
    return events | EVENT_RACE;
  }
  if (race.rivalCp >= RACE_CHECKPOINTS) {
    return finishRace(ctx, false, events);
  }
  return events;
}

export function triggerAmbush(ctx) {
  const { state, rng } = ctx;
  const amb = state.ambush;
  if (!amb || amb.active || amb.cooldown > 0) return false;
  const p = state.player;
  amb.active = true;
  amb.shooters = [];
  for (let i = 0; i < AMBUSH_SHOOTERS; i += 1) {
    const a = (i / AMBUSH_SHOOTERS) * Math.PI * 2 + rng();
    amb.shooters.push({
      x: p.x + Math.cos(a) * range(rng, 220, 320),
      y: p.y + Math.sin(a) * range(rng, 220, 320),
      hp: 50, shootCd: range(rng, 0.5, 1.5), angle: 0,
    });
  }
  state.toast = 'Ambush! Three shooters are on you — fight back or run!';
  state.toastTimer = 5;
  return true;
}

function stepAmbush(ctx, dt, events) {
  const { state, dist: d2 } = ctx;
  const amb = state.ambush;
  if (amb.cooldown > 0) amb.cooldown -= dt;
  if (!amb.active) {
    if (state.wanted >= AMBUSH_MIN_WANTED && amb.cooldown <= 0 && state.elapsed > 20) {
      if (ctx.rng() < dt / 25) triggerAmbush(ctx);
    }
    return events;
  }
  const p = state.player;
  for (const s of amb.shooters) {
    const d = d2(s.x, s.y, p.x, p.y);
    const a = Math.atan2(p.y - s.y, p.x - s.x);
    s.angle = a;
    // Shooters close in until they are in range, then hold and fire.
    if (d > 260) {
      s.x += Math.cos(a) * 130 * dt;
      s.y += Math.sin(a) * 130 * dt;
    }
    if (s.shootCd > 0) s.shootCd -= dt;
    if (d < 460 && s.shootCd <= 0 && p.health > 0) {
      s.shootCd = range(ctx.rng, 1.1, 2.0);
      state.bullets.push({
        x: s.x, y: s.y,
        vx: Math.cos(a + range(ctx.rng, -0.1, 0.1)) * 600,
        vy: Math.sin(a + range(ctx.rng, -0.1, 0.1)) * 600,
        life: 0.9, fromPlayer: false,
      });
    }
  }
  // Dead shooters drop out; bullets and punches are what hurt them.
  amb.shooters = amb.shooters.filter((s) => s.hp > 0);
  if (amb.shooters.length === 0) {
    amb.active = false;
    amb.cooldown = AMBUSH_COOLDOWN;
    amb.survived += 1;
    const pay = 300;
    state.player.money += pay;
    state.stats.cashEarned += pay;
    state.toast = `Ambush survived! +$${pay}`;
    state.toastTimer = 4;
    if (state.prog) state.prog.xp += 50;
    return events | EVENT_RACE | EVENT_CASH;
  }
  // The ambush also ends if the player escapes far away.
  const far = amb.shooters.every((s) => d2(s.x, s.y, p.x, p.y) > 900);
  if (far) {
    amb.active = false;
    amb.cooldown = AMBUSH_COOLDOWN;
    state.toast = 'You slipped the ambush.';
    state.toastTimer = 3;
    return events | EVENT_RACE;
  }
  return events;
}

export function stepStreetEvents(ctx, dt) {
  const { state } = ctx;
  if (!state.race || !state.ambush) return 0;
  let events = 0;
  events = stepRace(ctx, dt, events);
  events = stepAmbush(ctx, dt, events);
  return events;
}
