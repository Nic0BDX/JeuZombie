import { heroPortrait, armPortrait } from './home-art.js';
import { redTide } from './data/modes.js';
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
let shopMode='upgrades', shopTab=0, collectionTab=0, optionTab=0, questTab=0, heroPreview=-1, weaponPreview=-1;

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
  const volume=(key,title)=>'<label class="meta-volume">'+title+' <output>'+Math.round(opt[key]*100)+' %</output><input type="range" min="0" max="100" step="1" data-volume="'+key+'" value="'+Math.round(opt[key]*100)+'"></label>';
  const pages=[
    btn(optionLabel('vibration'),'m:toggle:vibration')+(back==='home'?btn('Effacer la sauvegarde','m:page:reset'):''),
    volume('musicVolume','Musique')+volume('sfxVolume','Effets sonores')+btn(optionLabel('sound'),'m:toggle:sound'),
    btn('Qualité des effets · '+quality[opt.quality],'m:quality')+btn(optionLabel('shake'),'m:toggle:shake'),
    btn(optionLabel('leftHanded'),'m:toggle:leftHanded')+'<p>Glisse ton pouce dans la moitié basse de l’écran. Les attaques se déclenchent automatiquement.</p>'
  ];
  screen('Paramètres',tabs(['Général','Audio','Graphismes','Commandes'],optionTab,'m:settings:',btn)+actions(pages[optionTab]+btn('Retour',back)));
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
  const id=weaponPreview<0?selectedWeapon():weaponPreview, chosen=weapons[id], defined=ownsWeapon(id), b=chosen.baseStats;
  let cards='<div class="loadout-grid">';
  for(let i=0;i<weapons.length;i++){
    const w=weapons[i], owned=ownsWeapon(i);
    cards+='<button class="loadout-card'+(id===i?' current':'')+'" style="--accent:'+w.color+'" type="button" data-do="m:previewWeapon:'+i+
      '"><img alt="" width="40" height="25" src="'+armPortrait(w)+'"><strong>'+w.nom+'</strong><small>'+(owned?'Disponible':weaponCosts[i]+' or')+'</small></button>';
  }
  const meter=(title,value,max)=>'<div class="stat-meter"><span>'+title+'</span><b><i style="width:'+Math.min(100,100*value/max)+'%"></i></b></div>';
  return cards+'</div><section class="loadout-detail" style="--accent:'+chosen.color+'"><h3>'+chosen.nom+'</h3><p>'+chosen.description+'</p>'+
    meter('Dégâts',b.degats,40)+meter('Cadence',1/b.cooldown,3)+meter('Portée',b.portee,220)+
    ui.btn(defined?(id===selectedWeapon()?'Équipée':'Équiper'):'Acheter · '+weaponCosts[id]+' or',defined?'m:starter:'+id:'m:weapon:'+id,'primary',
      defined?id===selectedWeapon():save.gold<weaponCosts[id])+'</section>';
}

function heroGallery(ui,back) {
  const id=heroPreview<0?selectedCharacter():heroPreview, c=characters[id], owned=ownsCharacter(id);
  let grid='<div class="hero-grid">';
  for(let i=0;i<characters.length;i++) {
    const h=characters[i], available=ownsCharacter(i);
    grid+='<button class="hero-card'+(i===id?' current':'')+'" type="button" data-do="m:previewHero:'+i+'"><img alt="" width="48" height="56" src="'+heroPortrait(i)+
      '"><strong>'+h.name+'</strong><small>'+(available?(i===selectedCharacter()?'Sélectionné':'Débloqué'):h.cost+' or')+'</small></button>';
  }
  ui.screen('Personnages',grid+'</div><section class="loadout-detail"><h3>'+c.name+'</h3><p>'+c.description+'</p>'+
    ui.btn(owned?'Sélectionner':'Débloquer · '+c.cost+' or','m:selectHero:'+id,'primary',!owned&&save.gold<c.cost)+'</section>'+ui.actions(ui.btn('Retour',back)));
}

