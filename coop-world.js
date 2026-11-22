import { coop, sendCoop, coopDirect, endCoop, broadcastCoop } from './coop-net.js';
import { start, finish, choose, skip, reroll, banishCard, dismissChest, useGameSlot, newCoopRun, viewportSize, hit, hurt, collect, interrupt } from './game.js';
import { player, stats, updatePlayer, passiveLevels } from './player.js';
import { readInput, movement } from './input.js';
import { mobs, tuneEnemies, updateEnemies } from './enemies.js';
import { shots, levels, evolved, enemyShot, updateWeapons } from './weapons.js';
import { loot, updateLoot } from './pickups.js';
import { updateWaves } from './waves.js';
import { choices, rarities } from './passives.js';
import { weapons } from './data/weapons.js';
import { characters } from './data/characters.js';
import { enemies } from './data/enemies.js';
import { cosmeticAppearance, cosmeticSprite } from './cosmetics.js';
import { getSprite } from './sprites.js';
import { startCombat, finishCombat, receiveCombatResult, combatDeath, combatRevive } from './combat-log.js';
import { sound, soundIds } from './audio.js';

const modes=['playing','level','chest','pause'];
export const emotes=['Aide','Merci','Attention','Danger','Ici','GG'];
const colors=['#b8e8aa','#8ddcfa','#ffc990','#e4acfa'];
const cardsChanged=new Event('cendres:coop-cards');
const downSeconds=30, reviveSeconds=3, reviveRadius=34, choiceSeconds=10;
const point=(v)=>Math.round(v*4);
const live=(t)=>!t.gone && t.avatar.hp>0;
const visualX=(v)=>v*.25;
const shotTargets=shots.map(()=>({x:0,y:0,ox:0,oy:0}));
const mobTargets=mobs.map(()=>({x:0,y:0,ox:0,oy:0}));
let party=[], local=0, elapsed=0, active=false, hostSeen=0, waveScale=1, finalBoss=false, bossIndex=-1;
let networkTimer=null, lastInput=0,lastPing=0,queuedCommand=null,sequence=0,latestTick=-1;
let guestPaused=false, endReport=null, endAt=0, resultTick=0, smoothStart=0, clockCorrection=0, style=0;
const packet={t:0,b:-1,p:[],m:[],s:[],l:[],u:[],c:[],k:[],e:[],a:[],v:[]};

export const activeWorld=()=>active;
export const localActor=()=>local;
export const worldMap=()=>active ? style : 0;
export const actorAppearance=index=>party[index]?.appearance??null;
export const choiceTime=()=>active ? party[local]?.choice ?? 0 : -1;
const host=()=>coop.host===coop.local;

function begin() {
  if(!coop.players?.length || !coop.id) return;
  const heroes=coop.players;
  local=heroes.findIndex(x=>x.id===coop.local);
  if(local<0) return;
  party=heroes.map((p,index)=>({
    index,id:p.id,pseudo:p.pseudo,character:p.character,appearance:cosmeticAppearance(p.equipped,p.character),run:newCoopRun(),avatar:null,stats:null,
    choice:0,choiceLevel:0,down:0,revive:0,gone:false,ghost:0,seen:performance.now(),
    x:0,y:0,inputSequence:0,commandSequence:0,sent:0,ox:0,oy:0,tx:0,ty:0,emote:-1,emoteLife:0
  }));
  elapsed=0; active=true; hostSeen=performance.now(); finalBoss=false; bossIndex=-1;
  lastInput=lastPing=0; queuedCommand=endReport=null; sequence=0; latestTick=-1; smoothStart=0; guestPaused=false;
  waveScale=1+.6*(party.length-1);
  const difficulty=({calme:.85,normal:1,ardue:1.25})[coop.difficulty]??1;
  style=({marais:0,lisiere:1,tourbiere:2})[coop.map]??0;
  tuneEnemies(waveScale*difficulty,250);
  startCombat(heroes[local].character,{
    id:coop.id,players:heroes,host:coop.host,difficulty:coop.difficulty,map:coop.map,startedAt:coop.startedAt,weapon:heroes[local].weapon
  });
  for(let i=0;i<party.length;i++) {
    const p=party[i], hero=heroes[i];
    useGameSlot(p);
    start(hero.character,hero.weapon,p);
    p.avatar.x=(i-(party.length-1)/2)*16;
    p.tx=p.avatar.x;
  }
  useGameSlot(party[local]);
  if(networkTimer===null) networkTimer=setInterval(networkTick,16);
}

