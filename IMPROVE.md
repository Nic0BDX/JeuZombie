############################################################
# S0 : RÈGLES PRIORITAIRES (ÉCONOMIE DE TOKENS ET OPTIMISATION)
############################################################
Priorité absolue sur tout le reste. Projet : "Les Cendres du Marais" (survivor-like zombie, mobile). On AMÉLIORE le jeu existant, on ne le refait pas.

## Lecture
- Enregistre ce document dans IMPROVE.md (copie exacte). Ne le relis jamais en entier : lis seulement S0 + la section de la phase en cours (grep/sed sur "## S").
- Lis PROGRESS.md (crée-le s'il n'existe pas) en début de session. Ne lis que les fichiers que tu vas modifier. Pas d'exploration générale du dépôt. Ne relis pas ce que tu viens d'écrire.

## Écriture
- Patchs ciblés uniquement. Jamais de réécriture complète d'un fichier existant, jamais de refactor non demandé.
- Aucune nouvelle dépendance. Aucun fichier audio ou image : sons, musique et sprites sont générés par code.
- Code compact, données dans des fichiers data/ (armes, cartes, boutique, audio), jamais en dur dans la logique. Commentaires : 1 ligne max.

## Exécution et réponses
- Une seule vérification rapide par phase (node --check sur les fichiers modifiés). Pas de rebuilds ni tests répétés.
- Ne colle jamais de code dans tes réponses, ne justifie rien sauf si je demande. Réponse de fin de phase : 10 lignes max en français : 1) fait, 2) comment tester sur téléphone (URL Vercel) + 3 points à vérifier, 3) reste à faire.
- Mets PROGRESS.md à jour (15 lignes max : phase, fichiers clés, décisions, bugs connus).

## Cadre
- Une seule phase à la fois, puis STOP, attends "phase suivante".
- Ne casse jamais l'existant. Jeu jouable et sans erreur console à la fin de chaque phase. Sauvegarde existante compatible (migration si le format change, clé versionnée).
- Cas ambigu : solution la plus simple, 1 ligne dans PROGRESS.md, pas de question.

## Optimisation (impératif)
- Pools d'objets, zéro allocation par frame (pas de .map/.filter/.forEach ni littéraux objets/tableaux dans la boucle chaude), distances au carré, spatial hash pour les collisions, sprites pré-rendus hors écran, rendu uniquement de ce qui est visible, plafonds d'entités (ennemis 300, projectiles 250, particules 150) avec réduction auto des effets si FPS < 45.
- Les calculs de stats (armes, passifs, boutique) sont faits à l'achat ou au level-up et mis en cache, jamais recalculés à chaque frame.

############################################################
# OBJECTIF
############################################################
Ajouter un vrai système d'armes, un système d'XP et de cartes d'amélioration riche, un menu principal avec boutique et méta-progression, et refaire entièrement les bruitages et la musique. Garde l'ambiance : marais, cendres, brume, braise, zombies. Tout doit être utilisable d'un seul pouce sur téléphone.

