############################################################
# S1 Comptes et profil (Supabase)
############################################################
- Auth : connexion anonyme au premier lancement (aucune friction), puis possibilité de "sécuriser le compte" par e-mail (lien magique) pour retrouver sa progression sur un autre téléphone. Pseudo unique (3-16 caractères, filtre de mots interdits), code ami à 6 caractères généré automatiquement.
- Aucune donnée personnelle collectée en dehors de l'e-mail optionnel. Pas de chat libre dans le jeu (voir S3).
- Fichier supabase/migration.sql à me fournir, avec tables et politiques RLS :
  profiles(id, pseudo, friend_code, created_at, equipped jsonb, stats jsonb),
  friendships(a, b, status[pending/accepted/blocked], created_at),
  currencies(user_id, gold, ash_points),
  inventory(user_id, item_id, acquired_at),
  matches(id, host_id, started_at, duration_s, result[win/loss], team_size, difficulty, boss_kills, total_kills),
  match_players(match_id, user_id, character, kills, damage_dealt, damage_taken, revives, deaths, level_reached, weapons jsonb, points_earned),
  transactions(id, user_id, kind, amount, item_id, created_at).
- Le solo hors ligne continue de marcher avec la sauvegarde locale ; à la reconnexion, la progression locale est fusionnée avec le compte (sans doublons ni perte).
- Un joueur ne peut lire/écrire que ses propres lignes (sauf profils publics limités à pseudo/équipement et matchs auxquels il a participé).

############################################################
# S2 Système d'amis
############################################################
- Écran Amis (depuis le menu) : liste avec statut (en ligne / en partie / hors ligne via Supabase Presence), ajout par pseudo ou code ami, demandes reçues (accepter/refuser), suppression, blocage.
- Invitation en un tap dans le salon d'un ami ; invitation reçue = bandeau cliquable en haut de l'écran. Lien/code de salon partageable à 4 caractères pour rejoindre sans être ami.
- Limites anti-abus : 100 amis max, 20 demandes en attente max, anti-spam d'invitations (1 par 5 s par ami).

############################################################
# S3 Salon et coop (2 à 4 joueurs, même équipe)
############################################################
- Salon : l'hôte choisit difficulté et carte, chacun choisit son personnage et son équipement, bouton Prêt, compte à rebours, départ quand tous sont prêts. Un même personnage peut être pris par plusieurs joueurs.
- Pas de chat libre. Communication par pings et emotes rapides (6 emotes : Aide, Merci, Attention, Danger, Ici, GG), affichées au-dessus du joueur.
- Architecture : hôte autoritaire. Le téléphone de l'hôte simule ennemis, vagues, collisions, drops. Les autres joueurs envoient leurs entrées (direction normalisée + actions) à 20 Hz et reçoivent des snapshots à 15 Hz.
- Transport : WebRTC DataChannel (non fiable, non ordonné) avec signalisation via les canaux Supabase Realtime. Si la connexion directe échoue, repli sur un relais Supabase Realtime à cadence réduite (10 Hz). Détecter la déconnexion (ping/pong 2 s) : si un joueur se déconnecte, son personnage devient un fantôme puis est retiré proprement. Si l'hôte part : fin de partie, chacun garde ses points déjà gagnés.
- Snapshots compacts : positions arrondies, ennemis envoyés uniquement dans le rayon de vue de chaque joueur, interpolation côté client (délai 100 ms), prédiction locale du déplacement du joueur lui-même.
- Équilibrage coop : PV et nombre d'ennemis x(1 + 0.6 x (joueurs-1)), plafond total 250 ennemis, gemmes d'XP partagées (chacun ramasse les siennes, 100 % pour celui qui les ramasse), butin de coffre pour celui qui l'ouvre, or et points d'équipe répartis.
- Level-up en coop SANS pause globale : chaque joueur voit ses 3 cartes avec un minuteur de 10 s (choix automatique à zéro), le jeu continue autour de lui, il est protégé par un bouclier pendant le choix.
- Équipe : barre de PV des coéquipiers au bord de l'écran avec flèche indiquant leur direction hors écran, couleurs de joueur distinctes.
- Réanimation : un joueur à 0 PV est au sol (30 s). Un coéquipier proche le relève en restant 3 s à portée (barre de progression), il revient à 50 % PV. Défaite si tous sont au sol en même temps.
- Boss et événements synchronisés à la seconde de partie. Une fin de partie commune avec écran de résultats d'équipe.

