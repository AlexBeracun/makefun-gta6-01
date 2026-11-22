// The world in 3D: Solmar Bay rendered with three.js — a sun-soaked coastal city
// with glass downtown towers, houses, a beach and ocean, traffic, pedestrians,
// police chases and the SBP helicopter, all from the same simulation state the
// 2D game used. The camera is a chase camera behind the player (an orbit around
// downtown on the title screen); the HUD, minimap and menus stay 2D on the
// overlay canvas. No shadows: the city is big and headless software GL is slow,
// so every car and pedestrian gets a cheap blob shadow instead.
import * as THREE from 'three';
import {
  COLORS, MISSIONS, PLACES, ROAD_GAP, ROAD_W, WORLD_H, WORLD_W,
} from './config.js';
import { clamp } from './random.js';

const VIEW_W = 1280;
const VIEW_H = 720;
const SCREEN_TITLE = 'title';

// 2D world (x right, y down) -> 3D (x right, y up, z = world y).
function to3(x, y, h = 0) {
  return new THREE.Vector3(x, h, y);
}

function makeFacadeTextures() {
  // Day: pale facade, dark glass windows. Night: dark facade, warm lit windows.
  const day = document.createElement('canvas');
  day.width = 128;
  day.height = 128;
  const d = day.getContext('2d');
  d.fillStyle = '#e8e4da';
  d.fillRect(0, 0, 128, 128);
  d.fillStyle = '#2a3a4a';
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 6; c += 1) {
      d.fillRect(8 + c * 20, 8 + r * 15, 12, 9);
    }
  }
  const night = document.createElement('canvas');
  night.width = 128;
  night.height = 128;
  const n = night.getContext('2d');
  n.fillStyle = '#1c2430';
  n.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 6; c += 1) {
      const lit = ((r * 7 + c * 13) % 3) !== 0;
      n.fillStyle = lit ? '#ffd76a' : '#0e1420';
      n.fillRect(8 + c * 20, 8 + r * 15, 12, 9);
    }
  }
  const lit = document.createElement('canvas');
  lit.width = 128;
  lit.height = 128;
  const l = lit.getContext('2d');
  l.fillStyle = '#000000';
  l.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 6; c += 1) {
      const isLit = ((r * 7 + c * 13) % 3) !== 0;
      if (isLit) {
        l.fillStyle = '#ffc861';
        l.fillRect(8 + c * 20, 8 + r * 15, 12, 9);
      }
    }
  }
  const dayTex = new THREE.CanvasTexture(day);
  const nightTex = new THREE.CanvasTexture(night);
  const litTex = new THREE.CanvasTexture(lit);
  for (const t of [dayTex, nightTex, litTex]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
  }
  return { dayTex, nightTex, litTex };
}

