-- Knot · migration « Partie 3 » (minuteur des cartes chronométrées, brouillons, annulation).
-- À coller UNE fois dans Supabase → SQL Editor → Run. Rien n'est recréé ni effacé : la table des réponses garde
-- toutes vos réponses, elle reçoit seulement 3 colonnes (statut, debut, fin) ; les fonctions sont remplacées.
-- On peut le relancer sans risque (par exemple après avoir activé pg_cron).
-- Ce bloc est la copie de la section « Étape 6 » de schema.sql (qui décrit l'état final de la base).

-- ───────────── Étape 6 : répondre chacun de son côté ─────────────

-- Chacun écrit sa réponse à la carte affichée ; on ne voit celle de l'autre qu'une fois qu'on a répondu tous les deux.
-- Les textes ne sont PAS dans la partie (que les deux téléphones lisent en entier) : ils sont dans cette table,
-- que personne ne peut lire directement (aucun droit, aucune règle RLS). Seules les fonctions ci-dessous y touchent.
-- « fois » : une sortie de la carte (l'heure du tirage, ou le début du paquet). Une carte qui ressort après un remélange
-- repart avec des réponses vides ; les anciennes restent (pour un futur historique), jusqu'à ce que le couple les efface.
create table if not exists public.reponses (
  couple_id uuid not null references public.couples(id) on delete cascade,
  carte text not null check (char_length(carte) between 1 and 80),
  fois text not null check (char_length(fois) between 1 and 40),
  place smallint not null check (place in (1, 2)),
  texte text not null,
  ecrite_le timestamptz not null default now(),
  primary key (couple_id, carte, fois, place)
);
alter table public.reponses enable row level security;

-- Partie 3 : minuteur des cartes chronométrées. Ces lignes ne recréent rien : elles ajoutent ce qui manque.
--   statut : 'brouillon' (en train d'écrire, jamais montré à l'autre), 'envoyee' (la réponse),
--            'rendue' (réponse d'une carte annulée, rendue à son auteur, visible de lui seul).
--   debut / fin : heure du tap sur « Répondre » et heure limite (rien pour une carte sans minuteur).
--   texte : 0 à 1000 caractères pour un brouillon ; 1 à 1000 pour une réponse envoyée ou rendue.
alter table public.reponses add column if not exists statut text not null default 'envoyee';
alter table public.reponses add column if not exists debut timestamptz;
alter table public.reponses add column if not exists fin timestamptz;
alter table public.reponses drop constraint if exists reponses_texte_check;
alter table public.reponses drop constraint if exists reponses_statut_check;
alter table public.reponses add constraint reponses_statut_check check (statut in ('brouillon', 'envoyee', 'rendue'));
alter table public.reponses drop constraint if exists reponses_texte_statut_check;
alter table public.reponses add constraint reponses_texte_statut_check check (
  case when statut = 'brouillon' then char_length(texte) <= 1000 else char_length(texte) between 1 and 1000 end);
-- Pour retrouver vite les brouillons dont le temps est écoulé (tâche de chaque minute)
create index if not exists reponses_brouillons_idx on public.reponses (fin) where statut = 'brouillon';

-- Où en sont les réponses de cette carte, vu de MON téléphone :
-- {"places": [1, 2] (qui a envoyé), "moi": ma réponse envoyée ou null, "autre": sa réponse, seulement si les deux ont envoyé,
--  "moi_le" / "autre_le": l'heure de chaque réponse (même règle),
--  "mon_brouillon": mon texte en cours ou null, "fin": mon heure limite (ms) ou null, "maintenant": l'heure de la base (ms),
--  "rendue": mon texte rendu la dernière fois que cette carte a été annulée (pour pré-remplir), ou null}.
-- Avant de répondre, elle termine ce dont le temps est écoulé (voir finaliser).
create or replace function public.lire_reponses(la_carte text, la_fois text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
  ma smallint := public.ma_place();
  places jsonb;
  mienne public.reponses;
  sienne public.reponses;
  rendue text;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  perform public.finaliser(le_couple, la_carte, la_fois);
  select coalesce(jsonb_agg(r.place order by r.place), '[]'::jsonb) into places
    from public.reponses r
    where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.statut = 'envoyee';
  select * into mienne from public.reponses r
    where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.place = ma;
  if mienne.statut = 'envoyee' then
    select * into sienne from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.place <> ma and r.statut = 'envoyee';
  end if;
  if mienne.statut is null or mienne.statut = 'rendue' then
    select r.texte into rendue from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.place = ma and r.statut = 'rendue'
      order by r.ecrite_le desc limit 1;
  end if;
  return jsonb_build_object(
    'places', places,
    'moi', case when mienne.statut = 'envoyee' then mienne.texte end,
    'autre', sienne.texte,
    'moi_le', case when mienne.statut = 'envoyee' then mienne.ecrite_le end,
    'autre_le', sienne.ecrite_le,
    'mon_brouillon', case when mienne.statut = 'brouillon' then mienne.texte end,
    'fin', floor(extract(epoch from mienne.fin) * 1000),
    'maintenant', floor(extract(epoch from clock_timestamp()) * 1000),
    'rendue', rendue);
end $$;

-- Prévient l'autre téléphone (outil interne) : un simple repère dans la partie, sans aucun texte.
-- Changer la partie déclenche le temps réel déjà en place ; l'autre téléphone relit alors lire_reponses().
create or replace function public.signaler_reponses(le_couple uuid, la_carte text, la_fois text) returns void
language sql volatile security definer set search_path = '' as $$
  update public.parties set
    etat = jsonb_set(etat, '{reponses}', jsonb_build_object('carte', la_carte, 'fois', la_fois,
      'n', coalesce((etat->'reponses'->>'n')::bigint, 0) + 1)),
    version = version + 1, modifiee_le = now()
  where couple_id = le_couple
$$;

-- Annuler les réponses d'une carte (outil interne). Même règle pour les deux personnes :
-- une ligne avec du texte (envoyée ou brouillon) devient « rendue » (gardée, visible de son seul auteur) ;
-- une ligne sans texte est effacée. Une seule réponse rendue par personne et par carte : la plus récente gagne.
-- Action ou Vérité : la carte retourne dans la pile (comme « Passer »). « Pour plus tard » : elle reste à sa place.
-- La partie reçoit un repère sans texte, etat.annulee = {carte, fois, n, vu}, effacé quand les deux l'ont vu (annulee_vue).
-- Renvoie false s'il n'y avait rien à annuler (personne n'avait commencé : pas de mention).
create or replace function public.annuler_interne(le_couple uuid, la_carte text, la_fois text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  e jsonb;
begin
  if not exists (select 1 from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.statut <> 'rendue') then
    return false;
  end if;
  delete from public.reponses r
    where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois
      and r.statut <> 'rendue' and char_length(btrim(r.texte)) = 0;
  delete from public.reponses r
    where r.couple_id = le_couple and r.carte = la_carte and r.statut = 'rendue'
      and r.place in (select x.place from public.reponses x
                      where x.couple_id = le_couple and x.carte = la_carte and x.fois = la_fois and x.statut <> 'rendue');
  update public.reponses r set statut = 'rendue', texte = btrim(r.texte), debut = null, fin = null, ecrite_le = now()
    where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.statut <> 'rendue';

  select etat into e from public.parties where couple_id = le_couple for update;
  if e is null then return true; end if;
  -- Seulement si c'est bien cette sortie de la carte (pas une carte retirée puis tirée à nouveau)
  if la_carte not like 'paquet:%' and e->'tirees'->la_carte->>'at' = la_fois then
    e := e #- array['tirees', la_carte];
    if e->>'affichee' = la_carte then e := jsonb_set(e, '{affichee}', 'null'::jsonb) #- '{minuteur}'; end if;
    if e->>'defi' = la_carte then e := e #- '{defi}'; end if;
  end if;
  e := jsonb_set(e, '{annulee}', jsonb_build_object('carte', la_carte, 'fois', la_fois,
    'n', floor(extract(epoch from clock_timestamp()) * 1000), 'vu', '[]'::jsonb));
  update public.parties set etat = e, version = version + 1, modifiee_le = now() where couple_id = le_couple;
  return true;
end $$;

-- Termine ce dont le temps est écoulé (outil interne) : un brouillon dont l'heure limite est passée est envoyé
-- tel qu'il a été sauvé, même coupé en pleine phrase ; s'il est vide, la carte est annulée.
-- Appelée par lire_reponses(), repondre(), commencer_reponse(), et chaque minute par finaliser_tout() (app fermée).
create or replace function public.finaliser(le_couple uuid, la_carte text, la_fois text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  b public.reponses;
  envoi boolean := false;
begin
  for b in select * from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois
        and r.statut = 'brouillon' and r.fin is not null and r.fin <= now()
      order by r.place for update loop
    if char_length(btrim(b.texte)) = 0 then
      perform public.annuler_interne(le_couple, la_carte, la_fois);
      return;
    end if;
    update public.reponses r set statut = 'envoyee', texte = btrim(b.texte), ecrite_le = b.fin
      where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.place = b.place;
    -- Une réponse envoyée : l'ancienne réponse rendue de cette personne pour cette carte ne sert plus
    delete from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.place = b.place and r.fois <> la_fois and r.statut = 'rendue';
    envoi := true;
  end loop;
  if envoi then perform public.signaler_reponses(le_couple, la_carte, la_fois); end if;
end $$;

-- Toutes les minutes (tâche pg_cron « knot-finaliser-reponses ») : termine les brouillons dont le temps est écoulé,
-- même si les deux apps sont fermées.
create or replace function public.finaliser_tout() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  x record;
  n integer := 0;
begin
  for x in select distinct r.couple_id, r.carte, r.fois from public.reponses r
      where r.statut = 'brouillon' and r.fin is not null and r.fin <= now() loop
    perform public.finaliser(x.couple_id, x.carte, x.fois);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Écrire (ou corriger) ma réponse. Une fois que les deux ont répondu, on ne la change plus.
-- Carte chronométrée : après l'heure limite (+ 5 s pour le réseau), c'est le brouillon sauvé qui compte ;
-- le texte envoyé trop tard est ignoré et on renvoie simplement où en sont les réponses.
create or replace function public.repondre(la_carte text, la_fois text, mon_texte text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
  ma smallint := public.ma_place();
  t text := btrim(coalesce(mon_texte, ''));
  mienne public.reponses;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  if char_length(t) not between 1 and 1000 or coalesce(char_length(la_carte), 0) not between 1 and 80
     or coalesce(char_length(la_fois), 0) not between 1 and 40 then
    raise exception 'reponse_invalide';
  end if;
  perform public.finaliser(le_couple, la_carte, la_fois);
  if (select count(*) from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.statut = 'envoyee') >= 2 then
    raise exception 'deja_revele';
  end if;
  select * into mienne from public.reponses r
    where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.place = ma;
  if mienne.fin is not null and now() > mienne.fin + interval '5 seconds' then
    return public.lire_reponses(la_carte, la_fois);
  end if;
  insert into public.reponses (couple_id, carte, fois, place, texte, statut) values (le_couple, la_carte, la_fois, ma, t, 'envoyee')
    on conflict (couple_id, carte, fois, place) do update set texte = excluded.texte, statut = 'envoyee', ecrite_le = now();
  delete from public.reponses r
    where r.couple_id = le_couple and r.carte = la_carte and r.place = ma and r.fois <> la_fois and r.statut = 'rendue';
  perform public.signaler_reponses(le_couple, la_carte, la_fois);
  return public.lire_reponses(la_carte, la_fois);
end $$;

-- Tap sur « Répondre » d'une carte chronométrée : mon minuteur démarre (heure de la base) et un brouillon est créé,
-- pré-rempli avec ma dernière réponse rendue pour cette carte s'il y en a une. Rappelée : ne relance pas le minuteur.
create or replace function public.commencer_reponse(la_carte text, la_fois text, secondes integer) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
  ma smallint := public.ma_place();
  mienne public.reponses;
  depart text;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  if coalesce(secondes, 0) not between 5 and 3600 or coalesce(char_length(la_carte), 0) not between 1 and 80
     or coalesce(char_length(la_fois), 0) not between 1 and 40 then
    raise exception 'reponse_invalide';
  end if;
  perform public.finaliser(le_couple, la_carte, la_fois);
  if (select count(*) from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.statut = 'envoyee') >= 2 then
    raise exception 'deja_revele';
  end if;
  select * into mienne from public.reponses r
    where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.place = ma;
  if mienne.statut is null or mienne.statut = 'rendue' then
    select r.texte into depart from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.place = ma and r.statut = 'rendue'
      order by r.ecrite_le desc limit 1;
    insert into public.reponses (couple_id, carte, fois, place, texte, statut, debut, fin, ecrite_le)
      values (le_couple, la_carte, la_fois, ma, coalesce(depart, ''), 'brouillon', now(), now() + make_interval(secs => secondes), now())
      on conflict (couple_id, carte, fois, place) do update set
        texte = excluded.texte, statut = 'brouillon', debut = excluded.debut, fin = excluded.fin, ecrite_le = excluded.ecrite_le;
  end if;
  return public.lire_reponses(la_carte, la_fois);
end $$;

-- Sauver mon brouillon (toutes les 2 à 3 secondes, et quand l'app passe en arrière-plan).
-- Après l'heure limite (+ 5 s), rien n'est changé : le brouillon déjà sauvé est envoyé (ou la carte annulée s'il est vide).
-- Renvoie {"fin": …, "maintenant": …} (ms), ou {"termine": true} si le temps était écoulé.
create or replace function public.sauver_brouillon(la_carte text, la_fois text, mon_texte text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
  ma smallint := public.ma_place();
  mienne public.reponses;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  select * into mienne from public.reponses r
    where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.place = ma for update;
  if mienne.statut is distinct from 'brouillon' then raise exception 'pas_de_brouillon'; end if;
  if mienne.fin is not null and now() > mienne.fin + interval '5 seconds' then
    perform public.finaliser(le_couple, la_carte, la_fois);
    return jsonb_build_object('termine', true);
  end if;
  update public.reponses r set texte = left(coalesce(mon_texte, ''), 1000)
    where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.place = ma;
  return jsonb_build_object('fin', floor(extract(epoch from mienne.fin) * 1000),
    'maintenant', floor(extract(epoch from clock_timestamp()) * 1000));
end $$;

-- « Passer cette carte » quand l'un de nous a commencé à répondre : même résultat qu'une annulation (voir annuler_interne).
create or replace function public.annuler_carte(la_carte text, la_fois text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  if coalesce(char_length(la_carte), 0) not between 1 and 80 or coalesce(char_length(la_fois), 0) not between 1 and 40 then
    raise exception 'reponse_invalide';
  end if;
  perform public.annuler_interne(le_couple, la_carte, la_fois);
  return public.lire_reponses(la_carte, la_fois);
end $$;

-- J'ai vu la mention « Cette carte a été annulée » (repère n) : ma place s'ajoute à etat.annulee.vu ;
-- quand les deux l'ont vue, le repère est effacé. Un repère plus récent (autre n) n'est pas touché.
create or replace function public.annulee_vue(le_n bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
  ma smallint := public.ma_place();
  e jsonb;
  vu jsonb;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  select etat into e from public.parties where couple_id = le_couple for update;
  if e is null or (e->'annulee'->>'n')::bigint is distinct from le_n then return; end if;
  vu := coalesce(e->'annulee'->'vu', '[]'::jsonb);
  if not vu @> jsonb_build_array(ma) then vu := vu || jsonb_build_array(ma); end if;
  if vu @> '[1, 2]'::jsonb then e := e #- '{annulee}';
  else e := jsonb_set(e, '{annulee,vu}', vu);
  end if;
  update public.parties set etat = e, version = version + 1, modifiee_le = now() where couple_id = le_couple;
end $$;

-- Effacer les réponses de cette carte (les deux), chez les deux.
create or replace function public.effacer_reponses(la_carte text, la_fois text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  delete from public.reponses r where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois;
  perform public.signaler_reponses(le_couple, la_carte, la_fois);
  return public.lire_reponses(la_carte, la_fois);
end $$;

-- « La dernière fois » : une fois qu'on a répondu tous les deux à cette carte, ce qu'on avait répondu
-- les fois précédentes où elle était sortie (seulement celles où les deux avaient envoyé), la plus récente d'abord :
-- [{"date": …, "moi": …, "autre": …}]. Avant d'avoir répondu tous les deux : [] (pour ne pas s'influencer).
-- Les brouillons et les réponses rendues n'y sont jamais.
create or replace function public.anciennes_reponses(la_carte text, la_fois text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
  ma smallint := public.ma_place();
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  if (select count(*) from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.statut = 'envoyee') < 2 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('date', f.date, 'moi', f.moi, 'autre', f.autre) order by f.date desc)
    from (
      select max(r.ecrite_le) as date,
             max(r.texte) filter (where r.place = ma) as moi,
             max(r.texte) filter (where r.place <> ma) as autre
      from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.fois <> la_fois and r.statut = 'envoyee'
      group by r.fois
      having count(*) = 2
    ) f
  ), '[]'::jsonb);
end $$;

revoke all on public.reponses from anon, authenticated;
-- Outils internes : personne ne les appelle depuis un téléphone
revoke all on function public.signaler_reponses(uuid, text, text), public.annuler_interne(uuid, text, text),
  public.finaliser(uuid, text, text), public.finaliser_tout() from public, anon, authenticated;
revoke all on function public.lire_reponses(text, text), public.repondre(text, text, text),
  public.effacer_reponses(text, text), public.anciennes_reponses(text, text),
  public.commencer_reponse(text, text, integer), public.sauver_brouillon(text, text, text),
  public.annuler_carte(text, text), public.annulee_vue(bigint) from public, anon;
grant execute on function public.lire_reponses(text, text), public.repondre(text, text, text),
  public.effacer_reponses(text, text), public.anciennes_reponses(text, text),
  public.commencer_reponse(text, text, integer), public.sauver_brouillon(text, text, text),
  public.annuler_carte(text, text), public.annulee_vue(bigint) to authenticated;

-- Tâche de chaque minute (pg_cron) : à activer d'abord dans Supabase → Database → Extensions → pg_cron.
-- Sans l'extension, rien ne casse : les brouillons sont terminés à la prochaine ouverture de l'app.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('knot-finaliser-reponses', '* * * * *', 'select public.finaliser_tout()');
  else
    raise notice 'pg_cron n''est pas activé : active-le (Database → Extensions), puis relance ce bloc.';
  end if;
end $$;
