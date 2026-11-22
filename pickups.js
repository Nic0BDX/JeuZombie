import { caps } from './data/waves.js';
import { xpSizes } from './data/cards.js';
import { player, stats } from './player.js';

export const loot=Array.from({length:caps.loot},()=>({active:false,kind:0,x:0,y:0,value:0,pull:false}));
const mergeThreshold=90, mergeRange=36*36;
let gemCount=0;

export function resetLoot() {
  gemCount=0;
  for(let i=0;i<loot.length;i++) loot[i].active=false;
}

function place(target,kind,x,y,value) {
  target.active=true; target.kind=kind; target.x=x; target.y=y; target.value=value; target.pull=false;
}

function dropGem(x,y,value) {
  let free=null, nearest=null, best=Infinity;
  for(let i=0;i<loot.length;i++) {
    const p=loot[i];
    if(!p.active) { free??=p; if(gemCount<mergeThreshold) break; continue; }
    if(p.kind!==0) continue;
    const dx=p.x-x,dy=p.y-y,d=dx*dx+dy*dy;
    if(d<best) { nearest=p; best=d; }
  }
  if(nearest && (!free || (gemCount>=mergeThreshold && best<=mergeRange))) nearest.value+=value;
  else if(free) { place(free,0,x,y,value); gemCount++; }
}

export function drop(kind,x,y,value=1) {
  if(kind===0) {
    let scatter=0;
    for(let i=xpSizes.length-1;i>=0;i--) {
      const size=xpSizes[i];
      while(value>=size) {
        dropGem(x+(scatter%3)*4,y+Math.floor(scatter/3)*4,size);
        scatter++; value-=size;
      }
    }
    return;
  }
  let replacement=null, gem=null, spareGem=null;
  for(let i=0;i<loot.length;i++) {
    const p=loot[i];
    if(!p.active) { place(p,kind,x,y,value); return; }
    if(p.kind===0) { spareGem=gem; gem=p; }
    else if(p.kind!==5) replacement=p;
  }
  if(kind===5) {
    if(replacement) place(replacement,kind,x,y,value);
    else if(gem && spareGem) { spareGem.value+=gem.value; place(gem,kind,x,y,value); gemCount--; }
  }
}

export function attract() {
  for(let i=0;i<loot.length;i++) if(loot[i].active && loot[i].kind===0) loot[i].pull=true;
}

export function updateLoot(dt,collect) {
  const reach=stats.magnet*stats.magnet;
  for(let i=0;i<loot.length;i++) {
    const p=loot[i];
    if(!p.active) continue;
    const x=player.x-p.x,y=player.y-p.y,d=x*x+y*y;
    if(d<81) {
      p.active=false;
      if(p.kind===0) gemCount--;
      collect(p.kind,p.value);
      continue;
    }
    if(p.kind===0 && (p.pull || d<reach)) {
      p.pull=true;
      const speed=Math.min(1,dt*180/Math.sqrt(d));
      p.x+=x*speed; p.y+=y*speed;
    }
  }
}
