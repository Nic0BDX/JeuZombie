import { weapons } from './data/weapons.js';
import { caps } from './data/waves.js';
import { player, stats } from './player.js';
import { mobs, bucket, head, links } from './enemies.js';
import { sound } from './audio.js';

export const levels=new Uint8Array(weapons.length), evolved=new Uint8Array(weapons.length);
const timers=new Float32Array(weapons.length);
export const shots=Array.from({length:caps.shots},()=>({life:0,total:0,kind:0,x:0,y:0,vx:0,vy:0,damage:0,area:0,pierce:0,mark:0,wait:0,strong:false}));
const contacted=new Uint32Array(caps.shots*caps.enemies);
let sequence=0, swing=1, orbit=0, cooldown=0;

export function resetWeapons(start) {
  levels.fill(0); evolved.fill(0); timers.fill(0); levels[start]=1;
  for(let i=0;i<shots.length;i++) shots[i].life=0;
  contacted.fill(0); sequence=0; swing=1; orbit=0; cooldown=0;
}

function projectile(kind,x,y,vx,vy,damage,area,life,pierce,wait=0) {
  for(let i=0;i<shots.length;i++) {
    const s=shots[i];
    if(s.life>0) continue;
    s.life=s.total=life; s.kind=kind; s.x=x; s.y=y; s.vx=vx; s.vy=vy;
    s.damage=damage; s.area=area; s.pierce=pierce; s.mark=++sequence;
    s.wait=wait; s.strong=kind>=0 && !!evolved[kind];
    return s;
  }
  return null;
}

export function enemyShot(x,y,dx,dy,damage) {
  projectile(-1,x,y,dx*86,dy*86,damage,4,3,1);
}

function nearest(width,height) {
  let target=null, best=Infinity;
  for(let i=0;i<mobs.length;i++) {
    const m=mobs[i];
    if(!m.active) continue;
    const x=m.x-player.x,y=m.y-player.y;
    if(Math.abs(x)>width/2+12 || Math.abs(y)>height/2+12) continue;
    const d=x*x+y*y;
    if(d<best) { best=d; target=m; }
  }
  return target;
}

function randomTarget(width,height) {
  const first=Math.floor(Math.random()*mobs.length);
  for(let i=0;i<mobs.length;i++) {
    const m=mobs[(first+i)%mobs.length];
    if(m.active && Math.abs(m.x-player.x)<width/2 && Math.abs(m.y-player.y)<height/2) return m;
  }
  return null;
}

function fire(id,width,height) {
  const w=weapons[id], level=levels[id]-1, strong=evolved[id];
  const damage=w.damage*stats.force*(1+level*.24)*(strong ? 1.85 : 1);
  const area=w.area*stats.area*(1+level*.075)*(strong ? 1.26 : 1);
  const life=w.duration*stats.duration*(1+level*.08);
  const count=1+Math.floor(level/3)+strong, pierce=w.pierce+Math.floor(level/2)+strong;
  const x=player.x,y=player.y;
  let target=id===5 ? randomTarget(width,height) : id===1 || id===3 ? nearest(width,height) : null;
  if(!target && (id===1 || id===5)) return false;
  if(id===0) {
    swing=-swing;
    projectile(id,x,y,swing,0,damage,area,life,pierce+count);
    if(strong) projectile(id,x,y,-swing,0,damage,area,life,pierce+count);
  } else if(id===4) {
    projectile(id,x,y,0,0,damage,area,life,pierce+count);
  } else for(let i=0;i<count;i++) {
    if(id===5) {
      if(i) target=randomTarget(width,height);
      if(target) projectile(id,target.x,target.y,0,0,damage,area,life,pierce);
    } else if(id===3) {
      const tx=(target?.x ?? x+player.dx*70)+(i%2 ? 26 : -i*12);
      const ty=(target?.y ?? y+player.dy*70)+i*14;
      projectile(id,x,y,(tx-x)/.55,(ty-y)/.55,damage,area,.55+life,pierce,.55);
    } else if(id===2) {
      const angle=orbit+i*Math.PI*2/count;
      projectile(id,x+Math.cos(angle)*area,y+Math.sin(angle)*area,angle,area,damage,8*stats.area,Math.max(life,.45),pierce);
    } else {
      const base=id===1 ? Math.atan2(target.y-y,target.x-x) : Math.atan2(player.dy,player.dx);
      const angle=base+(i-(count-1)/2)*.24+(id===6 ? Math.PI/5 : 0);
      const speed=(id===6 ? 115 : 160)*stats.shotSpeed;
      projectile(id,x,y,Math.cos(angle)*speed,Math.sin(angle)*speed,damage,area,life,pierce);
    }
  }
  return true;
}

