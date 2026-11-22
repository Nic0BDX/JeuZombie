import { save, persist, resetSave } from './save.js';
import { achievements, shop, shopCap, weaponCosts } from './data/shop.js';
import { characters } from './data/characters.js';
import { weapons } from './data/weapons.js';
import { enemies } from './data/enemies.js';
import { setAudioVolumes, sound, soundIds } from './audio.js';
import {
 ownsWeapon, ownsCharacter, selectedCharacter, selectedWeapon, selectCharacter, selectWeapon,
 buyUpgrade, unlockWeapon, unlockCharacter, upgradeCost, refundValue, refundUpgrades, achievementValue
} from './meta.js';

const quality=['basse','moyenne','haute'];
const tabLabels=['Améliorations','Armes','Personnages'];
const collectionLabels=['Bestiaire','Armes','Succès'];
const toggleLabels={sound:'Son',vibration:'Vibration',shake:'Secousses',leftHanded:'Mode gaucher'};
let shopTab=0, collectionTab=0;

function amount(value,unit){
  const n=unit==='%' ? Math.round(value*1000)/10 : Math.round(value*100)/100;
  return '+'+String(n).replace('.',',')+(unit ? ' '+unit : '');
}

function tabs(labels,selected,prefix,btn){
  let s='<div class="meta-tabs">';
  for(let i=0;i<labels.length;i++) s+=btn(labels[i],prefix+i,i===selected ? 'primary' : '');
  return s+'</div>';
}

function optionLabel(key){ return toggleLabels[key]+' · '+(save.options[key]?'oui':'non'); }

function options(back,ui){
  const { screen,actions,btn }=ui, opt=save.options;
  const volume=(key,title)=>'<label class="meta-volume">'+title+' <input type="range" min="0" max="100" step="1" data-volume="'+key+'" value="'+Math.round(opt[key]*100)+'"></label>';
  screen('Options',actions(volume('musicVolume','Musique')+volume('sfxVolume','Effets sonores')+
    btn(optionLabel('sound'),'m:toggle:sound')+btn(optionLabel('vibration'),'m:toggle:vibration')+
    btn(optionLabel('shake'),'m:toggle:shake')+btn(optionLabel('leftHanded'),'m:toggle:leftHanded')+
    btn('Qualité des effets · '+quality[opt.quality],'m:quality')+
    (back==='home'?btn('Effacer la sauvegarde','m:page:reset'): '')+btn('Retour',back)));
}

function charactersList(ui,allowSelect){
  let list='';
  const active=selectedCharacter();
  for(let i=0;i<characters.length;i++){
    const c=characters[i], owned=ownsCharacter(i);
    const label=owned ? (allowSelect && i===active ? ' · choisi' : ' · débloqué') : ' · '+c.cost+' or';
    list+=ui.card(c.name+label,c.description,weapons[c.weapon].icon,(allowSelect ? 'm:selectHero:' : 'm:hero:')+i,
      owned ? !allowSelect : save.gold<c.cost);
  }
  return list;
}

function weaponList(ui){
  let list='';
  for(let i=0;i<weapons.length;i++){
    const w=weapons[i], owned=ownsWeapon(i);
    list+=ui.card(w.nom+(owned?' · débloquée':' · '+weaponCosts[i]+' or'),w.description,w.icon,'m:weapon:'+i,owned||save.gold<weaponCosts[i]);
  }
  return list;
}

function drawShop(ui){
  const {screen,btn,card,actions}=ui;
  let list='';
  if(shopTab===0){
    for(let i=0;i<shop.length;i++){
      const [name,,step,,unit]=shop[i], rank=save.upgrades[i], cost=upgradeCost(i,rank);
      const change=amount(step*rank,unit)+' → '+amount(step*Math.min(shopCap,rank+1),unit);
      list+=card(name+' · '+rank+'/'+shopCap,change+(rank===shopCap?' · Maximum':' · Acheter '+cost+' or'),'＋','m:buy:'+i,rank===shopCap||save.gold<cost);
    }
    const refund=refundValue();
    if(refund) list+=btn('Rembourser toutes les améliorations · '+refund+' or','m:page:refund');
  } else if(shopTab===1) list=weaponList(ui);
  else list=charactersList(ui,false);
  screen('Boutique · '+save.gold+' or',tabs(tabLabels,shopTab,'m:shop:',btn)+actions(list+btn('Retour','home')));
}

function drawPreparation(ui){
  const {screen,btn,actions}=ui, id=selectedCharacter(), starter=selectedWeapon(), c=characters[id];
  let choices='', bonuses='';
  for(let i=0;i<weapons.length;i++) if(ownsWeapon(i)||i===c.weapon){
    const w=weapons[i];
    choices+=btn(w.icon+' '+w.nom,'m:starter:'+i,i===starter?'primary':'');
  }
  for(let i=0;i<shop.length;i++) if(save.upgrades[i]) bonuses+='<li>'+shop[i][0]+' '+amount(save.upgrades[i]*shop[i][2],shop[i][4])+'</li>';
  screen('Préparation','<p><strong>'+c.name+'</strong> · '+c.description.split(' · ')[1]+'</p>'+
    (bonuses?'<ul class="meta-bonuses">'+bonuses+'</ul>':'')+
    actions(btn('Choisir le personnage','m:page:prepareCharacters')+'<button class="primary" type="button" data-do="play">Lancer la partie</button>'+
    '<details><summary>Arme de départ · '+weapons[starter].nom+'</summary><div class="actions">'+choices+'</div></details>'+btn('Retour','home')));
}