// A unit box whose UVs repeat every ~36 world units, so windows stay the same
// size on a house and on a tower. Face order: +x, -x, +y, -y, +z, -z.
function buildingGeometry(w, h, d) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(i, pos.getX(i) * w, pos.getY(i) * h, pos.getZ(i) * d);
  }
  const uv = geo.attributes.uv;
  // Each face has 4 verts; face sizes in (u, v): +x/-x (d, h), +y/-y (w, d), +z/-z (w, h).
  const faceUV = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f += 1) {
    for (let v = 0; v < 4; v += 1) {
      const idx = f * 4 + v;
      uv.setXY(idx, uv.getX(idx) * faceUV[f][0] / 36, uv.getY(idx) * faceUV[f][1] / 36);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export function createWorldRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // The caller sizes the canvas in device pixels already; keep the ratio at 1 so
  // setSize does not multiply them again.
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#87b8d9');
  scene.fog = new THREE.Fog(0x87b8d9, 1400, 3200);
  const camera = new THREE.PerspectiveCamera(62, VIEW_W / VIEW_H, 1, 7000);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6a7a52, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
  scene.add(sun);
  scene.add(sun.target);

  const { dayTex, nightTex, litTex } = makeFacadeTextures();
  const matCache = new Map();
  // Six faces: facade on the four sides, a plain darker roof on top/bottom.
  function buildingMaterial(color, night) {
    const key = `${color}|${night ? 'n' : 'd'}`;
    if (!matCache.has(key)) {
      const side = night
        ? new THREE.MeshLambertMaterial({
          map: nightTex, color, emissive: 0xffc861, emissiveMap: litTex, emissiveIntensity: 0.9,
        })
        : new THREE.MeshLambertMaterial({ map: dayTex, color });
      const roofColor = new THREE.Color(color).multiplyScalar(night ? 0.35 : 0.55);
      const roof = new THREE.MeshLambertMaterial({ color: roofColor });
      matCache.set(key, [side, side, roof, roof, side, side]);
    }
    return matCache.get(key);
  }

  // Static city group, rebuilt whenever the city (seed) changes.
  let staticGroup = null;
  let lastBuildings = null;
  let lastNight = null;

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const carBodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const wheelGeo = new THREE.CylinderGeometry(5, 5, 4, 10);
  wheelGeo.rotateX(Math.PI / 2);
  const blobGeo = new THREE.CircleGeometry(1, 20);
  blobGeo.rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  const sphereGeo = new THREE.SphereGeometry(1, 10, 8);

  function flat(w, d, color, y = 0.1) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, y, 0);
    return m;
  }

  function buildStatic(state) {
    if (staticGroup) {
      scene.remove(staticGroup);
      staticGroup.traverse((o) => {
        if (o.geometry && o.geometry !== unitBox) o.geometry.dispose();
      });
    }
    staticGroup = new THREE.Group();
    const g = staticGroup;

    // Ground: grass, ocean (west), sand, then the city sidewalk slab.
    const ground = flat(WORLD_W + 1200, WORLD_H + 600, COLORS.grass, 0);
    ground.position.set(WORLD_W / 2, 0, WORLD_H / 2);
    g.add(ground);
    const ocean = flat(620, WORLD_H + 600, COLORS.ocean, 0.05);
    ocean.position.set(-120, 0.05, WORLD_H / 2);
    g.add(ocean);
    const foam = flat(26, WORLD_H + 600, '#f2ead8', 0.07);
    foam.position.set(196, 0.07, WORLD_H / 2);
    g.add(foam);
    const sand = flat(130, WORLD_H + 600, COLORS.sand, 0.06);
    sand.position.set(255, 0.06, WORLD_H / 2);
    g.add(sand);
    const slab = flat(WORLD_W - 300, WORLD_H - 100, COLORS.sidewalk, 0.08);
    slab.position.set(WORLD_W / 2 + 75, 0.08, WORLD_H / 2 + 50);
    g.add(slab);
    // Parks.
    for (const park of state.parks) {
      const p = flat(park.w, park.h, COLORS.park, 0.09);
      p.position.set(park.x + park.w / 2, 0.09, park.y + park.h / 2);
      g.add(p);
    }
    // Roads.
    const roadMat = new THREE.MeshLambertMaterial({ color: COLORS.road });
    for (let i = 0; i < 8; i += 1) {
      const x = 300 + i * ROAD_GAP;
      const r = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, WORLD_H), roadMat);
      r.rotation.x = -Math.PI / 2;
      r.position.set(x, 0.12, WORLD_H / 2);
      g.add(r);
    }
    for (let j = 0; j < 6; j += 1) {
      const y = 200 + j * ROAD_GAP;
      const r = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, ROAD_W), roadMat);
      r.rotation.x = -Math.PI / 2;
      r.position.set(WORLD_W / 2, 0.12, y);
      g.add(r);
    }
    // Lane dashes, one instanced mesh.
    const dashGeo = new THREE.PlaneGeometry(4, 22);
    dashGeo.rotateX(-Math.PI / 2);
    const dashMat = new THREE.MeshBasicMaterial({ color: COLORS.lane });
    const dashes = [];
    for (let i = 0; i < 8; i += 1) {
      const x = 300 + i * ROAD_GAP;
      for (let y = 200; y < WORLD_H; y += 46) dashes.push([x, y, 0]);
    }
    for (let j = 0; j < 6; j += 1) {
      const y = 200 + j * ROAD_GAP;
      for (let x = 300; x < WORLD_W; x += 46) dashes.push([x, y, 1]);
    }
    const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    dashes.forEach(([x, y, rot], i) => {
      e.set(0, rot ? Math.PI / 2 : 0, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, 0.14, y), q, new THREE.Vector3(1, 1, 1));
      dashMesh.setMatrixAt(i, m4);
    });
    g.add(dashMesh);
    // Buildings.
    for (const b of state.buildings) {
      const height = b.tall ? b.floors * 16 : b.floors * 15 + 6;
      const mesh = new THREE.Mesh(buildingGeometry(b.w, height, b.h), buildingMaterial(b.color, false));
      mesh.position.set(b.x + b.w / 2, height / 2, b.y + b.h / 2);
      mesh.userData.building = b;
      g.add(mesh);
    }
    // Palms: instanced trunks + crowns.
    if (state.palms.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(2.5, 3.5, 26, 6);
      const trunkMat = new THREE.MeshLambertMaterial({ color: COLORS.trunk });
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, state.palms.length);
      const crownGeo = new THREE.ConeGeometry(20, 12, 8);
      const crownMat = new THREE.MeshLambertMaterial({ color: COLORS.palm });
      const crowns = new THREE.InstancedMesh(crownGeo, crownMat, state.palms.length);
      const mm = new THREE.Matrix4();
      state.palms.forEach((palm, i) => {
        mm.makeTranslation(palm.x, 13, palm.y);
        trunks.setMatrixAt(i, mm);
        mm.makeTranslation(palm.x, 30, palm.y);
        crowns.setMatrixAt(i, mm);
      });
      g.add(trunks);
      g.add(crowns);
    }
    scene.add(g);
    lastBuildings = state.buildings;
  }

  // Dynamic objects, keyed by the simulation object they draw.
  const carMeshes = new Map();
  const pedMeshes = new Map();
  const copMeshes = new Map();
  const pickupMeshes = new Map();
  const bulletPool = [];
  const particlePoints = (() => {
    const max = 300;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 7, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    return { pts, max };
  })();

  // Objective beacon: a GTA waypoint pillar + pulsing ring + floating marker.
  const beacon = new THREE.Group();
  const beaconPillar = new THREE.Mesh(
    new THREE.CylinderGeometry(26, 26, 220, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beaconPillar.position.y = 110;
  const beaconRing = new THREE.Mesh(
    new THREE.RingGeometry(20, 30, 32),
    new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
  );
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.5;
  beacon.add(beaconPillar);
  beacon.add(beaconRing);
  scene.add(beacon);

  // Helicopter.
  const heliGroup = new THREE.Group();
  const heliBody = new THREE.Group();
  const heliMain = new THREE.Mesh(new THREE.BoxGeometry(46, 16, 22), new THREE.MeshLambertMaterial({ color: '#1c2733' }));
  const heliTail = new THREE.Mesh(new THREE.BoxGeometry(52, 6, 6), new THREE.MeshLambertMaterial({ color: '#1c2733' }));
  heliTail.position.set(-44, 2, 0);
  const heliRotor = new THREE.Group();
  const rotorBlade = new THREE.Mesh(new THREE.BoxGeometry(110, 1.5, 5), new THREE.MeshLambertMaterial({ color: '#222' }));
  const rotorBlade2 = rotorBlade.clone();
  rotorBlade2.rotation.y = Math.PI / 2;
  heliRotor.add(rotorBlade);
  heliRotor.add(rotorBlade2);
  heliRotor.position.y = 12;
  heliBody.add(heliMain);
  heliBody.add(heliTail);
  heliBody.add(heliRotor);
  heliGroup.add(heliBody);
  const heliCone = new THREE.Mesh(
    new THREE.ConeGeometry(60, 1, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  );
  const heliSpot = new THREE.Mesh(
    new THREE.CircleGeometry(65, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  heliSpot.rotation.x = -Math.PI / 2;
  heliSpot.position.y = 0.4;
  heliGroup.add(heliCone);
  heliGroup.add(heliSpot);
  heliGroup.visible = false;
  scene.add(heliGroup);

  // Service markers: coloured discs with a floating letter sprite.
  function letterSprite(letter, color) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = color;
    x.beginPath();
    x.arc(32, 32, 28, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#222';
    x.font = 'bold 34px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(letter, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(46, 46, 1);
    return sp;
  }
  const serviceGroup = new THREE.Group();
  for (const [place, color, letter] of [
    [PLACES.sprayShop, '#2ec4b6', 'S'],
    [PLACES.ammoShop, '#f2c94c', 'A'],
    [PLACES.hospital, '#ffffff', 'H'],
    [PLACES.safehouse, '#4fd07a', '⌂'],
  ]) {
    const sp = letterSprite(letter, color);
    sp.position.set(place.x, 42, place.y);
    serviceGroup.add(sp);
  }
  scene.add(serviceGroup);

  function makeCarMesh(car) {
    const group = new THREE.Group();
    const def = car.def;
    const bodyMat = new THREE.MeshLambertMaterial({ color: car.color });
    const body = new THREE.Mesh(carBodyGeo, bodyMat);
    body.scale.set(def.len, 10, def.wid);
    body.position.y = 7;
    group.add(body);
    const cabin = new THREE.Mesh(carBodyGeo, new THREE.MeshLambertMaterial({ color: '#14202d' }));
    cabin.scale.set(def.len * 0.42, 8, def.wid - 7);
    cabin.position.set(-def.len * 0.05, 15, 0);
    group.add(cabin);
    // Headlights + taillights.
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4), headMat);
      h.position.set(def.len / 2, 7, s * (def.wid / 2 - 4));
      group.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4), new THREE.MeshBasicMaterial({ color: 0xc02020 }));
      t.position.set(-def.len / 2, 7, s * (def.wid / 2 - 4));
      group.add(t);
    }
    if (car.def.id === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 8), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      sign.position.set(0, 21, 0);
      group.add(sign);
    }
    if (car.police) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(def.len - 4, 1, def.wid + 1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      stripe.position.set(0, 12.5, 0);
      group.add(stripe);
    }
    // Wheels.
    const wheelMat = new THREE.MeshLambertMaterial({ color: '#141414' });
    const wheels = [];
    for (const [wx, wz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx * (def.len / 2 - 8), 5, wz * (def.wid / 2 - 1));
      group.add(wheel);
      wheels.push(wheel);
    }
    // Blob shadow.
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.scale.set(def.len * 0.75, 1, def.wid * 0.8);
    blob.position.y = 0.3;
    group.add(blob);
    // Police light bar.
    let lightA = null;
    let lightB = null;
    if (car.police) {
      lightA = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), new THREE.MeshBasicMaterial({ color: 0xff2e2e }));
      lightA.position.set(-4, 21, -5);
      lightB = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), new THREE.MeshBasicMaterial({ color: 0x2e6bff }));
      lightB.position.set(-4, 21, 5);
      group.add(lightA);
      group.add(lightB);
    }
    group.userData = { wheels, lightA, lightB, headMat, bodyMat };
    return group;
  }

  function makePersonMesh(shirt, skin, cop) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(6.5, 7.5, 16, 8),
      new THREE.MeshLambertMaterial({ color: shirt }),
    );
    body.position.y = 10;
    group.add(body);
    const head = new THREE.Mesh(sphereGeo, new THREE.MeshLambertMaterial({ color: skin }));
    head.scale.setScalar(4.5);
    head.position.y = 22;
    group.add(head);
    if (cop) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 2, 10), new THREE.MeshBasicMaterial({ color: 0xd9d9d9 }));
      band.position.y = 25;
      group.add(band);
    }
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.scale.setScalar(11);
    blob.position.y = 0.3;
    group.add(blob);
    return group;
  }

  function makePickupMesh(pk) {
    const group = new THREE.Group();
    if (pk.kind === 'cash') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(22, 4, 14), new THREE.MeshLambertMaterial({ color: '#2fae5f' }));
      m.position.y = 6;
      group.add(m);
    } else if (pk.kind === 'health') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(18, 18, 4), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
      m.position.y = 12;
      group.add(m);
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(4, 14, 5), new THREE.MeshBasicMaterial({ color: 0xd94f4f }));
      c1.position.y = 12;
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 5), new THREE.MeshBasicMaterial({ color: 0xd94f4f }));
      c2.position.y = 12;
      group.add(c1);
      group.add(c2);
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(18, 4, 12), new THREE.MeshLambertMaterial({ color: '#f2c94c' }));
      m.position.y = 6;
      group.add(m);
    }
    return group;
  }

  function syncMap(map, items, make) {
    const seen = new Set();
    for (const item of items) {
      seen.add(item);
      if (!map.has(item)) {
        const mesh = make(item);
        map.set(item, mesh);
        scene.add(mesh);
      }
    }
    for (const [item, mesh] of map) {
      if (!seen.has(item)) {
        scene.remove(mesh);
        map.delete(item);
      }
    }
  }

  let camPos = null;
  let lastScreen = null;
  let lastElapsed = 0;

  function drawWorld3D(state, screen) {
    const night = state.clock >= 19.5 || state.clock < 5;
    const dusk = !night && state.clock >= 17 && state.clock < 19.5;
    if (state.buildings !== lastBuildings) buildStatic(state);
    if (night !== lastNight && staticGroup) {
      staticGroup.traverse((o) => {
        if (o.userData.building) o.material = buildingMaterial(o.userData.building.color, night);
      });
      lastNight = night;
    }
    // Sky, fog, sun by the clock.
    const sky = night ? new THREE.Color('#0b1030') : dusk ? new THREE.Color('#ff9a4d') : new THREE.Color('#87b8d9');
    scene.background = sky;
    scene.fog.color.copy(sky);
    hemi.intensity = night ? 0.35 : dusk ? 0.8 : 1.0;
    const sunAngle = ((state.clock - 6) / 12) * Math.PI;
    sun.position.set(
      WORLD_W / 2 + Math.cos(sunAngle) * 2200,
      night ? 500 : Math.max(300, Math.sin(sunAngle) * 1800),
      WORLD_H / 2 + 400,
    );
    sun.target.position.set(WORLD_W / 2, 0, WORLD_H / 2);
    sun.color.set(night ? 0x8fa8ff : dusk ? 0xffb36b : 0xfff2d8);
    sun.intensity = night ? 0.25 : dusk ? 0.9 : 1.6;

    // Cars.
    syncMap(carMeshes, state.cars, makeCarMesh);
    const dt = Math.max(0, state.elapsed - lastElapsed);
    lastElapsed = state.elapsed;
    for (const [car, mesh] of carMeshes) {
      mesh.position.set(car.x, 0, car.y);
      mesh.rotation.y = -car.angle;
      mesh.userData.spin = (mesh.userData.spin || 0) + car.speed * dt * 0.05;
      for (const wheel of mesh.userData.wheels) wheel.rotation.z = -mesh.userData.spin;
      if (mesh.userData.lightA) {
        const on = Math.floor(state.elapsed * 4) % 2 === 0;
        mesh.userData.lightA.material.color.set(on ? 0xff2e2e : 0x881111);
        mesh.userData.lightB.material.color.set(on ? 0x881111 : 0x2e6bff);
      }
      mesh.visible = true;
    }
    // Player.
    const p = state.player;
    if (p.inCar) {
      const mesh = carMeshes.get(p.inCar);
      if (mesh) {
        mesh.position.set(p.inCar.x, 0, p.inCar.y);
        mesh.rotation.y = -p.inCar.angle;
      }
    } else {
      if (!pedMeshes.has(p)) {
        const mesh = makePersonMesh('#e84c6c', '#c98a5a', false);
        pedMeshes.set(p, mesh);
        scene.add(mesh);
      }
      const mesh = pedMeshes.get(p);
      mesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * (p.moving ? 2 : 0), p.y);
      mesh.rotation.y = -p.angle;
      // Hero ring.
      if (!mesh.userData.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(12, 15, 32),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.4;
        mesh.add(ring);
        mesh.userData.ring = ring;
      }
    }
    // Pedestrians.
    syncMap(pedMeshes, [...state.peds, ...(p.inCar ? [] : [p])], (ped) => makePersonMesh(ped.shirt || '#e84c6c', ped.skin || '#c98a5a', false));
    for (const [ped, mesh] of pedMeshes) {
      if (ped === p) continue;
      mesh.position.set(ped.x, ped.dead ? 2 : Math.abs(Math.sin(state.elapsed * 6 + ped.x)) * 1.2, ped.y);
      mesh.rotation.set(ped.dead ? Math.PI / 2 : 0, -ped.angle, 0);
      mesh.visible = true;
    }
    // Cops on foot.
    syncMap(copMeshes, state.cops, () => makePersonMesh('#1c2733', '#e8b4a0', true));
    for (const [cop, mesh] of copMeshes) {
      mesh.position.set(cop.x, 0, cop.y);
      mesh.rotation.y = -cop.angle;
    }
    // Pickups.
    syncMap(pickupMeshes, state.pickups.filter((pk) => pk.active), makePickupMesh);
    for (const [pk, mesh] of pickupMeshes) {
      mesh.position.set(pk.x, Math.sin(pk.bob * 3) * 3, pk.y);
      mesh.rotation.y = state.elapsed * 1.5;
    }
    // Bullets.
    for (let i = 0; i < bulletPool.length; i += 1) bulletPool[i].visible = false;
    state.bullets.forEach((b, i) => {
      if (!bulletPool[i]) {
        const m = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
        m.scale.setScalar(3);
        bulletPool.push(m);
        scene.add(m);
      }
      bulletPool[i].position.set(b.x, 6, b.y);
      bulletPool[i].visible = true;
    });
    // Particles.
    {
      const pos = particlePoints.pts.geometry.attributes.position;
      const col = particlePoints.pts.geometry.attributes.color;
      const tmp = new THREE.Color();
      for (let i = 0; i < particlePoints.max; i += 1) {
        const pt = state.particles[i];
        if (pt) {
          pos.setXYZ(i, pt.x, 5, pt.y);
          tmp.set(pt.color).multiplyScalar(clamp(pt.life / pt.maxLife, 0, 1));
          col.setXYZ(i, tmp.r, tmp.g, tmp.b);
        } else {
          pos.setXYZ(i, 0, -100, 0);
          col.setXYZ(i, 0, 0, 0);
        }
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
    // Helicopter.
    if (state.heli) {
      heliGroup.visible = true;
      const h = state.heli;
      heliGroup.position.set(h.x, h.z, h.y);
      heliBody.rotation.y = -h.angle;
      heliRotor.rotation.y = state.elapsed * 28;
      // Searchlight: a cone from the helicopter to the ground under the player.
      const toPlayer = new THREE.Vector3(p.x - h.x, -h.z, p.y - h.y);
      const beamLen = toPlayer.length();
      heliCone.scale.set(1, beamLen, 1);
      heliCone.position.copy(toPlayer).multiplyScalar(0.5);
      heliCone.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), toPlayer.clone().normalize().negate(),
      );
      heliSpot.position.set(p.x - h.x, -h.z + 0.4, p.y - h.y);
      heliSpot.material.opacity = 0.22 + Math.sin(state.elapsed * 3) * 0.06;
    } else {
      heliGroup.visible = false;
    }
    // Objective beacon.
    const target = objectiveTarget3D(state);
    if (target) {
      beacon.visible = true;
      beacon.position.set(target.x, 0, target.y);
      const pulse = 1 + Math.sin(state.elapsed * 4) * 0.12;
      beaconRing.scale.setScalar(pulse);
      beaconPillar.material.opacity = 0.18 + Math.sin(state.elapsed * 4) * 0.05;
    } else {
      beacon.visible = false;
    }

    // Camera.
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();
    if (screen === SCREEN_TITLE) {
      const a = state.elapsed * 0.06;
      desired.set(2100 + Math.cos(a) * 1000, 560, 1000 + Math.sin(a) * 700);
      look.set(2100, 40, 1000);
    } else {
      const dist3 = p.inCar ? 370 : 240;
      const height = p.inCar ? 170 : 125;
      const fx = Math.cos(p.angle);
      const fy = Math.sin(p.angle);
      desired.set(p.x - fx * dist3, height, p.y - fy * dist3);
      look.set(p.x + fx * 130, 12, p.y + fy * 130);
    }
    if (!camPos || desired.distanceTo(camPos) > 700 || lastScreen !== screen) {
      camPos = desired.clone();
    } else {
      camPos.lerp(desired, 0.16);
    }
    lastScreen = screen;
    camera.position.copy(camPos);
    camera.lookAt(look);
    camera.updateMatrixWorld();

    renderer.render(scene, camera);
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function screenToWorld(mx, my, view) {
    // CSS pixels over the canvas -> world x/y on the ground plane (y = 0).
    const ratio = window.devicePixelRatio || 1;
    const px = (mx * ratio - view.x) / view.scale;
    const py = (my * ratio - view.y) / view.scale;
    const ndcX = (px / VIEW_W) * 2 - 1;
    const ndcY = -((py / VIEW_H) * 2 - 1);
    const vec = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
    const dir = vec.sub(camera.position).normalize();
    if (Math.abs(dir.y) < 1e-6) return { x: 0, y: 0 };
    const t = -camera.position.y / dir.y;
    const hit = camera.position.clone().add(dir.multiplyScalar(t));
    return { x: hit.x, y: hit.z };
  }

  return { drawWorld3D, resize, screenToWorld };
}

// The mission/fare objective in world coordinates (mirrors the 2D HUD's target).
function objectiveTarget3D(state) {
  const m = state.mission;
  if (!m) {
    if (state.fare) {
      return state.fare.stage === 'pickup'
        ? { x: state.fare.ped.x, y: state.fare.ped.y }
        : { x: state.fare.destX, y: state.fare.destY };
    }
    return null;
  }
  const def = MISSIONS[m.index];
  const step = def.steps[m.step];
  if (!step) return null;
  if (step.type === 'steal' || step.type === 'wanted' || step.type === 'clear') return null;
  return { x: step.x, y: step.y };
}
