// SOLMAR HEAT — written via write tool
// The car radio: three Solmar stations, each with its own mood and tempo,
// switched with R while playing. The station name rides in the HUD next to
// the clock, with a little dot that pulses on the station's beat. Switching
// plays a short jingle (the audio side lives in audio.js) and the world
// answers with a toast, so the player always knows what is on.
//
// The radio never touches the music loop or the engine sound — it is a
// station selector and a HUD readout, not a second soundtrack.
import { EVENT_RADIO } from './world-events.js';

// The dial, in order. Tempo is beats per minute: the HUD dot throbs once
// per beat, so the pop station feels twice as busy as the lo-fi one.
export const STATIONS = [
  {
    id: 'solmar-fm', name: 'SOLMAR FM 98.5', mood: 'Sunny pop', bpm: 128, color: '#ffd23e',
  },
  {
    id: 'rock-bay', name: 'ROCK BAY 101.1', mood: 'Hard rock', bpm: 142, color: '#ff6b6b',
  },
  {
    id: 'midnight-lofi', name: 'MIDNIGHT LO-FI 88.9', mood: 'Late-night lo-fi', bpm: 72, color: '#7ee7f2',
  },
];

// The opening slice: the pop station, switched on at the start of the day.
export function createRadio() {
  return {
    index: 0,
    switchedAt: 0,
    switches: 0,
    lastHeard: 'solmar-fm',
  };
}

// The station the dial is on right now.
export function currentStation(radio) {
  if (!radio) return STATIONS[0];
  return STATIONS[radio.index % STATIONS.length];
}

// Just the name, for the HUD clock line and for the world's radio string.
export function stationName(radio) {
  return currentStation(radio).name;
}

// Just the mood line, for toasts: "ROCK BAY 101.1 — Hard rock".
export function stationLine(radio) {
  const st = currentStation(radio);
  return `${st.name} — ${st.mood}`;
}

// The pulse of the HUD dot, 0..1, throbbing once per beat of the current
// station. It starts at full brightness on the beat and fades to nothing
// just before the next one, so the dot visibly breathes with the music.
// Right after a switch it holds at full for a couple of seconds, a little
// glow that says "this station is on now".
export function radioPulse(radio, elapsed) {
  const st = currentStation(radio);
  if (!radio) return 0;
  if (elapsed - radio.switchedAt < 2) return 1;
  const beat = 60 / st.bpm;
  const phase = ((elapsed - radio.switchedAt) % beat) / beat;
  return 1 - phase;
}

// The colour of the current station, for the HUD dot.
export function stationColor(radio) {
  return currentStation(radio).color;
}

// Move the dial one station forward, wrapping back to the first after the
// last. Writes the toast, keeps the world's radio string in step, and
// returns EVENT_RADIO so the main loop can play the switch jingle.
export function nextStation(state) {
  const radio = state.radioSys;
  if (!radio) return 0;
  radio.index = (radio.index + 1) % STATIONS.length;
  radio.switchedAt = state.elapsed;
  radio.switches += 1;
  radio.lastHeard = currentStation(radio).id;
  state.radio = stationName(radio);
  state.toast = `Radio: ${stationLine(radio)}`;
  state.toastTimer = 2.5;
  return EVENT_RADIO;
}

// Jump straight to a station by id (used by the title screen's quick pick
// and by tests). Unknown ids leave the dial where it is.
export function tuneTo(state, id) {
  const radio = state.radioSys;
  if (!radio) return false;
  const at = STATIONS.findIndex((st) => st.id === id);
  if (at < 0) return false;
  radio.index = at;
  radio.switchedAt = state.elapsed;
  radio.switches += 1;
  radio.lastHeard = id;
  state.radio = stationName(radio);
  return true;
}

// Advance the radio one frame: R (edge-triggered in the control object)
// moves the dial. Nothing happens on any other frame, and the radio never
// changes station on its own.
export function stepRadio(ctx, ctrl) {
  const { state } = ctx;
  if (!state.radioSys) return 0;
  if (ctrl && ctrl.radio) return nextStation(state);
  return 0;
}

// How many times the player has changed station this session.
export function radioSwitchCount(radio) {
  return radio ? radio.switches : 0;
}
