// Drawing only: the world's state and the current screen in, pixels out. Top-down
// open-world rendering: ocean and beach, road grid, buildings with lit windows, palm
// trees, traffic, pedestrians, police, mission beacons, and a full HUD with minimap.
import {
  CARS, COLORS, CONTROLS, GAME_TITLE, HERO_NAME, MISSIONS, PLACES, ROAD_GAP, ROAD_W,
  WORLD_H, WORLD_W,
} from './config.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_MISSIONS = 'missions';
export const SCREEN_WIN = 'win';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const VIEW_W = 1280;
const VIEW_H = 720;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, car) {
  const def = car.def;
  const len = def.len;
  const wid = def.wid;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, -len / 2 + 3, -wid / 2 + 4, len, wid, 7);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 7);
  ctx.fill();
  // Roof + windshield.
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  roundRect(ctx, -len / 2 + 10, -wid / 2 + 4, len * 0.42, wid - 8, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,240,0.7)';
  ctx.fillRect(len * 0.08, -wid / 2 + 4, 5, wid - 8);
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(len / 2 - 2, -wid / 2 + 2, 3, 5);
  ctx.fillRect(len / 2 - 2, wid / 2 - 7, 3, 5);
  // Taillights.
  ctx.fillStyle = '#c02020';
  ctx.fillRect(-len / 2, -wid / 2 + 2, 3, 5);
  ctx.fillRect(-len / 2, wid / 2 - 7, 3, 5);
  if (car.def.id === 'taxi') {
    ctx.fillStyle = '#222';
    ctx.fillRect(-6, -wid / 2 - 3, 14, 5);
  }
  if (car.police) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-len / 2 + 2, -wid / 2 + 1, len - 4, 4);
    ctx.fillRect(-len / 2 + 2, wid / 2 - 5, len - 4, 4);
    ctx.fillStyle = '#e8e4da';
    ctx.font = `bold 8px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('SBP', 0, 3);
  }
  ctx.restore();
}

function drawPedShape(ctx, ped, time) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.dead) {
    ctx.rotate(1.4);
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(12, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(time * 10 + ped.x) * 1.5;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body.
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, 7, 0, Math.PI * 2);
  ctx.fill();
  // Head.
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3 + bob * 0.3 - 2, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPalm(ctx, x, y, time) {
  const sway = Math.sin(time * 0.8 + x * 0.01) * 2;
  ctx.strokeStyle = COLORS.trunk;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 3, y - 14, x + 6 + sway, y - 26);
  ctx.stroke();
  ctx.fillStyle = COLORS.palm;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(x + 6 + sway + Math.cos(a) * 10, y - 26 + Math.sin(a) * 6, 11, 4, a, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW_W, height / VIEW_H);
    view.x = (width - VIEW_W * view.scale) / 2;
    view.y = (height - VIEW_H * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}:${weight || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function timeOfDayTint(state) {
    const h = state.clock;
    if (h >= 6 && h < 17) return null; // bright day
    if (h >= 17 && h < 19.5) return { color: 'rgba(255,120,40,0.14)', night: false };
    if (h >= 19.5 || h < 5) return { color: 'rgba(10,20,60,0.34)', night: true };
    return { color: 'rgba(255,170,80,0.10)', night: false };
  }

  function drawWorld(state) {
    const cam = state.cam;
    const camX = clamp(cam.x - VIEW_W / 2, 0, Math.max(0, WORLD_W - VIEW_W));
    const camY = clamp(cam.y - VIEW_H / 2, 0, Math.max(0, WORLD_H - VIEW_H));
    ctx.save();
    ctx.translate(-camX, -camY);
    const vx0 = camX - 80;
    const vy0 = camY - 80;
    const vx1 = camX + VIEW_W + 80;
    const vy1 = camY + VIEW_H + 80;

    // Ground: grass base.
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    // Ocean (west) + sand.
    ctx.fillStyle = COLORS.ocean;
    ctx.fillRect(vx0, vy0, 190 - vx0 > 0 ? 190 - vx0 : 0, vy1 - vy0);
    ctx.fillStyle = COLORS.oceanDeep;
    for (let y = Math.floor(vy0 / 90) * 90; y < vy1; y += 90) {
      ctx.fillRect(20, y + 20, 120, 6);
    }
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(190, vy0, 120, vy1 - vy0);
    // Wet sand line.
    ctx.fillStyle = '#d9c48a';
    ctx.fillRect(190, vy0, 14, vy1 - vy0);

    // Sidewalk blocks (the city floor between roads).
    ctx.fillStyle = COLORS.sidewalk;
    for (let i = 0; i < 8; i += 1) {
      for (let j = 0; j < 6; j += 1) {
        const x0 = 300 + i * ROAD_GAP + ROAD_W / 2;
        const y0 = 200 + j * ROAD_GAP + ROAD_W / 2;
        const x1 = 300 + (i + 1) * ROAD_GAP - ROAD_W / 2;
        const y1 = 200 + (j + 1) * ROAD_GAP - ROAD_W / 2;
        if (x1 < vx0 || y1 < vy0 || x0 > vx1 || y0 > vy1) continue;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }

    // Parks.
    for (const park of state.parks) {
      ctx.fillStyle = COLORS.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
    }

    // Roads.
    ctx.fillStyle = COLORS.road;
    for (let i = 0; i < 8; i += 1) {
      const x = 300 + i * ROAD_GAP;
      ctx.fillRect(x - ROAD_W / 2, vy0, ROAD_W, vy1 - vy0);
    }
    for (let j = 0; j < 6; j += 1) {
      const y = 200 + j * ROAD_GAP;
      ctx.fillRect(vx0, y - ROAD_W / 2, vx1 - vx0, ROAD_W);
    }
    // Lane dashes.
    ctx.fillStyle = COLORS.lane;
    for (let i = 0; i < 8; i += 1) {
      const x = 300 + i * ROAD_GAP;
      for (let y = Math.floor(vy0 / 46) * 46; y < vy1; y += 46) {
        ctx.fillRect(x - 2, y, 4, 22);
      }
    }
    for (let j = 0; j < 6; j += 1) {
      const y = 200 + j * ROAD_GAP;
      for (let x = Math.floor(vx0 / 46) * 46; x < vx1; x += 46) {
        ctx.fillRect(x, y - 2, 22, 4);
      }
    }

    // Buildings.
    const tint = timeOfDayTint(state);
    const night = tint && tint.night;
    for (const b of state.buildings) {
      if (b.x > vx1 || b.y > vy1 || b.x + b.w < vx0 || b.y + b.h < vy0) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // Roof edge.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x, b.y, b.w, 6);
      ctx.fillRect(b.x, b.y, 6, b.h);
      // Windows.
      const cols = Math.max(2, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const lit = night ? ((cx * 7 + cy * 13 + b.floors) % 3 === 0) : ((cx + cy) % 4 === 0);
          ctx.fillStyle = lit ? (night ? '#ffd76a' : '#bfe3f2') : 'rgba(20,30,45,0.55)';
          ctx.fillRect(b.x + 10 + cx * ((b.w - 20) / cols), b.y + 10 + cy * ((b.h - 20) / rows), 12, 12);
        }
      }
      if (b.tall) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, 4);
      }
    }

    // Palms.
    for (const palm of state.palms) {
      if (palm.x < vx0 || palm.x > vx1 || palm.y < vy0 || palm.y > vy1) continue;
      drawPalm(ctx, palm.x, palm.y, state.elapsed);
    }

    // Pickups.
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      const bob = Math.sin(pk.bob * 3) * 3;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.kind === 'cash') {
        ctx.fillStyle = '#2fae5f';
        roundRect(ctx, -11, -7, 22, 14, 3);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 11px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, 4);
      } else if (pk.kind === 'health') {
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, -10, -10, 20, 20, 4);
        ctx.fill();
        ctx.fillStyle = '#d94f4f';
        ctx.fillRect(-3, -8, 6, 16);
        ctx.fillRect(-8, -3, 16, 6);
      } else {
        ctx.fillStyle = '#f2c94c';
        roundRect(ctx, -10, -7, 20, 14, 3);
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.font = `bold 9px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('AMMO', 0, 3);
      }
      ctx.restore();
    }

    // Mission beacon + objective markers.
    drawObjective(state, camX, camY);

    // Service markers (spray, ammo, hospital, safehouse).
    drawServiceMarkers(state);

    // Cars (traffic + police + player car last).
    for (const car of state.cars) {
      if (car === state.player.inCar) continue;
      if (car.x < vx0 || car.x > vx1 || car.y < vy0 || car.y > vy1) continue;
      drawCarShape(ctx, car);
      if (car.police) drawSiren(ctx, car, state.elapsed);
      if (car.hp < 40 && car.hp > 0) {
        ctx.fillStyle = 'rgba(80,80,80,0.5)';
        ctx.beginPath();
        ctx.arc(car.x - 8, car.y - 8, 8 + Math.sin(state.elapsed * 6) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Pedestrians.
    for (const ped of state.peds) {
      if (ped.x < vx0 || ped.x > vx1 || ped.y < vy0 || ped.y > vy1) continue;
      drawPedShape(ctx, ped, state.elapsed);
      if (ped.fare) {
        ctx.fillStyle = '#f2c94c';
        ctx.font = `bold 16px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('!', ped.x, ped.y - 18 + Math.sin(state.elapsed * 4) * 3);
      }
    }
    // Cops on foot.
    for (const cop of state.cops) {
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 4, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1c2733';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8b4a0';
      ctx.beginPath();
      ctx.arc(Math.cos(cop.angle) * 3, Math.sin(cop.angle) * 3 - 2, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d9d9d9';
      ctx.fillRect(-6, -11, 12, 3);
      ctx.restore();
    }
    // Bullets.
    ctx.fillStyle = '#ffe9a8';
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Particles.
    for (const pt of state.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Player.
    const p = state.player;
    if (p.inCar) {
      drawCarShape(ctx, p.inCar);
      if (p.inCar.police) drawSiren(ctx, p.inCar, state.elapsed);
    } else {
      drawPedShape(ctx, { x: p.x, y: p.y, angle: p.angle, skin: '#c98a5a', shirt: '#e84c6c', dead: false }, state.elapsed);
      // A ring under the hero, so the player is easy to spot on foot.
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      // Direction tick.
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.angle) * 10, p.y + Math.sin(p.angle) * 10);
      ctx.lineTo(p.x + Math.cos(p.angle) * 18, p.y + Math.sin(p.angle) * 18);
      ctx.stroke();
    }

    // Night / dusk tint over everything.
    if (tint) {
      ctx.fillStyle = tint.color;
      ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    }
    ctx.restore();
    return { camX, camY };
  }

  function drawSiren(ctx, car, time) {
    const on = Math.floor(time * 4) % 2 === 0;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = on ? '#ff2e2e' : '#2e6bff';
    ctx.beginPath();
    ctx.arc(-4, -6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = on ? '#2e6bff' : '#ff2e2e';
    ctx.beginPath();
    ctx.arc(-4, 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function objectiveTarget(state) {
    const m = state.mission;
    if (!m) {
      if (state.fare) {
        return state.fare.stage === 'pickup'
          ? { x: state.fare.ped.x, y: state.fare.ped.y, label: 'Pick up the fare' }
          : { x: state.fare.destX, y: state.fare.destY, label: 'Drop off the passenger' };
      }
      return null;
    }
    const def = MISSIONS[m.index];
    const step = def.steps[m.step];
    if (!step) return null;
    if (step.type === 'steal') return { x: state.player.x, y: state.player.y, label: step.text, self: true };
    if (step.type === 'wanted' || step.type === 'clear') return { x: state.player.x, y: state.player.y, label: step.text, self: true };
    if (step.type === 'escape') return { x: step.x, y: step.y, label: step.text };
    return { x: step.x, y: step.y, label: step.text };
  }

  function drawObjective(state, camX, camY) {
    const target = objectiveTarget(state);
    if (!target || target.self) return;
    const pulse = 1 + Math.sin(state.elapsed * 4) * 0.12;
    const r = 26 * pulse;
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(target.x, target.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(242,201,76,0.25)';
    ctx.beginPath();
    ctx.arc(target.x, target.y, r, 0, Math.PI * 2);
    ctx.fill();
    // Beacon pillar.
    const grad = ctx.createLinearGradient(target.x, target.y - 160, target.x, target.y);
    grad.addColorStop(0, 'rgba(242,201,76,0)');
    grad.addColorStop(1, 'rgba(242,201,76,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(target.x - 10, target.y - 160, 20, 160);
    ctx.fillStyle = '#f2c94c';
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('▼', target.x, target.y - 34);
  }

  function drawServiceMarkers(state) {
    const marks = [
      { ...PLACES.sprayShop, color: '#2ec4b6', letter: 'S' },
      { ...PLACES.ammoShop, color: '#f2c94c', letter: 'A' },
      { ...PLACES.hospital, color: '#ffffff', letter: 'H' },
      { ...PLACES.safehouse, color: '#4fd07a', letter: '⌂' },
    ];
    for (const mark of marks) {
      ctx.fillStyle = mark.color;
      ctx.beginPath();
      ctx.arc(mark.x, mark.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(mark.letter, mark.x, mark.y + 4);
    }
  }

  function drawHud(state, screen) {
    const p = state.player;
    // Top-left: money + health.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, 14, 12, 250, 64, 10);
    ctx.fill();
    ctx.fillStyle = '#7ee787';
    text(`$${Math.floor(p.money).toLocaleString('en-US')}`, 28, 40, 26, '#7ee787', 'left', 'bold');
    // Health bar.
    ctx.fillStyle = '#333';
    roundRect(ctx, 28, 50, 150, 12, 6);
    ctx.fill();
    ctx.fillStyle = p.health > 40 ? '#4fd07a' : '#d94f4f';
    roundRect(ctx, 28, 50, 150 * clamp(p.health / 100, 0, 1), 12, 6);
    ctx.fill();
    text('HP', 186, 61, 12, '#fff');
    text(`Ammo ${p.ammo}`, 214, 61, 12, '#fff');
    // Top-right: wanted stars + clock.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, VIEW_W - 268, 12, 254, 64, 10);
    ctx.fill();
    for (let i = 0; i < 5; i += 1) {
      text('★', VIEW_W - 248 + i * 26, 44, 24, i < state.wanted ? '#ffd23e' : 'rgba(255,255,255,0.25)', 'left', 'bold');
    }
    const hh = Math.floor(state.clock);
    const mm = Math.floor((state.clock - hh) * 60);
    text(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ${state.radio}`, VIEW_W - 28, 66, 13, '#fff', 'right');
    // Objective banner.
    const target = objectiveTarget(state);
    const missionText = state.mission
      ? `${MISSIONS[state.mission.index].title}: ${MISSIONS[state.mission.index].steps[state.mission.step].text}`
      : target ? target.label : (state.storyDone ? 'Free roam — fares pay $150. Press M for missions.' : 'Press M for missions — Dee has work for you.');
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const bannerW = Math.min(720, 40 + missionText.length * 7.2);
    roundRect(ctx, (VIEW_W - bannerW) / 2, 12, bannerW, 34, 8);
    ctx.fill();
    text(missionText, VIEW_W / 2, 35, 15, '#ffe9a8', 'center', 'bold');
    if (state.missionTimer > 0) {
      text(`${Math.ceil(state.missionTimer)}s`, VIEW_W / 2, 62, 18, state.missionTimer < 15 ? '#ff6b6b' : '#fff', 'center', 'bold');
    }
    // Toast.
    if (state.toastTimer > 0 && state.toast) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const tw = Math.min(760, 40 + state.toast.length * 6.4);
      roundRect(ctx, (VIEW_W - tw) / 2, 92, tw, 30, 8);
      ctx.fill();
      text(state.toast, VIEW_W / 2, 113, 14, '#fff', 'center');
    }
    // Bottom-left: context hint / speed.
    if (p.inCar) {
      const kmh = Math.round(Math.abs(p.inCar.speed) * 0.36);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, 14, VIEW_H - 66, 190, 52, 10);
      ctx.fill();
      text(`${kmh} km/h`, 28, VIEW_H - 30, 26, '#fff', 'left', 'bold');
      text(p.inCar.def.name, 158, VIEW_H - 30, 13, '#ccc');
      if (p.inCar.hp < 100) {
        text(`Damage ${Math.max(0, Math.round(p.inCar.hp))}%`, 28, VIEW_H - 14, 11, '#ffb3b3');
      }
    } else {
      text('E: enter car   Space: punch   Click: shoot', 18, VIEW_H - 18, 13, 'rgba(255,255,255,0.85)');
    }
    // Wanted flash.
    if (state.wanted > 0 && Math.floor(state.elapsed * 2) % 2 === 0) {
      text('WANTED', VIEW_W / 2, 130, 16, '#ff6b6b', 'center', 'bold');
    }
    drawMinimap(state);
    // Off-screen objective arrow.
    if (target && !target.self) {
      const camX = clamp(state.cam.x - VIEW_W / 2, 0, Math.max(0, WORLD_W - VIEW_W));
      const camY = clamp(state.cam.y - VIEW_H / 2, 0, Math.max(0, WORLD_H - VIEW_H));
      const sx = target.x - camX;
      const sy = target.y - camY;
      if (sx < 0 || sx > VIEW_W || sy < 0 || sy > VIEW_H) {
        const cx = VIEW_W / 2;
        const cy = VIEW_H / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const ax = cx + Math.cos(a) * 260;
        const ay = cy + Math.sin(a) * 180;
        const d = Math.round(Math.hypot(target.x - p.x, target.y - p.y));
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(a);
        ctx.fillStyle = '#f2c94c';
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-8, -10);
        ctx.lineTo(-8, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        text(`${d}m`, ax, ay + 26, 12, '#f2c94c', 'center', 'bold');
      }
    }
  }

  function drawMinimap(state) {
    const mw = 190;
    const mh = 138;
    const mx = VIEW_W - mw - 14;
    const my = VIEW_H - mh - 14;
    const sx = mw / WORLD_W;
    const sy = mh / WORLD_H;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, mx - 4, my - 4, mw + 8, mh + 8, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    // Ocean + sand.
    ctx.fillStyle = COLORS.ocean;
    ctx.fillRect(mx, my, 190 * sx, mh);
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(mx + 190 * sx, my, 120 * sx, mh);
    ctx.fillStyle = '#3d3a44';
    for (let i = 0; i < 8; i += 1) ctx.fillRect(mx + (300 + i * ROAD_GAP) * sx - 1, my, 2, mh);
    for (let j = 0; j < 6; j += 1) ctx.fillRect(mx, my + (200 + j * ROAD_GAP) * sy - 1, mw, 2);
    // Buildings.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const b of state.buildings) ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
    // Objective.
    const target = objectiveTarget(state);
    if (target && !target.self) {
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.arc(mx + target.x * sx, my + target.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police.
    ctx.fillStyle = '#2e6bff';
    for (const car of state.cars) {
      if (car.police) {
        ctx.beginPath();
        ctx.arc(mx + car.x * sx, my + car.y * sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Player arrow.
    const p = state.player;
    ctx.save();
    ctx.translate(mx + p.x * sx, my + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -4);
    ctx.lineTo(-5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    text('SOLMAR BAY', mx + mw / 2, my - 8, 11, '#fff', 'center', 'bold');
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = 640;
    const lineH = 30;
    const h = 150 + lines.length * lineH + 70;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    ctx.fillStyle = 'rgba(10,14,24,0.88)';
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = accent || '#f2c94c';
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, 14);
    ctx.stroke();
    text(title, VIEW_W / 2, y + 64, 40, accent || '#f2c94c', 'center', 'bold');
    lines.forEach((line, i) => {
      text(line, VIEW_W / 2, y + 118 + i * lineH, 17, '#e8e4da', 'center');
    });
    if (prompt) text(prompt, VIEW_W / 2, y + h - 30, 17, '#7ee787', 'center', 'bold');
  }

  function drawTitle(state, save) {
    drawWorld(state);
    ctx.fillStyle = 'rgba(8,12,24,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text(GAME_TITLE, VIEW_W / 2, 190, 84, '#ffd23e', 'center', 'bold');
    text('S O L M A R   B A Y', VIEW_W / 2, 232, 24, '#7ee7f2', 'center', 'bold');
    text(`An open-world story starring ${HERO_NAME} — drive, steal, run missions, lose the heat.`, VIEW_W / 2, 282, 17, '#fff', 'center');
    const lines = [
      'A complete open world: beach, downtown, marina and docks.',
      'Traffic, pedestrians, police chases, 6 story missions, fares, shops.',
      'WASD drive & walk · E steal car · Space punch / handbrake · Click shoot · M missions',
    ];
    lines.forEach((line, i) => text(line, VIEW_W / 2, 330 + i * 28, 16, '#e8e4da', 'center'));
    text(save ? 'Press ENTER or click to CONTINUE your saved game' : 'Press ENTER or click to start a NEW GAME', VIEW_W / 2, 470, 20, '#7ee787', 'center', 'bold');
    text('Progress saves automatically after every mission.', VIEW_W / 2, 505, 14, '#aaa', 'center');
    text('Original game — no Rockstar content. Runs offline, no network.', VIEW_W / 2, 660, 13, 'rgba(255,255,255,0.6)', 'center');
  }

  function drawMissions(state) {
    drawWorld(state);
    ctx.fillStyle = 'rgba(8,12,24,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text('MISSIONS — Solmar Bay', VIEW_W / 2, 90, 34, '#ffd23e', 'center', 'bold');
    MISSIONS.forEach((m, i) => {
      const y = 140 + i * 76;
      const done = i < state.missionIndex;
      const current = state.mission && state.mission.index === i;
      const locked = i > state.missionIndex;
      ctx.fillStyle = current ? 'rgba(242,201,76,0.25)' : done ? 'rgba(126,231,135,0.14)' : 'rgba(255,255,255,0.07)';
      roundRect(ctx, 240, y, 800, 64, 10);
      ctx.fill();
      text(`${done ? '✓' : locked ? '🔒' : current ? '▶' : `${i + 1}.`} ${m.title}`, 260, y + 28, 20, done ? '#7ee787' : '#fff', 'left', 'bold');
      text(`${m.giver} · $${m.pay} · ${m.brief}`, 260, y + 52, 14, '#ccc');
      if (current) text('IN PROGRESS', 1000, y + 28, 14, '#ffd23e', 'right', 'bold');
    });
    text('Press M or Esc to return · Missions start automatically in order — walk to the marker', VIEW_W / 2, 620, 15, '#aaa', 'center');
    text('Tip: the Spray Shop (S on the map) clears your wanted level for $200.', VIEW_W / 2, 648, 15, '#aaa', 'center');
  }

  function drawPaused(state) {
    drawWorld(state);
    ctx.fillStyle = 'rgba(8,12,24,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const lines = [
      `Money $${Math.floor(state.player.money).toLocaleString('en-US')} · Missions ${state.missionIndex}/${MISSIONS.length} · Cars stolen ${state.stats.carsStolen}`,
      '',
      ...CONTROLS.map(([k, v]) => `${k} — ${v}`),
    ];
    drawPanel('PAUSED', lines, 'Press P or Esc to resume · M for missions', '#7ee7f2');
  }

  function drawOver(state, kind, best) {
    drawWorld(state);
    ctx.fillStyle = 'rgba(8,12,24,0.66)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (kind === 'busted') {
      drawPanel('BUSTED!', [
        'The Solmar Bay Police caught you. They took 15% of your cash.',
        `Money left: $${Math.floor(state.player.money).toLocaleString('en-US')}`,
        'You wake up outside Solmar General. The city is still yours to take.',
      ], 'Press R to get back out there', '#2e6bff');
    } else {
      drawPanel('WASTED', [
        'You went down in Solmar Bay. The medics took 10% of your cash.',
        `Money left: $${Math.floor(state.player.money).toLocaleString('en-US')}`,
        'You wake up outside Solmar General. The city is still yours to take.',
      ], 'Press R to get back out there', '#d94f4f');
    }
  }

  function drawWin(state) {
    drawWorld(state);
    ctx.fillStyle = 'rgba(8,12,24,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawPanel('STORY COMPLETE', [
      'Every mission done. The Harbor Heist paid off and Solmar Bay is yours.',
      `Total earned: $${Math.floor(state.stats.cashEarned).toLocaleString('en-US')} · Cars stolen: ${state.stats.carsStolen}`,
      'Keep playing: fares, chases and the whole city stay open.',
    ], 'Press Enter to keep roaming free', '#7ee787');
  }

  // The last camera centre, kept so screenToWorld can aim without a fresh draw.
  let lastCam = { x: VIEW_W / 2, y: VIEW_H / 2 };

  /** Convert CSS-pixel mouse coordinates over the canvas into world coordinates. */
  function screenToWorld(mx, my) {
    const ratio = window.devicePixelRatio || 1;
    const camX = clamp(lastCam.x - VIEW_W / 2, 0, Math.max(0, WORLD_W - VIEW_W));
    const camY = clamp(lastCam.y - VIEW_H / 2, 0, Math.max(0, WORLD_H - VIEW_H));
    return {
      x: (mx * ratio - view.x) / view.scale + camX,
      y: (my * ratio - view.y) / view.scale + camY,
    };
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, save) {
    lastCam = { x: state.cam.x, y: state.cam.y };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e18';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, save);
      return;
    }
    if (screen === SCREEN_MISSIONS) {
      drawMissions(state);
      return;
    }
    if (screen === SCREEN_PAUSED) {
      drawPaused(state);
      return;
    }
    if (screen === SCREEN_OVER) {
      drawOver(state, state.gameOver || 'busted');
      return;
    }
    if (screen === SCREEN_WIN) {
      drawWin(state);
      return;
    }
    drawWorld(state);
    drawHud(state, screen);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld };
}