function drawQuests(ui) {
  const {screen,btn,actions}=ui;
  if(questTab===1) {
    screen('Quêtes et événements',tabs(['Quêtes','Événement'],questTab,'m:quest:',btn)+
      '<section class="raid-card"><h3>'+redTide.name+'</h3><p>Les hordes sont plus nombreuses et plus résistantes.</p>'+
      btn('Participer','play-tide','primary')+'</section>'+actions(btn('Retour','home')));
    return;
  }
  let list='';
  for(let i=0;i<achievements.length;i++) {
    const [,title,desc,key,goal,prize]=achievements[i], value=Math.min(goal,achievementValue(key));
    const won=!!(save.collection.achievements & (1<<i)), shown=key==='bestTime'?Math.floor(value/60)+' / '+goal/60+' min':value+' / '+goal;
    list+='<article class="quest-row"><strong>'+title+'</strong><span>'+desc+'</span><progress max="'+goal+'" value="'+value+'"></progress><small>'+
      shown+' · '+(won?'Reçu':'Récompense')+' · '+prize+' or</small></article>';
  }
  screen('Quêtes et événements',tabs(['Quêtes','Événement'],questTab,'m:quest:',btn)+list+actions(btn('Retour','home')));
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
    list='<div class="upgrade-grid">'+list+'</div>';
    const refund=refundValue();
    if(refund) list+=btn('Rembourser toutes les améliorations · '+refund+' or','m:page:refund');
  } else if(shopTab===1) list=weaponList(ui);
  else list=charactersList(ui,false);
  screen((shopTab===0?'Améliorations':shopTab===1&&shopMode!=='store'?'Arsenal':'Boutique')+' · '+save.gold+' or',
    tabs(tabLabels,shopTab,'m:shop:',btn)+btn('Cosmétiques','m:page:cosmetics')+actions(list+btn('Retour','home')));
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
  if(page==='characters'||page==='prepareCharacters'){
    heroGallery(ui,'m:page:'+(page==='characters'?'home':'prepare'));
  } else if(page==='prepare') drawPreparation(ui);
  else if(page==='shop') drawShop(ui);
  else if(page==='quests') drawQuests(ui);
  else if(page==='collection') drawCollection(ui);
  else if(page==='options'||page==='pauseOptions') options(page==='options'?'home':'pauseMenu',ui);
  else if(page==='refund') screen('Rembourser les améliorations ?',actions(btn('Récupérer '+refundValue()+' or','m:refund','primary')+btn('Annuler','m:page:shop')));
  else if(page==='reset') screen('Effacer la sauvegarde ?',actions(btn('Continuer vers la confirmation','m:page:resetConfirm')+btn('Annuler','m:page:options')));
  else if(page==='resetConfirm') screen('Effacement définitif','<p>La progression de ce téléphone sera effacée. Un compte sécurisé reste récupérable par e-mail.</p>'+actions(btn('Effacer sur ce téléphone','m:reset')+btn('Annuler','m:page:options','primary')));
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
  if(kind==='page') {
    if(value==='arsenal'||value==='upgrades'||value==='store') {
      shopMode=value;shopTab=value==='upgrades'?0:1;return 'shop';
    }
    if(value==='quests'||value==='event') { questTab=value==='event'?1:0; return 'quests'; }
    if(value==='achievements'||value==='collection') { collectionTab=value==='achievements'?2:0; return 'collection'; }
    return value;
  }
  if(kind==='settings' && id>=0 && id<4) optionTab=id;
  else if(kind==='quest' && (id===0||id===1)) questTab=id;
  else if(kind==='previewWeapon' && weapons[id]) weaponPreview=id;
  else if(kind==='previewHero' && characters[id]) heroPreview=id;
  else if(kind==='shop') shopTab=id;
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
    const output=event.target.closest('label')?.querySelector('output');
    if(output) output.value=event.target.value+' %';
  });
  panel.addEventListener('change',event=>{
    if(event.target.dataset.volume) persist();
  });
}
