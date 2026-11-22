import { activeWorld, updateCoopWorld, queueCoopCommand, localActor, worldMap, renderTeam, actorAppearance, splitCoopGold } from './coop-world.js';
import { activeCosmetics, cosmeticSprite, primeCosmeticSprite } from './cosmetics.js';
import { startCombat, finishCombat, combatHit, combatTaken, combatHeal, combatLevel, combatDeath, combatEquip } from './combat-log.js';
import { finishRewards, trackKill, trackWeapon, trackEvolution } from './meta.js';
import { player, updatePlayer, resetPlayer, stats, passiveLevels, useHero } from './player.js';
import { readInput, movement, stick } from './input.js';
import { getSprite, terrainVariants, tileHash, creatures, buildCreatures, ghostHound } from './sprites.js';

import { enemies, invulnerability } from './data/enemies.js';
import { caps } from './data/waves.js';
import { characters } from './data/characters.js';
import { xpGoal, gemTier, utilityCards, chestGold, cardTools } from './data/cards.js';
import { weapons } from './data/weapons.js';
import { mobs, updateEnemies, tuneEnemies } from './enemies.js';
import { shots, levels, evolved, enemyShot, resetWeapons, updateWeapons, refreshWeapons, useArsenal } from './weapons.js';
import { loot, drop, attract, resetLoot, updateLoot } from './pickups.js';
import { resetWaves, updateWaves } from './waves.js';
import { offer, upgrade, reward, banish, resetCards, utilityOffset, useHand } from './passives.js';
import { sound, vibrate, soundIds } from './audio.js';
import { save, persist } from './save.js';

const soloRun={ mode:'menu', elapsed:0, xp:0, goal:xpGoal(1,1), level:1, kills:0, gold:0, paid:0, rerolls:cardTools.rerolls, skips:cardTools.skips, banishes:cardTools.banishes, chests:0, reward:-1, boss:-1, enemyCount:0 };
export let run=soloRun;
let actor=0, soloAppearance=null;
function appearance(index=actor) { return activeWorld()?actorAppearance(index):soloAppearance; }
export function useGameSlot(slot=null) {
  actor=slot?.index??0; run=slot?.run??soloRun;
  useHero(actor); useArsenal(actor); useHand(actor);
  if(slot) { slot.avatar=player; slot.stats=stats; }
}
export function newCoopRun() { return {...soloRun}; }
export function viewportSize() { return scene; }
const effects=Array.from({length:caps.effects},()=>({life:0,x:0,y:0,vx:0,vy:0,label:'',color:'',bold:false}));
const numbers=Array.from({length:1000},(_,i)=>String(i));
const chainLinks=[3,3], noDash=[];
const gems=['#69b9ff','#97defe','#a8a4ff','#b4f4ff','#f67676','#83efd3','#f69467','#f9d676','#f2ba83'];
let shake=0, cursor=0, impact=0, bossSpawned=false;
buildCreatures(enemies);

function bank() {
  save.gold+=run.gold-run.paid;
  run.paid=run.gold;
  persist();
}

export function background() {
  if(run.mode==='playing' && !activeWorld()) run.mode='pause';
  bank();
}

export function start(character, startingWeapon=characters[character].weapon, shared=null) {
  if(!shared) {
    useGameSlot();
    tuneEnemies();
    startCombat(character,{weapon:startingWeapon});
    soloAppearance=activeCosmetics(character);
    primeCosmeticSprite(character,soloAppearance?.skin??soloAppearance?.character);
  }
  run.score=run.bossKills=run.firstWinBonus=run.achievementGold=0;
  run.mode='playing'; run.elapsed=run.xp=run.kills=run.gold=run.paid=run.chests=0;
  run.level=1; run.reward=run.boss=-1; run.enemyCount=0;
  const clear=!shared || shared.index===0;
  if(clear) { bossSpawned=false; impact=shake=cursor=0; }
  resetPlayer(character);
  run.goal=xpGoal(1,stats.growth);
  run.rerolls=cardTools.rerolls+stats.rerolls;
  run.skips=cardTools.skips; run.banishes=cardTools.banishes+stats.banishes;
  resetCards();
  resetWeapons(startingWeapon,clear);
  if(!shared || shared.index===localActor()) trackWeapon(startingWeapon);
  refreshWeapons();
  if(clear) {
    resetWaves();
    for(let i=0;i<mobs.length;i++) mobs[i].active=false;
    resetLoot();
    for(let i=0;i<effects.length;i++) effects[i].life=0;
  }
}

