export const passives = [
 ['Poudre de silex','Force','force',.12],['Engrenage noir','Vitesse d’attaque','haste',.09],
 ['Prisme des joncs','Zone','area',.10],['Sceau de veille','Durée','duration',.13],
 ['Plume de cuivre','Vitesse des projectiles','shotSpeed',.12],['Cœur de tourbe','PV max','health',12,'+12 PV'],
 ['Sève d’aulne','Régénération','regen',.25,'+0,25 PV/s'],['Cuirasse de vase','Armure','armor',1.2,'+1,2'],
 ['Bottes d’aigrettes','Vitesse de marche','speed',.08],['Lodestone bleue','Aimant','magnet',.16],
 ['Savoir des roseaux','Croissance XP','growth',.10],['Patte grise','Chance','luck',.11],
 ['Œil des braises','Chance critique','crit',.03],['Voile des noyés','Esquive','dodge',.035,'+3,5 %'],
 ['Dent des revenants','Vol de vie','lifeSteal',.018,'+1,8 %'],['Escarcelle de tourbe','Gain d’or','goldGain',.10]
];
export const passiveMax = 5;
export const initialStats = { health:100, regen:.1, armor:0, speed:1, magnet:30, force:1, haste:1, area:1,
 duration:1, shotSpeed:1, growth:1, luck:1, crit:0, dodge:0, lifeSteal:0, goldGain:1, rerolls:0, banishes:0 };
export const shop = [
 ['Vitalité','health',10],['Force','force',.10],['Allure','speed',.05],['Fortune','luck',.12]
];
export const shopCap = 5;
export const shopCost = 40;
