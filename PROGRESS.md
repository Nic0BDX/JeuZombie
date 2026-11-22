# Progression
- ONLINE P2 : amis, demandes, blocages, présence privée, invitations et salons partageables.
- Fichiers clés : social.js, social-ui.js, online.js et supabase/online-p2.sql.
- Appliquer migration.sql puis online-p2.sql. Vercel utilise toujours SUPABASE_URL et SUPABASE_PUBLISHABLE_KEY.
- Limites SQL : 100 amis, 20 demandes en attente, 5 secondes entre invitations par ami, 4 joueurs par salon.
- Salon d’attente uniquement. Coop et simulation partagée en P3.
- Realtime, RLS et scénarios à deux téléphones restent à vérifier sur Supabase configuré.
