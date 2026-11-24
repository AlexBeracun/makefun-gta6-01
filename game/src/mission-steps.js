// SOLMAR HEAT — new mission step types: chase, tail and survive.
// The story missions used to be only waypoints, pickups and escapes. These
// three step kinds give later missions teeth, and the mission runner in
// missions.js hands any step it does not recognise to stepNewStep() here.
//
//   chase   — a target car flees; catch it (ram it to a stop) before it escapes.
//   tail    — follow a target car without being spotted: stay inside the gold
//             zone, roughly 150 to 650 px away. Too close and you are seen,
//             too far and you lose them.
//   survive — stay alive at a given wanted level for a fixed duration; the
//             clock only counts while the heat is on.
//
// Each step keeps its runtime in mission.runtime, created by beginNewStep()
// when the step starts and cleared when it completes.
import { clamp, dist, pick, range } from './random.js';
import { CARS } from './config.js';

export const TAIL_MIN = 150;
export const TAIL_MAX = 650;
export const TAIL_GRACE = 4; // seconds outside the zone before the tail fails
export const CHASE_CATCH_HITS = 3; // rams needed to stop the target
export const CHASE_ESCAPE_DIST = 1400;

export function isNewStepType(type) {
  return type === 'chase' || type === 'tail' || type === 'survive';
}

// Spawn the car a chase or tail step needs: a fast coupe ahead of the player.
export function spawnTargetCar(ctx, step) {
  const { state, rng } = ctx;
  const p = state.player;
  const def = CARS.find((c) => c.id === 'coupe') || CARS[0];
  const a = p.angle + range(rng, -0.4, 0.4);
  const car = {
    def, x: p.x + Math.cos(a) * 420, y: p.y + Math.sin(a) * 420,
    angle: p.angle, speed: 120, targetSpeed: def.speed * 0.7,
    color: pick(rng, ['#20242e', '#3f7fd0', '#7a2fd0']),
    traffic: false, police: false, driver: true, cruise: 0, turnAt: null,
    hp: 100, smoke: 0, missionTarget: true,
  };
  state.cars.push(car);
  return car;
}

export function beginNewStep(ctx, step) {
  const { state } = ctx;
  const m = state.mission;
  if (!m) return null;
  if (step.type === 'chase' || step.type === 'tail') {
    const car = spawnTargetCar(ctx, step);
    m.runtime = {
      car, hits: 0, outTimer: 0, spotted: false,
      lastX: car.x, lastY: car.y,
    };
    if (step.type === 'tail') {
      state.toast = 'Tail the target — stay in the gold zone, not too close, not too far.';
    } else {
      state.toast = 'Chase the target car down — ram it to a stop!';
    }
    state.toastTimer = 4;
  } else if (step.type === 'survive') {
    m.runtime = { held: 0, needed: step.duration || 20 };
    state.toast = `Survive ${m.runtime.needed}s at ${step.stars || 2} stars!`;
    state.toastTimer = 4;
  }
  return m.runtime;
}

function stepChase(ctx, step, dt) {
  const { state, dist: d2 } = ctx;
  const m = state.mission;
  const rt = m.runtime;
  const car = rt.car;
  const p = state.player;
  if (!state.cars.includes(car)) return 'fail';
  const d = d2(p.x, p.y, car.x, car.y);
  // The target flees: it steers away from the player and runs flat out.
  const away = Math.atan2(car.y - p.y, car.x - p.x);
  let want = away;
  // Keep it on the roads: nudge it back toward the city centre when it
  // drifts near the edge.
  if (car.x < 500 || car.x > 3300 || car.y < 350 || car.y > 2400) {
    want = Math.atan2(1300 - car.y, 1800 - car.x);
  }
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
  const top = car.def.speed * 0.82;
  car.speed += clamp(top - car.speed, -300 * dt, 260 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 200, 3400);
  car.y = clamp(car.y, 100, 2500);
  // A ram counts when the player car hits it hard.
  if (p.inCar && d < 56 && Math.abs(p.inCar.speed) > 150) {
    if (!rt.hitCd || rt.hitCd <= 0) {
      rt.hits += 1;
      rt.hitCd = 1;
      car.hp -= 34;
      car.speed *= 0.5;
      state.toast = `Hit ${rt.hits}/${CHASE_CATCH_HITS} — keep ramming!`;
      state.toastTimer = 2;
    }
  }
  if (rt.hitCd > 0) rt.hitCd -= dt;
  if (rt.hits >= CHASE_CATCH_HITS || car.hp <= 0) {
    car.missionTarget = false;
    car.speed = 0;
    return 'done';
  }
  if (d > CHASE_ESCAPE_DIST) return 'fail';
  return 'run';
}

