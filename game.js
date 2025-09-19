// Minimal, stable game scaffold with its own loop and clean exit
let running = false, rafId = 0, last = 0;
let root, canvas, ctx;
let activeMod = null;

export async function initGame(args) {
  const mod = await import('./runner_game.js');
  activeMod = mod;
  return mod.initGame(args);
}

export function destroyGame() {
  if (activeMod && typeof activeMod.destroyGame === 'function') {
    activeMod.destroyGame();
  }
  activeMod = null;
}