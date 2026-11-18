// The screenshot scenes behind ?shot=title|chase|mission|night. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (drive along the road grid toward the objective, walk toward the marker),
// so the frame is what a real game looks like and the same seed always gives the same
// frame. The night scene sets the clock to 21:30 for headlights and lit windows.
import { PLACES, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;
const TITLE_SECONDS = 6;
const CHASE_SECONDS = 26;
const MISSION_SECONDS = 3;
const NIGHT_SECONDS = 22;

/** Drive control steering toward a point 400 px ahead on the current road. */
function driveControl(world) {
  const p = world.state.player;
  const car = p.inCar;
  if (!car) return { up: false, down: false, left: false, right: false };
  const roadXs = [300, 750, 1200, 1650, 2100, 2550, 3000, 3450];
  const roadYs = [200, 650, 1100, 1550, 2000, 2450];
  let nearestX = roadXs[0];
  let nearestY = roadYs[0];
  for (const x of roadXs) if (Math.abs(x - car.x) < Math.abs(nearestX - car.x)) nearestX = x;
  for (const y of roadYs) if (Math.abs(y - car.y) < Math.abs(nearestY - car.y)) nearestY = y;
  const horizontal = Math.abs(car.y - nearestY) < Math.abs(car.x - nearestX);
  let tx;
  let ty;
  if (horizontal) {
    tx = car.x + Math.cos(car.angle) * 420;
    ty = nearestY;
  } else {
    tx = nearestX;
    ty = car.y + Math.sin(car.angle) * 420;
  }
  const want = Math.atan2(ty - car.y, tx - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return {
    up: true,
    down: false,
    left: diff < -0.12,
    right: diff > 0.12,
    brake: Math.abs(diff) > 1.4,
    sprint: false,
  };
}

/** A driver that loops a rectangle of road corners, so a chase never runs out of road.
 * It drives to each corner itself (never cutting across a block), slows before the
 * turn, and only then swings round — so it stays on the asphalt. */
function makeLoopDriver(corners) {
  let corner = 0;
  return function loopControl(world) {
    const p = world.state.player;
    const car = p.inCar;
    if (!car) return { up: false, down: false, left: false, right: false };
    const target = corners[corner];
    const distToCorner = Math.hypot(target.x - car.x, target.y - car.y);
    if (distToCorner < 55) {
      corner = (corner + 1) % corners.length;
    }
    const next = corners[corner];
    const want = Math.atan2(next.y - car.y, next.x - car.x);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const nearCorner = Math.hypot(next.x - car.x, next.y - car.y) < 140;
    const speedCap = nearCorner ? 190 : 340;
    // Throttle whenever the car is nearly stopped: at speed 0 the steering does
    // nothing, so a stopped car facing the wrong way must creep forward to turn.
    // Brake only while actually moving fast into a sharp turn.
    return {
      up: (Math.abs(diff) < 0.6 || Math.abs(car.speed) < 70) && Math.abs(car.speed) < speedCap,
      down: false,
      left: diff < -0.1,
      right: diff > 0.1,
      brake: Math.abs(diff) > 1.2 && Math.abs(car.speed) > 90,
      sprint: false,
    };
  };
}

/** On-foot control walking toward a target point. */
function walkControl(world, tx, ty) {
  const p = world.state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  return {
    up: dy < -12,
    down: dy > 12,
    left: dx < -12,
    right: dx > 12,
    sprint: true,
  };
}

function putPlayerInCar(world, defId) {
  const p = world.state.player;
  const car = world.state.cars.find((c) => c.def.id === defId && !c.police)
    || world.state.cars.find((c) => !c.police && !c.traffic);
  if (!car) return;
  car.x = p.x + 40;
  car.y = p.y;
  car.angle = 0;
  car.speed = 60;
  car.traffic = false;
  car.driver = false;
  // A staged chase car is sturdy: the frame must show a chase, not a wreck.
  car.hp = 1000;
  p.inCar = car;
}

/**
 * Set `world` to the named scene (title, chase, mission or night; any other name is
 * title) and return the screen to draw over it and the save to show on the title.
 */
export function stageShot(name, world) {
  world.reset();
  const st = world.state;
  if (name !== 'chase' && name !== 'mission' && name !== 'night') {
    for (let i = 0; i < TITLE_SECONDS / SAMPLE; i += 1) {
      world.step(SAMPLE, { up: false, down: false, left: false, right: false });
    }
    return { screen: SCREEN_TITLE, save: null };
  }
  if (name === 'chase') {
    // Golden-hour police chase: 3 stars, a fast car, sirens behind, looping a block.
    st.clock = 17.6;
    st.fareTimer = 9999;
    st.player.x = 1200;
    st.player.y = 1100;
    putPlayerInCar(world, 'sport');
    world.addWanted(3);
    // First Wheels is live: steal done, the deli beacon shows a mission in progress.
    world.startMission(0);
    const drive = makeLoopDriver([
      { x: 1650, y: 1100 }, { x: 1650, y: 1550 },
      { x: 1200, y: 1550 }, { x: 1200, y: 1100 },
    ]);
    for (let i = 0; i < CHASE_SECONDS / SAMPLE; i += 1) {
      world.step(SAMPLE, drive(world));
      if (st.gameOver) break;
    }
    return { screen: SCREEN_PLAY, save: null };
  }
  if (name === 'mission') {
    // Dockside Deal on foot: Mara at the south docks, crate marker ahead, 2 stars.
    st.fareTimer = 9999;
    world.startMission(4);
    st.player.x = 520;
    st.player.y = 2220;
    st.player.angle = Math.PI / 2;
    for (let i = 0; i < MISSION_SECONDS / SAMPLE; i += 1) {
      const step = world.currentStep();
      if (step && step.x !== undefined) {
        world.step(SAMPLE, walkControl(world, step.x, step.y));
      } else {
        world.step(SAMPLE, { up: false, down: false, left: false, right: false });
      }
      if (st.gameOver) break;
    }
    return { screen: SCREEN_PLAY, save: null };
  }
  // Night: 3-star chase through downtown under lit windows, looping a block.
  st.clock = 21.5;
  st.fareTimer = 9999;
  st.player.x = 2100;
  st.player.y = 650;
  putPlayerInCar(world, 'muscle');
  world.addWanted(3);
  // The Harbor Heist is live: the bank beacon and the escape objective show.
  world.startMission(5);
  const nightDrive = makeLoopDriver([
    { x: 2550, y: 650 }, { x: 2550, y: 1100 },
    { x: 2100, y: 1100 }, { x: 2100, y: 650 },
  ]);
  for (let i = 0; i < NIGHT_SECONDS / SAMPLE; i += 1) {
    world.step(SAMPLE, nightDrive(world));
    if (st.gameOver) break;
  }
  return { screen: SCREEN_PLAY, save: null };
}
