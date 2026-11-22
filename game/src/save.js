// The save: one localStorage row with the player's money, ammo, health, mission
// progress, position, clock and stats. Written after every mission and every 30
// seconds of play; read back on the title screen so a saved game continues.
import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const p = state.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: p.money, ammo: p.ammo, health: p.health,
      missionIndex: state.missionIndex, storyDone: state.storyDone,
      x: p.x, y: p.y, clock: state.clock, stats: state.stats,
    }));
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function applySave(state, data) {
  if (!data) return false;
  const p = state.player;
  p.money = data.money ?? 250;
  p.ammo = data.ammo ?? 24;
  p.health = data.health ?? 100;
  p.x = data.x ?? 1150;
  p.y = data.y ?? 1000;
  state.missionIndex = data.missionIndex ?? 0;
  state.storyDone = !!data.storyDone;
  state.clock = data.clock ?? 9.5;
  if (data.stats) state.stats = data.stats;
  state.cam.x = p.x;
  state.cam.y = p.y;
  return true;
}
