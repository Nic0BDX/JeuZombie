import { wanderer } from './data/characters.js';

export const player = { x: 0, y: 0, facing: 1, frame: 0, stride: 0, sprite: wanderer.sprite };

export function updatePlayer(dt, x, y) {
  player.x += x * dt * wanderer.speed;
  player.y += y * dt * wanderer.speed;
  if (x) player.facing = Math.sign(x);
  player.stride = x || y ? (player.stride + dt * 9) % 4 : 0;
  player.frame = Math.floor(player.stride);
}