function teamHurt(damage,index) {
  const t=party[index];
  if(!live(t)) return;
  useGameSlot(t);
  hurt(damage);
  useGameSlot(party[0]);
}

function teamHit(enemy,damage,critical,weapon=-1,index=0) {
  const t=party[index];
  if(!t) return;
  useGameSlot(t);
  hit(enemy,damage,critical,weapon,index);
  useGameSlot(party[0]);
}

function command(t,name,value) {
  if(name==='choose' && t.run.mode==='level' && choices.includes(value) && value>=0) choose(value);
  else if(name==='reroll') reroll();
  else if(name==='skip') skip();
  else if(name==='banish') banishCard(value);
  else if(name==='chest' && t.run.mode==='chest') dismissChest();
  else if(name==='emote' && Number.isInteger(value) && value>=0 && value<emotes.length && t.emoteLife<=0) {
    t.emote=value; t.emoteLife=2.5;
  }
}

export function queueCoopCommand(name,value=0) {
  if(!active || host()) return false;
  const run=party[local].run;
  queuedCommand=[++sequence,name,value,run.level,run.mode];
  return true;
}

export function coopPause(value) {
  if(!active) return false;
  if(!host()) guestPaused=value;
  party[local].run.mode=value?'pause':'playing';
  return true;
}

export function splitCoopGold(value,index) {
  if(!active) return false;
  const chunk=Math.floor(value/party.length);
  for(const t of party) {
    const base=chunk+(t.index===index ? value-chunk*party.length : 0);
    t.run.gold+=Math.round(base*t.stats.goldGain);
  }
  return true;
}

export function triggerEmote(index) {
  if(!active || queueCoopCommand('emote',index)) return;
  command(party[local],'emote',index);
}

function complete(mode,remote=null) {
  if(!active) return;
  active=false;
  const t=party[local];
  useGameSlot(t);
  if(host()) {
    let bosses=0;
    for(const p of party) bosses+=p.run.bossKills;
    endReport=finishCombat(mode==='won'?'win':'loss',elapsed,bosses);
    endAt=performance.now();
    resultTick=0;
    if(endReport) broadcastCoop('result',endReport);
  } else if(remote) receiveCombatResult(remote);
  else finishCombat('loss',elapsed,0,{submit:false});
  finish(mode,true);
}

function tickDown(t,dt) {
  if(t.avatar.hp>0 || t.gone) return;
  if(t.down===0) { t.down=downSeconds; combatDeath(t.index); }
  else if(t.down>0) t.down-=dt;
  if(t.down<=0) { t.down=-1; t.gone=true; return; }
  let helper=null;
  for(const p of party) {
    if(!live(p) || (p.avatar.x-t.avatar.x)**2+(p.avatar.y-t.avatar.y)**2>reviveRadius**2) continue;
    helper=p; break;
  }
  if(!helper) t.revive=0;
  else {
    t.revive+=dt;
    if(t.revive>=reviveSeconds) {
      t.avatar.hp=t.stats.health*.5; t.avatar.inv=2; t.down=t.revive=0;
      combatRevive(helper.index);
    }
  }
}

function finishChoice(t,dt) {
  if(t.run.mode==='level') {
    if(t.choiceLevel!==t.run.level) {
      t.choiceLevel=t.run.level; t.choice=choiceSeconds;
      if(t.index===local) dispatchEvent(cardsChanged);
    }
    t.choice=Math.max(0,t.choice-dt);
    if(t.choice===0) choose(choices[0]);
  } else t.choiceLevel=0;
}

