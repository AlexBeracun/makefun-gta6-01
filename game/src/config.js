// SOLMAR HEAT — an original open-world crime game set in Solmar Bay.
// All names, characters, places and story are original. No Rockstar content.
// config.js: world constants, districts, vehicles, missions, pickups.

export const WORLD_W = 3600;
export const WORLD_H = 2600;
export const ROAD_GAP = 450; // distance between road centre lines
export const ROAD_W = 72;
export const STEP = 1 / 60;
export const SEED = 20261118;

export const GAME_TITLE = 'SOLMAR HEAT';
export const CITY_NAME = 'Solmar Bay';
export const HERO_NAME = 'Mara Solis';

// Palette: sun-soaked pastel coastal city, warm asphalt, teal sea.
export const COLORS = {
  ocean: '#1e7fa8',
  oceanDeep: '#14607f',
  sand: '#ecd9a0',
  grass: '#7fae5a',
  park: '#6da34e',
  sidewalk: '#c9c2b4',
  road: '#3d3a44',
  roadEdge: '#2c2933',
  lane: '#e8d44d',
  downtown: ['#7d8aa5', '#5b7d9c', '#8fa3b8', '#6b8aa0', '#a08b7d', '#4f6d84'],
  house: ['#e8a87c', '#f2c879', '#d97b6c', '#a8c686', '#e6b8a2', '#c9a86a'],
  industrial: ['#9a8f7a', '#7d7466', '#b0a08a'],
  palm: '#3f8f4f',
  trunk: '#8a6b4a',
};

// Vehicles the player can steal or drive. speed = top speed px/s, accel, turn.
export const CARS = [
  { id: 'sedan', name: 'Solmar Sedan', color: '#c94f43', speed: 430, accel: 300, turn: 2.6, len: 46, wid: 22 },
  { id: 'taxi', name: 'Bay Taxi', color: '#e8c832', speed: 410, accel: 290, turn: 2.6, len: 46, wid: 22 },
  { id: 'coupe', name: 'Comet Coupe', color: '#3f7fd0', speed: 520, accel: 380, turn: 2.9, len: 44, wid: 21 },
  { id: 'van', name: 'Cargo Van', color: '#e8e4da', speed: 350, accel: 230, turn: 2.1, len: 56, wid: 24 },
  { id: 'pickup', name: 'Dune Pickup', color: '#5a8f5a', speed: 440, accel: 310, turn: 2.5, len: 50, wid: 23 },
  { id: 'sport', name: 'Vortex GT', color: '#d02090', speed: 580, accel: 430, turn: 3.1, len: 44, wid: 21 },
  { id: 'muscle', name: 'Thunder V8', color: '#7a2fd0', speed: 500, accel: 360, turn: 2.7, len: 48, wid: 22 },
  { id: 'beach', name: 'Beach Buggy', color: '#f2a541', speed: 400, accel: 320, turn: 3.0, len: 42, wid: 22 },
  { id: 'police', name: 'SBP Interceptor', color: '#20242e', speed: 560, accel: 420, turn: 3.0, len: 48, wid: 22 },
];

