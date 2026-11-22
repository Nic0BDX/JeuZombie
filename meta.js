import { save, persist } from './save.js';
import { achievements, shop, shopCap, shopFactor, weaponCosts, finishBonus } from './data/shop.js';
import { characters } from './data/characters.js';

export const ownsWeapon=id=>Number.isInteger(id) && id>=0 && id<weaponCosts.length && !!(save.weapons & (1<<id));
export const ownsCharacter=id=>Number.isInteger(id) && id>=0 && id<characters.length && !!(save.characters & (1<<id));
export const upgradeCost=(id,rank)=>Math.floor(shop[id][3]*shopFactor**rank);
export const selectedCharacter=()=>ownsCharacter(save.character) ? save.character : 0;
export const selectedWeapon=()=>ownsWeapon(save.startingWeapon) ? save.startingWeapon : characters[selectedCharacter()].weapon;

export function selectCharacter(id){
  if(!ownsCharacter(id)) return false;
  save.character=id; save.startingWeapon=-1; persist();
  return true;
}

export function selectWeapon(id){
  if(!ownsWeapon(id) && id!==characters[selectedCharacter()].weapon) return false;
  save.startingWeapon=id; persist();
  return true;
}

export function buyUpgrade(id){
  if(!shop[id]) return false;
  const rank=save.upgrades[id], cost=upgradeCost(id,rank);
  if(rank>=shopCap || save.gold<cost) return false;
  save.gold-=cost; save.upgrades[id]++; save.invested[id]+=cost; persist();
  return true;
}

export function unlockWeapon(id){
  if(ownsWeapon(id) || !weaponCosts[id] || save.gold<weaponCosts[id]) return false;
  save.gold-=weaponCosts[id]; save.weapons|=1<<id; persist();
  return true;
}

export function unlockCharacter(id){
  const item=characters[id];
  if(!item || ownsCharacter(id) || save.gold<item.cost) return false;
  save.gold-=item.cost; save.characters|=1<<id; persist();
  return true;
}

export function refundValue(){
  let total=0;
  for(let i=0;i<shop.length;i++) total+=save.invested[i];
  return total;
}

export function refundUpgrades(){
  const amount=refundValue();
  if(!amount) return false;
  save.gold+=amount; save.invested.fill(0); save.upgrades.fill(0); persist();
  return true;
}

export function trackEnemy(kind){ save.collection.seen|=1<<kind; }
export function seeWeapon(id){ save.collection.seenWeapons|=1<<id; }
export function trackWeapon(id){ seeWeapon(id); save.collection.weapons|=1<<id; }
export function trackEvolution(id){ save.collection.evolutions|=1<<id; }
export function trackKill(kind){ trackEnemy(kind); save.collection.kills[kind]++; }

function bitCount(bits){
  let n=0;
  while(bits) { bits&=bits-1; n++; }
  return n;
}

export function achievementValue(key){
  const c=save.collection;
  if(key==='weapons') return bitCount(c.weapons);
  if(key==='evolutions') return bitCount(c.evolutions);
  if(key==='enemies') return bitCount(c.seen);
  return save.records[key]??0;
}

export function finishRewards(run,won,multiplier=1){
  const r=save.records, f=finishBonus, seconds=Math.floor(run.elapsed), bosses=run.bossKills||0;
  const firstWin=won && r.wins===0;
  run.score=seconds*f.pointsPerSecond+run.kills*f.pointsPerKill+bosses*f.pointsPerBoss;
  r.runs++; r.wins+=Number(won); r.kills+=run.kills; r.bosses+=bosses; r.totalScore+=run.score;
  r.bestTime=Math.max(r.bestTime,seconds); r.bestLevel=Math.max(r.bestLevel,run.level); r.bestScore=Math.max(r.bestScore,run.score);
  let gold=Math.floor((Math.floor(seconds/f.secondsPerGold)+Math.floor(run.kills/f.killsPerGold)+bosses*f.goldPerBoss)*multiplier);
  run.firstWinBonus=firstWin ? f.firstWin : 0;
  gold+=run.firstWinBonus;
  run.achievementGold=0;
  for(let i=0;i<achievements.length;i++){
    const [, , , stat, goal, reward]=achievements[i];
    if(save.collection.achievements & (1<<i) || achievementValue(stat)<goal) continue;
    save.collection.achievements|=1<<i;
    run.achievementGold+=reward;
  }
  return gold+run.achievementGold;
}
