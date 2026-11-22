export const xpSizes=[1,5,20,100];
export const cardTools={rerolls:2,skips:1,banishes:2};
export const cardRarities=[
 ['Commune','#8f929d'],['Rare','#75b9f1'],['Épique','#c195ed'],['Légendaire','#ffae71']
];
export const utilityCards=[
 ['Baume des joncs','Rend 25 % des PV max.',.25,0],
 ['Remède du marais','Rend 50 % des PV max.',.50,0],
 ['Bourse de cuivre','Rapporte 10 or.',0,10],
 ['Butin de braise','Rapporte 18 or.',0,18]
];
export const chestGold=12;
export const extraCardLuck=1.22;

export function xpGoal(level,growth) {
  const n=level-1;
  return Math.floor(6+7*n+.35*n*n)*growth;
}

export function gemTier(value) {
  if(value>=xpSizes[3]) return 3;
  if(value>=xpSizes[2]) return 2;
  return Number(value>=xpSizes[1]);
}
