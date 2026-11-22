import { weapons, synergyTag } from './data/weapons.js';
import { caps } from './data/waves.js';
import { player, stats } from './player.js';
import { mobs, bucket, head, links, inflict, push } from './enemies.js';
import { sound } from './audio.js';

export const levels=new Uint8Array(weapons.length), evolved=new Uint8Array(weapons.length);
const timers=new Float32Array(weapons.length);
export const shots=Array.from({length:caps.shots},()=>({life:0,total:0,kind:0,x:0,y:0,vx:0,vy:0,damage:0,area:0,pierce:0,mark:0,wait:0,strong:false, config:null, reach:0, phase:0, interval:0}));
const contacted=new Uint32Array(caps.shots*caps.enemies);
const configs=weapons.map(()=>({}));
const baseLevel={spread:.18,mirror:false,ricochet:false,chain:false,echo:false,poison:0,stun:0};
const factorKeys=new Set(['degats','zone','cooldown','duree']);
let sequence=0, swing=1, orbit=0, cooldown=0;

export function hasSynergy(id, preview=false) {
  if(!weapons[id].tags.includes(synergyTag)) return false;
  for(let i=0;i<weapons.length;i++) if(i!==id && levels[i] && weapons[i].tags.includes(synergyTag)) return preview || levels[id]>0;
  return false;
}

export function refreshWeapons() {
  for(let id=0;id<levels.length;id++) {
    if(!levels[id]) continue;
    const w=weapons[id], cfg=configs[id], base=w.baseStats;
    Object.assign(cfg,baseLevel,base);
    for(let level=1;level<levels[id];level++) {
      const delta=w.niveaux[level];
      for(const key in delta) {
        if(typeof delta[key]==='boolean' || key==='spread') cfg[key]=delta[key];
        else cfg[key]+=delta[key]*(factorKeys.has(key) ? base[key] : 1);
      }
    }
    cfg.degats*=stats.force;
    cfg.cooldown/=stats.haste;
    cfg.zone*=stats.area;
    cfg.vitesse*=stats.shotSpeed;
    cfg.duree*=stats.duration;
    cfg.crit=Math.min(.85,cfg.crit*stats.luck+(stats.crit||0));
    cfg.status=w.status;
    cfg.statusTime=w.dureeStatut+cfg.poison+cfg.stun;
    if(cfg.status==='burn' && hasSynergy(id)) cfg.statusTime*=1.5;
    cfg.behavior=behaviors[w.type];
    cfg.son=w.son;
    if(evolved[id]) {
      const bonus=w.evolution.bonus;
      cfg.degats*=bonus.degats;
      cfg.zone*=bonus.zone;
      cfg.projectiles+=bonus.projectiles;
      cfg.son=w.evolution.son;
    }
  }
}

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
    s.config=kind>=0 ? configs[kind] : null;
    s.reach=s.config?.portee ?? Infinity;
    s.phase=s.interval=0;
    return s;
  }
  return null;
}

export function enemyShot(x,y,dx,dy,damage) {
  projectile(-1,x,y,dx*86,dy*86,damage,4,3,1);
}

function nearest(width,height,range,x0=player.x,y0=player.y) {
  let target=null, best=range*range;
  for(let i=0;i<mobs.length;i++) {
    const m=mobs[i];
    if(!m.active) continue;
    const x=m.x-x0,y=m.y-y0;
    if(Math.abs(x)>width/2+12 || Math.abs(y)>height/2+12) continue;
    const d=x*x+y*y;
    if(d<best) { best=d; target=m; }
  }
  return target;
}

function randomTarget(width,height,range) {
  const first=Math.floor(Math.random()*mobs.length);
  for(let i=0;i<mobs.length;i++) {
    const m=mobs[(first+i)%mobs.length];
    if((m.x-player.x)**2+(m.y-player.y)**2>range*range) continue;
    if(m.active && Math.abs(m.x-player.x)<width/2 && Math.abs(m.y-player.y)<height/2) return m;
  }
  return null;
}

function emit(id,c,x,y,vx=0,vy=0,area=c.zone,life=c.duree,wait=0) {
  return projectile(id,x,y,vx,vy,c.degats,area,life,c.perforation,wait);
}

function follow(s) { s.x=player.x; s.y=player.y; return true; }

