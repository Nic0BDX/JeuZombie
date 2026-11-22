import { weaponCosts } from './shop.js';
export { weaponCosts };

export const characters = [
 { name:'Fossoyeur', sprite:'wanderer', speed:76, weapon:0, bonus:'armor', amount:2, cost:0, description:'Faux rouillée · +2 armure' },
 { name:'Chasseuse', sprite:'nettle', speed:82, weapon:1, bonus:'growth', amount:.22, cost:50, description:'Fusil de chasse · +22 % XP' },
 { name:'Pêcheur', sprite:'ember', speed:76, weapon:7, bonus:'force', amount:.24, cost:120, description:'Arbalète · +24 % dégâts' },
 { name:'Herboriste', sprite:'herbalist', speed:74, weapon:2, bonus:'regen', amount:.7, cost:175, description:'Torches ardentes · +0,7 PV/s' },
 { name:'Fossile', sprite:'fossil', speed:72, weapon:9, bonus:'health', amount:24, cost:240, description:'Boomerang d’os · +24 PV max' }
];