export function finish(mode,cooperative=false) {
  if(run.mode==='won' || run.mode==='lost') return;
  if(!cooperative) finishCombat(mode==='won'?'win':'loss',run.elapsed,run.bossKills);
  run.gold+=finishRewards(run,mode==='won',stats.goldGain);
  run.mode=mode;
  sound(mode==='won' ? soundIds.victory : soundIds.defeat);
  bank();
}

export function choose(id) {
  if(queueCoopCommand('choose',id)) return;
  if(run.mode!=='level') return;
  if(id>=utilityOffset) {
    const card=utilityCards[id-utilityOffset];
    if(!card) return;
    heal(stats.health*card[2]);
    if(card[3]) addGold(card[3]);
  } else {
    const growth=stats.growth;
    upgrade(id);
    if(id>=0 && id<levels.length) {
      combatEquip(id,actor);
      if(!activeWorld() || actor===localActor()) trackWeapon(id);
    }
    sound(soundIds.choose);
    if(stats.growth!==growth) {
      run.xp*=stats.growth/growth;
      run.goal=xpGoal(run.level,stats.growth);
    }
  }
  run.mode='playing';
  interrupt();
}

export function reroll() { if(queueCoopCommand('reroll')) return; if(run.mode==='level' && run.rerolls>0) { run.rerolls--; offer(); } }
export function skip() { if(queueCoopCommand('skip')) return; if(run.mode==='level' && run.skips>0) { run.skips--; choose(-1); } }

export function banishCard(id) {
  if(queueCoopCommand('banish',id)) return true;
  if(run.mode!=='level' || !run.banishes || !banish(id)) return false;
  run.banishes--;
  return true;
}

function addGold(value) { run.gold+=Math.round(value*stats.goldGain); sound(soundIds.coin); }

function particle(x,y,vx,vy,life,label,color,bold=false) {
  const p=effects[cursor++ % effects.length];
  p.x=x; p.y=y; p.vx=vx; p.vy=vy; p.life=life; p.label=label; p.color=color; p.bold=bold;
}

export function hit(m,damage,critical,weapon=-1,owner=actor) {
  const dealt=Math.max(0,Math.min(m.hp,damage));
  combatHit(dealt,weapon,damage>=m.hp,owner,run.elapsed);
  if(stats.lifeSteal) heal(dealt*stats.lifeSteal);
  m.hp-=damage; m.flash=.1;
  if(save.options.quality && (critical || !reduced)) particle(m.x,m.y-8,0,-24,.5,numbers[Math.min(999,Math.round(damage))],critical ? '#ffe98e' : '#fff3d1',critical);
  if(impact<=0) { sound(1); impact=.075; }
  if(m.hp>0) return;
  m.active=false; run.kills++;
  if(!activeWorld() || actor===localActor()) trackKill(m.kind); if(m.kind>=6) run.bossKills++;
  drop(0,m.x,m.y,enemies[m.kind].xp);
  if(m.kind===8) run.chests++;
  else if(m.kind>=5) drop(5,m.x,m.y);
  else {
    const roll=Math.random()/stats.luck;
    if(roll<.018) drop(1,m.x,m.y);
    else if(roll<.026) drop(2,m.x,m.y);
    else if(roll<.032) drop(3,m.x,m.y);
    else if(roll<.13) drop(4,m.x,m.y,2);
  }
  const count=reduced ? 0 : save.options.quality*2;
  for(let i=0;i<count;i++) particle(m.x,m.y,(Math.random()-.5)*70,(Math.random()-.5)*70,.28,'',appearance(owner)?.death?.color??enemies[m.kind].color);
  if(m.kind>=5) shake=.24;
  sound(2);
}

export function hurt(damage) {
  if(activeWorld() && run.mode==='level') return;
  if(player.inv>0 || player.hp<=0) return;
  if(stats.dodge>0 && Math.random()<stats.dodge) { player.inv=.18; return; }
  const taken=Math.min(player.hp,Math.max(1,damage-stats.armor));
  player.hp-=taken; combatTaken(taken,actor);
  player.inv=invulnerability;
  shake=.17; sound(6); vibrate(20);
}

function heal(value) {
  const healed=Math.min(value,stats.health-player.hp);
  if(healed>0) { player.hp+=healed; combatHeal(healed,actor); }
}