## S1 Système d'armes (data/weapons.js, moteur générique dans weapons.js)
Architecture : chaque arme est une donnée {id, nom, type, tags[], baseStats{degats, cooldown, projectiles, zone, vitesse, duree, perforation, portee, crit, recul}, niveaux[1..8] (deltas), evolution{passifRequis, nomEvolue, bonus}, effetVisuel, son}. Un seul moteur lit ces données : ajouter une arme = ajouter une entrée, sans toucher la logique. Les types de comportement (arc, projectile ciblé, orbite, cloche, aura, éclair, rebond, rafale directionnelle, mine/piège, boomerang) sont des modules réutilisables.
- Le joueur porte 6 armes max (emplacements affichés dans le HUD avec niveau). Dégâts calculés : base x force joueur x bonus d'arme, avec chance de coup critique (x2) et affichage des chiffres (jaune pour critique).
- Statuts : brûlure (dégâts sur la durée), ralentissement, poison, étourdissement, recul. Les ennemis en portent plusieurs avec durée.
- Armes de départ (noms originaux, thème marais/zombie), 12 armes :
  1. Faux rouillée : arc devant le joueur, alterne gauche/droite, recul.
  2. Fusil de chasse : projectile sur l'ennemi le plus proche, éventail de plombs.
  3. Torches ardentes : orbitent autour du joueur, brûlure.
  4. Cocktail incendiaire : lancé en cloche, laisse une flaque de feu au sol.
  5. Brume toxique : aura de poison autour du joueur.
  6. Foudre des marais : frappe des ennemis au hasard, étourdit.
  7. Hache rebondissante : rebondit sur les bords de l'écran.
  8. Arbalète : tire dans la direction du déplacement, perforant.
  9. Mines à spores : pose des pièges qui explosent au contact, zone.
  10. Boomerang d'os : aller-retour, touche deux fois.
  11. Chaînes de cendre : ralentit en zone, tire les ennemis vers le joueur.
  12. Chien fantôme : allié qui poursuit et mord les ennemis proches.
- Progression des 8 niveaux : alternance +1 projectile, +dégâts, +zone, +perforation, -cooldown, +durée, un niveau 8 à effet spécial propre à chaque arme.
- Évolutions : arme niveau 8 + passif associé, ouverture de coffre : version évoluée (nom différent, dégâts x2, effet visuel et sonore renforcé).
- Synergies par tags : certains duos donnent un bonus affiché dans la carte (ex. feu + feu = brûlure plus longue).

## S2 XP et cartes d'amélioration (data/cards.js, ui.js)
- Gemmes d'XP de 4 tailles (1/5/20/100), aimant, fusion si trop nombreuses. Courbe : XP niveau N = floor(6 + 7x(N-1) + 0.35x(N-1)^2) x croissance.
- Barre d'XP pleine largeur avec animation de remplissage, flash et son au level-up, niveau affiché.
- Écran de level-up : pause, 3 cartes (4 avec bonus de chance), grandes cartes tactiles empilées verticalement, un tap pour choisir. Chaque carte : icône pixel, nom, niveau actuel -> suivant, description claire avec chiffres, cadre de couleur selon la rareté (Commune grise, Rare bleue, Épique violette, Légendaire orange braise), étiquette NOUVEAU / NIVEAU X / ÉVOLUTION / SYNERGIE.
- Types de cartes : nouvelle arme, amélioration d'arme, passif (16 : force, cadence, zone, durée, vitesse projectile, PV max, régénération, armure, vitesse, aimant, croissance, chance, critique, esquive, vol de vie, gain d'or), soin, or.
- Tirage pondéré : la chance augmente les raretés hautes, jamais de doublon dans un même tirage, priorité aux armes/passifs déjà possédés après 6 emplacements pleins. Tout est maxé : cartes or/soin.
- Outils : 2 relances (reroll), 1 mise de côté (skip) et 2 bannissements (banish, retire une carte de la partie) par partie, extensibles via la boutique. Boutons grands et clairement étiquetés.

## S3 Menu, boutique et méta-progression (data/shop.js, save.js)
- Menu principal (bas d'écran, gros boutons, fond animé brume et braises) : Jouer, Personnages, Boutique, Collection, Options.
- Écran de préparation : choix du personnage et de l'arme de départ, résumé des bonus actifs.
- Boutique permanente (monnaie : or gagné en partie) avec onglets :
  a) Améliorations : 12 lignes de 5 niveaux (force, PV max, vitesse, armure, croissance, aimant, cadence, chance, critique, relances, bannissements, or gagné), coût = base x 1.55^niveau, aperçu avant/après, bouton Acheter, remboursement total possible.
  b) Armes : déblocage des 12 armes (les 4 premières gratuites) avec prix croissants.
  c) Personnages : 5 survivants à débloquer (Fossoyeur, Chasseuse, Pêcheur, Herboriste, Fossile) avec arme de départ et bonus passif uniques.