function stepTail(ctx, step, dt) {
  const { state, dist: d2 } = ctx;
  const m = state.mission;
  const rt = m.runtime;
  const car = rt.car;
  const p = state.player;
  if (!state.cars.includes(car)) return 'fail';
  // The target cruises a lazy loop around the block it started on.
  const cx = rt.lastX;
  const cy = rt.lastY;
  const loopA = Math.atan2(car.y - cy, car.x - cx) + 0.35;
  const tx = cx + Math.cos(loopA) * 380;
  const ty = cy + Math.sin(loopA) * 380;
  const want = Math.atan2(ty - car.y, tx - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += clamp(diff, -1.8 * dt, 1.8 * dt);
  const top = car.def.speed * 0.42;
  car.speed += clamp(top - car.speed, -200 * dt, 180 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const d = d2(p.x, p.y, car.x, car.y);
  rt.distance = d;
  const inZone = d >= TAIL_MIN && d <= TAIL_MAX;
  if (inZone) {
    rt.outTimer = 0;
    rt.held = (rt.held || 0) + dt;
  } else {
    rt.outTimer += dt;
    if (d < TAIL_MIN) {
      rt.spotted = true;
      state.toast = 'Too close — the target spotted you!';
      state.toastTimer = 2;
    }
    if (rt.outTimer > TAIL_GRACE) return 'fail';
  }
  const need = step.duration || 25;
  if ((rt.held || 0) >= need) {
    car.missionTarget = false;
    return 'done';
  }
  return 'run';
}

function stepSurvive(ctx, step, dt) {
  const { state } = ctx;
  const m = state.mission;
  const rt = m.runtime;
  const want = step.stars || 2;
  // The heat must be at the level: top it up while the step runs.
  if (state.wanted < want) {
    state.wanted = want;
    state.heatTimer = 0;
    state.decayTimer = 0;
  }
  if (state.wanted >= want) rt.held += dt;
  if (rt.held >= rt.needed) return 'done';
  return 'run';
}

// Advance one new-style step. Returns 'done', 'fail' or 'run'.
export function stepNewStep(ctx, step, dt) {
  const { state } = ctx;
  const m = state.mission;
  if (!m) return 'run';
  if (!m.runtime) beginNewStep(ctx, step);
  if (step.type === 'chase') return stepChase(ctx, step, dt);
  if (step.type === 'tail') return stepTail(ctx, step, dt);
  if (step.type === 'survive') return stepSurvive(ctx, step, dt);
  return 'run';
}

// Clean up when the mission ends early: the target car stops being special.
export function clearNewStep(ctx) {
  const { state } = ctx;
  const m = state.mission;
  if (m && m.runtime && m.runtime.car) {
    m.runtime.car.missionTarget = false;
  }
  if (m) m.runtime = null;
}

// How the HUD shows progress for a new-style step, 0..1.
export function newStepProgress(ctx, step) {
  const m = ctx.state.mission;
  if (!m || !m.runtime) return 0;
  if (step.type === 'chase') return clamp(m.runtime.hits / CHASE_CATCH_HITS, 0, 1);
  if (step.type === 'tail') return clamp((m.runtime.held || 0) / (step.duration || 25), 0, 1);
  if (step.type === 'survive') return clamp(m.runtime.held / m.runtime.needed, 0, 1);
  return 0;
}