export function collect(kind,value) {
  if(kind===0) { run.xp+=value*stats.growth*stats.growth; sound(3); }
  else if(kind===1) heal(30);
  else if(kind===2) attract();
  else if(kind===3) {
    for(let i=0;i<mobs.length;i++) {
      const m=mobs[i];
      if(m.active && Math.abs(m.x-player.x)<scene.width/2 && Math.abs(m.y-player.y)<scene.height/2) hit(m,m.hp,true);
    }
    shake=.28;
  } else if(kind===4) { if(!splitCoopGold(value,actor)) addGold(value); }
  else run.chests++;
}

export function interrupt() {
  if(run.chests) {
    run.chests--; run.reward=reward(); if(run.reward>=0 && run.reward<levels.length) combatEquip(run.reward,actor); if(run.reward>=levels.length && (!activeWorld() || actor===localActor())) trackEvolution(run.reward-levels.length); addGold(chestGold);
    sound(run.reward>=weapons.length ? soundIds.evolve : soundIds.chest); vibrate(45); run.mode='chest';
  } else if(run.xp>=run.goal) {
    run.xp-=run.goal; run.level++; run.goal=xpGoal(run.level,stats.growth); combatLevel(run.level,actor);
    offer(); sound(soundIds.level); sound(soundIds.cards); vibrate(35); run.mode='level';
  }
}

export function dismissChest() { if(queueCoopCommand('chest')) return; run.mode='playing'; interrupt(); }
let reduced=false;
export function reduceEffects(value) { reduced=value; }

const scene = document.createElement('canvas');
const art = scene.getContext('2d', { alpha: false });
let screen, scale, ratio, insetX, insetY, vignette;

export function resize(canvas) {
  screen = canvas.getContext('2d', { alpha: false });
  ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  const portrait = canvas.height >= canvas.width;
  scale = Math.max(1, Math.round(Math.min(canvas.width / (portrait ? 270 : 480), canvas.height / (portrait ? 480 : 270))));
  scene.width = Math.ceil(canvas.width / scale);
  scene.height = Math.ceil(canvas.height / scale);
  insetX = Math.floor((canvas.width - scene.width * scale) / 2);
  insetY = Math.floor((canvas.height - scene.height * scale) / 2);
  screen.imageSmoothingEnabled = false;
  art.imageSmoothingEnabled = false;
  const x = scene.width / 2, y = scene.height / 2;
  vignette = art.createRadialGradient(x, y, Math.min(x, y) * .42, x, y, Math.hypot(x, y));
  vignette.addColorStop(0, '#10101800');
  vignette.addColorStop(1, '#101018b8');
}

export function update(dt) {
  if(activeWorld()) { updateCoopWorld(dt); animateEffects(dt); return; }
  if(run.mode!=='playing') return;
  run.elapsed+=dt;
  readInput();
  updatePlayer(dt,movement.x,movement.y);
  if(updateWaves(dt,run.elapsed,scene.width,scene.height)) { sound(7); shake=.3; if(run.elapsed>=900) bossSpawned=true; }
  const minute=Math.min(14,Math.floor(run.elapsed/60));
  updateEnemies(dt,minute,hurt,enemyShot,hit);
  updateWeapons(dt,scene.width,scene.height,hit,hurt);
  updateLoot(dt,collect);
  run.boss=-1; run.enemyCount=0;
  let finalBoss=false;
  for(let i=0;i<mobs.length;i++) {
    if(!mobs[i].active) continue;
    run.enemyCount++;
    if(mobs[i].kind<6) continue;
    if(run.boss<0 || mobs[i].kind>mobs[run.boss].kind) run.boss=i;
    if(mobs[i].kind===8) finalBoss=true;
  }
  animateEffects(dt);
  if(player.hp<=0) { combatDeath(0); finish('lost'); }
  else if(bossSpawned && !finalBoss) {
    if(run.chests || run.xp>=run.goal) interrupt();
    else finish('won');
  } else interrupt();
}

function animateEffects(dt) {
  shake=Math.max(0,shake-dt); impact-=dt;
  for(let i=0;i<effects.length;i++) {
    const p=effects[i];
    if(p.life<=0) continue;
    p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
  }
}

