// SOLMAR HEAT — rotating street challenges.
// Eight small feats that rotate through the day: drive far, earn fast, keep a
// combo, thread traffic, finish jobs, hold top speed, win a race, survive the
// heat. One challenge is live at a time; finishing it pays out and the next
// one takes its place. Progress is measured against the live world state, so
// a challenge can complete in the middle of anything else the player does.
import { clamp } from './random.js';

export const CHALLENGES = [
  { id: 'joyride', name: 'Joyride', text: 'Drive 5,000m in one session', pay: 400 },
  { id: 'earner', name: 'Earner', text: 'Earn $2,000 in one session', pay: 500 },
  { id: 'wheelman', name: 'Wheelman', text: 'Reach a x2.00 mission combo', pay: 600 },
  { id: 'threader', name: 'Threader', text: 'Score 5 near misses', pay: 450 },
  { id: 'hustler', name: 'Hustler', text: 'Finish 2 courier runs', pay: 700 },
  { id: 'speedster', name: 'Speedster', text: 'Hit 550 px/s top speed', pay: 500 },
  { id: 'racer', name: 'Racer', text: 'Win a street race', pay: 800 },
  { id: 'survivor', name: 'Survivor', text: 'Survive an ambush', pay: 750 },
];

export const ROTATE_SECONDS = 180;

export function createChallenges() {
  return {
    index: 0,
    timer: ROTATE_SECONDS,
    done: 0,
    earned: 0,
    sessionStartMoney: 0,
    sessionStartDistance: 0,
    // Baselines for the counter-based challenges: progress is measured from
    // the moment the challenge went live, not from lifetime totals — otherwise
    // a player who already has 5 near misses would auto-complete Threader
    // the instant it rotated in. Speedster tracks its own session best
    // because top speed is a max, not a counter.
    sessionStartNearMisses: 0,
    sessionStartJobsDone: 0,
    sessionStartRacesWon: 0,
    sessionStartSurvived: 0,
    sessionTopSpeed: 0,
    completedIds: [],
  };
}

// Snapshot every baseline from the live world state. Called whenever a new
// challenge goes live — on rotation, on completion, and after loading a
// save, where the restored counters would otherwise dwarf fresh baselines.
export function resetChallengeBaselines(state) {
  const ch = state.challenges;
  if (!ch) return;
  ch.sessionStartMoney = state.stats.cashEarned;
  ch.sessionStartDistance = state.prog ? state.prog.distance : 0;
  ch.sessionStartNearMisses = state.prog ? state.prog.nearMisses : 0;
  ch.sessionStartJobsDone = state.prog ? state.prog.jobsDone : 0;
  ch.sessionStartRacesWon = state.prog ? state.prog.racesWon : 0;
  ch.sessionStartSurvived = state.ambush ? state.ambush.survived : 0;
  ch.sessionTopSpeed = 0;
}

export function currentChallenge(state) {
  const ch = state.challenges;
  if (!ch) return null;
  return CHALLENGES[ch.index % CHALLENGES.length];
}

// Progress toward the live challenge, 0..1.
export function challengeProgress(state) {
  const ch = state.challenges;
  const prog = state.prog;
  if (!ch || !prog) return 0;
  const def = currentChallenge(state);
  const earned = state.stats.cashEarned - (ch.sessionStartMoney || 0);
  const driven = prog.distance - (ch.sessionStartDistance || 0);
  const nearMisses = prog.nearMisses - (ch.sessionStartNearMisses || 0);
  const jobsDone = prog.jobsDone - (ch.sessionStartJobsDone || 0);
  const racesWon = prog.racesWon - (ch.sessionStartRacesWon || 0);
  const survived = (state.ambush ? state.ambush.survived : 0) - (ch.sessionStartSurvived || 0);
  if (def.id === 'joyride') return clamp(driven / 5000, 0, 1);
  if (def.id === 'earner') return clamp(earned / 2000, 0, 1);
  if (def.id === 'wheelman') return clamp((prog.combo - 1) / 1, 0, 1);
  if (def.id === 'threader') return clamp(nearMisses / 5, 0, 1);
  if (def.id === 'hustler') return clamp(jobsDone / 2, 0, 1);
  if (def.id === 'speedster') return clamp((ch.sessionTopSpeed || 0) / 550, 0, 1);
  if (def.id === 'racer') return clamp(racesWon / 1, 0, 1);
  if (def.id === 'survivor') return clamp(survived / 1, 0, 1);
  return 0;
}

function completeChallenge(ctx, def) {
  const { state } = ctx;
  const ch = state.challenges;
  let pay = def.pay;
  if (state.prog && state.prog.combo > 1) pay = Math.round(pay * state.prog.combo);
  state.player.money += pay;
  state.stats.cashEarned += pay;
  ch.done += 1;
  ch.earned += pay;
  ch.completedIds.push(def.id);
  if (state.prog) {
    state.prog.xp += 60;
    state.prog.challengesDone += 1;
  }
  state.toast = `Challenge complete: ${def.name}! +$${pay}`;
  state.toastTimer = 4;
  // Move on to the next challenge and reset the session baselines.
  ch.index = (ch.index + 1) % CHALLENGES.length;
  ch.timer = ROTATE_SECONDS;
  resetChallengeBaselines(state);
  return true;
}

export function stepChallenges(ctx, dt) {
  const { state } = ctx;
  const ch = state.challenges;
  if (!ch) return 0;
  ch.timer -= dt;
  // Speedster measures the fastest driving since this challenge went live.
  const speed = state.player.inCar ? Math.abs(state.player.inCar.speed) : 0;
  if (speed > ch.sessionTopSpeed) ch.sessionTopSpeed = speed;
  if (ch.timer <= 0) {
    // Rotate without paying: the old challenge simply lapses.
    ch.index = (ch.index + 1) % CHALLENGES.length;
    ch.timer = ROTATE_SECONDS;
    resetChallengeBaselines(state);
    const def = currentChallenge(state);
    state.toast = `New challenge: ${def.name} — ${def.text} ($${def.pay})`;
    state.toastTimer = 4;
    return 0;
  }
  if (challengeProgress(state) >= 1) {
    const def = currentChallenge(state);
    completeChallenge(ctx, def);
    return 1;
  }
  return 0;
}