############################################################
# S4 Points de fin de partie et boutique cosmétique
############################################################
- Deux monnaies : Or (améliorations permanentes existantes) et Points de Cendre (cosmétiques).
- Points de Cendre gagnés en fin de partie : 2 par minute survécue + 1 par 50 kills + 40 par boss + 3 par réanimation + 30 de bonus victoire d'équipe + 10 de bonus coop si joué à plusieurs. Plafonds par minute et par partie contrôlés par le serveur pour limiter la triche (fonction SQL sécurisée qui refuse les valeurs aberrantes et la répétition du même match_id).
- Les récompenses sont créditées via une fonction RPC Supabase (security definer), jamais en écriture directe côté client.
- Boutique cosmétique (onglets) : Personnages, Skins de personnage, Revêtements d'armes (apparence des projectiles et effets : flamme verte, braise bleue, os doré...), Traînées de déplacement, Effets de mort ennemie, Cadres et titres de profil. Raretés Commune/Rare/Épique/Légendaire avec prix croissants, prévisualisation avant achat, équiper/déséquiper, loadout sauvegardé par personnage.
- Les cosmétiques n'ont AUCUN effet sur les stats. Aucun achat avec de l'argent réel.
- Rendu des skins sans fichiers : variantes par échange de palette appliquées sur les sprites générés, pré-rendues une seule fois par skin et mises en cache (aucun recalcul par frame). Chaque joueur voit les skins équipés des autres en partie.
- Un tirage "Coffre de cendre" quotidien gratuit (1 cosmétique commun/rare) et des succès qui donnent des Points de Cendre.

############################################################
# S5 Suivi des combats
############################################################
- Collecte pendant la partie (compteurs en mémoire, aucun envoi réseau pendant le jeu) : par joueur, kills, dégâts infligés, dégâts subis, soins, réanimations, morts, niveau atteint, et par arme les dégâts et kills. Courbe de dégâts d'équipe par minute.
- Écran de résultats : victoire/défaite, durée, MVP de l'équipe, tableau par joueur (kills, dégâts, réanimations, points gagnés), répartition des dégâts par arme (barres), courbe de dégâts par minute, bouton Rejouer ensemble.
- Historique : onglet "Combats" avec les 30 derniers matchs (date, résultat, durée, équipe, points), détail au tap. Statistiques à vie : parties, victoires, temps total, kills, meilleur temps, arme la plus utilisée, ratio réanimations, classement parmi les amis (kills et meilleur temps).
- Les résultats sont envoyés à Supabase une seule fois à la fin de la partie par l'hôte, avec validation côté serveur (cohérence durée/kills/dégâts, un match_id unique). Mode hors ligne : file d'attente locale renvoyée à la reconnexion.

############################################################
# S6 Phases (lis S0 + la section indiquée seulement)
############################################################
P1 : S1 comptes, profil, migration SQL, config.js depuis les variables Vercel, fusion de la sauvegarde locale.
P2 : S2 amis, présence, invitations, codes de salon.
P3 : S3 salon + coop à 2 joueurs d'abord (WebRTC + signalisation, snapshots, prédiction, réanimation, level-up sans pause), puis extension à 4.
P4 : S4 points de fin de partie, fonctions RPC sécurisées, boutique cosmétique, skins par palette, loadout.
P5 : S5 suivi des combats, écran de résultats, historique, stats, classement amis + optimisation réseau et mobile finale.

############################################################
# COMMANDE
############################################################
Applique S0. Enregistre ONLINE.md et PROGRESS.md. Fais la phase 1 uniquement (S1), donne-moi le fichier SQL et la liste exacte des variables d'environnement à créer sur Vercel, déploie une préversion et réponds en 10 lignes max.
