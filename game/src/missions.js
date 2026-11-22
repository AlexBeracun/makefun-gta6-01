// Story missions: 10 jobs for Mara Solis across Solmar Bay. A mission is a list
// of steps — steal, goto, pickup, wanted, clear, collect, escape — and stepMission
// advances them as the player meets each one. Completing a mission pays out, saves
// the game, and starts the next one; failing one sends the player back to the giver.
import { MISSIONS } from './config.js';
import { EVENT_MISSION_DONE, EVENT_MISSION_FAIL } from './world-events.js';

export function missionDef(ctx) {
  const { state } = ctx;
  // The active mission is the one the player is running, which is not always the
  // next unstarted one (the screenshot scenes start a later mission directly).
  return MISSIONS[state.mission ? state.mission.index : state.missionIndex] || null;
}

export function currentStep(ctx) {
  const m = ctx.state.mission;
  if (!m) return null;
  return missionDef(ctx).steps[m.step];
}

export function startMission(ctx, index) {
  const { state, spawnPed, addWanted } = ctx;
  const def = MISSIONS[index];
  if (!def) return;
  state.mission = { index, step: 0, collected: 0, passenger: false };
  state.missionTimer = def.timeLimit || 0;
  state.toast = `${def.title} — ${def.giver}: ${def.brief}`;
  state.toastTimer = 6;
  // Any mission that opens with a pickup has someone waiting at the marker.
  if (def.steps[0].type === 'pickup') {
    const ped = spawnPed(ctx, def.steps[0].x + 20, def.steps[0].y + 30);
    ped.state = 'wait';
    ped.waitTimer = 999;
    state.mission.ped = ped;
  }
  if (def.id === 'm4') addWanted(2);
  if (def.id === 'm6') state.missionTimer = 0;
}

export function completeStep(ctx, events) {
  const { state } = ctx;
  const m = state.mission;
  const def = missionDef(ctx);
  m.step += 1;
  if (m.step >= def.steps.length) {
    state.player.money += def.pay;
    state.stats.cashEarned += def.pay;
    state.stats.missionsDone += 1;
    state.missionIndex += 1;
    state.mission = null;
    state.toast = `Mission complete: ${def.title} — $${def.pay} earned!`;
    state.toastTimer = 5;
    if (state.missionIndex >= MISSIONS.length) {
      state.storyDone = true;
      state.toast = 'STORY COMPLETE — You own Solmar Bay now. Free roam: drive fares, dodge the heat!';
      state.toastTimer = 7;
    }
    return events | EVENT_MISSION_DONE;
  }
  return events;
}

export function failMission(ctx, events) {
  const { state } = ctx;
  const def = missionDef(ctx);
  state.mission = null;
  state.toast = `Mission failed: ${def.title}. Talk to ${def.giver} again — press M for missions.`;
  state.toastTimer = 5;
  return events | EVENT_MISSION_FAIL;
}

export function stepMission(ctx, dt) {
  const { state, dist, addWanted } = ctx;
  if (!state.mission) return 0;
  const m = state.mission;
  const def = missionDef(ctx);
  const step = def.steps[m.step];
  const p = state.player;
  let events = 0;
  if (state.missionTimer > 0) {
    state.missionTimer -= dt;
    if (state.missionTimer <= 0) return failMission(ctx, events);
  }
  if (step.type === 'steal') {
    if (p.inCar) events = completeStep(ctx, events);
  } else if (step.type === 'goto') {
    if (dist(p.x, p.y, step.x, step.y) < step.radius) events = completeStep(ctx, events);
  } else if (step.type === 'pickup') {
    if (p.inCar && Math.abs(p.inCar.speed) < 70 && dist(p.x, p.y, step.x, step.y) < step.radius) {
      m.passenger = true;
      if (m.ped) {
        m.ped.dead = true;
        m.ped.deadTimer = 0;
      }
      const next = def.steps[m.step + 1];
      state.toast = next ? `Passenger aboard — ${next.text}` : 'Passenger aboard!';
      state.toastTimer = 3;
      events = completeStep(ctx, events);
    }
  } else if (step.type === 'wanted') {
    if (state.wanted >= step.stars) events = completeStep(ctx, events);
  } else if (step.type === 'clear') {
    if (state.wanted === 0) events = completeStep(ctx, events);
  } else if (step.type === 'collect') {
    if (dist(p.x, p.y, step.x, step.y) < step.radius) {
      m.collected += 1;
      if (def.heatOnCollect && state.wanted < def.heatOnCollect) {
        addWanted(def.heatOnCollect - state.wanted);
      }
      if (def.id === 'm6') {
        p.money += 0; // the cash lands at the safehouse, not here
        state.toast = 'Cash grabbed! Run for the safehouse!';
        state.toastTimer = 3;
      }
      events = completeStep(ctx, events);
    }
  } else if (step.type === 'escape') {
    if (state.wanted === 0 && dist(p.x, p.y, step.x, step.y) < 110) events = completeStep(ctx, events);
    else if (state.wanted < step.stars && state.missionTimer <= 0) {
      // Keep the heat on until the player reaches the safehouse.
      addWanted(step.stars - state.wanted);
    }
  }
  return events;
}
