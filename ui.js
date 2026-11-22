import { selectedCharacter, selectedWeapon, seeWeapon } from './meta.js';
import { bindSocial, drawSocial, socialMode } from './social-ui.js';
import { drawProfile, bindProfile, retryProfile } from './profile-ui.js';
import { bindMetaVolumes, drawMeta, drawRunResult, handleMeta } from './meta-ui.js';
import { run, start, background, choose, reroll, skip, banishCard, dismissChest } from './game.js';
import { player, passiveLevels } from './player.js';
import { levels, evolved } from './weapons.js';
import { mobs } from './enemies.js';
import { choices, rarities, offset, utilityOffset, cardInfo } from './passives.js';
import { save, persist } from './save.js';
import { unlock, syncAudio } from './audio.js';
import { weapons, slots } from './data/weapons.js';
import { passives } from './data/passives.js';
import { enemies } from './data/enemies.js';
import { cardRarities } from './data/cards.js';

const menu=document.querySelector('#menu'), panel=document.querySelector('#panel'), hud=document.querySelector('#hud');
const bar=document.querySelector('#experience'), clock=document.querySelector('#clock'), level=document.querySelector('#level');
const boss=document.querySelector('#boss'), bossName=boss.querySelector('span'), bossBar=boss.querySelector('i');
const kit=document.querySelector('#kit'), pause=document.querySelector('#pause');
const percent=Array.from({length:101},(_,i)=>i+'%');
const digits=Array.from({length:60},(_,i)=>String(i).padStart(2,'0'));
const times=Array.from({length:3601},(_,i)=>digits[Math.floor(i/60)%60]+':'+digits[i%60]);
let previous='', page='welcome', lastSecond=-1, lastLevel=0, lastXp=-1, lastBoss=-2, lastBossHp=-1, banishMode=false;

function btn(label,action,classes='',disabled=false) {
  return '<button type="button" class="'+classes+'" data-do="'+action+'"'+(disabled?' disabled':'')+'>'+label+'</button>';
}
function card(name,desc,icon,action,disabled=false) {
  return btn('<b>'+icon+'</b><span><strong>'+name+'</strong><small>'+desc+'</small></span>',action,'card',disabled);
}
function screen(title,content,tag='h2') { panel.innerHTML='<'+tag+'>'+title+'</'+tag+'>'+content; }
function actions(content) { return '<div class="actions">'+content+'</div>'; }

const metaUi={btn,card,screen,actions};
bindMetaVolumes(panel);
bindSocial(panel,()=>{ if(run.mode==='menu' && page==='friends') syncUi(true); },()=>{
  page='friends'; if(run.mode==='menu') syncUi(true);
});
bindProfile(panel,()=>{ if(run.mode==='menu' && (page==='profile' || page==='home')) syncUi(true); });

function drawMenu() {
  if(menu.dataset) menu.dataset.metaPage=run.mode==='menu' ? page : '';
  if(run.mode==='menu') {
    if(page==='profile') drawProfile(metaUi);
    else if(page==='friends') drawSocial(metaUi);
    else if(!drawMeta(page,metaUi)) screen('Les Cendres du Marais',actions(btn('Touche pour jouer','home','primary')),'h1');
  } else if(run.mode==='pause') {
    if(page==='pauseOptions') drawMeta(page,metaUi);
    else screen('Pause',actions(btn('Reprendre','resume','primary')+btn('Options','pauseOptions')+btn('Quitter la partie','exit')));
  } else if(run.mode==='level') {
    let list='';
    for(let i=0;i<choices.length;i++) {
      const id=choices[i];
      if(id<0) continue;
      if(id<offset) seeWeapon(id);
      const c=cardInfo(id), rarity=cardRarities[rarities[i]];
      list+='<button type="button" class="card upgrade" data-do="choose'+i+'" style="--rarity:'+rarity[1]+'"'+
        (banishMode && id>=utilityOffset?' disabled':'')+'><b>'+c.icon+'</b><span><em>'+rarity[0]+' · '+c.tag+
        '</em><strong>'+c.name+(c.rank?' <span class="card-rank">'+c.rank+'</span>':'')+'</strong><small>'+c.desc+'</small></span></button>';
    }
    screen('Niveau '+run.level,(banishMode?'<p>Choisis une carte à bannir.</p>':'')+actions(list)+'<div class="split card-tools">'+
      btn('Relancer · '+run.rerolls,'reroll','',!run.rerolls || banishMode)+
      btn('Passer · '+run.skips,'skip','',!run.skips || banishMode)+
      btn(banishMode?'Annuler':'Bannir · '+run.banishes,'banish','',!run.banishes || !choices.some(id=>id>=0&&id<utilityOffset))+'</div>');
  } else if(run.mode==='chest') {
    const id=run.reward;
    const label=id<0 ? '12 or' : id>=offset ? weapons[id-offset].evolution.nomEvolue : weapons[id].nom+' · niv. '+levels[id];
    screen('Coffre', '<div class="chest'+(id>=offset ? ' evolved' : '')+'" aria-hidden="true">'+(id>=offset ? '✦' : '⬙')+'</div><p>'+label+'</p>'+actions(btn('Continuer','chest','primary')));
  } else drawRunResult(run,times[Math.min(3600,Math.floor(run.elapsed))],levels,evolved,metaUi);
}

