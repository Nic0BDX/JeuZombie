export const shop = [
 ['Dégâts','force',.10,40,'%'],['PV max','health',10,40,'PV'],['Vitesse','speed',.05,40,'%'],
 ['Chance','luck',.12,40,'%'],['Armure','armor',1,45,'pt'],['Croissance XP','growth',.08,55,'%'],
 ['Aimant','magnet',5,45,'px'],['Cadence','haste',.08,65,'%'],['Critiques','crit',.035,70,'%'],
 ['Relances','rerolls',1,85,''],['Bannissements','banishes',1,85,''],['Or gagné','goldGain',.08,75,'%']
];
export const shopCap=5;
export const shopFactor=1.55;
export const legacyShopCost=40;
export const weaponCosts=[0,0,0,0,75,90,105,120,135,155,175,200];
export const finishBonus={ secondsPerGold:18, killsPerGold:12, goldPerBoss:18, firstWin:100, pointsPerSecond:1, pointsPerKill:5, pointsPerBoss:150 };

export const achievements=[
 ['firstRun','Première sortie','Terminer une partie.','runs',1,12],
 ['fiveRuns','Habitué des joncs','Terminer 5 parties.','runs',5,25],
 ['tenRuns','Le marais te connaît','Terminer 10 parties.','runs',10,45],
 ['firstKill','Première cendre','Éliminer un ennemi.','kills',1,8],
 ['hundredKills','Faucheur de vase','Éliminer 100 ennemis.','kills',100,25],
 ['fiveHundredKills','Les joncs se taisent','Éliminer 500 ennemis.','kills',500,45],
 ['thousandKills','La boue se souvient','Éliminer 1 000 ennemis.','kills',1000,70],
 ['boss','La première tête','Vaincre un boss.','bosses',1,30],
 ['fiveBosses','Chasse aux revenants','Vaincre 5 boss.','bosses',5,60],
 ['firstWin','Rentrer à l’aube','Remporter une partie.','wins',1,40],
 ['threeWins','Le jour revient','Remporter 3 parties.','wins',3,80],
 ['fiveMinutes','Une bougie dans le noir','Tenir 5 minutes.','bestTime',300,20],
 ['tenMinutes','Au-delà des roseaux','Tenir 10 minutes.','bestTime',600,35],
 ['fifteenMinutes','Toute la nuit','Tenir 15 minutes.','bestTime',900,55],
 ['levelTen','Éveil','Atteindre le niveau 10.','bestLevel',10,25],
 ['levelTwenty','Maître des cendres','Atteindre le niveau 20.','bestLevel',20,50],
 ['fiveWeapons','Arsenal des berges','Porter 5 armes différentes au fil des parties.','weapons',5,25],
 ['allWeapons','Tout l’arsenal','Porter 12 armes différentes au fil des parties.','weapons',12,65],
 ['firstEvolution','Feu nouveau','Découvrir une évolution.','evolutions',1,30],
 ['allEnemies','Cartographe de la vase','Rencontrer les 9 espèces.','enemies',9,55]
];