// Story missions. Each step is a waypoint objective.
export const MISSIONS = [
  {
    id: 'm1', title: 'First Wheels', giver: 'Dee',
    brief: 'Dee needs a driver. Steal any car on the street and bring it to the deli on Palm Row.',
    pay: 300,
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', x: 1330, y: 620, text: 'Drive to the deli on Palm Row', radius: 90 },
    ],
  },
  {
    id: 'm2', title: 'Sunset Courier', giver: 'Dee',
    brief: 'A package for the marina. Fast and quiet — 100 seconds, and the docks pay on time.',
    pay: 600, timeLimit: 100,
    steps: [
      { type: 'goto', x: 2250, y: 2420, text: 'Pick up the package at the courier depot', radius: 80 },
      { type: 'goto', x: 2700, y: 2280, text: 'Deliver it to the marina pier before time runs out', radius: 80 },
    ],
  },
  {
    id: 'm3', title: 'Beach Pickup', giver: 'Tomas',
    brief: 'Tomas is stranded at the beach bar. Pick him up and drop him at the Grand Solmar hotel.',
    pay: 500,
    steps: [
      { type: 'pickup', x: 420, y: 1150, text: 'Pick up Tomas at the beach bar (drive close and stop)', radius: 110 },
      { type: 'goto', x: 2900, y: 700, text: 'Drop Tomas at the Grand Solmar hotel', radius: 90 },
    ],
  },
  {
    id: 'm4', title: 'Heat Check', giver: 'Dee',
    brief: 'The Solmar Bay Police are on your tail. Lose a 2-star wanted level — hide, spray, survive.',
    pay: 800,
    steps: [
      { type: 'wanted', stars: 2, text: 'You are wanted — 2 stars. Lose the heat!' },
      { type: 'clear', text: 'Lose the wanted level (hide, or visit the Spray Shop)' },
    ],
  },
  {
    id: 'm5', title: 'Dockside Deal', giver: 'Rosa',
    brief: "Three crates at the south docks, Rosa's cut inside. Grab them all — the dock crew will not like it.",
    pay: 1200, heatOnCollect: 2,
    steps: [
      { type: 'collect', x: 600, y: 2350, text: 'Collect crate 1 of 3 at the south docks', radius: 70 },
      { type: 'collect', x: 1050, y: 2400, text: 'Collect crate 2 of 3 at the south docks', radius: 70 },
      { type: 'collect', x: 1500, y: 2350, text: 'Collect crate 3 of 3 at the south docks', radius: 70 },
      { type: 'goto', x: 2900, y: 700, text: 'Bring the crates to Rosa at the Grand Solmar', radius: 90 },
    ],
  },
  {
    id: 'm6', title: 'Harbor Heist', giver: 'Dee',
    brief: 'The big one. Hit the Harbor Bank, grab the cash, and lose a 3-star chase to the safehouse.',
    pay: 5000,
    steps: [
      { type: 'goto', x: 2250, y: 1150, text: 'Reach the Harbor Bank downtown', radius: 80 },
      { type: 'collect', x: 2250, y: 1150, text: 'Grab the cash inside (stand on the marker)', radius: 70 },
      { type: 'escape', stars: 3, text: 'Escape! Lose the 3-star wanted level and reach the safehouse', x: 3100, y: 2100 },
    ],
  },
  {
    id: 'm7', title: 'Rush Hour', giver: 'Dee',
    brief: 'Three drops, one clock. Depot, marina, hotel — 90 seconds and the city pays on time.',
    pay: 900, timeLimit: 90,
    steps: [
      { type: 'goto', x: 2250, y: 2420, text: 'Pick up the rush parcel at the courier depot', radius: 80 },
      { type: 'goto', x: 2700, y: 2280, text: 'Drop 1 of 3 at the marina pier', radius: 80 },
      { type: 'goto', x: 2900, y: 700, text: 'Drop 2 of 3 at the Grand Solmar hotel', radius: 80 },
      { type: 'goto', x: 1330, y: 620, text: 'Drop 3 of 3 at the Palm Row deli before time runs out', radius: 80 },
    ],
  },
  {
    id: 'm8', title: 'Taxi King', giver: 'Tomas',
    brief: 'Tomas is back — and he tips big. Two stops across town, no scratches on the paint.',
    pay: 1000,
    steps: [
      { type: 'pickup', x: 420, y: 1150, text: 'Pick up Tomas at the beach bar (drive close and stop)', radius: 110 },
      { type: 'goto', x: 2900, y: 700, text: 'Drop Tomas at the Grand Solmar hotel', radius: 90 },
      { type: 'goto', x: 2250, y: 1150, text: 'Second stop: the Harbor Bank downtown', radius: 90 },
    ],
  },
  {
    id: 'm9', title: "Rosa's Revenge", giver: 'Rosa',
    brief: 'The dock crew took Rosa\'s crates back. Take them back — all three — and run for the safehouse.',
    pay: 2000, heatOnCollect: 2,
    steps: [
      { type: 'collect', x: 600, y: 2350, text: 'Take crate 1 of 3 at the south docks', radius: 70 },
      { type: 'collect', x: 1500, y: 2350, text: 'Take crate 2 of 3 at the south docks', radius: 70 },
      { type: 'collect', x: 2400, y: 2350, text: 'Take crate 3 of 3 at the south docks', radius: 70 },
      { type: 'goto', x: 3100, y: 2100, text: 'Run the crates to the safehouse', radius: 90 },
    ],
  },
  {
    id: 'm10', title: 'King of Solmar', giver: 'Dee',
    brief: 'The last job. Hit the Harbor Bank again, grab everything, and outrun a 4-star manhunt to the safehouse.',
    pay: 8000,
    steps: [
      { type: 'goto', x: 2250, y: 1150, text: 'Reach the Harbor Bank downtown', radius: 80 },
      { type: 'collect', x: 2250, y: 1150, text: 'Grab all the cash inside (stand on the marker)', radius: 70 },
      { type: 'escape', stars: 4, text: 'Escape! Lose the 4-star wanted level and reach the safehouse', x: 3100, y: 2100 },
    ],
  },
];

// Side activities.
export const TAXI_FARE = 150;
export const SPRAY_COST = 200;
export const AMMO_COST = 150;
export const HEALTH_COST = 100;

// Fixed service locations (also drawn on the map).
export const PLACES = {
  sprayShop: { x: 900, y: 1750, name: 'Spray Shop' },
  ammoShop: { x: 1800, y: 700, name: 'Ammo Store' },
  hospital: { x: 2700, y: 1600, name: 'Solmar General' },
  safehouse: { x: 3100, y: 2100, name: 'Safehouse' },
  deli: { x: 1330, y: 620, name: 'Palm Row Deli' },
  marina: { x: 2700, y: 2280, name: 'Marina Pier' },
  hotel: { x: 2900, y: 700, name: 'Grand Solmar' },
  bank: { x: 2250, y: 1150, name: 'Harbor Bank' },
};

export const WANTED_DECAY_SECONDS = 28;
export const MAX_WANTED = 5;
export const SAVE_KEY = 'solmar-heat-save-v1';

export const CONTROLS = [
  ['W A S D / Arrows', 'Move / drive'],
  ['Shift', 'Sprint'],
  ['E', 'Enter / steal car, exit car'],
  ['Space', 'Handbrake (car) / punch (on foot)'],
  ['Mouse click', 'Shoot (with pistol)'],
  ['M', 'Mission list'],
  ['P / Esc', 'Pause'],
  ['R', 'Restart after Busted / Wasted'],
];
