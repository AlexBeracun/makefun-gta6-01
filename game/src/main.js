// SOLMAR HEAT — rewritten via write tool
// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. Screens: title, play, missions, paused,
// busted/wasted, and story complete. Autosaves after every mission.
//
// Gameplay systems (10): open-world driving and carjacking; the 5-star wanted
// system with police, foot cops and the helicopter; story missions; courier
// jobs and vigilante bounties; ranks, XP and mission combos; the weather
// cycle; chase, tail and survive mission steps; street races and ambushes;
// police escalation with roadblocks and undercover units; nitro, vehicle
// handling and rotating street challenges.
//
// ?seed=N fixes the city. ?shot=chase|heli|mission|beach (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import { MISSIONS, SAVE_KEY, SEED, STEP } from './config.js';
import { createWorld, EVENT_BUSTED, EVENT_CHALLENGE, EVENT_JOB, EVENT_MISSION_DONE, EVENT_MISSION_FAIL, EVENT_RACE, EVENT_WASTED } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer, SCREEN_MISSIONS, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : SEED;

const canvas = document.getElementById('game');
const hudCanvas = document.getElementById('hud');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas, hudCanvas);
const audio = createAudio();
// A read handle for play-testing (the finalist review can inspect the live state).
window.__world = world;

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.save);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = world.load();
  let accumulator = 0;
  let last = performance.now();
  let autoStartAt = 0;
  let winShown = false;
  let saveTimer = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    if (save) world.applySave(save);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startMusic();
    autoStartAt = world.state.elapsed + 1;
    winShown = world.state.storyDone;
    announce('Playing Solmar Heat. Press M for missions.');
  }

  function backToTitle() {
    screen = SCREEN_TITLE;
    save = world.load();
    announce('Solmar Heat. Press Enter to play.');
  }

  function handleEvents(events) {
    if (events & EVENT_MISSION_DONE) {
      audio.mission();
      audio.cash();
      world.save();
      save = world.load();
      autoStartAt = world.state.elapsed + 2;
      if (world.state.storyDone && !winShown) {
        winShown = true;
        screen = SCREEN_WIN;
      }
    }
    if (events & EVENT_MISSION_FAIL) {
      audio.busted();
      autoStartAt = world.state.elapsed + 10;
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      screen = SCREEN_OVER;
      announce('Busted by the Solmar Bay Police.');
    }
    if (events & EVENT_WASTED) {
      audio.busted();
      screen = SCREEN_OVER;
      announce('Wasted in Solmar Bay.');
    }
    // Jobs, races and challenges get their own little jingle.
    if (events & (EVENT_JOB | EVENT_RACE | EVENT_CHALLENGE)) {
      audio.event();
    }
  }

  function buildControl() {
    const p = world.state.player;
    const shooting = input.mouse.down && p.ammo > 0 && !p.inCar;
    const aim = shooting ? renderer.screenToWorld(input.mouse.x, input.mouse.y) : null;
    return {
      up: input.down('w', 'arrowup'),
      down: input.down('s', 'arrowdown'),
      left: input.down('a', 'arrowleft'),
      right: input.down('d', 'arrowright'),
      sprint: input.down('shift'),
      enter: input.wasPressed('e'),
      job: input.wasPressed('j'),
      punch: input.wasPressed(' '),
      brake: input.down(' '),
      shooting,
      shootX: aim ? aim.x : undefined,
      shootY: aim ? aim.y : undefined,
    };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    // Screen switches.
    if (input.wasPressed('enter') || input.mouse.clicked) {
      audio.unlock();
      if (screen === SCREEN_TITLE) startGame();
      else if (screen === SCREEN_OVER) {
        world.respawn();
        screen = SCREEN_PLAY;
      } else if (screen === SCREEN_WIN) screen = SCREEN_PLAY;
    }
    if (input.wasPressed('p', 'escape')) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED || screen === SCREEN_MISSIONS) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (input.wasPressed('m')) {
      if (screen === SCREEN_PLAY) screen = SCREEN_MISSIONS;
      else if (screen === SCREEN_MISSIONS) screen = SCREEN_PLAY;
    }
    if (input.wasPressed('r') && screen === SCREEN_OVER) {
      world.respawn();
      screen = SCREEN_PLAY;
    }
    if (input.wasPressed('t')) {
      const saveNow = world.load();
      if (saveNow) {
        world.applySave(saveNow);
        announce('Loaded save.');
      }
    }

    if (screen === SCREEN_PLAY) {
      // Build the control once per frame: buildControl() reads edge-triggered
      // keys (E / Space) that stay true until endFrame(), so rebuilding it
      // per sim step toggled enter/exit twice in one frame whenever the slow
      // 3D renderer let a frame contain 2+ fixed steps (E entered the car,
      // then immediately exited it again). Clear the edge fields after the
      // first step so each press fires exactly once per frame.
      const ctrl = buildControl();
      while (accumulator >= STEP) {
        const events = world.step(STEP, ctrl);
        handleEvents(events);
        accumulator -= STEP;
        ctrl.enter = false;
        ctrl.punch = false;
        ctrl.job = false;
        if (screen !== SCREEN_PLAY) break;
      }
      // Auto-start the next story mission once the player is settled.
      const st = world.state;
      if (screen === SCREEN_PLAY && !st.mission && !st.gameOver
        && st.missionIndex < MISSIONS.length && st.elapsed >= autoStartAt) {
        world.startMission(st.missionIndex);
      }
      // Engine + siren follow the game.
      const p = st.player;
      audio.setEngine(p.inCar ? Math.abs(p.inCar.speed) / p.inCar.def.speed : 0, !!p.inCar);
      audio.setSiren(st.wanted > 0, st.elapsed);
      saveTimer += 1;
      if (saveTimer > 1800) {
        saveTimer = 0;
        world.save();
      }
    } else if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        world.step(STEP, { up: false, down: false, left: false, right: false });
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      audio.setEngine(0, false);
      audio.setSiren(false, 0);
    }

    renderer.draw(world.state, screen, save);
    input.endFrame();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      world.save();
      announce('Paused.');
    }
  });
  window.addEventListener('beforeunload', () => world.save());

  announce('Solmar Heat. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