function tickHost(dt) {
  elapsed+=dt;
  const now=performance.now(), viewport=viewportSize();
  readInput();
  let allDown=true, target=party[0];
  for(const t of party) {
    useGameSlot(t);
    t.run.elapsed=elapsed;
    t.emoteLife=Math.max(0,t.emoteLife-dt);
    if(t.index!==local && now-t.seen>8000 && !t.gone) {
      if(!t.ghost) { t.ghost=now; t.down=-1; t.avatar.hp=0; combatDeath(t.index); }
      if(now-t.ghost>5000) t.gone=true;
    }
    if(!t.ghost && live(t)) {
      allDown=false; target=t;
      if(t.run.mode==='playing') updatePlayer(dt,t.index===local?movement.x:t.x,t.index===local?movement.y:t.y);
      else updatePlayer(dt,0,0);
    }
  }
  if(allDown) { complete('lost'); return; }
  useGameSlot(target);
  const width=viewport.width,height=viewport.height;
  if(updateWaves(dt,elapsed,width,height,waveScale)) { sound(soundIds.boss); if(elapsed>=900) finalBoss=true; }
  useGameSlot(party[0]);
  updateEnemies(dt,Math.min(14,Math.floor(elapsed/60)),teamHurt,enemyShot,teamHit,party);
  let living=0;
  for(const t of party) {
    useGameSlot(t);
    if(!t.ghost) tickDown(t,dt);
    const alive=live(t);
    updateWeapons(dt,width,height,hit,teamHurt,party,alive);
    useGameSlot(t);
    if(alive) {
      living++;
      updateLoot(dt,collect);
      if(t.run.mode==='playing') interrupt();
      finishChoice(t,dt);
    }
  }
  bossIndex=-1;
  let count=0, lastBoss=false;
  for(let i=0;i<mobs.length;i++) {
    const m=mobs[i];
    if(!m.active) continue;
    count++;
    if(m.kind>=6 && (bossIndex<0 || mobs[bossIndex].kind<m.kind)) bossIndex=i;
    if(m.kind===8) lastBoss=true;
  }
  for(const t of party) { t.run.boss=bossIndex; t.run.enemyCount=count; }
  useGameSlot(party[local]);
  if(!living) complete('lost');
  else if(finalBoss && !lastBoss) complete('won');
}

function tickGuest(dt) {
  const t=party[local], now=performance.now();
  if(now-hostSeen>9000) { complete('lost'); return; }
  readInput();
  if(t.run.mode==='playing' && live(t)) updatePlayer(dt,movement.x,movement.y);
  const s=Math.min(1,(now-smoothStart)/100);
  const adjustment=Math.min(1,dt*5);
  if(t.ghost || t.gone || !t.avatar.hp) { t.avatar.x=t.tx; t.avatar.y=t.ty; }
  else if(latestTick>=0) {
    t.avatar.x+=(t.tx+movement.x*characters[t.character].speed*.075-t.avatar.x)*adjustment;
    t.avatar.y+=(t.ty+movement.y*characters[t.character].speed*.075-t.avatar.y)*adjustment;
  }
  for(const p of party) if(p!==t) { p.avatar.x=p.ox+(p.tx-p.ox)*s; p.avatar.y=p.oy+(p.ty-p.oy)*s; }
  for(let i=0;i<mobs.length;i++) if(mobs[i].active) {
    const p=mobTargets[i]; mobs[i].x=p.ox+(p.x-p.ox)*s; mobs[i].y=p.oy+(p.y-p.oy)*s;
  }
  for(let i=0;i<shots.length;i++) if(shots[i].life>0) {
    const p=shotTargets[i]; shots[i].x=p.ox+(p.x-p.ox)*s; shots[i].y=p.oy+(p.y-p.oy)*s;
  }
  if(t.run.mode==='level') t.choice=Math.max(0,t.choice-dt);
  for(const p of party) p.emoteLife=Math.max(0,p.emoteLife-dt);
  t.run.elapsed+=Math.min(dt*1.1,Math.max(0,clockCorrection+.10-t.run.elapsed));
  elapsed=t.run.elapsed;
}

export function updateCoopWorld(dt) { if(host()) tickHost(dt); else tickGuest(dt); }

