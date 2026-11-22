import { passiveLevels, recalc } from './player.js';
import { levels, evolved, refreshWeapons } from './weapons.js';
import { save } from './save.js';
import { weapons, weaponMax, slots } from './data/weapons.js';
import { passives, passiveMax } from './data/passives.js';

export const choices=new Int16Array(3);
export const candidates=new Int16Array(weapons.length+passives.length);
export const offset=weapons.length;

export function offer() {
  let used=0, equipped=0, held=0;
  for(let i=0;i<levels.length;i++) if(levels[i]) equipped++;
  for(let i=0;i<passiveLevels.length;i++) if(passiveLevels[i]) held++;
  for(let i=0;i<levels.length;i++) if(levels[i]<weaponMax && (levels[i] || (equipped<slots && (save.weapons & (1<<i))))) candidates[used++]=i;
  for(let i=0;i<passiveLevels.length;i++) if(passiveLevels[i]<passiveMax && (passiveLevels[i] || held<slots)) candidates[used++]=offset+i;
  choices.fill(-1);
  for(let i=0;i<choices.length && used;i++) {
    const p=Math.floor(Math.random()*used);
    choices[i]=candidates[p];
    candidates[p]=candidates[--used];
  }
}

export function upgrade(id) {
  if(id<0) return;
  if(id<offset) levels[id]++;
  else { passiveLevels[id-offset]++; recalc(); }
  refreshWeapons();
}

export function reward() {
  for(let i=0;i<levels.length;i++) if(levels[i]===weaponMax && !evolved[i] && passiveLevels[weapons[i].evolution.passifRequis]) {
    evolved[i]=1; refreshWeapons();
    return i+offset;
  }
  for(let i=0;i<levels.length;i++) if(levels[i] && levels[i]<weaponMax) { levels[i]++; refreshWeapons(); return i; }
  return -1;
}
