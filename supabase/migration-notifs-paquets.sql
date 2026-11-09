-- Knot · notifications des paquets « Pour plus tard ».
-- À coller une fois dans Supabase → SQL Editor → Run.
-- La table notifs_envoyees retient l'heure du dernier tirage notifié. Les paquets ont leur propre ligne
-- (« tirage-paquet », délai de 2 minutes), séparée de celle d'Action ou Vérité (« tirage », 30 secondes).
alter table public.notifs_envoyees drop constraint if exists notifs_envoyees_type_check;
alter table public.notifs_envoyees add constraint notifs_envoyees_type_check
  check (type in ('reponse', 'tirage', 'tirage-paquet'));