function pack(t) {
  const w=viewportSize(), a=t.avatar, maxX=w.width/2+56,maxY=w.height/2+56;
  const x=a.x,y=a.y, m=packet.m,s=packet.s,l=packet.l,p=packet.p,c=packet.c,k=packet.k,e=packet.e,v=packet.v, run=t.run;
  packet.t=Math.round(elapsed*100);
  packet.b=bossIndex; packet.m.length=packet.s.length=packet.l.length=packet.p.length=0;
  for(const q of party) {
    const h=q.avatar;
    p.push(point(h.x),point(h.y),point(h.hp),point(q.stats.health),h.frame,h.facing,point(q.down),point(q.revive),Number(q.gone),q.emote,point(q.emoteLife));
  }
  for(let i=0;i<mobs.length;i++) {
    const q=mobs[i];
    if(!q.active || i!==bossIndex && (Math.abs(q.x-x)>maxX || Math.abs(q.y-y)>maxY)) continue;
    m.push(i,q.serial,q.kind,point(q.x),point(q.y),point(q.hp),point(q.max),q.facing,
      Number(q.flash>0)|Number(q.burn>0)<<1|Number(q.poison>0)<<2|Number(q.stun>0)<<3|Number(q.slow>0)<<4);
  }
  for(let i=0;i<shots.length;i++) {
    const q=shots[i];
    if(q.life<=0 || Math.abs(q.x-x)>maxX || Math.abs(q.y-y)>maxY) continue;
    s.push(i,q.kind,point(q.x),point(q.y),point(q.area),Math.round(q.life*100),Math.round(q.wait*100),q.strong?1:0,q.phase,point(q.vx),point(q.vy),q.owner);
  }
  for(let i=0;i<loot.length;i++) {
    const q=loot[i];
    if(q.active && Math.abs(q.x-x)<=maxX && Math.abs(q.y-y)<=maxY) l.push(i,q.kind,point(q.x),point(q.y),q.value);
  }
  useGameSlot(t);
  for(let i=0;i<choices.length;i++) { c[i]=choices[i]; v[i]=rarities[i]; }
  for(let i=0;i<levels.length;i++) { k[i]=levels[i]; e[i]=evolved[i]; }
  for(let i=0;i<passiveLevels.length;i++) packet.a[i]=passiveLevels[i];
  const u=packet.u;
  u[0]=modes.indexOf(run.mode); u[1]=run.level; u[2]=run.xp; u[3]=run.goal; u[4]=run.reward;
  u[5]=run.rerolls; u[6]=run.skips; u[7]=run.banishes; u[8]=point(t.choice); u[9]=t.commandSequence;
  u[10]=run.kills; u[11]=run.gold;
  useGameSlot(party[local]);
  return packet;
}

