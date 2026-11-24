// SOLMAR HEAT — written via write tool
// Heat streaks: finish jobs clean, one after another, and the city pays you
// extra for it. Every story mission, courier run, race win or bounty closed
// without getting busted or wasted in between raises the streak by one, and
// each success pays a bonus that grows with the streak. Getting busted or
// wasted wipes the streak back to zero — the best streak is kept forever,
// so there is always a record to beat.
//
// The bonus is a flat amount per kind of success, multiplied by the streak
// itself and capped, so a long clean run is worth real money but can never
// explode the economy. The multiplier shown on the HUD is a gentler number
// (1 + 0.1 per streak level, capped at 2.0) that reads as a rank bonus.
import { clamp } from './random.js';
import {
  EVENT_BUSTED, EVENT_JOB, EVENT_MISSION_DONE, EVENT_RACE, EVENT_WASTED,
} from './world-events.js';

// Base payout for each kind of clean success, before the streak multiplier.
export const STREAK_BASE_PAY = {
  mission: 50,
  job: 25,
  race: 40,
  bounty: 35,
};

// The biggest single streak bonus the game will ever pay.
export const STREAK_BONUS_CAP = 500;

// The streak level at which the HUD multiplier stops growing.
export const STREAK_MULTIPLIER_CAP_LEVEL = 10;

// The opening slice: no streak yet, no best yet, nothing earned yet.
export function createStreaks() {
  return {
    streak: 0,
    best: 0,
    earned: 0,
    lastBonus: 0,
    lastKind: '',
    successes: 0,
    lost: 0,
  };
}

// The HUD multiplier for a streak slice: 1 + 0.1 per level, capped at 2.0.
export function streakMultiplier(streaks) {
  if (!streaks) return 1;
  const level = Math.min(streaks.streak, STREAK_MULTIPLIER_CAP_LEVEL);
  return 1 + level * 0.1;
}

// The cash bonus for finishing one success of a kind at a given streak:
// base pay times the streak, capped so long runs stay sane.
export function streakBonusFor(kind, streak) {
  const base = STREAK_BASE_PAY[kind] || STREAK_BASE_PAY.job;
  return Math.min(base * Math.max(1, streak), STREAK_BONUS_CAP);
}

// One line for the HUD badge: "Streak x3 · x1.3".
export function streakLabel(streaks) {
  if (!streaks) return '';
  return `Streak x${streaks.streak} · x${streakMultiplier(streaks).toFixed(1)}`;
}

// Which kind of success an event bitmask carries, if any. A frame can only
// hold one kind — a mission finish beats a job finish beats a race win —
// so the first match wins and the streak climbs by exactly one.
function successKind(events) {
  if (events & EVENT_MISSION_DONE) return 'mission';
  if (events & EVENT_JOB) return 'job';
  if (events & EVENT_RACE) return 'race';
  return '';
}

// Advance the streaks one frame from the event bitmask the world step has
// built up. Busted or wasted resets the streak first and pays nothing, even
// if a success landed in the same frame — getting caught voids the run.
// A success raises the streak, pays the bonus straight into the player's
// pocket, and announces it with a toast. Returns 0: the toast and the cash
// are the whole effect, no new event flag is needed.
export function stepStreaks(state, events) {
  const s = state.streaks;
  if (!s) return 0;
  if (events & (EVENT_BUSTED | EVENT_WASTED)) {
    if (s.streak >= 2) {
      state.toast = `Streak x${s.streak} lost — the heat got you.`;
      state.toastTimer = 3;
    }
    if (s.streak > 0) s.lost += 1;
    s.streak = 0;
    s.lastBonus = 0;
    s.lastKind = '';
    return 0;
  }
  const kind = successKind(events);
  if (!kind) return 0;
  s.streak += 1;
  s.best = Math.max(s.best, s.streak);
  s.successes += 1;
  const bonus = streakBonusFor(kind, s.streak);
  s.lastBonus = bonus;
  s.lastKind = kind;
  s.earned += bonus;
  const p = state.player;
  p.money += bonus;
  state.stats.cashEarned += bonus;
  const kindWord = kind === 'mission' ? 'Mission clean' : kind === 'job' ? 'Job clean' : 'Race won';
  state.toast = `${kindWord}! Streak x${s.streak} — bonus +$${bonus}.`;
  state.toastTimer = 3;
  return 0;
}

// How close the streak is to its best, for the pause screen.
export function streakSummary(streaks) {
  if (!streaks) return 'No streak yet — finish a job clean to start one.';
  if (streaks.streak === 0) {
    return `Best streak x${streaks.best} · $${streaks.earned} earned from streaks`;
  }
  return `Streak x${streaks.streak} (best x${streaks.best}) · $${streaks.earned} earned from streaks`;
}

// Reset the slice without touching the best — used when a save is loaded
// fresh and the run should start clean but the record should stand.
export function resetStreakRun(streaks) {
  if (!streaks) return;
  streaks.streak = 0;
  streaks.lastBonus = 0;
  streaks.lastKind = '';
}
