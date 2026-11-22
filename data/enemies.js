export const enemies = [
 ['Rôdeur',18,32,9,7,'#8fa878',1,0],['Moucheron',11,55,6,6,'#ce8db3',1,0],
 ['Portefaix',72,19,16,9,'#a78e72',3,0],['Crache-vase',30,25,10,7,'#8cbdb2',3,2.7],
 ['Nuée',16,46,8,6,'#bbbb70',1,0],['Guetteur',180,29,20,11,'#d98f69',8,1.8],
 ['Le Fossoyeur',800,23,23,15,'#a692cf',15,2.5],['L’Aulne Creux',1800,21,30,15,'#e4a274',24,2],
 ['La Nuit Renversée',3400,24,36,15,'#ee90ad',36,1.6]
].map(([name,hp,speed,damage,radius,color,xp,fire])=>({name,hp,speed,damage,radius,color,xp,fire}));
export const invulnerability = .65;
