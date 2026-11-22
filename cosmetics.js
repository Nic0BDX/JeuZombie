import { account, socialConnection, socialRpc } from './online.js';
import { characters } from './data/characters.js';
import { cosmeticById } from './data/cosmetics.js';
import { getSprite } from './sprites.js';

const cacheName='cendres-cosmetics-v1';
const empty={owner:'',ash:0,items:[],equipped:{},chestAvailable:false,achievements:[]};
export const cosmetics={...empty,available:false,busy:false,message:''};
const loadouts=characters.map(()=>null);
const sprites=characters.map(()=>Object.create(null));
let refreshing, lastRead=0, generation=0;

const emit=()=>dispatchEvent(new Event('cendres:cosmetics'));
function read(){
  try { return JSON.parse(localStorage.getItem(cacheName)); } catch { return null; }
}

export function cosmeticAppearance(equipped,character){
  const loadout=equipped?.cosmetics?.[character];
  if(!loadout) return null;
  const look={};
  for(const slot in loadout) {
    const item=cosmeticById[loadout[slot]];
    if(item?.slot===slot) look[slot]=item;
  }
  primeCosmeticSprite(character,look.skin??look.character);
  return look;
}
export function activeCosmetics(character){ return loadouts[character]??null; }

function rgb(hex){
  const value=Number.parseInt(hex.slice(1),16);
  return [value>>16,(value>>8)&255,value&255];
}

export function primeCosmeticSprite(character,item){
  if(!item || !characters[character] || sprites[character][item.id]) return;
  const dark=rgb(item.color), light=rgb(item.light), frames=new Array(4);
  for(let frame=0;frame<4;frame++){
    const source=getSprite(characters[character].sprite,frame);
    const canvas=document.createElement('canvas');
    canvas.width=source.width; canvas.height=source.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx?.getImageData) { frames[frame]=source; continue; }
    ctx.drawImage(source,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height), data=pixels.data;
    for(let i=0;i<data.length;i+=4){
      if(!data[i+3]) continue;
      const shade=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)/255;
      for(let c=0;c<3;c++) data[i+c]=shade<.45 ? dark[c]*shade/.45 : dark[c]+(light[c]-dark[c])*(shade-.45)/.55;
    }
    ctx.putImageData(pixels,0,0);
    frames[frame]=canvas;
  }
  sprites[character][item.id]=frames;
}

export function cosmeticSprite(character,frame,item){
  return (item && sprites[character]?.[item.id]?.[frame]) || getSprite(characters[character].sprite,frame);
}

function apply(owner,data){
  if(!data || !Array.isArray(data.items) || !data.equipped) return false;
  const {ash,items,equipped,chestAvailable,achievements}=data;
  const record={owner,ash,items,equipped,chestAvailable,achievements};
  Object.assign(cosmetics,record);
  for(let i=0;i<loadouts.length;i++) loadouts[i]=cosmeticAppearance(equipped,i);
  try { localStorage.setItem(cacheName,JSON.stringify(record)); } catch {}
  return true;
}

export function cosmeticsState(){
  const connection=socialConnection();
  cosmetics.available=!!connection;
  if(!connection) return Promise.resolve(false);
  if(refreshing || cosmetics.busy) return refreshing??Promise.resolve(false);
  const current=generation;
  refreshing=(async()=>{
    try {
      const answer=await socialRpc('cosmetics_state',{});
      if(current!==generation || socialConnection()?.id!==connection.id) return false;
      const ok=apply(connection.id,answer);
      if(ok) { lastRead=Date.now(); if(cosmetics.message==='Boutique indisponible.') cosmetics.message=''; }
      return ok;
    } catch {
      if(current===generation) cosmetics.message='Boutique indisponible.';
      return false;
    } finally { refreshing=null; emit(); }
  })();
  return refreshing;
}

export async function cosmeticAction(action,item,character,slot){
  const connection=socialConnection();
  if(!connection || cosmetics.busy) return false;
  cosmetics.busy=true;
  cosmetics.message='';
  emit();
  const current=generation;
  try {
    if(refreshing) await refreshing;
    if(current!==generation || socialConnection()?.id!==connection.id) return false;
    const data=action==='chest' ? await socialRpc('cosmetics_daily',{}) :
      action==='purchase' ? await socialRpc('cosmetics_purchase',{p_item:item}) :
      await socialRpc('cosmetics_equip',{p_character:character,p_slot:slot,p_item:item});
    if(current!==generation || socialConnection()?.id!==connection.id) return false;
    if(!apply(connection.id,data)) return false;
    if(data.chestItem) cosmetics.message='Coffre ouvert · '+(cosmeticById[data.chestItem]?.name??'Cosmétique acquis');
    return true;
  } catch(error) {
    if(current===generation) cosmetics.message=error.detail??'Action indisponible.';
    return false;
  } finally { cosmetics.busy=false; emit(); }
}

export function startCosmetics(){
  const cached=read();
  if(cached?.owner) apply(cached.owner,cached);
  addEventListener('cendres:account',()=>{
    const connection=socialConnection();
    cosmetics.available=!!connection;
    const owner=account.profile?.id;
    if(owner && owner!==cosmetics.owner){
      generation++; lastRead=0;
      Object.assign(cosmetics,empty,{owner,available:!!connection,message:''});
      loadouts.fill(null);
    }
    if(connection && Date.now()-lastRead>20000) cosmeticsState();
    else emit();
  });
  addEventListener('cendres:reset',()=>{
    generation++; lastRead=0; loadouts.fill(null);
    Object.assign(cosmetics,empty,{available:false,busy:false,message:''});
    try { localStorage.removeItem(cacheName); } catch {}
    emit();
  });
  addEventListener('cendres:match-recorded',cosmeticsState);
}
