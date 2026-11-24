// SOLMAR HEAT — rewritten via write tool
// The event bit flags step() returns, so the caller (sound, toasts) can react
// without the world knowing about screens. Kept in its own module so the mission
// and combat modules can use them without importing the whole world.
export const EVENT_CASH = 1;
export const EVENT_MISSION_DONE = 2;
export const EVENT_MISSION_FAIL = 4;
export const EVENT_BUSTED = 8;
export const EVENT_WASTED = 16;
export const EVENT_WANTED = 32;
export const EVENT_SHOT = 64;
export const EVENT_CRASH = 128;
export const EVENT_PICKUP = 256;
export const EVENT_PUNCH = 512;
export const EVENT_MISSION_START = 1024;
