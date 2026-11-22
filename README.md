# DEADZONE

**[Jouer à DEADZONE](https://deadzone-nic0bdx.vercel.app/)** · [Mode diagnostic](https://deadzone-nic0bdx.vercel.app/?debug=1)

Survivor-like zombie en pixel art, pensé pour téléphone. Survis aux vagues, ramasse de l’XP, combine armes et passifs, puis affronte les boss. Le solo fonctionne en invité, avec une sauvegarde locale.

## Jouer

| Action | Téléphone | Ordinateur |
| --- | --- | --- |
| Se déplacer | Joystick flottant dans la moitié basse de l’écran | Flèches, ZQSD ou WASD |
| Attaquer | Automatique | Automatique |
| Choisir une amélioration | Toucher une carte | Cliquer sur une carte |
| Mettre en pause | Bouton en haut de l’écran | Même bouton |

- **Solo** — parties de survie, armes évolutives, boss et événement Marée des Braises.
- **Progression** — personnages à débloquer, améliorations permanentes, arsenal et collection.
- **En ligne** — compte invité ou sécurisé par e-mail, amis, salons et coop de 2 à 4, cosmétiques et historique. Ces fonctions nécessitent Supabase configuré.
- **PWA** — ajout possible à l’écran d’accueil et jeu solo hors ligne après le premier chargement.

La version publique peut être en avance sur la branche `main`.

## Lancer en local

À la racine du dépôt, lance un serveur HTTP statique, par exemple avec Python 3.

```sh
python -m http.server 8000
```

Ouvre `http://localhost:8000/`. Le solo fonctionne sans configuration serveur ni installation de dépendances. Pour tester `api/config.js` et les fonctionnalités en ligne, utilise un déploiement Vercel configuré.

## Configurer Supabase sur Vercel

1. Applique les [migrations SQL](supabase/) dans l’ordre suivant : `migration.sql`, puis `online-p2.sql` à `online-p5.sql`.
2. Active la connexion anonyme et la liaison de compte dans Supabase, puis autorise les URL de redirection de l’application.
3. Ajoute ces variables à l’environnement Vercel cible et redéploie.

| Variable | Valeur |
| --- | --- |
| `SUPABASE_URL` | URL HTTPS du projet Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Clé publique `sb_publishable_…` |

La fonction `api/config.js` expose uniquement la configuration publique.

## Repères dans le dépôt

- `game.js`, `weapons.js`, `enemies.js` et `waves.js` pour la simulation Canvas 2D.
- `data/` pour les armes, les personnages, les améliorations et l’équilibrage.
- `online.js`, `coop-net.js` et `coop-world.js` pour le compte et le multijoueur.
- `manifest.webmanifest` et `sw.js` pour l’installation et le mode hors ligne.
