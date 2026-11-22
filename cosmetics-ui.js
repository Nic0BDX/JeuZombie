import { characters } from './data/characters.js';
import { cosmeticItems, cosmeticById, cosmeticSlots, cosmeticRarities, ashAchievements } from './data/cosmetics.js';
import { cosmetics, cosmeticAction, cosmeticsState, cosmeticSprite, primeCosmeticSprite } from './cosmetics.js';

const rarityColors={common:'#9eaaa1',rare:'#7eb5ee',epic:'#c289eb',legendary:'#ffae6a'};
const slots=Object.keys(cosmeticSlots);
let slot='character', hero=null, preview='';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const button=(text,action,value='',off=false)=>'<button type="button" data-cosmetic="'+action+'" data-value="'+esc(value)+'"'+(off?' disabled':'')+'>'+text+'</button>';

export function drawCosmetics(ui,character){
  const idx=hero??character??0;
  const selected=cosmeticById[preview], owned=cosmetics.items.includes(preview);
  const equipped=cosmetics.equipped.cosmetics?.[idx]?.[slot];
  const equippedName=cosmeticById[equipped]?.name??'Aucun';
  const tabs=slots.map(key=>button(cosmeticSlots[key],'tab',key,key===slot)).join('');
  const heroes=characters.map((value,index)=>'<option value="'+index+'"'+(index===idx?' selected':'')+'>'+esc(value.name)+'</option>').join('');
  let list='';
  for(const item of cosmeticItems) {
    if(item.slot!==slot) continue;
    list+=button(item.icon+' '+item.name+' · '+(item.id===equipped?'Équipé':cosmetics.items.includes(item.id)?'Acquis':item.price+' pc'),
      'preview',item.id,item.id===preview);
  }
  let detail='';
  if(selected){
    const off=!cosmetics.available||cosmetics.busy;
    detail='<section class="cosmetic-preview" style="border:2px solid '+rarityColors[selected.rarity]+';padding:9px">'+
      '<canvas id="cosmetic-sample" width="48" height="48" aria-hidden="true" style="display:block;margin:auto;width:48px;height:48px;image-rendering:pixelated"></canvas>'+
      '<strong>'+selected.name+'</strong><p>'+cosmeticRarities[selected.rarity]+' · '+selected.price+' Points de Cendre</p>'+
      (preview===equipped ? button('Déséquiper','unequip',preview,off) : owned ? button('Équiper','equip',preview,off) :
      button('Acheter','purchase',preview,off||cosmetics.ash<selected.price))+'</section>';
  }
  const achievements=ashAchievements.map(([id,name,points])=>'<li>'+name+' · '+points+' pc'+
    (cosmetics.achievements.includes(id)?' ✓':'')+'</li>').join('');
  ui.screen('Cosmétiques','<p>'+cosmetics.ash+' Points de Cendre</p>'+
    (!cosmetics.available?'<p>Connecte ton profil pour accéder aux achats.</p>':'')+
    (cosmetics.message?'<p role="status">'+esc(cosmetics.message)+'</p>':'')+
    ui.actions(button(cosmetics.chestAvailable?'Coffre de cendre gratuit':'Coffre de cendre indisponible','chest','',!cosmetics.available||!cosmetics.chestAvailable||cosmetics.busy))+
    '<p><label>Personnage <select data-cosmetic-hero style="min-height:48px">'+heroes+'</select></label></p>'+
    '<div class="split">'+tabs+'</div><p>Équipé · '+equippedName+'</p>'+detail+ui.actions(list)+
    '<details><summary>Succès de Cendre</summary><ul>'+achievements+'</ul></details>'+ui.actions(ui.btn('Retour','m:page:home')));
  if(selected) drawSample(idx,selected);
}

function drawSample(character,item){
  const canvas=document.querySelector('#cosmetic-sample'), ctx=canvas?.getContext('2d');
  if(!ctx) return;
  ctx.imageSmoothingEnabled=false;
  if(item.slot==='character'||item.slot==='skin'){
    primeCosmeticSprite(character,item);
    ctx.drawImage(cosmeticSprite(character,0,item),0,0,48,48);
  } else {
    ctx.fillStyle=item.color; ctx.fillRect(5,5,38,38);
    ctx.fillStyle=item.light; ctx.fillRect(7,7,34,34);
    ctx.fillStyle='#222333'; ctx.fillRect(9,9,30,30);
    ctx.font='23px monospace'; ctx.textAlign='center'; ctx.fillStyle=item.light;
    ctx.fillText(item.icon,24,33);
  }
}

export function bindCosmetics(panel,refresh,selectCharacter){
  panel.addEventListener('click',event=>{
    const target=event.target.closest('button[data-cosmetic]');
    if(!target || target.disabled) return;
    const {cosmetic:action,value}=target.dataset;
    if(action==='tab'){ slot=value; preview=''; refresh(); return; }
    if(action==='preview'){ preview=value; refresh(); return; }
    const character=hero??selectCharacter?.()??0;
    if(action==='chest'||action==='purchase'||action==='equip'||action==='unequip'){
      void cosmeticAction(action,action==='unequip'?null:value,character,slot);
    }
  });
  panel.addEventListener('change',event=>{
    if(!event.target.hasAttribute('data-cosmetic-hero')) return;
    hero=Number(event.target.value);
    refresh();
  });
  addEventListener('cendres:cosmetics',refresh);
}
export { cosmeticsState };
