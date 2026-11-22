import { coop, coopAction, coopCountdown } from './coop-net.js';
import { save } from './save.js';
import { characters } from './data/characters.js';
import { weapons } from './data/weapons.js';

const escape=text=>String(text??'').replace(/[&<>"']/g,key=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[key]);
const difficulties=[['calme','Brume calme'],['normal','Brume dense'],['ardue','Nuit ardue']];
const maps=[['marais','Marais'],['tourbiere','Tourbière'],['lisiere','Lisière']];
const option=(value,label,selected)=>'<option value="'+value+'"'+(value===selected?' selected':'')+'>'+escape(label)+'</option>';

export function drawCoopLobby() {
  if(!coop.roomId) return '';
  const local=coop.players.find(p=>p.id===coop.local);
  if(!local) return '';
  const remaining=coopCountdown(), host=coop.host===coop.local;
  let names='', heroes='', arms='';
  for(const p of coop.players) {
    const hero=characters[p.character]?.name??'Silex';
    names+='<li><strong>'+escape(p.pseudo)+'</strong> · '+escape(hero)+' · '+(p.ready?'Prêt':'En attente')+'</li>';
  }
  let controls='';
  if(coop.startedAt) {
    controls='<p role="status">'+(remaining?'Départ dans '+remaining+' s':'Partie en cours')+'</p>';
    if(host && remaining) controls+='<button data-coop="cancel" type="button">Annuler le départ</button>';
  } else {
    for(let i=0;i<characters.length;i++) if(save.characters&(1<<i)) heroes+=option(i,characters[i].name,local.character);
    for(let i=0;i<weapons.length;i++) if(save.weapons&(1<<i)) arms+=option(i,weapons[i].nom,local.weapon);
    if(host) controls+='<form class="account-form" data-coop-form="setup"><label>Difficulté <select name="difficulty">'+
      difficulties.map(([value,label])=>option(value,label,coop.difficulty)).join('')+'</select></label><label>Carte <select name="map">'+
      maps.map(([value,label])=>option(value,label,coop.map)).join('')+'</select></label><button type="submit">Appliquer</button></form>';
    else controls+='<p>'+escape(difficulties.find(([v])=>v===coop.difficulty)?.[1])+' · '+escape(maps.find(([v])=>v===coop.map)?.[1])+'</p>';
    controls+='<form class="account-form" data-coop-form="loadout"><label>Survivant <select name="character">'+heroes+
      '</select></label><label>Arme de départ <select name="weapon">'+arms+'</select></label><button type="submit">Équiper</button></form>'+
      '<div class="split"><button type="button" data-coop="ready" data-ready="'+String(!local.ready)+'">'+(local.ready?'Annuler prêt':'Je suis prêt')+'</button>'+
      (host?'<button data-coop="launch" type="button"'+(coop.players.length<2||coop.players.some(p=>!p.ready)?' disabled':'')+'>Lancer la coop</button>':'')+'</div>';
  }
  return '<ul class="social-list">'+names+'</ul>'+(coop.error?'<p role="status">'+escape(coop.error)+'</p>':'')+controls;
}

export function bindCoopLobby(panel,refresh) {
  let handling=false, focused=false;
  function redraw() { if(!focused && !handling) refresh(); }
  panel.addEventListener('focusin',event=>{ if(event.target.matches('select')&&event.target.form?.dataset.coopForm) focused=true; });
  panel.addEventListener('focusout',event=>{
    if(event.target.matches('select')&&event.target.form?.dataset.coopForm) focused=false;
  });
  panel.addEventListener('submit',async event=>{
    const form=event.target, action=form.dataset.coopForm;
    if(!action) return;
    event.preventDefault();
    if(handling) return;
    const fields=new FormData(form);
    const value=action==='setup'?{difficulty:fields.get('difficulty'),map:fields.get('map')}:
      {character:Number(fields.get('character')),weapon:Number(fields.get('weapon'))};
    handling=true;
    try { await coopAction(action,value); } finally { handling=false; focused=false; redraw(); }
  });
  panel.addEventListener('click',async event=>{
    const button=event.target.closest('button[data-coop]');
    if(!button || handling || button.disabled) return;
    handling=true; button.disabled=true;
    const action=button.dataset.coop;
    try { await coopAction(action,action==='ready'?{ready:button.dataset.ready==='true'}:{}); }
    finally { handling=false; button.disabled=false; redraw(); }
  });
  addEventListener('cendres:coop-change',redraw);
}
