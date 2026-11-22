import { passiveLevels, recalc, stats } from './player.js';
import { levels, evolved, refreshWeapons, hasSynergy } from './weapons.js';
import { save } from './save.js';
import { weapons, weaponMax, slots, synergyDescription } from './data/weapons.js';
import { passives, passiveMax } from './data/passives.js';
import { extraCardLuck, utilityCards } from './data/cards.js';

export const offset=weapons.length, utilityOffset=offset+passives.length;
export const choices=new Int16Array(4);
export const rarities=new Uint8Array(4);
const candidates=new Int16Array(utilityOffset+utilityCards.length);
const weights=new Float32Array(candidates.length), banned=new Uint8Array(utilityOffset);
const tiers=new Uint8Array(candidates.length);

export function resetCards() { choices.fill(-1); banned.fill(0); }

export function banish(id) {
  const slot=choices.indexOf(id);
  if(id<0 || id>=utilityOffset || slot<0) return false;
  banned[id]=1;
  offer(slot);
  return true;
}

export function offer(replaceSlot=-1) {
  let used=0, equipped=0, held=0;
  for(let i=0;i<levels.length;i++) if(levels[i]) equipped++;
  for(let i=0;i<passiveLevels.length;i++) if(passiveLevels[i]) held++;
  for(let i=0;i<levels.length;i++) if(!banned[i] && levels[i]<weaponMax && (levels[i] || (equipped<slots && (save.weapons & (1<<i))))) candidates[used++]=i;
  for(let i=0;i<passiveLevels.length;i++) if(!banned[offset+i] && passiveLevels[i]<passiveMax && (passiveLevels[i] || held<slots)) candidates[used++]=offset+i;
  const replacing=replaceSlot>=0;
  const count=replacing ? 1 : stats.luck>=extraCardLuck ? 4 : 3;
  if(replacing) {
    let remaining=0;
    for(let i=0;i<used;i++) if(!choices.includes(candidates[i])) candidates[remaining++]=candidates[i];
    used=remaining;
  } else choices.fill(-1);
  if(used<count) for(let i=0;i<utilityCards.length;i++) {
    const id=utilityOffset+i;
    if(!replacing || !choices.includes(id)) candidates[used++]=id;
  }
  let total=0;
  for(let i=0;i<used;i++) {
    const id=candidates[i], owned=id<offset ? levels[id] : id<utilityOffset ? passiveLevels[id-offset] : 0;
    const rank=id<offset ? owned/2 : owned;
    const tier=id>=utilityOffset ? (id-utilityOffset)%2 : Math.min(3,Math.floor(rank));
    tiers[i]=tier;
    weights[i]=Math.pow(.65*Math.max(.7,stats.luck),tier)*(owned ? 1.18 : 1)*(id<utilityOffset ? 1 : .12);
    total+=weights[i];
  }
  for(let i=0;i<count && used && total>0;i++) {
    let roll=Math.random()*total, selected=0;
    while(selected<used-1 && roll>=weights[selected]) roll-=weights[selected++];
    const slot=replacing ? replaceSlot : i;
    choices[slot]=candidates[selected]; rarities[slot]=tiers[selected];
    total-=weights[selected];
    candidates[selected]=candidates[--used];
    weights[selected]=weights[used]; tiers[selected]=tiers[used];
  }
}

const statLabels={degats:'dégâts',cooldown:'recharge',projectiles:'projectiles',zone:'zone',vitesse:'vitesse',
 duree:'durée',perforation:'perforation',recul:'recul',poison:'poison',stun:'étourdissement',spread:'dispersion'};
const relative=new Set(['degats','cooldown','zone','duree']);
const specialText={mirror:'frappe des deux côtés',ricochet:'rebond offensif',chain:'détonation en chaîne',echo:'troisième passage'};

function signed(n) { return (n>=0 ? '+' : '−')+String(Math.abs(n)).replace('.',','); }
function weaponBonus(weapon,rank) {
  if(!rank) return weapon.baseStats.degats+' dégâts · '+weapon.baseStats.projectiles+' projectile(s)';
  const delta=weapon.niveaux[rank];
  let result='';
  for(const key in delta) {
    if(result) result+=' · ';
    if(specialText[key]) result+=specialText[key];
    else if(key==='spread') result+='dispersion '+Math.round(delta[key]*180/Math.PI)+'°';
    else if(relative.has(key)) result+=signed(Math.round(delta[key]*100))+' % '+statLabels[key];
    else result+=signed(delta[key])+(key==='stun'||key==='poison' ? ' s ' : ' ')+statLabels[key];
  }
  return result;
}

export function cardInfo(id) {
  if(id>=utilityOffset) {
    const item=utilityCards[id-utilityOffset];
    const desc=item[3] ? 'Rapporte '+Math.round(item[3]*stats.goldGain)+' or.' : item[1];
    return {name:item[0],desc,icon:'◆',tag:item[2]?'SOIN':'OR',rank:''};
  }
  if(id<offset) {
    const w=weapons[id], rank=levels[id], synergy=hasSynergy(id,true);
    const evolution=rank===weaponMax-1 && passiveLevels[w.evolution.passifRequis];
    const bonus=weaponBonus(w,rank);
    const note=evolution ? ' · Coffre : '+w.evolution.nomEvolue : synergy ? ' · '+synergyDescription : '';
    return {name:w.nom,desc:w.description+' '+bonus+note,icon:w.icon,
      tag:evolution?'ÉVOLUTION':synergy?'SYNERGIE':rank?'NIVEAU '+(rank+1):'NOUVEAU',rank:rank+' → '+(rank+1)};
  }
  const p=passives[id-offset], rank=passiveLevels[id-offset];
  const value=p[4] ? p[4] : signed(Math.round(p[3]*100))+' %';
  return {name:p[0],desc:p[1]+' '+value,icon:'◆',tag:rank?'NIVEAU '+(rank+1):'NOUVEAU',rank:rank+' → '+(rank+1)};
}

export function upgrade(id) {
  if(id<0 || id>=utilityOffset) return;
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
