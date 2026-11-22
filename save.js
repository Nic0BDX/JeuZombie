import { shop, shopCap, legacyShopCost } from './data/shop.js';

const key='cendres-du-marais-v2', legacyKey='cendres-du-marais-v1';
const defaults=()=>({
  version:2, gold:0, characters:1, weapons:15, character:0, startingWeapon:-1,
  upgrades:shop.map(()=>0), invested:shop.map(()=>0),
  options:{sound:true,musicVolume:.55,sfxVolume:.8,vibration:true,shake:true,quality:2,leftHanded:false},
  collection:{seen:0,kills:[0,0,0,0,0,0,0,0,0], weapons:0,seenWeapons:0,evolutions:0,achievements:0},
  records:{runs:0,wins:0,kills:0,bosses:0,bestTime:0,bestLevel:0,bestScore:0,totalScore:0}
});
function read(key){ try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }

function normalize(source) {
  const base=defaults(), legacy=source.version!==2;
  const ranks=base.upgrades.map((_,i)=>Math.max(0,Math.min(shopCap,Math.floor(Number(source.upgrades?.[i])||0))));
  return {
    ...base,...source,version:2,characters:(source.characters|0)|1,weapons:(source.weapons|0)|15,
    upgrades:ranks,invested:ranks.map((rank,i)=>legacy ? legacyShopCost*rank*(rank+1)/2 : Math.max(0,Number(source.invested?.[i])||0)),
    options:{...base.options,...source.options},
    collection:{...base.collection,...source.collection,kills:base.collection.kills.map((_,i)=>Math.max(0,Number(source.collection?.kills?.[i])||0))},
    records:{...base.records,...source.records}
  };
}

const previous=read(key)??read(legacyKey);
export let save=previous && typeof previous==='object' ? normalize(previous) : defaults();
export function persist(){ try { localStorage.setItem(key,JSON.stringify(save)); } catch {} }
export function resetSave(){ save=defaults(); persist(); }
if(previous && previous.version!==2) persist();
