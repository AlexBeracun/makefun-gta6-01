// SOLMAR HEAT — the weather cycle.
// Solmar Bay is not always sunny. The sky rolls through clear, rain and fog
// on a slow timer, and each kind of weather changes how the city drives:
// rain makes the roads slick (less grip for the player) and slows traffic
// down, fog grounds the police helicopter so a chase can be lost in the murk.
// The module owns state.weather and is stepped every frame by the world.
import { clamp, pick } from './random.js';

export const WEATHER_KINDS = ['clear', 'rain', 'fog'];
export const WEATHER_CLEAR = 'clear';
export const WEATHER_RAIN = 'rain';
export const WEATHER_FOG = 'fog';

// How long each kind of weather lasts before the sky rolls again.
export const WEATHER_MIN_SECONDS = 45;
export const WEATHER_MAX_SECONDS = 90;

// Grip the player keeps on each surface: rain takes a fifth of it away.
export const GRIP = { clear: 1, rain: 0.8, fog: 0.95 };
// Traffic slowdown: rain makes every other driver cautious too.
export const TRAFFIC_FACTOR = { clear: 1, rain: 0.72, fog: 0.85 };

export function createWeather() {
  return {
    kind: 'clear',
    timer: 60, // seconds until the next change
    changes: 0,
    rainTotal: 0, // seconds spent in rain, for the pause screen
    fogTotal: 0,
  };
}

export function weatherLabel(weather) {
  if (!weather) return 'Clear';
  if (weather.kind === 'rain') return 'Rain';
  if (weather.kind === 'fog') return 'Fog';
  return 'Clear';
}

export function gripFactor(weather) {
  if (!weather) return 1;
  return GRIP[weather.kind] ?? 1;
}

export function trafficFactor(weather) {
  if (!weather) return 1;
  return TRAFFIC_FACTOR[weather.kind] ?? 1;
}

// Fog grounds the helicopter: it cannot fly, so it never spawns and an
// airborne one is sent home.
export function heliGrounded(weather) {
  return !!weather && weather.kind === 'fog';
}

export function isRaining(weather) {
  return !!weather && weather.kind === 'rain';
}

export function stepWeather(ctx, dt) {
  const { state, rng } = ctx;
  const w = state.weather;
  if (!w) return;
  w.timer -= dt;
  if (w.kind === 'rain') w.rainTotal += dt;
  if (w.kind === 'fog') w.fogTotal += dt;
  if (w.timer > 0) return;
  // Roll a new kind, different from the one we just had.
  const options = WEATHER_KINDS.filter((k) => k !== w.kind);
  const next = pick(rng, options);
  w.kind = next;
  w.timer = WEATHER_MIN_SECONDS + rng() * (WEATHER_MAX_SECONDS - WEATHER_MIN_SECONDS);
  w.changes += 1;
  if (next === 'rain') {
    state.toast = 'Rain over Solmar Bay — roads are slick, grip is down.';
  } else if (next === 'fog') {
    state.toast = 'Fog rolling in — the police helicopter is grounded.';
  } else {
    state.toast = 'The sun is back out over Solmar Bay.';
  }
  state.toastTimer = 4;
}

// For tests and screenshots: force a kind of weather right now.
export function setWeather(state, kind) {
  if (!state.weather) return false;
  if (!WEATHER_KINDS.includes(kind)) return false;
  state.weather.kind = kind;
  state.weather.timer = 60;
  return true;
}

// How much of the game so far was wet or murky, 0..1.
export function badWeatherShare(weather) {
  if (!weather) return 0;
  const total = weather.rainTotal + weather.fogTotal;
  const span = Math.max(1, total + 60);
  return clamp(total / span, 0, 1);
}
