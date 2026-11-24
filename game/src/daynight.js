// SOLMAR HEAT — written via write tool
// The day/night cycle: one full Solmar day lasts a few hundred seconds of play,
// the light follows the hour, and the HUD clock tells the player which day it
// is. Visual only — the cycle never changes wanted levels, police behaviour or
// mission rules, so a night drive plays exactly like a day drive, only darker.
//
// The day is measured as a fraction where 0 is dawn, 0.25 is midday, 0.5 is
// dusk and 0.75 is the middle of the night. The world clock already runs in
// hours (0–24), so the fraction is the clock shifted so that 06:00 lands on 0.
import { clamp } from './random.js';

// One in-game day, in seconds of play. The world clock advances 24 hours over
// this many seconds, so a day here is a long drive, not a blink.
export const DAY_LENGTH_SECONDS = 900;

// The hours that bound the night, matching the 3D renderer's own switch.
export const NIGHT_START_HOUR = 19.5;
export const NIGHT_END_HOUR = 5;

// Clock hour (0–24) -> day fraction (0 = dawn, 0.25 = noon, 0.5 = dusk,
// 0.75 = midnight). Dawn is 06:00, so the shift is six hours.
export function dayFrac(clock) {
  const shifted = (((clock - 6) % 24) + 24) % 24;
  return shifted / 24;
}

// Day fraction -> clock hour, the inverse of dayFrac.
export function fracToClock(frac) {
  return (((frac * 24 + 6) % 24) + 24) % 24;
}

// Brightness for a day fraction: 1.0 at midday, sliding down to about 0.45
// at midnight, then back up toward dawn. A cosine keeps the change smooth,
// so the light never jumps from one frame to the next.
export function brightnessAt(frac) {
  const angle = (frac - 0.25) * Math.PI * 2;
  return 0.725 + 0.275 * Math.cos(angle);
}

// Warmth for a day fraction: near 1 at dawn and at dusk, near 0 at noon and
// at midnight. The renderer tints the scene orange with this, so sunrises
// and sunsets over the bay glow instead of just dimming.
export function warmthAt(frac) {
  const near = (centre) => {
    let d = Math.abs(frac - centre);
    if (d > 0.5) d = 1 - d;
    return Math.exp(-((d / 0.07) ** 2));
  };
  return clamp(Math.max(near(0), near(0.5)), 0, 1);
}

// True while the city is in its night hours: from 19:30 until 05:00.
export function isNightAt(frac) {
  return frac >= dayFrac(NIGHT_START_HOUR) && frac <= dayFrac(NIGHT_END_HOUR);
}

// True in the golden hour around dawn or dusk.
export function isGoldenHourAt(frac) {
  return warmthAt(frac) > 0.45;
}

// A plain name for the time of day, for the HUD and for toasts.
export function phaseName(frac) {
  if (frac < 0.06 || frac > 0.94) return 'Dawn';
  if (frac < 0.19) return 'Morning';
  if (frac < 0.31) return 'Midday';
  if (frac < 0.44) return 'Afternoon';
  if (frac < 0.56) return 'Dusk';
  if (frac < 0.69) return 'Evening';
  return 'Night';
}

// The opening slice of the cycle: day one, mid-morning, full daylight.
export function createDayNight() {
  const startClock = 9.5;
  const frac = dayFrac(startClock);
  return {
    frac,
    day: 1,
    brightness: brightnessAt(frac),
    warm: warmthAt(frac),
    night: isNightAt(frac),
    phase: phaseName(frac),
    prevClock: startClock,
    nightsSeen: 0,
  };
}

// "Day 2 — 21:40": the day counter plus the clock in 24-hour form.
export function clockLabel(daynight, clock) {
  const hh = Math.floor(clock);
  const mm = Math.floor((clock - hh) * 60);
  const day = daynight ? daynight.day : 1;
  return `Day ${day} — ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Advance the cycle one frame. The world clock is the source of truth: the
// fraction, brightness and warmth are all derived from it, and the day
// counter ticks up each time the clock wraps past midnight.
export function stepDayNight(ctx) {
  const { state } = ctx;
  const dn = state.daynight;
  if (!dn) return;
  const clock = state.clock;
  if (clock < dn.prevClock) {
    dn.day += 1;
  }
  dn.prevClock = clock;
  dn.frac = dayFrac(clock);
  dn.brightness = brightnessAt(dn.frac);
  dn.warm = warmthAt(dn.frac);
  const wasNight = dn.night;
  dn.night = isNightAt(dn.frac);
  const phase = phaseName(dn.frac);
  if (phase !== dn.phase) {
    dn.phase = phase;
    if (dn.night && !wasNight) {
      dn.nightsSeen += 1;
      state.toast = 'Night falls over Solmar Bay — the streets light up.';
      state.toastTimer = 3;
    } else if (!dn.night && wasNight) {
      state.toast = `Dawn breaks over Solmar Bay — Day ${dn.day}.`;
      state.toastTimer = 3;
    }
  }
}

// How dark the 2D overlay should be: 0 in full daylight, up to about 0.3
// at midnight, so the HUD tint never swallows the scene.
export function overlayDarkness(daynight) {
  if (!daynight) return 0;
  return clamp((1 - daynight.brightness) * 0.55, 0, 0.32);
}

// The fraction of the day that has passed, for save screens and debug.
export function dayProgress(daynight) {
  if (!daynight) return 0;
  return clamp(daynight.frac, 0, 1);
}
