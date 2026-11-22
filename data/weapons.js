export const weapons = [
 ['Serpe de brume','⌒','Arc alterné.','Marée des serpes',2,23,.77,46,.18,3,'#a1ecc4'],
 ['Épine veilleuse','➤','Vise la cible la plus proche.','Ronce astrale',0,19,.66,5,1.8,1,'#b5f1a2'],
 ['Veilleurs d’os','◌','Des éclats gravitent autour de toi.','Couronne des os',3,9,.34,36,.25,3,'#eee0aa'],
 ['Graine de cendre','✦','Retombe et éclate en zone.','Jardin des braises',4,27,1.4,34,.48,6,'#ffae73'],
 ['Halo des joncs','◎','Blesse les ennemis proches.','Cœur du marais',6,7,.38,42,.26,10,'#93dfa1'],
 ['Foudre sourde','ϟ','Frappe des cibles au hasard.','Orage des noyés',1,28,1.35,18,.22,3,'#caf5ff'],
 ['Miroir fendu','◇','Rebondit aux bords de l’écran.','Palais des miroirs',8,13,1.1,5,3.2,6,'#dfb1ff'],
 ['Lanterne d’ambre','➲','Tire dans ta direction de marche.','Phare des cendres',9,20,.85,6,1.75,2,'#ffe18e']
].map(([name,icon,description,evolution,passive,damage,cooldown,area,duration,pierce,color]) =>
 ({name,icon,description,evolution,passive,damage,cooldown,area,duration,pierce,color}));
export const weaponMax = 8;
export const slots = 6;
