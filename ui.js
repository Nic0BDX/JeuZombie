import { run, start, background, choose, reroll, skip, dismissChest } from './game.js';
import { player, passiveLevels } from './player.js';
import { levels, evolved } from './weapons.js';
import { mobs } from './enemies.js';
import { choices, offset } from './passives.js';
import { save, persist } from './save.js';
import { unlock } from './audio.js';
import { characters, weaponCosts } from './data/characters.js';
import { weapons } from './data/weapons.js';
import { passives, shop, shopCap, shopCost } from './data/passives.js';
import { enemies } from './data/enemies.js';

const menu=document.querySelector('#menu'), panel=document.querySelector('#panel'), hud=document.querySelector('#hud');
const bar=document.querySelector('#experience'), clock=document.querySelector('#clock'), level=document.querySelector('#level');
const boss=document.querySelector('#boss'), bossName=boss.querySelector('span'), bossBar=boss.querySelector('i');
const kit=document.querySelector('#kit'), pause=document.querySelector('#pause');
const digits=Array.from({length:60},(_,i)=>String(i).padStart(2,'0'));
const times=Array.from({length:3601},(_,i)=>digits[Math.floor(i/60)%60]+':'+digits[i%60]);
let previous='', page='welcome', selected=0, lastSecond=-1, lastLevel=0, lastXp=-1, lastBoss=-2;

function btn(label,action,classes='',disabled=false) {
  return '<button type="button" class="'+classes+'" data-do="'+action+'"'+(disabled?' disabled':'')+'>'+label+'</button>';
}
function card(name,desc,icon,action,disabled=false) {
  return btn('<b>'+icon+'</b><span><strong>'+name+'</strong><small>'+desc+'</small></span>',action,'card',disabled);
}
function screen(title,content,tag='h2') { panel.innerHTML='<'+tag+'>'+title+'</'+tag+'>'+content; }
function actions(content) { return '<div class="actions">'+content+'</div>'; }
function back() { return btn('Retour','home'); }

function drawMenu() {
  if(run.mode==='menu') {
    if(page==='welcome') screen('Les Cendres du Marais',actions(btn('Touche pour jouer','home','primary')),'h1');
    else if(page==='home') screen('Les Cendres du Marais','<p>'+save.gold+' or</p>'+actions(
      btn('Jouer','play','primary')+btn('Personnages','characters')+btn('Boutique','shop')+btn('Options','options')),'h1');
    else if(page==='characters') {
      let list='';
      for(let i=0;i<characters.length;i++) {
        const c=characters[i], owned=save.characters & (1<<i);
        const label=owned ? (i===selected ? ' · choisi' : '') : ' · '+c.cost+' or';
        list+=card(c.name+label,c.description,weapons[c.weapon].icon,'character'+i,!owned && save.gold<c.cost);
      }
      screen('Personnages',actions(list+btn('Jouer avec '+characters[selected].name,'play','primary')+back()));
    } else if(page==='options') options('home');
    else {
      let list='';
      for(let i=0;i<shop.length;i++) {
        const rank=save.upgrades[i], cost=shopCost*(1+rank);
        list+=card(shop[i][0]+' '+rank+'/'+shopCap,rank>=shopCap ? 'Maximum' : cost+' or','＋','buy'+i,rank>=shopCap || save.gold<cost);
      }
      for(let i=0;i<weaponCosts.length;i++) if(weaponCosts[i]) {
        const owned=save.weapons & (1<<i);
        list+=card(weapons[i].name,owned ? 'Débloquée' : weaponCosts[i]+' or',weapons[i].icon,'weapon'+i,!!owned || save.gold<weaponCosts[i]);
      }
      screen('Boutique · '+save.gold+' or',actions(list+back()));
    }
  } else if(run.mode==='pause') {
    if(page==='pauseOptions') options('pauseMenu');
    else screen('Pause',actions(btn('Reprendre','resume','primary')+btn('Options','pauseOptions')+btn('Quitter la partie','exit')));
  } else if(run.mode==='level') {
    let list='';
    for(let i=0;i<choices.length;i++) {
      const id=choices[i];
      if(id<0) continue;
      if(id<offset) {
        const w=weapons[id];
        list+=card(w.name,w.description+' · niv. '+(levels[id]+1),w.icon,'choose'+i);
      } else {
        const p=passives[id-offset];
        list+=card(p[0],p[1]+' · niv. '+(passiveLevels[id-offset]+1),'◆','choose'+i);
      }
    }
    if(!list) list=btn('Continuer','continue','primary');
    screen('Niveau '+run.level,actions(list)+'<div class="split">'+
      btn('Relancer · '+run.rerolls,'reroll','',!run.rerolls || !choices.some(id=>id>=0))+
      btn('Passer · '+run.skips,'skip','',!run.skips)+'</div>');
  } else if(run.mode==='chest') {
    const id=run.reward;
    const label=id<0 ? '12 or' : id>=offset ? weapons[id-offset].evolution : weapons[id].name+' · niv. '+levels[id];
    screen('Coffre', '<div class="chest" aria-hidden="true">⬙</div><p>'+label+'</p>'+actions(btn('Continuer','chest','primary')));
  } else screen(run.mode==='won'?'Victoire':'Défaite','<p>Temps '+times[Math.min(3600,Math.floor(run.elapsed))]+' · '+run.kills+' éliminations</p><p>'+run.gold+' or · Niveau '+run.level+'</p>'+
    actions(btn('Rejouer','play','primary')+btn('Menu','exit')));
}