function collisions(s,hit,offset) {
  const reach=s.area+16;
  const sx=s.x, sy=s.y;
  for(let y=Math.floor((sy-reach)/32);y<=Math.floor((sy+reach)/32);y++) {
    for(let x=Math.floor((sx-reach)/32);x<=Math.floor((sx+reach)/32);x++) {
      for(let i=head[bucket(x,y)];i>=0;i=links[i]) {
        const m=mobs[i];
        if(!m.active || contacted[offset+i]===s.mark || Math.floor(m.x/32)!==x || Math.floor(m.y/32)!==y) continue;
        const dx=m.x-sx,dy=m.y-sy, range=s.area+(m.kind>=6 ? 13 : 6);
        if(dx*dx+dy*dy>range*range || (s.kind===0 && dx*s.vx< -6)) continue;
        contacted[offset+i]=s.mark;
        hit(m,s.damage,s.strong);
        if(--s.pierce<=0) { if(s.kind===1 || s.kind===6 || s.kind===7) s.life=0; return; }
      }
    }
  }
}

export function updateWeapons(dt,width,height,hit,hurt) {
  orbit+=dt*4;
  cooldown-=dt;
  for(let i=0;i<weapons.length;i++) {
    if(!levels[i]) continue;
    timers[i]-=dt;
    if(timers[i]>0) continue;
    if(fire(i,width,height)) {
      timers[i]=weapons[i].cooldown/(stats.haste*(1+(levels[i]-1)*.10+evolved[i]*.2));
      if(cooldown<=0) { sound(0); cooldown=.13; }
    } else timers[i]=.1;
  }
  for(let i=0;i<shots.length;i++) {
    const s=shots[i];
    if(s.life<=0) continue;
    s.life-=dt;
    if(s.life<=0) continue;
    if(s.kind===2) {
      s.vx+=dt*4;
      s.x=player.x+Math.cos(s.vx)*s.vy; s.y=player.y+Math.sin(s.vx)*s.vy;
    } else if(s.kind===4 || s.kind===0) { s.x=player.x; s.y=player.y; }
    else if(s.kind!==5 && (s.kind!==3 || s.wait>0)) {
      const step=s.kind===3 ? Math.min(dt,s.wait) : dt;
      s.x+=s.vx*step; s.y+=s.vy*step;
      if(s.kind===3) { s.wait-=dt; if(s.wait>0) continue; }
    }
    if(s.kind===6) {
      const left=player.x-width/2+4, right=player.x+width/2-4;
      const top=player.y-height/2+4, bottom=player.y+height/2-4;
      if(s.x<left || s.x>right) { s.vx=s.x<left ? Math.abs(s.vx) : -Math.abs(s.vx); s.x=Math.max(left,Math.min(right,s.x)); }
      if(s.y<top || s.y>bottom) { s.vy=s.y<top ? Math.abs(s.vy) : -Math.abs(s.vy); s.y=Math.max(top,Math.min(bottom,s.y)); }
    }
    if(s.kind<0) {
      const dx=s.x-player.x,dy=s.y-player.y;
      if(dx*dx+dy*dy<81) { hurt(s.damage); s.life=0; }
    } else if(s.pierce>0) collisions(s,hit,i*caps.enemies);
  }
}
