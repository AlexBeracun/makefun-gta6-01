// SOLMAR HEAT — rewritten via write tool
// The city itself: the road grid, and one block of buildings, park or palms per
// block, with a district (downtown towers, industrial sheds, houses, park) picked
// from where the block sits. buildCity fills state.buildings, state.palms and
// state.parks from the world's seeded rng, so the same seed always builds the
// same Solmar Bay.
import { COLORS, ROAD_GAP, ROAD_W, WORLD_H, WORLD_W } from './config.js';
import { pick, range, rangeInt } from './random.js';

export const ROAD_XS = [];
for (let x = 300; x <= WORLD_W - 150; x += ROAD_GAP) ROAD_XS.push(x);
export const ROAD_YS = [];
for (let y = 200; y <= WORLD_H - 150; y += ROAD_GAP) ROAD_YS.push(y);

function districtAt(x, y) {
  if (x > 1950 && y < 1300) return 'downtown';
  if (x > 2400 && y > 1850) return 'industrial';
  if (x > 2400 && y >= 1300 && y < 1850) return 'houses';
  if (x < 900 && y > 1850) return 'park';
  return 'houses';
}

export function buildCity(ctx) {
  const { state, rng } = ctx;
  state.buildings = [];
  state.palms = [];
  state.parks = [];
  for (let i = 0; i < ROAD_XS.length - 1; i += 1) {
    for (let j = 0; j < ROAD_YS.length - 1; j += 1) {
      const x0 = ROAD_XS[i] + ROAD_W / 2 + 14;
      const y0 = ROAD_YS[j] + ROAD_W / 2 + 14;
      const x1 = ROAD_XS[i + 1] - ROAD_W / 2 - 14;
      const y1 = ROAD_YS[j + 1] - ROAD_W / 2 - 14;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      if (district === 'park' && rng() < 0.7) {
        state.parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        for (let p = 0; p < 6; p += 1) {
          state.palms.push({ x: range(rng, x0 + 20, x1 - 20), y: range(rng, y0 + 20, y1 - 20) });
        }
        continue;
      }
      if (district === 'downtown') {
        // One tall tower per block, sometimes two.
        const w = range(rng, 130, 200);
        const h = range(rng, 130, 200);
        state.buildings.push({
          x: cx - w / 2, y: cy - h / 2, w, h,
          color: pick(rng, COLORS.downtown), tall: true, floors: rangeInt(rng, 8, 18),
        });
        if (rng() < 0.4) {
          const w2 = range(rng, 80, 120);
          const h2 = range(rng, 80, 120);
          state.buildings.push({
            x: x0 + range(rng, 0, 60), y: y0 + range(rng, 0, 60), w: w2, h: h2,
            color: pick(rng, COLORS.downtown), tall: true, floors: rangeInt(rng, 5, 9),
          });
        }
      } else if (district === 'industrial') {
        const w = range(rng, 180, 280);
        const h = range(rng, 120, 180);
        state.buildings.push({
          x: cx - w / 2, y: cy - h / 2, w, h,
          color: pick(rng, COLORS.industrial), tall: false, floors: 1,
        });
      } else {
        // Two or three houses per block.
        const count = rangeInt(rng, 2, 3);
        for (let k = 0; k < count; k += 1) {
          const w = range(rng, 70, 130);
          const h = range(rng, 60, 110);
          const bx = range(rng, x0, Math.max(x0 + 1, x1 - w));
          const by = range(rng, y0, Math.max(y0 + 1, y1 - h));
          state.buildings.push({
            x: bx, y: by, w, h,
            color: pick(rng, COLORS.house), tall: false, floors: rangeInt(rng, 1, 2),
          });
        }
      }
    }
  }
  // Palm-lined beach road.
  for (let y = 260; y < WORLD_H - 100; y += 130) {
    state.palms.push({ x: 250 + range(rng, -14, 14), y: y + range(rng, -20, 20) });
    if (rng() < 0.5) state.palms.push({ x: 2050 + range(rng, -10, 10), y: y + range(rng, -20, 20) });
  }
}