function drawKit() {
  let text='';
  let occupied=0;
  for(let i=0;i<levels.length;i++) if(levels[i]) {
    const w=weapons[i], name=evolved[i] ? w.evolution.nomEvolue : w.nom;
    text+='<span title="'+name+'">'+w.icon+' '+(evolved[i]?'★':'')+levels[i]+'</span>';
    occupied++;
  }
  for(let i=occupied;i<slots;i++) text+='<span class="empty" aria-label="Emplacement d’arme libre">·</span>';
  for(let i=0;i<passiveLevels.length;i++) if(passiveLevels[i]) text+='<span style="color:#8fd8c2" title="'+passives[i][0]+'">◆ '+passiveLevels[i]+'</span>';
  if(kit.innerHTML!==text) kit.innerHTML=text;
}

export function syncUi(force=false) {
  syncAudio(run.mode,run.elapsed,run.enemyCount,run.boss>=0);
  if(previous!==run.mode) socialMode(run.mode);
  if(force || previous!==run.mode) {
    previous=run.mode;
    document.documentElement?.classList?.toggle('left-handed',save.options.leftHanded);
    if(run.mode!=='level') banishMode=false;
    hud.hidden=run.mode==='menu';
    menu.hidden=run.mode==='playing';
    if(!menu.hidden) drawMenu();
    else drawKit();
  }
  if(hud.hidden) return;
  const second=Math.min(3600,Math.floor(run.elapsed));
  if(second!==lastSecond) { lastSecond=second; clock.textContent=times[second]; }
  if(run.level!==lastLevel) {
    if(run.level>lastLevel && lastLevel>0 && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      bar.parentElement?.animate?.([{backgroundColor:'#d3f5ff'},{backgroundColor:'#161c27'}],420);
    }
    lastLevel=run.level; level.textContent='NV '+run.level;
  }
  const xp=Math.min(100,Math.floor(run.xp/run.goal*100));
  if(lastXp!==xp) { lastXp=xp; bar.style.width=percent[Math.max(0,Math.min(100,xp))]; }
  if(run.boss!==lastBoss) {
    lastBoss=run.boss; boss.hidden=run.boss<0;
    if(run.boss>=0) bossName.textContent=enemies[mobs[run.boss].kind].name;
  }
  if(run.boss>=0) {
    const hp=Math.max(0,Math.min(100,Math.round(mobs[run.boss].hp/mobs[run.boss].max*100)));
    if(lastBossHp!==hp) { lastBossHp=hp; bossBar.style.width=percent[hp]; }
  }
}

function screenOrientationLock() {
  window.screen.orientation?.lock?.('portrait')?.catch(()=>{});
}

pause.addEventListener('click',()=>{ if(run.mode==='playing') { page='pauseMenu'; background(); syncUi(); } });
panel.addEventListener('click',event=>{
  const target=event.target.closest('button[data-do]');
  if(!target || target.disabled) return;
  const action=target.dataset.do;
  if(action==='accountRetry') retryProfile();
  else if(action.startsWith('m:')) page=handleMeta(action,page);
  else if(action==='play') {
    unlock();
    if(matchMedia('(display-mode: fullscreen)').matches || navigator.standalone) {
      screenOrientationLock();
    }
    start(selectedCharacter(),selectedWeapon());
  }
  else if(action==='home') { unlock(); page='home'; }
  else if(action==='exit') { background(); run.mode='menu'; page='home'; }
  else if(action==='resume') { unlock(); run.mode='playing'; }
  else if(action==='chest') dismissChest();
  else if(action==='continue') choose(-1);
  else if(action==='reroll') reroll();
  else if(action==='skip') skip();
  else if(action==='banish') banishMode=!banishMode;
  else if(action.startsWith('choose')) {
    const id=choices[Number(action.slice(6))];
    if(banishMode) {
      if(banishCard(id)) banishMode=false;
    } else choose(id);
  }
  else page=action;
  syncUi(true);
});
