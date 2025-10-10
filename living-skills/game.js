// Minimal, stable game scaffold with its own loop and clean exit
let running = false, rafId = 0, last = 0;
let root, canvas, ctx;
let currentMod = null;

export async function initGame(args) {
  const mod = await import('./runner_game.js');
  currentMod = mod;
  return mod.initGame(args);
}

export function destroyGame() {
  try { currentMod?.destroyGame?.(); } catch {}
  currentMod = null;
}