function travel(s,dt) {
  const x=s.vx*dt,y=s.vy*dt;
  s.x+=x; s.y+=y;
  if(s.reach!==Infinity) s.reach-=Math.hypot(x,y);
  if(s.reach<=0) s.life=0;
  return s.life>0;
}

function timedHit(s,dt) {
  s.interval-=dt;
  if(s.interval>0) return false;
  s.interval=.38;
  s.mark=++sequence;
  s.pierce=s.config.perforation;
  return true;
}

function fan(id,c,angle) {
  for(let i=0;i<c.projectiles;i++) {
    const a=angle+(i-(c.projectiles-1)/2)*c.spread;
    emit(id,c,player.x,player.y,Math.cos(a)*c.vitesse,Math.sin(a)*c.vitesse);
  }
  return true;
}

const behaviors={
  arc:{fire(id,c) {
    swing=-swing;
    for(let i=0;i<c.projectiles;i++) emit(id,c,player.x,player.y,(c.mirror && i%2 ? -1 : 1)*swing,i*7,c.zone+i*6);
    return true;
  },step(s) { follow(s); s.y+=s.vy; return true; }},
  target:{fire(id,c,w,h) {
    const m=nearest(w,h,c.portee);
    return m ? fan(id,c,Math.atan2(m.y-player.y,m.x-player.x)) : false;
  },step:travel,consume:true},
  direction:{fire(id,c) { return fan(id,c,Math.atan2(player.dy,player.dx)); },step:travel,consume:true},
  orbit:{fire(id,c) {
    for(let i=0;i<c.projectiles;i++) emit(id,c,player.x,player.y,orbit+i*Math.PI*2/c.projectiles,c.zone,9);
    return true;
  },step(s,dt) {
    s.vx+=dt*s.config.vitesse;
    s.x=player.x+Math.cos(s.vx)*s.vy; s.y=player.y+Math.sin(s.vx)*s.vy;
    return true;
  }},
  lob:{fire(id,c,w,h) {
    const m=nearest(w,h,c.portee), x=player.x,y=player.y;
    for(let i=0;i<c.projectiles;i++) {
      const tx=(m?.x ?? x+player.dx*66)+(i%2 ? 22 : -i*10);
      const ty=(m?.y ?? y+player.dy*66)+i*12;
      emit(id,c,x,y,(tx-x)/.55,(ty-y)/.55,c.zone,c.duree+.55,.55);
    }
    return true;
  },step(s,dt) {
    if(s.wait>0) {
      const step=Math.min(dt,s.wait);
      s.x+=s.vx*step; s.y+=s.vy*step;
      s.wait-=step;
    }
    return s.wait<=0 && timedHit(s,dt);
  }},
  aura:{fire(id,c) {
    const s=emit(id,c,player.x,player.y,0,0,c.zone*Math.sqrt(c.projectiles));
    if(s) s.pierce+=c.projectiles-1;
    return true;
  },step:follow},
  lightning:{fire(id,c,w,h) {
    let fired=false;
    for(let i=0;i<c.projectiles;i++) {
      const m=randomTarget(w,h,c.portee);
      if(m) { emit(id,c,m.x,m.y); fired=true; }
    }
    return fired;
  },step:()=>true},
  bounce:{fire(id,c) { return fan(id,c,Math.atan2(player.dy,player.dx)+Math.PI/5); },step(s,dt,w,h) {
    if(!travel(s,dt)) return false;
    const x=s.x-player.x,y=s.y-player.y,maxX=w/2-4,maxY=h/2-4;
    if(Math.abs(x)>maxX) { s.vx=-Math.sign(x)*Math.abs(s.vx); s.x=player.x+Math.sign(x)*maxX; if(s.config.ricochet) s.mark=++sequence; }
    if(Math.abs(y)>maxY) { s.vy=-Math.sign(y)*Math.abs(s.vy); s.y=player.y+Math.sign(y)*maxY; if(s.config.ricochet) s.mark=++sequence; }
    return true;
  },consume:true},
  trap:{fire(id,c) {
    const a=Math.atan2(player.dy,player.dx)+Math.PI;
    for(let i=0;i<c.projectiles;i++) {
      const d=a+(i-(c.projectiles-1)/2)*.55;
      emit(id,c,player.x+Math.cos(d)*22,player.y+Math.sin(d)*22);
    }
    return true;
  },step(s,dt,w,h) {
    if(s.phase) return true;
    if(!nearest(w,h,12,s.x,s.y)) return false;
    triggerTrap(s);
    if(s.config.chain) for(let i=0;i<shots.length;i++) {
      const o=shots[i];
      if(o.life>0 && o.config?.behavior===behaviors.trap && !o.phase && (o.x-s.x)**2+(o.y-s.y)**2<s.area**2) triggerTrap(o);
    }
    return true;
  }},
  return:{fire(id,c) { return fan(id,c,Math.atan2(player.dy,player.dx)); },step(s,dt) {
    if(!s.phase && (s.reach<=s.config.portee*.12 || s.life<=s.total*.52)) {
      s.phase=1; s.mark=++sequence; s.pierce=s.config.perforation;
    }
    if(s.phase) {
      const x=player.x-s.x,y=player.y-s.y,d=x*x+y*y;
      if(d<49) {
        if(!s.config.echo || s.phase>1) { s.life=0; return false; }
        s.phase=2; s.mark=++sequence; s.pierce=s.config.perforation;
        s.vx=-s.vx; s.vy=-s.vy; s.life+=.24;
      } else if(s.phase===1) {
        const speed=s.config.vitesse*1.25/Math.sqrt(d);
        s.vx=x*speed; s.vy=y*speed;
      }
      s.x+=s.vx*dt; s.y+=s.vy*dt;
      return true;
    }
    return travel(s,dt);
  }},
  ally:{fire(id,c) {
    for(let i=0;i<c.projectiles;i++) emit(id,c,player.x,player.y+i*12);
    return true;
  },step(s,dt,w,h) {
    const m=nearest(w,h,s.config.portee,s.x,s.y), x=(m?.x ?? player.x)-s.x,y=(m?.y ?? player.y)-s.y;
    const d=x*x+y*y;
    if(d>4) {
      const step=Math.min(1,s.config.vitesse*dt/Math.sqrt(d));
      s.vx=x; s.x+=x*step; s.y+=y*step;
    }
    return timedHit(s,dt);
  }}
};

