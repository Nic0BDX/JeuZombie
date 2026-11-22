import { player, updatePlayer } from './player.js';
import { readInput, movement, stick } from './input.js';
import { getSprite, tiles, tileHash } from './sprites.js';

const scene = document.createElement('canvas');
const art = scene.getContext('2d', { alpha: false });
let screen, scale, ratio, insetX, insetY, vignette;

export function resize(canvas) {
  screen = canvas.getContext('2d', { alpha: false });
  ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  const portrait = canvas.height >= canvas.width;
  scale = Math.max(1, Math.round(Math.min(canvas.width / (portrait ? 270 : 480), canvas.height / (portrait ? 480 : 270))));
  scene.width = Math.ceil(canvas.width / scale);
  scene.height = Math.ceil(canvas.height / scale);
  insetX = Math.floor((canvas.width - scene.width * scale) / 2);
  insetY = Math.floor((canvas.height - scene.height * scale) / 2);
  screen.imageSmoothingEnabled = false;
  art.imageSmoothingEnabled = false;
  const x = scene.width / 2, y = scene.height / 2;
  vignette = art.createRadialGradient(x, y, Math.min(x, y) * .42, x, y, Math.hypot(x, y));
  vignette.addColorStop(0, '#10101800');
  vignette.addColorStop(1, '#101018b8');
}

export function update(dt) {
  readInput();
  updatePlayer(dt, movement.x, movement.y);
}

export function render() {
  const cx = scene.width >> 1, cy = scene.height >> 1;
  const left = Math.round(player.x) - cx, top = Math.round(player.y) - cy;
  for (let y = Math.floor(top / 32); y * 32 < top + scene.height; y++) {
    for (let x = Math.floor(left / 32); x * 32 < left + scene.width; x++) {
      art.drawImage(tiles[tileHash(x, y) & 15], x * 32 - left, y * 32 - top);
    }
  }
  art.fillStyle = '#15191c';
  art.fillRect(cx - 5, cy + 5, 10, 3);
  art.setTransform(player.facing, 0, 0, 1, cx, cy);
  art.drawImage(getSprite(player.sprite, player.frame), -8, -8);
  art.resetTransform();
  art.fillStyle = vignette;
  art.fillRect(0, 0, scene.width, scene.height);
  screen.drawImage(scene, insetX, insetY, scene.width * scale, scene.height * scale);
  if (!stick.active) return;
  const x = stick.x * ratio, y = stick.y * ratio;
  screen.lineWidth = 2 * ratio;
  screen.strokeStyle = '#e0ead06b';
  screen.beginPath();
  screen.arc(x, y, 48 * ratio, 0, Math.PI * 2);
  screen.stroke();
  screen.fillStyle = '#d6e5ce66';
  screen.beginPath();
  screen.arc(x + stick.dx * ratio, y + stick.dy * ratio, 17 * ratio, 0, Math.PI * 2);
  screen.fill();
}