const seenMob=new Uint8Array(mobs.length),seenShot=new Uint8Array(shots.length),seenLoot=new Uint8Array(loot.length);
function snapshot(d) {
  if(!Number.isFinite(d?.t) || d.t<=latestTick || !Array.isArray(d.p) || d.p.length!==party.length*11 ||
    !Array.isArray(d.m) || !Array.isArray(d.s) || !Array.isArray(d.l) || !Array.isArray(d.u) ||
    !Array.isArray(d.c) || !Array.isArray(d.k) || !Array.isArray(d.e) || !Array.isArray(d.a) || !Array.isArray(d.v)) return;
  latestTick=d.t; smoothStart=performance.now(); clockCorrection=d.t*.01;
  const localHero=party[local], u=d.u;
  for(let j=0;j<party.length;j++) {
    const t=party[j], i=j*11, a=t.avatar;
    t.ox=a.x; t.oy=a.y;
    t.tx=visualX(d.p[i]); t.ty=visualX(d.p[i+1]); a.hp=visualX(d.p[i+2]); t.stats.health=visualX(d.p[i+3]);
    if(j!==local || !a.hp) a.frame=d.p[i+4]&3;
    a.facing=d.p[i+5]<0?-1:1;
    t.down=visualX(d.p[i+6]); t.revive=visualX(d.p[i+7]); t.gone=!!d.p[i+8];
    t.emote=d.p[i+9]|0; t.emoteLife=visualX(d.p[i+10]);
  }
  seenMob.fill(0); seenShot.fill(0); seenLoot.fill(0);
  for(let i=0;i+8<d.m.length && i<9*mobs.length;i+=9) {
    const index=d.m[i],kind=d.m[i+2],m=mobs[index],p=mobTargets[index];
    if(!m || !enemies[kind]) continue;
    p.x=visualX(d.m[i+3]); p.y=visualX(d.m[i+4]);
    if(!m.active || m.serial!==d.m[i+1]) { m.x=p.x; m.y=p.y; }
    p.ox=m.x; p.oy=m.y;
    seenMob[index]=1; m.active=true; m.serial=d.m[i+1]; m.kind=kind;
    m.hp=visualX(d.m[i+5]); m.max=visualX(d.m[i+6]); m.facing=d.m[i+7]<0?-1:1;
    const flags=d.m[i+8]; m.flash=flags&1; m.burn=flags&2; m.poison=flags&4; m.stun=flags&8; m.slow=flags&16;
  }
  for(let i=0;i+11<d.s.length && i<shots.length*12;i+=12) {
    const index=d.s[i],q=shots[index],p=shotTargets[index], kind=d.s[i+1];
    if(!q || (kind!==-1 && !weapons[kind])) continue;
    p.x=visualX(d.s[i+2]); p.y=visualX(d.s[i+3]);
    if(q.life<=0 || q.kind!==kind || Math.abs(q.x-p.x)+Math.abs(q.y-p.y)>90) { q.x=p.x; q.y=p.y; }
    p.ox=q.x; p.oy=q.y;
    seenShot[index]=1; q.kind=kind; q.area=visualX(d.s[i+4]); q.life=d.s[i+5]/100; q.wait=d.s[i+6]/100;
    q.strong=!!d.s[i+7]; q.phase=d.s[i+8]; q.vx=visualX(d.s[i+9]); q.vy=visualX(d.s[i+10]); q.owner=d.s[i+11]|0;
  }
  for(let i=0;i+4<d.l.length && i<loot.length*5;i+=5) {
    const index=d.l[i],q=loot[index];
    if(!q || d.l[i+1]<0 || d.l[i+1]>5) continue;
    seenLoot[index]=1; q.active=true; q.kind=d.l[i+1]; q.x=visualX(d.l[i+2]); q.y=visualX(d.l[i+3]); q.value=d.l[i+4];
  }
  for(let i=0;i<mobs.length;i++) if(!seenMob[i]) mobs[i].active=false;
  for(let i=0;i<shots.length;i++) if(!seenShot[i]) shots[i].life=0;
  for(let i=0;i<loot.length;i++) if(!seenLoot[i]) loot[i].active=false;
  const run=localHero.run;
  run.boss=mobs[d.b]?.active?d.b:-1;
  run.enemyCount=d.m.length/9;
  const wasMode=run.mode, wasLevel=run.level, wasReward=run.reward;
  run.mode=modes[u[0]]??'playing';
  if(guestPaused && run.mode==='playing') run.mode='pause'; run.level=u[1]; run.xp=u[2]; run.goal=u[3]; run.reward=u[4];
  run.rerolls=u[5]; run.skips=u[6]; run.banishes=u[7]; localHero.choice=visualX(u[8]); run.kills=u[10]; run.gold=Math.max(0,u[11]|0);
  if(queuedCommand && u[9]>=queuedCommand[0]) queuedCommand=null;
  let changed=wasMode!==run.mode || wasLevel!==run.level || wasReward!==run.reward;
  for(let i=0;i<choices.length;i++) {
    if(choices[i]!==d.c[i] || rarities[i]!==d.v[i]) changed=true;
    choices[i]=d.c[i]; rarities[i]=d.v[i];
  }
  for(let i=0;i<levels.length;i++) { levels[i]=d.k[i]; evolved[i]=d.e[i]; }
  for(let i=0;i<passiveLevels.length;i++) passiveLevels[i]=d.a[i];
  if(changed && (run.mode==='level' || run.mode==='chest')) dispatchEvent(cardsChanged);
}

function receive(event) {
  const {id,type,payload}=event.detail;
  if(!party.length || !(active || endReport || type==='result')) return;
  const t=party.find(x=>x.id===id);
  if(!t || t.index===local) return;
  if(type==='ping') { sendCoop(id,'pong',payload); return; }
  if(type==='pong') { t.seen=performance.now(); if(id===coop.host) hostSeen=t.seen; return; }
  if(host() && type==='input' && active) {
    if(!Array.isArray(payload) || !Number.isSafeInteger(payload[0]) || payload[0]<=t.inputSequence) return;
    t.seen=performance.now(); t.inputSequence=payload[0];
    if(t.ghost || t.gone) return;
    let x=Number(payload[1])||0,y=Number(payload[2])||0;
    if(!Number.isFinite(x) || !Number.isFinite(y)) x=y=0;
    const length=Math.max(1,Math.hypot(x,y));
    t.x=x/length; t.y=y/length;
    const cmd=payload[3];
    if(Array.isArray(cmd) && Number.isSafeInteger(cmd[0]) && cmd[0]>t.commandSequence) {
      t.commandSequence=cmd[0];
      if(cmd[1]==='emote' || cmd[3]===t.run.level && cmd[4]===t.run.mode) {
        useGameSlot(t); command(t,cmd[1],cmd[2]); useGameSlot(party[local]);
      }
    }
  } else if(!host() && id===coop.host) {
    hostSeen=performance.now();
    if(type==='snapshot' && active) snapshot(payload);
    if(type==='result' && payload?.id===coop.id) {
      if(active) complete(payload.result==='win'?'won':'lost',payload);
      else receiveCombatResult(payload);
    }
  }
}

