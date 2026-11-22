export const cosmeticSlots=Object.freeze({
  character:'Personnages',skin:'Skins',weapon:'Revêtements',trail:'Traînées',death:'Effets de mort',frame:'Cadres',title:'Titres'
});
export const cosmeticRarities=Object.freeze({
  common:'Commune',rare:'Rare',epic:'Épique',legendary:'Légendaire'
});
export const cosmeticItems=Object.freeze([
  ["nomade_mousse","character","Nomade des mousses","common",40,"#8fc5a2","#e2f5ab","✥"],
  ["veilleuse_ecume","character","Veilleuse d’écume","epic",150,"#5dc1cf","#e0f8fa","✦"],
  ["roi_braise","character","Roi des braises","legendary",290,"#ad503d","#ffe096","♜"],
  ["peau_saule","skin","Saule luisant","common",45,"#829d62","#e9f6b9","❧"],
  ["peau_cendre","skin","Cendre froide","rare",75,"#718699","#e0f1fa","✶"],
  ["peau_mauve","skin","Voile mauve","epic",155,"#74588f","#f1bdea","☾"],
  ["peau_or","skin","Braise dorée","legendary",305,"#a86d31","#fff196","✧"],
  ["trait_fanal","weapon","Flamme verte","common",45,"#78dd8c","#d0f8a2","↟"],
  ["trait_azur","weapon","Braise bleue","rare",90,"#5aacff","#c3edff","◆"],
  ["trait_or","weapon","Os doré","legendary",325,"#ecbc61","#fff0a9","◈"],
  ["pas_spores","trail","Pas de spores","common",35,"#91c779","#caffac","··"],
  ["pas_lune","trail","Sillage lunaire","rare",80,"#9fa1e7","#e2ccff","⋯"],
  ["pas_marais","trail","Fil du marais","epic",145,"#58bba5","#cefce6","∿"],
  ["mort_brume","death","Nuée d’aiguilles","common",50,"#a3c477","#e4efb9","✺"],
  ["mort_flamb","death","Flambée du guet","epic",160,"#df7958","#ffd19a","✹"],
  ["mort_aurore","death","Aurore des noyés","legendary",310,"#bd65ba","#f9cffa","✷"],
  ["cadre_jonc","frame","Cadre en jonc","common",30,"#a2b579","#edf5c0","▣"],
  ["cadre_etain","frame","Étain bruni","rare",100,"#8facbc","#c6dfe6","▧"],
  ["cadre_or","frame","Sigille de l’Étang","legendary",260,"#e5ae55","#fff0a9","▣"],
  ["titre_guetteur","title","Guetteur du marais","common",30,"#c1d68d","#eef7c0","✎"],
  ["titre_mistral","title","Souffle de brume","rare",70,"#9ec3d1","#d1f4f8","✐"],
  ["titre_feu","title","Gardien de la braise","legendary",255,"#ffa46a","#ffedaf","✪"]
].map(([id,slot,name,rarity,price,color,light,icon])=>Object.freeze({id,slot,name,rarity,price,color,light,icon})));
export const cosmeticById=Object.freeze(Object.fromEntries(cosmeticItems.map(item=>[item.id,item])));
export const ashAchievements=Object.freeze([
  ["first_match","Premier combat",15],
  ["first_win","Première victoire",30],
  ["hundred_kills","Cent éliminations",25],
  ["ten_revives","Dix réanimations",35],
  ["ten_matches","Dix combats",40]
]);