function drawCollection(ui){
  const {screen,btn,actions}=ui,c=save.collection;
  let list='<ul class="collection-list">';
  if(collectionTab===0){
    for(let i=0;i<enemies.length;i++){
      const seen=c.seen & (1<<i);
      list+='<li><strong>'+(seen?enemies[i].name:'Ennemi inconnu')+'</strong><small>'+(seen?c.kills[i]+' élimination(s)':'À rencontrer')+'</small></li>';
    }
  } else if(collectionTab===1){
    for(let i=0;i<weapons.length;i++){
      const w=weapons[i], seen=(c.weapons|c.seenWeapons) & (1<<i);
      list+='<li><strong>'+(seen?w.icon+' '+w.nom:'Arme inconnue')+'</strong><small>'+(c.evolutions & (1<<i)?w.evolution.nomEvolue:'Évolution à découvrir')+'</small></li>';
    }
  } else {
    for(let i=0;i<achievements.length;i++){
      const [,name,desc,stat,goal,prize]=achievements[i], won=c.achievements & (1<<i);
      const normalized=stat==='bestTime' ? Math.floor(Math.min(goal,achievementValue(stat))/60)+'/'+goal/60+' min' : Math.min(goal,achievementValue(stat))+'/'+goal;
      list+='<li><strong>'+name+'</strong><small>'+desc+' · '+(won?'✓ '+prize+' or reçus':normalized+' · '+prize+' or')+'</small></li>';
    }
  }
  screen('Collection',tabs(collectionLabels,collectionTab,'m:collection:',btn)+list+'</ul>'+actions(btn('Retour','home')));
}

export function drawMeta(page,ui){
  const {screen,actions,btn}=ui;
  if(page==='home'){
    screen('Les Cendres du Marais','<p>'+save.gold+' or</p>'+actions(btn('Jouer','m:page:prepare','primary')+
      btn('Personnages','m:page:characters')+btn('Boutique','m:page:shop')+btn('Collection','m:page:collection')+btn('Options','m:page:options')),'h1');
  } else if(page==='characters'||page==='prepareCharacters'){
    screen('Personnages',actions(charactersList(ui,true)+btn('Retour','m:page:'+(page==='characters'?'home':'prepare'))));
  } else if(page==='prepare') drawPreparation(ui);
  else if(page==='shop') drawShop(ui);
  else if(page==='collection') drawCollection(ui);
  else if(page==='options'||page==='pauseOptions') options(page==='options'?'home':'pauseMenu',ui);
  else if(page==='refund') screen('Rembourser les améliorations ?',actions(btn('Récupérer '+refundValue()+' or','m:refund','primary')+btn('Annuler','m:page:shop')));
  else if(page==='reset') screen('Effacer la sauvegarde ?',actions(btn('Continuer vers la confirmation','m:page:resetConfirm')+btn('Annuler','m:page:options')));
  else if(page==='resetConfirm') screen('Effacement définitif','<p>Or, déblocages et records seront effacés.</p>'+actions(btn('Tout effacer','m:reset')+btn('Annuler','m:page:options','primary')));
  else return false;
  return true;
}

export function drawRunResult(run,time,levels,evolved,ui){
  const { screen,actions,btn }=ui;
  let kit='';
  for(let i=0;i<levels.length;i++) if(levels[i]) kit+='<li>'+
    (evolved[i]?weapons[i].evolution.nomEvolue:weapons[i].nom)+' · niv. '+levels[i]+'</li>';
  screen(run.mode==='won'?'Victoire':'Défaite','<p>'+time+' · '+run.kills+' éliminations · '+run.bossKills+' boss</p>'+
    '<p>Niveau '+run.level+' · '+run.score+' points · '+run.gold+' or</p>'+
    (run.firstWinBonus?'<p>Première victoire · +'+run.firstWinBonus+' or</p>':'')+
    (run.achievementGold?'<p>Succès · +'+run.achievementGold+' or</p>':'')+
    '<ul class="meta-bonuses">'+kit+'</ul>'+actions(btn('Rejouer','play','primary')+btn('Menu','exit')));
}

export function handleMeta(action,page){
  const [,kind,value]=action.split(':'), id=Number(value);
  let bought;
  if(kind==='page') return value;
  if(kind==='shop') shopTab=id;
  else if(kind==='collection') collectionTab=id;
  else if(kind==='selectHero'){
    if(!ownsCharacter(id)) bought=unlockCharacter(id);
    if(selectCharacter(id) && page==='prepareCharacters') {
      if(bought) sound(soundIds.buy);
      return 'prepare';
    }
  } else if(kind==='starter') selectWeapon(id);
  else if(kind==='buy') bought=buyUpgrade(id);
  else if(kind==='weapon') bought=unlockWeapon(id);
  else if(kind==='hero') bought=unlockCharacter(id);
  else if(kind==='refund'){refundUpgrades();return 'shop';}
  else if(kind==='reset'&&page==='resetConfirm'){resetSave();setAudioVolumes();return 'home';}
  else if(kind==='quality'){save.options.quality=(save.options.quality+2)%3;persist();}
  else if(kind==='toggle'&&value in toggleLabels){
    save.options[value]=!save.options[value];
    setAudioVolumes();persist();
  }
  if(bought!==undefined) sound(bought?soundIds.buy:soundIds.refuse);
  return page;
}

export function bindMetaVolumes(panel){
  panel.addEventListener('input',event=>{
    const key=event.target.dataset.volume;
    if(key!=='musicVolume'&&key!=='sfxVolume') return;
    save.options[key]=Number(event.target.value)/100;
    setAudioVolumes();
  });
  panel.addEventListener('change',event=>{
    if(event.target.dataset.volume) persist();
  });
}
