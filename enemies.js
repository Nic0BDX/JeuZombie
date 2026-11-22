import { trackEnemy } from './meta.js';
import { enemies } from './data/enemies.js';
import { caps, damageGrowth, hpGrowth } from './data/waves.js';
import { player } from './player.js';

export const mobs = Array.from({length:caps.enemies},()=>({ active:false, x:0,y:0,hp:0,max:0,kind:0,flash:0,fire:0,facing:1,burn:0,poison:0,slow:0,stun:0,burnDmg:0,poisonDmg:0,tick:0,kx:0,ky:0,knock:0 }));
export const head = new Int16Array(4096), links = new Int16Array(caps.enemies);
const cell = 32;

export function bucket(x,y) {
  return (Math.imul(x,73856093) ^ Math.imul(y,19349663)) & 4095;
}

export function rebuild() {
  head.fill(-1);
  for (let i=0;i<mobs.length;i++) {
    const m=mobs[i];
    if (!m.active) continue;
    const key=bucket(Math.floor(m.x/cell),Math.floor(m.y/cell));
    links[i]=head[key]; head[key]=i;
  }
}

export function spawn(kind,x,y,minute) {
  for (let i=0;i<mobs.length;i++) {
    const m=mobs[i];
    if (m.active) continue;
    trackEnemy(kind); m.active=true; m.kind=kind; m.x=x; m.y=y; m.flash=0; m.burn=m.poison=m.slow=m.stun=m.tick=m.kx=m.ky=m.knock=m.burnDmg=m.poisonDmg=0;
    m.max=m.hp=enemies[kind].hp*(kind>=6 ? 1 : 1+minute*hpGrowth);
    m.fire=enemies[kind].fire;
    return;
  }
  if (kind >= 5) {
    for (let i=0;i<mobs.length;i++) {
      if (mobs[i].kind>=5) continue;
      mobs[i].active=false;
      spawn(kind,x,y,minute);
      return;
    }
  }
}

export function inflict(m,status,duration,damage) {
  if(status==='stun' && m.kind>=6) duration*=.35;
  if(status==='burn') m.burnDmg=m.burn>0 ? Math.max(m.burnDmg,damage*.24) : damage*.24;
  if(status==='poison') m.poisonDmg=m.poison>0 ? Math.max(m.poisonDmg,damage*.18) : damage*.18;
  m[status]=Math.max(m[status],duration);
}

export function push(m,x,y,force) {
  const dx=m.x-x,dy=m.y-y,d=dx*dx+dy*dy;
  if(d<1) return;
  const gain=force*(m.kind>=6 ? .25 : 1)/Math.sqrt(d);
  m.kx=dx*gain; m.ky=dy*gain; m.knock=.20;
}

function tickStatuses(m,dt,hit) {
  if(m.burn>0 || m.poison>0) {
    m.tick-=dt;
    if(m.tick<=0) {
      m.tick+=.45;
      hit(m,(m.burn>0 ? m.burnDmg : 0)+(m.poison>0 ? m.poisonDmg : 0),false);
    }
  } else m.tick=0;
  m.burn=Math.max(0,m.burn-dt);
  m.poison=Math.max(0,m.poison-dt);
  m.slow=Math.max(0,m.slow-dt);
  m.stun=Math.max(0,m.stun-dt);
  m.knock=Math.max(0,m.knock-dt);
}

export function updateEnemies(dt,minute,hurt,shoot,hit) {
  rebuild();
  for (let i=0;i<mobs.length;i++) {
    const m=mobs[i];
    if (!m.active) continue;
    tickStatuses(m,dt,hit);
    if(!m.active) continue;
    const type=enemies[m.kind], dx=player.x-m.x, dy=player.y-m.y;
    const d2=dx*dx+dy*dy;
    if(m.kind<5 && d2>810000) { m.active=false; continue; }
    const d=Math.sqrt(d2)||1;
    const ranged=type.fire>0 && d<100;
    const speed=type.speed*(ranged ? (d<65 ? -.55 : .2) : 1);
    let vx=dx/d*speed, vy=dy/d*speed;
    const cx=Math.floor(m.x/cell), cy=Math.floor(m.y/cell);
    for (let y=cy-1;y<=cy+1;y++) for (let x=cx-1;x<=cx+1;x++) {
      for(let j=head[bucket(x,y)];j>=0;j=links[j]) {
        if(j===i || !mobs[j].active) continue;
        const o=mobs[j], ox=m.x-o.x, oy=m.y-o.y;
        if (Math.floor(o.x/cell)!==x || Math.floor(o.y/cell)!==y) continue;
        const n=ox*ox+oy*oy;
        if (n>=196) continue;
        if (n===0) vx+=i<j ? 5 : -5;
        else { vx+=ox*(196-n)*.015; vy+=oy*(196-n)*.015; }
      }
    }
    const movement=m.stun>0 ? 0 : m.slow>0 ? .57 : 1;
    m.x+=(vx*movement+(m.knock>0 ? m.kx : 0))*dt;
    m.y+=(vy*movement+(m.knock>0 ? m.ky : 0))*dt;
    m.facing=dx<0 ? -1 : 1;
    m.flash=Math.max(0,m.flash-dt);
    const reach=type.radius+5;
    const damage=type.damage*(1+minute*damageGrowth);
    if(m.stun>0) continue;
    if(d2<reach*reach) hurt(damage);
    if(!type.fire || d2>36000) continue;
    m.fire-=dt;
    if(m.fire>0) continue;
    m.fire=type.fire;
    shoot(m.x,m.y,dx/d,dy/d,damage);
    if(m.kind>=6) {
      shoot(m.x,m.y,dx/d*.9-dy/d*.43,dy/d*.9+dx/d*.43,damage);
      shoot(m.x,m.y,dx/d*.9+dy/d*.43,dy/d*.9-dx/d*.43,damage);
    }
    if(m.kind>=7) {
      shoot(m.x,m.y,-dy/d,dx/d,damage);
      shoot(m.x,m.y,dy/d,-dx/d,damage);
    }
  }
  rebuild();
}