export function render() {
  const cx = scene.width >> 1, cy = scene.height >> 1;
  const jitter=save.options.shake && save.options.quality && run.mode==='playing' ? shake*9 : 0;
  const left=Math.round(player.x+Math.sin(run.elapsed*150)*jitter)-cx;
  const top=Math.round(player.y+Math.cos(run.elapsed*131)*jitter)-cy;
  const px=Math.round(player.x)-left, py=Math.round(player.y)-top;
  const tiles=terrainVariants[worldMap()];
  for (let y = Math.floor(top / 32); y * 32 < top + scene.height; y++) {
    for (let x = Math.floor(left / 32); x * 32 < left + scene.width; x++) {
      art.drawImage(tiles[tileHash(x, y) & 15], x * 32 - left, y * 32 - top);
    }
  }
  renderEntities(left,top);
  renderTeam(art,left,top,scene.width,scene.height);
  const look=appearance();
  if(look?.trail && player.stride>0 && !reduced) {
    art.fillStyle=look.trail.color;
    art.fillRect(px-Math.round(player.dx*11),py-Math.round(player.dy*11),3,2);
    art.fillRect(px-Math.round(player.dx*16),py-Math.round(player.dy*16),2,1);
  }
  art.fillStyle = '#15191c';
  art.fillRect(px - 5, py + 5, 10, 3);
  art.setTransform(player.facing, 0, 0, 1, px, py);
  if(!player.inv || Math.floor(player.inv*20)%2===0) art.drawImage(cosmeticSprite(player.character,player.frame,look?.skin??look?.character)??getSprite(player.sprite,player.frame), -8, -8);
  art.resetTransform();
  if(run.mode!=='menu') {
    art.fillStyle='#17181c'; art.fillRect(px-9,py+9,18,3);
    art.fillStyle='#dd6976'; art.fillRect(px-8,py+10,Math.ceil(16*player.hp/stats.health),1);
  }
  art.fillStyle = vignette;
  art.fillRect(0, 0, scene.width, scene.height);
  screen.drawImage(scene, insetX, insetY, scene.width * scale, scene.height * scale);
  if (!stick.active || run.mode!=='playing') return;
  const x = stick.x * ratio, y = stick.y * ratio;
  screen.lineWidth = 2 * ratio;
  screen.strokeStyle = '#e0ead06b';
  screen.beginPath();
  screen.arc(x, y, 48 * ratio, 0, Math.PI * 2);
  screen.stroke();
  screen.fillStyle = '#d6e5ce66';
  screen.beginPath();
  screen.arc(x + stick.dx * ratio, y + stick.dy * ratio, 17 * ratio, 0, Math.PI * 2);
  screen.fill();
}

function visible(x,y,pad) { return x>=-pad && y>=-pad && x<scene.width+pad && y<scene.height+pad; }

