// SOLMAR HEAT — ranks, XP and driving stats.
// The long game: everything the player does feeds one ladder. Earn XP from
// missions, jobs, bounties and near misses, climb five ranks from Rookie to
// King of Solmar, and each rank fattens every payout. A mission streak builds
// a combo multiplier (up to x2) that multiplies mission and job pay — but
// failing a mission breaks the streak. The slice lives in state.prog and is
// saved with the rest of the game, so a rank survives a reload.
import { clamp } from './random.js';

export const RANKS = [
  { name: 'Rookie', xp: 0, bonus: 0 },
  { name: 'Hustler', xp: 250, bonus: 0.1 },
  { name: 'Wheelman', xp: 700, bonus: 0.2 },
  { name: 'Shot Caller', xp: 1500, bonus: 0.35 },
  { name: 'King of Solmar', xp: 3000, bonus: 0.5 },
];

export const COMBO_MAX = 2;
export const COMBO_STEP = 0.25;
export const NEAR_MISS_XP = 5;
export const NEAR_MISS_DIST = 70;

export function createProgression() {
  return {
    xp: 0,
    rank: 0,
    combo: 1,
    streak: 0,
    jobsDone: 0,
    bountiesDone: 0,
    racesWon: 0,
    challengesDone: 0,
    nearMisses: 0,
    distance: 0, // metres driven, total
    topSpeed: 0, // fastest speed ever, px/s
    crashes: 0,
    bestCombo: 1,
  };
}

export function rankName(prog) {
  return RANKS[clamp(prog.rank, 0, RANKS.length - 1)].name;
}

export function rankBonus(prog) {
  return RANKS[clamp(prog.rank, 0, RANKS.length - 1)].bonus;
}

// XP needed to reach the next rank, or 0 when already at the top.
export function xpToNextRank(prog) {
  if (prog.rank >= RANKS.length - 1) return 0;
  return RANKS[prog.rank + 1].xp - prog.xp;
}

// Fraction of the way through the current rank, 0..1, for the XP bar.
export function rankProgress(prog) {
  if (prog.rank >= RANKS.length - 1) return 1;
  const cur = RANKS[prog.rank].xp;
  const next = RANKS[prog.rank + 1].xp;
  return clamp((prog.xp - cur) / (next - cur), 0, 1);
}

export function addXp(state, amount, why) {
  const prog = state.prog;
  if (!prog) return;
  prog.xp += amount;
  let rankedUp = false;
  while (prog.rank < RANKS.length - 1 && prog.xp >= RANKS[prog.rank + 1].xp) {
    prog.rank += 1;
    rankedUp = true;
  }
  if (rankedUp) {
    state.toast = `Rank up! You are now ${rankName(prog)} — payouts +${Math.round(rankBonus(prog) * 100)}%.`;
    state.toastTimer = 5;
  } else if (why) {
    state.toast = why;
    state.toastTimer = 2;
  }
}

// A mission finished cleanly: the streak grows and the combo with it.
export function onMissionDone(state) {
  const prog = state.prog;
  if (!prog) return;
  prog.streak += 1;
  prog.combo = clamp(1 + prog.streak * COMBO_STEP, 1, COMBO_MAX);
  if (prog.combo > prog.bestCombo) prog.bestCombo = prog.combo;
  addXp(state, 100, null);
}

// A mission failed: the streak — and the combo — resets to nothing.
export function onMissionFail(state) {
  const prog = state.prog;
  if (!prog) return;
  if (prog.combo > 1) {
    state.toast = 'Combo broken — mission failed.';
    state.toastTimer = 3;
  }
  prog.streak = 0;
  prog.combo = 1;
}

// Apply rank bonus + combo to a cash payout and return the final amount.
export function applyPayout(state, base) {
  const prog = state.prog;
  if (!prog) return base;
  const withRank = base * (1 + rankBonus(prog));
  return Math.round(withRank * prog.combo);
}

// Driving stats: called every frame the player is in a car.
export function trackDriving(state, speed, dt) {
  const prog = state.prog;
  if (!prog || dt <= 0) return;
  prog.distance += Math.abs(speed) * dt * 0.36; // px/s -> rough metres
  if (Math.abs(speed) > prog.topSpeed) prog.topSpeed = Math.abs(speed);
}

// A near miss: a traffic car flashes past within arm's reach while the player
// is moving fast. Small XP, and it counts toward the Threader challenge.
export function checkNearMiss(state, car, speed) {
  const prog = state.prog;
  if (!prog || !state.player.inCar) return false;
  if (Math.abs(speed) < 260) return false;
  const dx = car.x - state.player.x;
  const dy = car.y - state.player.y;
  const d = Math.hypot(dx, dy);
  if (d > NEAR_MISS_DIST || d < 30) return false;
  if (car.nearMissCd && car.nearMissCd > 0) return false;
  car.nearMissCd = 3;
  prog.nearMisses += 1;
  addXp(state, NEAR_MISS_XP, `Near miss! +${NEAR_MISS_XP} XP`);
  return true;
}

export function recordCrash(state) {
  const prog = state.prog;
  if (!prog) return;
  prog.crashes += 1;
}

// Serialize / restore: the save module stores this object as-is.
export function progressionSaveData(prog) {
  if (!prog) return null;
  return {
    xp: prog.xp, rank: prog.rank, combo: prog.combo, streak: prog.streak,
    jobsDone: prog.jobsDone, bountiesDone: prog.bountiesDone,
    racesWon: prog.racesWon, challengesDone: prog.challengesDone,
    nearMisses: prog.nearMisses, distance: Math.round(prog.distance),
    topSpeed: Math.round(prog.topSpeed), crashes: prog.crashes,
    bestCombo: prog.bestCombo,
  };
}

export function applyProgressionSave(state, data) {
  if (!data || !state.prog) return;
  const prog = state.prog;
  prog.xp = data.xp ?? 0;
  prog.rank = clamp(data.rank ?? 0, 0, RANKS.length - 1);
  prog.combo = data.combo ?? 1;
  prog.streak = data.streak ?? 0;
  prog.jobsDone = data.jobsDone ?? 0;
  prog.bountiesDone = data.bountiesDone ?? 0;
  prog.racesWon = data.racesWon ?? 0;
  prog.challengesDone = data.challengesDone ?? 0;
  prog.nearMisses = data.nearMisses ?? 0;
  prog.distance = data.distance ?? 0;
  prog.topSpeed = data.topSpeed ?? 0;
  prog.crashes = data.crashes ?? 0;
  prog.bestCombo = data.bestCombo ?? 1;
}
