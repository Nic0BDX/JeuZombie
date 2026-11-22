import { save } from './save.js';
import { account } from './online.js';
import { cosmetics } from './cosmetics.js';
import { social, friendStatus } from './social.js';
import { drawHomeArt } from './home-art.js';

const fmt=new Intl.NumberFormat('fr-FR');
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[ch]);
const item=(icon,label,page)=>'<button type="button" data-do="m:page:'+page+'"><i aria-hidden="true">'+icon+'</i>'+label+'</button>';
const icons={profile:'◈',gold:'●',ash:'◆',versus:'⚔',store:'▣',gear:'⚙',people:'♟',stats:'▥',quest:'✦',collection:'▤',home:'⌂'};
export function accountProgress() {
  const xp=Math.max(0,Math.floor(Number(save.records.totalScore)||0));
  const level=Math.floor((Math.sqrt(1+xp*8/100)-1)/2);
  return {level,xp,earned:xp-level*(level+1)*50,goal:(level+1)*100};
}
function wallet(label,icon,value,page) {
  return '<button class="hub-currency '+page+'" type="button" data-do="m:page:'+page+'" aria-label="'+label+' '+fmt.format(value)+'"><i aria-hidden="true">'+icon+'</i><strong>'+fmt.format(value)+'</strong></button>';
}
export function initHomeArt() {
  const canvas=document.querySelector('#home-art');
  if(canvas) drawHomeArt(canvas);
}
export function drawHome(panel) {
  const p=accountProgress();
  const online=social.friends.filter(person=>person.status==='accepted' && friendStatus(person.id)!=='offline').length;
  panel.innerHTML='<header class="hub-header"><button type="button" class="hub-profile" data-do="m:page:profile">'+
      '<i aria-hidden="true">'+icons.profile+'</i><span><strong>'+esc(account.profile?.pseudo??'Compte invité')+'</strong><small>Niv. '+p.level+
      '</small></span></button>'+wallet('Or',icons.gold,save.gold,'upgrades')+wallet('Points de Cendre',icons.ash,cosmetics.owner===account.profile?.id?cosmetics.ash:0,'cosmetics')+
      '<button class="hub-settings" type="button" data-do="m:page:options" aria-label="Options">'+icons.gear+'</button>'+
    '<div class="hub-xp"><div class="hub-meter" role="progressbar" aria-label="Expérience du compte" aria-valuemax="'+p.goal+'" aria-valuenow="'+p.earned+'"><b style="width:'+p.earned/p.goal*100+'%"></b></div>'+
      '<span>'+fmt.format(p.earned)+' / '+fmt.format(p.goal)+' XP</span></div></header>'+
    '<section class="hub-hero"><div class="hub-title"><span>LES CENDRES DU</span><h1>MARAIS</h1></div>'+
      '<button class="hub-online" type="button" data-do="m:page:friends"><b></b> '+online+' ami'+(online===1?'':'s')+' en ligne</button>'+
      '<div class="hub-play"><button class="hub-primary" type="button" data-do="m:page:prepare"><i aria-hidden="true">'+icons.versus+
      '</i><span><strong>JOUER</strong><small>Survie solo</small></span><b aria-hidden="true">›</b></button>'+
      '<button class="hub-coop" type="button" data-do="m:page:friends">'+icons.people+' Coop</button></div></section>'+
    '<section class="hub-tiles" aria-label="Équipement et progression">'+item(icons.store,'Arsenal','arsenal')+item('▲','Améliorations','upgrades')+
       item(icons.people,'Personnages','characters')+item(icons.collection,'Collection','collection')+'</section>'+
    '<section class="hub-reward"><i aria-hidden="true">'+icons.quest+'</i><div><strong>Coffre de Cendre</strong><small>'+
      (cosmetics.available?(cosmetics.chestAvailable?'Récompense disponible':'Coffre du jour déjà ouvert'):'Récompense quotidienne')+
      '</small></div><button type="button" data-do="m:page:cosmetics">Voir <span aria-hidden="true">›</span></button></section>'+
    '<nav class="hub-nav" aria-label="Menu principal">'+item(icons.home,'Accueil','home')+item(icons.stats,'Combats','combat')+
      item(icons.quest,'Succès','achievements')+item(icons.store,'Boutique','cosmetics')+item(icons.people,'Amis','friends')+'</nav>';
}