function triggerTrap(s) { s.phase=1; s.life=.22; }

function collisions(s,hit,offset) {
  const reach=s.area+16;
  const sx=s.x, sy=s.y;
  for(let y=Math.floor((sy-reach)/32);y<=Math.floor((sy+reach)/32);y++) {
    for(let x=Math.floor((sx-reach)/32);x<=Math.floor((sx+reach)/32);x++) {
      for(let i=head[bucket(x,y)];i>=0;i=links[i]) {
        const m=mobs[i];
        if(!m.active || contacted[offset+i]===s.mark || Math.floor(m.x/32)!==x || Math.floor(m.y/32)!==y) continue;
        const dx=m.x-sx,dy=m.y-sy, range=s.area+(m.kind>=6 ? 13 : 6);
        if(dx*dx+dy*dy>range*range || (s.config.behavior===behaviors.arc && dx*s.vx< -6)) continue;
        contacted[offset+i]=s.mark;
        const c=s.config, critical=Math.random()<c.crit;
        if(c.status) inflict(m,c.status,c.statusTime,s.damage);
        if(c.recul) push(m,sx,sy,c.recul);
        hit(m,s.damage*(critical ? 2 : 1),critical);
        if(--s.pierce<=0) { if(c.behavior.consume) s.life=0; return; }
      }
    }
  }
}

export function updateWeapons(dt,width,height,hit,hurt) {
  orbit=(orbit+dt*4)%(Math.PI*2);
  cooldown-=dt;
  for(let i=0;i<weapons.length;i++) {
    if(!levels[i]) continue;
    timers[i]-=dt;
    if(timers[i]>0) continue;
    const c=configs[i];
    if(c.behavior.fire(i,c,width,height)) {
      timers[i]=c.cooldown;
      if(cooldown<=0 || evolved[i]) { sound(c.son); cooldown=.13; }
    } else timers[i]=.1;
  }
  for(let i=0;i<shots.length;i++) {
    const s=shots[i];
    if(s.life<=0) continue;
    s.life-=dt;
    if(s.life<=0) continue;
    if(s.kind<0) {
      travel(s,dt);
      const dx=s.x-player.x,dy=s.y-player.y;
      if(dx*dx+dy*dy<81) { hurt(s.damage); s.life=0; }
    } else if(s.config.behavior.step(s,dt,width,height) && s.pierce>0) collisions(s,hit,i*caps.enemies);
  }
}