- Collection : bestiaire (ennemis rencontrés, kills), armes vues, évolutions découvertes, succès (20) avec récompenses d'or.
- Récompenses : or + points de fin de partie selon temps, kills, boss tués ; bonus de première victoire. Écran de fin détaillé (temps, kills, niveau, or gagné, armes portées).
- Sauvegarde localStorage versionnée, migration de l'ancien format sans rien perdre, sauvegarde en fin de partie et sur visibilitychange, try/catch.
- Options : volume musique, volume effets (curseurs), vibration, screen shake, qualité des effets (haute/moyenne/basse), gaucher (déplace le joystick/boutons), reset de la sauvegarde avec double confirmation.

## S4 Bruitages et musique (audio.js, data/audio.js), tout généré par code
- Remplace complètement l'audio actuel. Web Audio API uniquement, aucun fichier.
- Mixer : bus master -> compresseur/limiteur (pas de saturation), sous-bus musique et effets avec leurs volumes (options). Plafond de 16 voix, priorité aux sons importants, anti-spam (un même son max 1 fois par 50 ms), micro-variation de hauteur aléatoire (+/-6 %) pour éviter la répétition. Ducking : la musique baisse de 40 % pendant les écrans de level-up et de boss.
- Bruitages (synthèse, enveloppes ADSR courtes), cohérents avec le thème : tir de fusil (bruit + coup grave), coup de faux (balayage de bruit filtré), flamme (bruit passe-bande), éclair (craquement + grondement), impact de zombie (thud + bruit), mort de zombie (gémissement court descendant), gemme (tintement montant, hauteur qui monte si ramassages enchaînés), level-up (arpège lumineux), apparition de cartes (swoosh), choix de carte (clic satisfaisant), coffre (cliquetis + fanfare), joueur touché (impact grave + dissonance), pièce d'or, achat boutique, refus, alerte boss (grondement + corne), victoire, défaite.
- Musique générative en boucle (séquenceur planifié avec l'horloge audio, pas de setInterval imprécis), gamme mineure sombre : couche 1 basse/drone, couche 2 arpège mélancolique, couche 3 percussions (kick sourd, caisse claire sèche, charley), couche 4 mélodie lead rare. Intensité adaptative : les couches s'ajoutent selon la minute et le nombre d'ennemis. Morceaux distincts : menu (calme, ambiance), partie (3 niveaux d'intensité), boss (tempo plus rapide, plus agressif), victoire, défaite. Transitions en fondu sur la mesure.
- Respecte les règles mobiles : l'AudioContext n'est débloqué qu'au premier tap (écran "Touche pour jouer"), suspend l'audio quand l'app passe en arrière-plan ou en pause, reprend proprement.

## S5 Retours visuels (juste ce qu'il faut)
- Flash d'impact, chiffres de dégâts (critique en jaune plus gros), particules de mort, tremblement d'écran léger désactivable, effets de statut visibles (flamme sur ennemi brûlé, bulles de poison), halo de rareté sur les cartes, animation de coffre et d'évolution. Tout respecte les plafonds de particules.

## S6 Phases (lis S0 + la section indiquée seulement)
P1 : S1 système d'armes (moteur data-driven, 12 armes, statuts, critiques, 6 emplacements, HUD d'armes).
P2 : S2 XP, courbe, cartes à raretés, relances/bannissements, passifs (16), coffres et évolutions, synergies.
P3 : S4 audio complet (mixer, bruitages, musique adaptative), options de volume.
P4 : S3 menu principal, préparation, boutique, personnages, sauvegarde versionnée, options.
P5 : S3 collection/bestiaire/succès + S5 retours visuels + optimisation mobile finale (FPS, mémoire, batterie).

############################################################
# COMMANDE
############################################################
Applique S0. Enregistre IMPROVE.md et PROGRESS.md. Lis seulement le code nécessaire à la phase 1, fais la phase 1 uniquement (S1), déploie une préversion Vercel, réponds en 10 lignes max.
