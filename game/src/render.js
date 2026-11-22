// Drawing only: the world's state and the current screen in, pixels out. The world
// itself is 3D (render3d.js, a three.js chase-camera view); this file paints the 2D
// HUD, minimap and menus on a transparent canvas over the WebGL canvas.
import {
  COLORS, CONTROLS, GAME_TITLE, HERO_NAME, MISSIONS, ROAD_GAP, WORLD_H, WORLD_W,
} from './config.js';
import { clamp } from './random.js';
import { createWorldRenderer } from './render3d.js';

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

export function createRenderer(gameCanvas, hudCanvas) {
  const ctx = hudCanvas.getContext('2d');
  const world3d = createWorldRenderer(gameCanvas);
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    gameCanvas.width = width;
    gameCanvas.height = height;
    hudCanvas.width = width;
    hudCanvas.height = height;
    view.scale = Math.min(width / VIEW_W, height / VIEW_H);
    view.x = (width - VIEW_W * view.scale) / 2;
    view.y = (height - VIEW_H * view.scale) / 2;
    world3d.resize(width, height);
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

  // The world itself is 3D now (render3d.js): this just paints it. The HUD,
  // minimap and menus stay 2D on this canvas, which sits over the WebGL canvas.
  function drawWorld(state, screen) {
    world3d.drawWorld3D(state, screen);
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
    const bannerW = Math.min(1000, 40 + missionText.length * 8);
    roundRect(ctx, (VIEW_W - bannerW) / 2, 12, bannerW, 34, 8);
    ctx.fill();
    text(missionText, VIEW_W / 2, 35, 15, '#ffe9a8', 'center', 'bold');
    if (state.missionTimer > 0) {
      text(`${Math.ceil(state.missionTimer)}s`, VIEW_W / 2, 62, 18, state.missionTimer < 15 ? '#ff6b6b' : '#fff', 'center', 'bold');
    }
    // Toast. Long toasts (mission briefs) shrink a little so the text never runs
    // off the sides of the screen.
    if (state.toastTimer > 0 && state.toast) {
      const size = state.toast.length > 80 ? 12 : 14;
      const tw = Math.min(1240, 40 + state.toast.length * (size === 12 ? 7 : 8.8));
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, (VIEW_W - tw) / 2, 92, tw, 30, 8);
      ctx.fill();
      text(state.toast, VIEW_W / 2, 113, size, '#fff', 'center');
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
    // Helicopter overhead.
    if (state.heli) {
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(mx + state.heli.x * sx, my + state.heli.y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
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

  function drawTitle(state, screen, save) {
    drawWorld(state, screen);
    ctx.fillStyle = 'rgba(8,12,24,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text(GAME_TITLE, VIEW_W / 2, 190, 84, '#ffd23e', 'center', 'bold');
    text('S O L M A R   B A Y', VIEW_W / 2, 232, 24, '#7ee7f2', 'center', 'bold');
    text(`An open-world story starring ${HERO_NAME} — drive, steal, run missions, lose the heat.`, VIEW_W / 2, 282, 17, '#fff', 'center');
    const lines = [
      'A complete open world: beach, downtown, marina and docks.',
      'Traffic, pedestrians, police chases, helicopter manhunts, 10 story missions, fares, shops.',
      'WASD drive & walk · E steal car · Space punch / handbrake · Click shoot · M missions',
    ];
    lines.forEach((line, i) => text(line, VIEW_W / 2, 330 + i * 28, 16, '#e8e4da', 'center'));
    text(save ? 'Press ENTER or click to CONTINUE your saved game' : 'Press ENTER or click to start a NEW GAME', VIEW_W / 2, 470, 20, '#7ee787', 'center', 'bold');
    text('Progress saves automatically after every mission.', VIEW_W / 2, 505, 14, '#aaa', 'center');
    text('Original game — no Rockstar content. Runs offline, no network.', VIEW_W / 2, 660, 13, 'rgba(255,255,255,0.6)', 'center');
  }

  function drawMissions(state, screen) {
    drawWorld(state, screen);
    ctx.fillStyle = 'rgba(8,12,24,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text('MISSIONS — Solmar Bay', VIEW_W / 2, 90, 34, '#ffd23e', 'center', 'bold');
    // Two columns of five: ten missions do not fit in one column.
    MISSIONS.forEach((m, i) => {
      const col = Math.floor(i / 5);
      const row = i % 5;
      const x0 = 60 + col * 600;
      const y = 140 + row * 76;
      const done = i < state.missionIndex;
      const current = state.mission && state.mission.index === i;
      const locked = i > state.missionIndex;
      ctx.fillStyle = current ? 'rgba(242,201,76,0.25)' : done ? 'rgba(126,231,135,0.14)' : 'rgba(255,255,255,0.07)';
      roundRect(ctx, x0, y, 560, 64, 10);
      ctx.fill();
      text(`${done ? '✓' : locked ? '🔒' : current ? '▶' : `${i + 1}.`} ${m.title}`, x0 + 20, y + 28, 19, done ? '#7ee787' : '#fff', 'left', 'bold');
      // The brief is one line: cut it to the card width.
      const brief = m.brief.length > 72 ? `${m.brief.slice(0, 69)}…` : m.brief;
      text(`${m.giver} · $${m.pay} · ${brief}`, x0 + 20, y + 52, 13, '#ccc');
      if (current) text('IN PROGRESS', x0 + 540, y + 28, 13, '#ffd23e', 'right', 'bold');
    });
    text('Press M or Esc to return · Missions start automatically in order — walk to the marker', VIEW_W / 2, 620, 15, '#aaa', 'center');
    text('Tip: the Spray Shop (S on the map) clears your wanted level for $200.', VIEW_W / 2, 648, 15, '#aaa', 'center');
  }

  function drawPaused(state, screen) {
    drawWorld(state, screen);
    ctx.fillStyle = 'rgba(8,12,24,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const lines = [
      `Money $${Math.floor(state.player.money).toLocaleString('en-US')} · Missions ${state.missionIndex}/${MISSIONS.length} · Cars stolen ${state.stats.carsStolen}`,
      '',
      ...CONTROLS.map(([k, v]) => `${k} — ${v}`),
    ];
    drawPanel('PAUSED', lines, 'Press P or Esc to resume · M for missions', '#7ee7f2');
  }

  function drawOver(state, screen, kind, best) {
    drawWorld(state, screen);
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

  function drawWin(state, screen) {
    drawWorld(state, screen);
    ctx.fillStyle = 'rgba(8,12,24,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawPanel('STORY COMPLETE', [
      'Every mission done — from First Wheels to King of Solmar. The city is yours.',
      `Total earned: $${Math.floor(state.stats.cashEarned).toLocaleString('en-US')} · Cars stolen: ${state.stats.carsStolen}`,
      'Keep playing: fares, chases and the whole city stay open.',
    ], 'Press Enter to keep roaming free', '#7ee787');
  }

  /** Convert CSS-pixel mouse coordinates over the canvas into world coordinates. */
  function screenToWorld(mx, my) {
    return world3d.screenToWorld(mx, my, view);
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, save) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Transparent: the 3D world shows through from the WebGL canvas below.
    ctx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, screen, save);
      return;
    }
    if (screen === SCREEN_MISSIONS) {
      drawMissions(state, screen);
      return;
    }
    if (screen === SCREEN_PAUSED) {
      drawPaused(state, screen);
      return;
    }
    if (screen === SCREEN_OVER) {
      drawOver(state, screen, state.gameOver || 'busted');
      return;
    }
    if (screen === SCREEN_WIN) {
      drawWin(state, screen);
      return;
    }
    drawWorld(state, screen);
    drawHud(state, screen);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld };
}
