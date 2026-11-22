import { characters } from './data/characters.js';
import { initialStats, passives } from './data/passives.js';
import { shop } from './data/shop.js';
import { save } from './save.js';

const heroes=Array.from({length:4},()=>({avatar:{ x:0, y:0, facing:1, frame:0, stride:0, sprite:'wanderer', dx:1, dy:0, hp:100, inv:0, character:0 },stats:{ ...initialStats },passives:new Uint8Array(passives.length)}));
export let player=heroes[0].avatar, stats=heroes[0].stats, passiveLevels=heroes[0].passives;
export function useHero(index) {
  const hero=heroes[index];
  player=hero.avatar; stats=hero.stats; passiveLevels=hero.passives;
}

export function recalc() {
  const old = stats.health;
  Object.assign(stats, initialStats);
  const character = characters[player.character];
  stats[character.bonus] += character.amount;
  for (let i = 0; i < shop.length; i++) stats[shop[i][1]] += save.upgrades[i] * shop[i][2];
  for (let i = 0; i < passives.length; i++) {
    const [, , key, amount] = passives[i];
    const level = passiveLevels[i];
    if (key === 'magnet') {
      stats.magnet += initialStats.magnet * amount * level;
    } else stats[key] += amount * level;
  }
  player.hp = Math.min(stats.health, player.hp + Math.max(0, stats.health - old));
}

export function resetPlayer(character) {
  player.character = character;
  player.sprite = characters[character].sprite;
  player.x = player.y = player.stride = player.frame = player.inv = player.dy = 0;
  player.dx = player.facing = 1;
  passiveLevels.fill(0);
  recalc();
  player.hp = stats.health;
}

export function updatePlayer(dt, x, y) {
  const speed = characters[player.character].speed * stats.speed;
  player.x += x * dt * speed;
  player.y += y * dt * speed;
  if (x || y) {
    const length = Math.hypot(x, y);
    player.dx = x / length;
    player.dy = y / length;
    player.stride = (player.stride + dt * 9) % 4;
  } else player.stride = 0;
  if (x) player.facing = Math.sign(x);
  player.frame = Math.floor(player.stride);
  player.inv = Math.max(0, player.inv - dt);
  player.hp = Math.min(stats.health, player.hp + stats.regen * dt);
}
