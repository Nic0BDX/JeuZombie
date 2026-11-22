import { waves, bossMinutes, eliteEvery } from './data/waves.js';
import { player } from './player.js';
import { spawn } from './enemies.js';

let clock=0, elite=0, boss=0, special=-1;
export function resetWaves() { clock=0; elite=eliteEvery; boss=0; special=-1; }

function outside(kind,angle,width,height,minute) {
  const dx=Math.cos(angle), dy=Math.sin(angle);
  const distance=Math.min((width/2+32)/Math.abs(dx),(height/2+32)/Math.abs(dy));
  spawn(kind, player.x+dx*distance, player.y+dy*distance, minute);
}

export function updateWaves(dt,elapsed,width,height,multiplier=1) {
  const minute=Math.min(14,Math.floor(elapsed/60));
  if(boss<bossMinutes.length && elapsed>=bossMinutes[boss]*60) {
    outside(6+boss,Math.random()*Math.PI*2,width,height,minute);
    boss++;
    return true;
  }
  if(elapsed>=elite) {
    outside(5,Math.random()*Math.PI*2,width,height,minute);
    elite+=eliteEvery;
  }
  const wave=waves[minute];
  clock-=dt;
  if(elapsed>=900 || clock>0) return false;
  clock=wave[0];
  if(wave[4] && special!==minute) {
    special=minute;
    const angle=Math.random()*Math.PI*2;
    for(let i=0;i<Math.ceil(24*multiplier);i++) {
      if(wave[4]==='ring') outside(4,angle+i*Math.PI*2/Math.ceil(24*multiplier),width,height,minute);
      else {
        const side=Math.cos(angle)<0 ? -1 : 1;
        spawn(4,player.x+side*(width/2+35),player.y+(i-12)*14,minute);
      }
    }
  }
  for(let i=0;i<Math.ceil(wave[1]*multiplier);i++) outside(wave[2+(Math.random()<.35 ? 1 : 0)],Math.random()*Math.PI*2,width,height,minute);
  return false;
}
