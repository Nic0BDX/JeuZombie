import { caps } from './data/waves.js';
import { player, stats } from './player.js';

export const loot=Array.from({length:caps.loot},()=>({active:false,kind:0,x:0,y:0,value:0,pull:false}));
export function drop(kind,x,y,value=1) {
  let target=null;
  for(let i=0;i<loot.length;i++) {
    const p=loot[i];
    if(!p.active) { target=p; break; }
    if(p.kind===0) target=p;
  }
  if(!target) return;
  if(target.active && kind===0) { target.value+=value; return; }
  if(target.active && kind!==5) return;
  target.active=true; target.kind=kind; target.x=x; target.y=y; target.value=value; target.pull=false;
}

export function attract() {
  for(let i=0;i<loot.length;i++) if(loot[i].kind===0) loot[i].pull=true;
}

export function updateLoot(dt,collect) {
  const reach=stats.magnet*stats.magnet;
  for(let i=0;i<loot.length;i++) {
    const p=loot[i];
    if(!p.active) continue;
    const x=player.x-p.x,y=player.y-p.y,d=x*x+y*y;
    if(d<81) {
      p.active=false;
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