function networkTick() {
  const now=performance.now();
  if(endReport) {
    if(now-endAt>7500) endReport=null;
    else if(now-resultTick>400) {
      resultTick=now;
      for(const t of party) if(t.index!==local) sendCoop(t.id,'result',endReport);
    }
  }
  if(!active) {
    if(!endReport && networkTimer!==null) { clearInterval(networkTimer); networkTimer=null; }
    return;
  }
  if(host()) {
    for(const t of party) {
      if(t.index===local || t.gone || now<t.sent) continue;
      const interval=coopDirect(t.id)?1000/15:100;
      t.sent=Math.max(now-interval*.5,t.sent)+interval;
      sendCoop(t.id,'snapshot',pack(t));
    }
  } else if(now>=lastInput) {
    const interval=coopDirect(coop.host)?50:100;
    lastInput=Math.max(now-interval*.5,lastInput)+interval;
    const canMove=party[local].run.mode==='playing';
    sendCoop(coop.host,'input',[++sequence,canMove?movement.x:0,canMove?movement.y:0,queuedCommand]);
  }
  if(now-lastPing>=2000) {
    lastPing=now;
    for(const t of party) if(t.index!==local && (host() || t.id===coop.host)) sendCoop(t.id,'ping',now);
  }
}

export function initCoopWorld() {
  addEventListener('cendres:coop-start',begin);
  addEventListener('cendres:coop-message',receive);
  addEventListener('cendres:coop-peer',event=>{
    if(!active || event.detail.status!=='left') return;
    const member=party.find(p=>p.id===event.detail.id);
    if(member) member.seen=performance.now()-8100;
    if(event.detail.id===coop.host) hostSeen=performance.now()-9100;
  });
  addEventListener('cendres:match-recorded',event=>{
    if(host() && event.detail?.id===coop.id) {
      endReport=event.detail;
      endAt=performance.now();
      if(networkTimer===null) networkTimer=setInterval(networkTick,16);
    }
  });
  const closeHost=()=>{ if(active && host()) complete('lost'); };
  addEventListener('pagehide',closeHost);
  addEventListener('offline',closeHost);
}


export async function leaveCoopWorld() {
  if(active) complete('lost');
  endCoop();
  party=[]; endReport=null;
}

export function renderTeam(ctx,left,top,width,height) {
  if(!active) return;
  const own=party[local];
  for(const t of party) {
    const a=t.avatar;
    if(t.gone) continue;
    const x=Math.round(a.x)-left,y=Math.round(a.y)-top;
    const on=x>=8 && x<width-8 && y>=12 && y<height-12;
    if(t===own && t.emoteLife<=0 && !t.down) continue;
    ctx.fillStyle=colors[t.index];
    if(on) {
      if(t!==own) {
        ctx.globalAlpha=t.down || t.ghost ? .48 : 1;
        ctx.setTransform(a.facing,0,0,1,x,y);
        ctx.drawImage(cosmeticSprite(t.character,a.frame,t.appearance?.skin??t.appearance?.character)??getSprite(a.sprite,a.frame),-8,-8);
        ctx.resetTransform(); ctx.globalAlpha=1;
      }
      ctx.fillRect(x-7,y+7,Math.ceil(14*a.hp/t.stats.health),2);
      if(t.down>0) {
        ctx.fillStyle='#fcd78a'; ctx.fillRect(x-7,y+9,Math.ceil(14*t.revive/reviveSeconds),2);
        ctx.font='bold 8px monospace'; ctx.fillText(Math.ceil(t.down),x-5,y-10);
      }
      if(t.emoteLife>0) { ctx.font='bold 8px monospace'; ctx.fillText(emotes[t.emote]??'',x-8,y-17); }
    } else if(t!==own) {
      const px=Math.max(8,Math.min(width-8,x)),py=Math.max(12,Math.min(height-16,y));
      const angle=Math.atan2(y-height/2,x-width/2);
      ctx.setTransform(Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),px,py);
      ctx.beginPath(); ctx.moveTo(5,0); ctx.lineTo(-3,-4); ctx.lineTo(-3,4); ctx.fill(); ctx.resetTransform();
      ctx.fillRect(px-7,py+5,Math.ceil(14*a.hp/t.stats.health),2);
    }
  }
}