function renderEntities(left,top) {
  const t=run.elapsed;
  for(let i=0;i<loot.length;i++) {
    const p=loot[i];
    if(!p.active) continue;
    const x=Math.round(p.x)-left,y=Math.round(p.y)-top;
    if(!visible(x,y,10)) continue;
    const size=p.kind===0 ? 2+gemTier(p.value) : p.kind===5 ? 6 : 4;
    art.fillStyle=gems[p.kind===0 ? size-2 : p.kind+3];
    if(p.kind===5) {
      art.fillRect(x-6,y-4,12,8); art.fillStyle='#472d3d'; art.fillRect(x-6,y-1,12,2);
      art.fillStyle='#fff2c2'; art.fillRect(x-1,y-2,2,4);
    } else {
      art.fillRect(x-size+1,y-1,size*2-1,3); art.fillRect(x-1,y-size,3,size*2+1);
      if(Math.floor(t*6+i)%5===0) { art.fillStyle='#efffff'; art.fillRect(x,y-1,1,1); }
    }
  }
  for(let i=0;i<mobs.length;i++) {
    const m=mobs[i];
    if(!m.active) continue;
    const x=Math.round(m.x)-left,y=Math.round(m.y)-top;
    if(!visible(x,y,20)) continue;
    const size=m.kind>=6 ? 32 : m.kind===5 ? 22 : 16;
    const sprite=creatures[m.kind][((Math.floor(t*7+i)&1)<<1)+Number(m.flash>0)];
    art.fillStyle='#202425'; art.fillRect(x-size/3,y+size/3,size*.66,3);
    art.setTransform(m.facing,0,0,1,x,y);
    art.drawImage(sprite,-size/2,-size/2,size,size);
    art.resetTransform();
    if(!reduced && save.options.quality) {
      if(m.burn>0) {
        const flicker=(Math.floor(t*14)+i)&1;
        art.fillStyle='#e56f4a'; art.fillRect(x-6,y-10+flicker,3,4);
        art.fillStyle='#ffd487'; art.fillRect(x-5,y-10,1,3);
      }
      if(m.poison>0) {
        const rise=(Math.floor(t*12)+i)%5;
        art.fillStyle='#aadc73'; art.fillRect(x+5,y-8-rise,2,2); art.fillRect(x+8,y-5-rise,1,1);
      }
      if(m.stun>0) { art.fillStyle='#c8e7ff'; art.fillRect(x-1,y-13,3,2); }
      if(m.slow>0) { art.fillStyle='#c6b2db'; art.fillRect(x-3,y+7,6,1); }
    }
  }
  for(let i=0;i<shots.length;i++) {
    const s=shots[i];
    if(s.life<=0) continue;
    const x=Math.round(s.x)-left,y=Math.round(s.y)-top;
    if(!visible(x,y,s.area+8)) continue;
    const weapon=weapons[s.kind];
    const visual=weapon?.effetVisuel;
    const color=weapon ? appearance(s.owner)?.weapon?.color??weapon.color : '#f28eaa';
    art.strokeStyle=art.fillStyle=color;
    art.lineWidth=s.strong ? 3 : 1;
    art.globalAlpha=s.wait>0 ? .9 : Math.min(1,s.life*8);
    art.beginPath();
    if(visual==='arc') {
      const a=s.vx<0 ? Math.PI : 0;
      art.arc(x,y,s.area,a-1.23,a+1.23);
      art.stroke();
    } else if(visual==='circle' || visual==='chains' || (visual==='lob' && s.wait<=0) || (visual==='mine' && s.phase)) {
      art.arc(x,y,s.area,0,Math.PI*2); art.stroke();
      art.globalAlpha*=s.strong ? .28 : .14; art.fill();
      if(visual==='chains') {
        art.globalAlpha=1;
        art.setLineDash(chainLinks);
        art.beginPath();
        art.moveTo(x-s.area,y); art.lineTo(x+s.area,y);
        art.moveTo(x,y-s.area); art.lineTo(x,y+s.area);
        art.stroke();
        art.setLineDash(noDash);
      }
    } else if(visual==='lightning') {
      art.moveTo(x+6,y-38); art.lineTo(x-4,y-20); art.lineTo(x+5,y-20); art.lineTo(x,y); art.stroke();
      art.fillRect(x-4,y-2,8,4);
    } else if(visual==='lob') {
      const lift=Math.round(Math.sin(Math.max(0,s.wait)/.55*Math.PI)*38);
      art.fillRect(x-2,y-lift-2,5,5);
    } else if(visual==='mine') {
      art.fillRect(x-4,y-2,8,4); art.fillRect(x-2,y-4,4,8);
    } else if(visual==='hound') {
      const facing=s.vx<0 ? -1 : 1;
      art.setTransform(facing,0,0,1,x,y);
      art.drawImage(ghostHound,-8,-5);
      art.resetTransform();
    } else if(visual==='diamond') {
      const r=s.strong ? 6 : 4;
      art.moveTo(x-r,y); art.lineTo(x,y-r); art.lineTo(x+r,y); art.lineTo(x,y+r); art.closePath(); art.fill();
    } else {
      art.moveTo(x,y); art.lineTo(x-s.vx*.056,y-s.vy*.056);
      art.lineWidth=s.strong ? 4 : s.kind>=0 ? 3 : 2; art.stroke();
    }
    art.globalAlpha=1;
  }
  let bold=false;
  art.font='bold 8px monospace';
  for(let i=0;i<effects.length;i++) {
    const p=effects[i];
    if(p.life<=0) continue;
    const x=Math.round(p.x)-left,y=Math.round(p.y)-top;
    if(!visible(x,y,12)) continue;
    art.globalAlpha=Math.min(1,p.life*5);
    art.fillStyle=p.color;
    if(p.label) {
      if(p.bold!==bold) { bold=p.bold; art.font=bold ? 'bold 11px monospace' : 'bold 8px monospace'; }
      art.fillText(p.label,x-4,y);
    } else art.fillRect(x,y,2,2);
  }
  art.globalAlpha=1;
}