function options(returnTo) {
  const opt=save.options;
  screen('Options',actions(btn('Son · '+(opt.sound?'activé':'coupé'),'sound')+
    btn('Vibration · '+(opt.vibration?'activée':'coupée'),'vibration')+
    btn('Secousses · '+(opt.shake?'activées':'coupées'),'shake')+
    btn('Qualité des effets · '+['basse','moyenne','haute'][opt.quality],'quality')+btn('Retour',returnTo)));
}

function drawKit() {
  let text='';
  for(let i=0;i<levels.length;i++) if(levels[i]) text+='<span title="'+weapons[i].name+'">'+weapons[i].icon+' '+(evolved[i]?'★':levels[i])+'</span>';
  for(let i=0;i<passiveLevels.length;i++) if(passiveLevels[i]) text+='<span style="color:#8fd8c2" title="'+passives[i][0]+'">◆ '+passiveLevels[i]+'</span>';
  if(kit.innerHTML!==text) kit.innerHTML=text;
}

export function syncUi(force=false) {
  if(force || previous!==run.mode) {
    previous=run.mode;
    hud.hidden=run.mode==='menu';
    menu.hidden=run.mode==='playing';
    if(!menu.hidden) drawMenu();
    else drawKit();
  }
  if(hud.hidden) return;
  const second=Math.min(3600,Math.floor(run.elapsed));
  if(second!==lastSecond) { lastSecond=second; clock.textContent=times[second]; }
  if(run.level!==lastLevel) { lastLevel=run.level; level.textContent='NV '+run.level; }
  const xp=Math.floor(run.xp/run.goal*100);
  if(lastXp!==xp) { lastXp=xp; bar.style.width=xp+'%'; }
  if(run.boss!==lastBoss) {
    lastBoss=run.boss; boss.hidden=run.boss<0;
    if(run.boss>=0) bossName.textContent=enemies[mobs[run.boss].kind].name;
  }
  if(run.boss>=0) bossBar.style.width=Math.max(0,Math.round(mobs[run.boss].hp/mobs[run.boss].max*100))+'%';
}

function screenOrientationLock() {
  window.screen.orientation?.lock?.('portrait')?.catch(()=>{});
}

pause.addEventListener('click',()=>{ if(run.mode==='playing') { page='pauseMenu'; background(); syncUi(); } });
panel.addEventListener('click',event=>{
  const target=event.target.closest('button[data-do]');
  if(!target || target.disabled) return;
  const action=target.dataset.do;
  if(action==='play') {
    unlock();
    if(matchMedia('(display-mode: fullscreen)').matches || navigator.standalone) {
      screenOrientationLock();
    }
    start(selected);
  }
  else if(action==='home') { unlock(); page='home'; }
  else if(action==='exit') { background(); run.mode='menu'; page='home'; }
  else if(action==='resume') { unlock(); run.mode='playing'; }
  else if(action==='chest') dismissChest();
  else if(action==='continue') choose(-1);
  else if(action==='reroll') reroll();
  else if(action==='skip') skip();
  else if(action.startsWith('choose')) choose(choices[Number(action.slice(6))]);
  else if(/^character\d+$/.test(action)) {
    const i=Number(action.slice(9));
    if(!(save.characters & (1<<i))) {
      save.gold-=characters[i].cost; save.characters|=1<<i; persist();
    }
    selected=i;
  } else if(action.startsWith('buy')) {
    const i=Number(action.slice(3));
    save.gold-=shopCost*(1+save.upgrades[i]); save.upgrades[i]++; persist();
  } else if(action.startsWith('weapon')) {
    const i=Number(action.slice(6));
    save.gold-=weaponCosts[i]; save.weapons|=1<<i; persist();
  } else if(action==='quality') {
    save.options.quality=(save.options.quality+2)%3; persist();
  } else if(action in save.options) {
    save.options[action]=!save.options[action]; if(action==='sound' && save.options.sound) unlock(); persist();
  } else page=action;
  syncUi(true);
});
