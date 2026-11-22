const progressions = [
 {projectiles:1},{degats:.27},{zone:.22},{perforation:2},{cooldown:-.20},{duree:.30}
];

export const weapons = [
 ['faux','Faux rouillée','arc','acier','⌒','Arc alterné qui repousse.', 'Moisson des noyés',2,23,.77,1,46,0,.18,3,60,.08,100,'#a1ecc4','arc','',0,{mirror:true}],
 ['fusil','Fusil de chasse','target','acier','➤','Éventail de plombs sur la cible la plus proche.','Canon de tourbière',0,12,.8,3,5,190,.85,1,152,.12,22,'#edd5a0','trail','',0,{projectiles:2,spread:.28}],
 ['torches','Torches ardentes','orbit','feu','◌','Torches en orbite qui brûlent.','Couronne des bûchers',3,9,.64,2,38,4,.64,4,60,.08,0,'#ffc27e','diamond','burn',2,{duree:.75}],
 ['cocktail','Cocktail incendiaire','lob','feu','✦','Un jet en cloche laisse une flaque de feu.','Jardin des braises',4,13,1.5,1,32,0,1.4,7,130,.07,0,'#ffae73','lob','burn',2,{zone:.45}],
 ['brume','Brume toxique','aura','spore','◎','Empoisonne les ennemis proches.','Souffle des tourbières',6,7,.55,1,42,0,.3,10,52,.06,0,'#93dfa1','circle','poison',2.5,{duree:.5,poison:.8}],
 ['foudre','Foudre des marais','lightning','orage','ϟ','Frappe au hasard et étourdit.','Orage des noyés',1,28,1.4,1,18,0,.24,3,180,.16,0,'#caf5ff','lightning','stun',.45,{stun:.50}],
 ['hache','Hache rebondissante','bounce','acier','◇','Rebondit aux bords de l’écran.','Cyclone de fer',8,15,1.12,1,6,125,3.2,6,400,.09,35,'#dfb1ff','diamond','',0,{ricochet:true}],
 ['arbalete','Arbalète','direction','acier','➲','Tire un carreau perforant dans le sens de la marche.','Trait du fossoyeur',9,22,.96,1,6,210,1,3,210,.11,0,'#ffe18e','trail','',0,{perforation:4}],
 ['mines','Mines à spores','trap','spore','⊙','Pose des pièges qui éclatent au contact.','Champ des revenants',7,32,1.45,1,33,0,5,12,72,.09,50,'#cee78a','mine','poison',1.4,{chain:true}],
 ['os','Boomerang d’os','return','os','↶','Touche à l’aller et au retour.','Cercle des ossements',5,19,1.16,1,8,142,1.5,7,105,.10,0,'#eee0aa','diamond','',0,{echo:true}],
 ['chaines','Chaînes de cendre','aura','cendre','⛓','Ralentit les cibles et les attire.','Entraves du grand marais',8,15,1.07,1,57,0,.28,13,64,.08,-132,'#cbc1d8','chains','slow',1.6,{recul:-80}],
 ['chien','Chien fantôme','ally','spectre','✧','Un allié poursuit et mord les zombies.','Meute des disparus',6,15,2.26,1,9,102,2.1,10,130,.10,0,'#b4e0f3','hound','',0,{projectiles:2}]
].map(([id,nom,type,tag,icon,description,nomEvolue,passifRequis,degats,cooldown,projectiles,zone,vitesse,duree,perforation,portee,crit,recul,color,effetVisuel,status,dureeStatut,special]) => ({
 id,nom,type,tags:[tag],icon,description,color,effetVisuel,son:0,status,dureeStatut,
 baseStats:{degats,cooldown,projectiles,zone,vitesse,duree,perforation,portee,crit,recul},
 niveaux:[{},...progressions,special],
 evolution:{passifRequis,nomEvolue,bonus:{degats:2,zone:1.22,projectiles:1},son:8}
}));
export const weaponMax = 8;
export const slots = 6;
export const synergyTag = 'feu';
export const synergyDescription = 'Synergie Feu · brûlure +50 %';
