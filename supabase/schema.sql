-- Knot · étapes 3, 4 et 5 : le couple, la partie partagée et les cartes ajoutées.
-- À coller dans Supabase → SQL Editor → Run. Peut être relancé sans danger (rien n'est effacé).
--
-- Principe de sécurité :
--   • Chaque téléphone a un compte invisible (connexion anonyme). auth.uid() = l'identifiant de ce compte.
--   • RLS (Row Level Security) : à chaque lecture, la base ne renvoie que les lignes du couple de la personne.
--   • Aucune écriture directe n'est permise (pas de règle « insert / update / delete ») :
--     tout passe par les fonctions du fichier (creer_couple, apercu_code, utiliser_code, code_relier, jouer),
--     qui vérifient chaque cas.

create extension if not exists pgcrypto with schema extensions;

-- ───────────── Tables ─────────────

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- code pour que l'autre rejoigne, ex. KNOT-BV-7K3Q
  prenom_1 text not null check (char_length(prenom_1) between 1 and 30),  -- personne qui a créé le couple
  prenom_2 text not null check (char_length(prenom_2) between 1 and 30),  -- l'autre personne
  cree_le timestamptz not null default now()
);

create table if not exists public.membres (
  user_id uuid primary key references auth.users(id) on delete cascade,   -- un compte = un seul couple
  couple_id uuid not null references public.couples(id) on delete cascade,
  place smallint not null check (place in (1, 2)),
  rejoint_le timestamptz not null default now(),
  unique (couple_id, place)                  -- une place = un seul téléphone : jamais plus de 2 par couple
);

create table if not exists public.codes_relier (
  code text primary key,
  couple_id uuid not null references public.couples(id) on delete cascade,
  place smallint not null check (place in (1, 2)),   -- la place que le nouveau téléphone reprendra
  cree_par uuid not null references auth.users(id) on delete cascade,
  cree_le timestamptz not null default now(),
  utilise_le timestamptz                     -- vide tant que le code n'a pas servi
);
-- Au plus un code non utilisé par place
create unique index if not exists codes_relier_un_seul_en_attente
  on public.codes_relier (couple_id, place) where utilise_le is null;

create table if not exists public.essais_codes (   -- codes faux tapés, pour bloquer qui essaie au hasard
  user_id uuid not null references auth.users(id) on delete cascade,
  essaye_le timestamptz not null default now()
);
create index if not exists essais_codes_par_compte on public.essais_codes (user_id, essaye_le);

-- Étape 4 : la partie du couple, une ligne par couple. « etat » contient tout le jeu partagé (cartes tirées,
-- carte affichée, défi en cours, interrupteurs, cartes ajoutées, paquets « Pour plus tard », minuteur).
-- « version » augmente à chaque changement : un téléphone sait ainsi si ce qu'il reçoit est plus récent que ce qu'il a.
create table if not exists public.parties (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  etat jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  modifiee_le timestamptz not null default now()
);

-- ───────────── Règles de sécurité (RLS) ─────────────

-- Le couple de la personne connectée (ou rien). « security definer » : la fonction lit la table membres
-- sans passer par ses propres règles, sinon la règle de membres s'appellerait elle-même sans fin.
create or replace function public.mon_couple_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select couple_id from public.membres where user_id = auth.uid()
$$;

-- Ma place dans le couple (1 = la personne qui l'a créé, 2 = l'autre), ou rien. Sert à savoir à qui est une carte ajoutée.
create or replace function public.ma_place() returns smallint
language sql stable security definer set search_path = '' as $$
  select place from public.membres where user_id = auth.uid()
$$;

alter table public.couples enable row level security;
alter table public.membres enable row level security;
alter table public.codes_relier enable row level security;
alter table public.essais_codes enable row level security;   -- aucune règle : personne ne la lit
alter table public.parties enable row level security;

drop policy if exists "voir la partie de mon couple" on public.parties;
create policy "voir la partie de mon couple" on public.parties
  for select to authenticated using (couple_id = public.mon_couple_id());

drop policy if exists "voir mon couple" on public.couples;
create policy "voir mon couple" on public.couples
  for select to authenticated using (id = public.mon_couple_id());

drop policy if exists "voir les membres de mon couple" on public.membres;
create policy "voir les membres de mon couple" on public.membres
  for select to authenticated using (couple_id = public.mon_couple_id());

drop policy if exists "voir mes codes relier" on public.codes_relier;
create policy "voir mes codes relier" on public.codes_relier
  for select to authenticated using (couple_id = public.mon_couple_id() and cree_par = auth.uid());

-- ───────────── Petits outils (internes) ─────────────

-- Première lettre d'un prénom, sans accent, en majuscule (« Élodie » → E). X si ce n'est pas une lettre.
create or replace function public.initiale(p text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(regexp_replace(upper(translate(left(btrim(p), 1),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŸ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUYY')), '[^A-Z]', '', 'g'), ''), 'X')
$$;

-- Prénom propre : espaces en trop retirés, entre 1 et 30 caractères.
create or replace function public.prenom_propre(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare r text := regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g');
begin
  if char_length(r) < 1 or char_length(r) > 30 then raise exception 'prenom_invalide'; end if;
  return r;
end $$;

-- Code tapé → forme officielle. Accepte minuscules, espaces, tirets oubliés : « knot vb 7k3q » → KNOT-VB-7K3Q.
create or replace function public.code_propre(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare r text := regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g');
begin
  if left(r, 4) = 'KNOT' then r := substr(r, 5); end if;
  if char_length(r) <> 6 then return null; end if;
  -- Dans les initiales, un 0 tapé à la place d'un O (ou 1 pour I) est corrigé
  return 'KNOT-' || translate(left(r, 2), '01', 'OI') || '-' || right(r, 4);
end $$;

-- Nouveau code jamais utilisé. Les 4 caractères viennent d'un tirage cryptographique (impossible à prévoir),
-- dans un alphabet sans 0, O, 1, I. 256 est un multiple de 32 : chaque caractère a la même chance de sortir.
create or replace function public.nouveau_code(p1 text, p2 text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  octets bytea;
  suite text;
  candidat text;
begin
  loop
    octets := extensions.gen_random_bytes(4);
    suite := '';
    for i in 0..3 loop
      suite := suite || substr(alphabet, get_byte(octets, i) % 32 + 1, 1);
    end loop;
    candidat := 'KNOT-' || public.initiale(p1) || public.initiale(p2) || '-' || suite;
    if not exists (select 1 from public.couples where code = candidat)
       and not exists (select 1 from public.codes_relier where code = candidat) then
      return candidat;
    end if;
  end loop;
end $$;

-- Plus de 10 codes faux dans l'heure → bloqué pour l'heure.
create or replace function public.trop_d_essais() returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) >= 10 from public.essais_codes
  where user_id = auth.uid() and essaye_le > now() - interval '1 hour'
$$;

-- ───────────── Les 4 fonctions appelées par l'app ─────────────

-- 1. Créer le couple. Renvoie le code à donner à l'autre.
create or replace function public.creer_couple(mon_prenom text, autre_prenom text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  p1 text := public.prenom_propre(mon_prenom);
  p2 text := public.prenom_propre(autre_prenom);
  nouveau public.couples;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if public.mon_couple_id() is not null then raise exception 'deja_en_couple'; end if;
  insert into public.couples (code, prenom_1, prenom_2)
    values (public.nouveau_code(p1, p2), p1, p2) returning * into nouveau;
  insert into public.membres (user_id, couple_id, place) values (auth.uid(), nouveau.id, 1);
  insert into public.parties (couple_id, etat) values (nouveau.id, public.etat_vide());
  return nouveau.code;
end $$;

-- 2. Regarder un code sans l'utiliser : quel prénom est attendu ?
--    Renvoie {"type": "couple" | "relier", "prenom": …} ou {"erreur": …}.
--    Les erreurs sont renvoyées (pas « levées ») pour que l'essai raté reste bien enregistré.
create or replace function public.apercu_code(code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c text := public.code_propre(code);
  cp public.couples;
  r public.codes_relier;
  place_libre smallint;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if public.mon_couple_id() is not null then return jsonb_build_object('erreur', 'deja_en_couple'); end if;
  if public.trop_d_essais() then return jsonb_build_object('erreur', 'trop_d_essais'); end if;

  select * into cp from public.couples where couples.code = c;
  if found then
    select p into place_libre from unnest(array[1, 2]::smallint[]) p
      where not exists (select 1 from public.membres m where m.couple_id = cp.id and m.place = p)
      order by p limit 1;
    if place_libre is null then
      insert into public.essais_codes (user_id) values (auth.uid());
      return jsonb_build_object('erreur', 'complet');
    end if;
    return jsonb_build_object('type', 'couple',
      'prenom', case place_libre when 1 then cp.prenom_1 else cp.prenom_2 end);
  end if;

  select * into r from public.codes_relier where codes_relier.code = c and utilise_le is null;
  if found then
    select * into cp from public.couples where id = r.couple_id;
    return jsonb_build_object('type', 'relier',
      'prenom', case r.place when 1 then cp.prenom_1 else cp.prenom_2 end);
  end if;

  insert into public.essais_codes (user_id) values (auth.uid());
  return jsonb_build_object('erreur', 'code_inconnu');
end $$;

-- 3. Utiliser un code. « prenom » vide = on garde le prénom prévu ; sinon il le remplace.
--    Renvoie {"ok": true} ou {"erreur": …}.
create or replace function public.utiliser_code(code text, prenom text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c text := public.code_propre(code);
  nouveau_prenom text := case when nullif(btrim(coalesce(prenom, '')), '') is null then null
                              else public.prenom_propre(prenom) end;
  cp public.couples;
  le_couple uuid;
  la_place smallint;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if public.mon_couple_id() is not null then return jsonb_build_object('erreur', 'deja_en_couple'); end if;
  if public.trop_d_essais() then return jsonb_build_object('erreur', 'trop_d_essais'); end if;

  -- Code du couple : on prend la place libre. « for update » : si deux téléphones arrivent
  -- en même temps, le second attend le premier, puis trouve le couple complet.
  select * into cp from public.couples where couples.code = c for update;
  if found then
    select p into la_place from unnest(array[1, 2]::smallint[]) p
      where not exists (select 1 from public.membres m where m.couple_id = cp.id and m.place = p)
      order by p limit 1;
    if la_place is null then
      insert into public.essais_codes (user_id) values (auth.uid());
      return jsonb_build_object('erreur', 'complet');
    end if;
    insert into public.membres (user_id, couple_id, place) values (auth.uid(), cp.id, la_place);
    le_couple := cp.id;
  else
    -- Code « relier » : marqué utilisé en une seule opération, seulement s'il ne l'était pas encore.
    -- Deux téléphones ne peuvent donc jamais s'en servir tous les deux.
    update public.codes_relier set utilise_le = now()
      where codes_relier.code = c and utilise_le is null
      returning couple_id, place into le_couple, la_place;
    if not found then
      insert into public.essais_codes (user_id) values (auth.uid());
      return jsonb_build_object('erreur', 'code_inconnu');
    end if;
    -- Le nouveau téléphone prend la place ; l'ancien n'a plus de couple (il reviendra à l'accueil).
    delete from public.membres where couple_id = le_couple and place = la_place;
    insert into public.membres (user_id, couple_id, place) values (auth.uid(), le_couple, la_place);
  end if;

  if nouveau_prenom is not null then
    update public.couples set
      prenom_1 = case when la_place = 1 then nouveau_prenom else prenom_1 end,
      prenom_2 = case when la_place = 2 then nouveau_prenom else prenom_2 end
    where id = le_couple;
  end if;
  -- La partie change de version : l'autre téléphone, s'il est ouvert, est prévenu en direct que le couple est au complet.
  update public.parties set version = version + 1, modifiee_le = now() where couple_id = le_couple;
  return jsonb_build_object('ok', true);
end $$;

-- 4. Code pour relier le nouveau téléphone de l'AUTRE (jamais pour sa propre place).
--    Tant qu'il n'a pas servi, c'est toujours le même code. Seulement si le couple est complet.
create or replace function public.code_relier() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  moi public.membres;
  cp public.couples;
  autre_place smallint;
  existant text;
  nouveau text;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  select * into moi from public.membres where user_id = auth.uid();
  if not found then raise exception 'pas_de_couple'; end if;
  autre_place := 3 - moi.place;
  if not exists (select 1 from public.membres where couple_id = moi.couple_id and place = autre_place) then
    raise exception 'couple_incomplet';
  end if;

  select code into existant from public.codes_relier
    where couple_id = moi.couple_id and place = autre_place and utilise_le is null;
  if found then
    -- Le code en attente devient « le mien » (si c'est l'autre qui l'avait créé, je peux maintenant le voir)
    update public.codes_relier set cree_par = auth.uid() where code = existant;
    return existant;
  end if;

  select * into cp from public.couples where id = moi.couple_id;
  nouveau := public.nouveau_code(cp.prenom_1, cp.prenom_2);
  insert into public.codes_relier (code, couple_id, place, cree_par)
    values (nouveau, moi.couple_id, autre_place, auth.uid());
  return nouveau;
end $$;

-- ───────────── Étape 4 : la partie partagée ─────────────

-- Partie neuve : rien de tiré, « À distance » activé.
create or replace function public.etat_vide() returns jsonb
language sql immutable set search_path = '' as $$
  select '{"tirees": {}, "perso": {}, "paquets": {}, "distance": true}'::jsonb
$$;

-- Les couples créés avant l'étape 4 reçoivent leur partie.
insert into public.parties (couple_id, etat) select id, public.etat_vide() from public.couples on conflict do nothing;

-- Étape 5 : les cartes ajoutées avant cette étape n'ont pas d'auteur noté. Elles vont à la personne 1.
update public.parties p set
  etat = jsonb_set(p.etat, '{perso}', (
    select jsonb_object_agg(k, case when jsonb_typeof(v) = 'object' and not v ? 'place' then v || '{"place": 1}'::jsonb else v end)
    from jsonb_each(p.etat->'perso') as t(k, v))),
  version = p.version + 1, modifiee_le = now()
where jsonb_typeof(p.etat->'perso') = 'object'
  and exists (select 1 from jsonb_each(p.etat->'perso') as t(k, v) where jsonb_typeof(v) = 'object' and not v ? 'place');

-- 5. Jouer : applique une liste de petits ordres à la partie de MON couple, puis renvoie
--    {"etat": …, "version": …, "maintenant": heure du serveur en millisecondes}.
--    Un ordre : {"set": ["tirees", "v12"], "valeur": {…}} (écrire) ou {"suppr": ["tirees", "v12"]} (effacer).
--    Seules quelques clés sont permises :
--      • tirees, perso, paquets : des listes « identifiant → valeur », chemin de 2 éléments ;
--      • affichee, defi, distance, minuteur : une seule valeur, chemin de 1 élément.
--    Une liste vide ne change rien : elle sert à lire la partie et l'heure du serveur.
--    Étape 5 : une carte ajoutée (perso) porte la place de son auteur, écrite ici par la base (jamais celle
--    envoyée par le téléphone). Un ordre qui modifie ou efface la carte de l'autre est ignoré, sans bloquer les autres.
create or replace function public.jouer(ordres jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
  ma smallint := public.ma_place();
  existante jsonb;
  e jsonb;
  v bigint;
  o jsonb;
  chemin text[];
  cle text;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  if jsonb_typeof(ordres) is distinct from 'array' or jsonb_array_length(ordres) > 300 then
    raise exception 'ordres_invalides';
  end if;

  insert into public.parties (couple_id, etat) values (le_couple, public.etat_vide()) on conflict do nothing;
  -- « for update » : si les deux téléphones jouent au même instant, le second attend le premier
  select etat, version into e, v from public.parties where couple_id = le_couple for update;

  if jsonb_array_length(ordres) > 0 then
    for o in select * from jsonb_array_elements(ordres) loop
      if jsonb_typeof(o->'set') = 'array' then
        chemin := array(select jsonb_array_elements_text(o->'set'));
      elsif jsonb_typeof(o->'suppr') = 'array' then
        chemin := array(select jsonb_array_elements_text(o->'suppr'));
      else
        raise exception 'ordres_invalides';
      end if;
      cle := chemin[1];
      if cle in ('tirees', 'perso', 'paquets') then
        if cardinality(chemin) <> 2 or coalesce(char_length(chemin[2]), 0) not between 1 and 80 then
          raise exception 'ordres_invalides';
        end if;
        if jsonb_typeof(e->cle) is distinct from 'object' then e := jsonb_set(e, array[cle], '{}'::jsonb); end if;
      elsif cle in ('affichee', 'defi', 'distance', 'minuteur') then
        if cardinality(chemin) <> 1 then raise exception 'ordres_invalides'; end if;
      else
        raise exception 'ordres_invalides';
      end if;
      if cle = 'perso' then
        -- Seul l'auteur touche à sa carte (une carte sans place, d'avant l'étape 5, est à la personne 1)
        existante := e->'perso'->chemin[2];
        if jsonb_typeof(existante) = 'object' and coalesce(existante->>'place', '1') <> ma::text then
          continue;
        end if;
        if o ? 'set' then
          if jsonb_typeof(o->'valeur') is distinct from 'object' then raise exception 'ordres_invalides'; end if;
          o := jsonb_set(o, '{valeur,place}', to_jsonb(ma));
        end if;
      end if;
      if o ? 'set' then e := jsonb_set(e, chemin, coalesce(o->'valeur', 'null'::jsonb), true);
      else e := e #- chemin;
      end if;
    end loop;
    if octet_length(e::text) > 500000 then raise exception 'partie_trop_grande'; end if;
    update public.parties set etat = e, version = version + 1, modifiee_le = now()
      where couple_id = le_couple returning version into v;
  end if;

  return jsonb_build_object('etat', e, 'version', v,
    'maintenant', floor(extract(epoch from clock_timestamp()) * 1000));
end $$;

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
  texte text not null check (char_length(texte) between 1 and 1000),
  ecrite_le timestamptz not null default now(),
  primary key (couple_id, carte, fois, place)
);
alter table public.reponses enable row level security;

-- Où en sont les réponses de cette carte, vu de MON téléphone :
-- {"places": [1, 2], "moi": mon texte ou null, "autre": son texte, seulement si les deux ont répondu,
--  "moi_le" / "autre_le": l'heure de chaque réponse (même règle)}.
create or replace function public.lire_reponses(la_carte text, la_fois text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
  ma smallint := public.ma_place();
  places jsonb;
  mien text;
  sien text;
  mien_le timestamptz;
  sien_le timestamptz;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  select coalesce(jsonb_agg(r.place order by r.place), '[]'::jsonb) into places
    from public.reponses r where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois;
  select r.texte, r.ecrite_le into mien, mien_le from public.reponses r
    where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.place = ma;
  if mien is not null then
    select r.texte, r.ecrite_le into sien, sien_le from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois and r.place <> ma;
  end if;
  -- moi_le / autre_le : l'heure de chaque réponse (affichée au verso de la carte)
  return jsonb_build_object('places', places, 'moi', mien, 'autre', sien,
    'moi_le', mien_le, 'autre_le', case when sien is not null then sien_le end);
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

-- Écrire (ou corriger) ma réponse. Une fois que les deux ont répondu, on ne la change plus.
create or replace function public.repondre(la_carte text, la_fois text, mon_texte text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
  ma smallint := public.ma_place();
  t text := btrim(coalesce(mon_texte, ''));
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  if char_length(t) not between 1 and 1000 or coalesce(char_length(la_carte), 0) not between 1 and 80
     or coalesce(char_length(la_fois), 0) not between 1 and 40 then
    raise exception 'reponse_invalide';
  end if;
  if (select count(*) from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois) >= 2 then
    raise exception 'deja_revele';
  end if;
  insert into public.reponses (couple_id, carte, fois, place, texte) values (le_couple, la_carte, la_fois, ma, t)
    on conflict (couple_id, carte, fois, place) do update set texte = excluded.texte, ecrite_le = now();
  perform public.signaler_reponses(le_couple, la_carte, la_fois);
  return public.lire_reponses(la_carte, la_fois);
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
-- les fois précédentes où elle était sortie (seulement celles où les deux avaient répondu), la plus récente d'abord :
-- [{"date": …, "moi": …, "autre": …}]. Avant d'avoir répondu tous les deux : [] (pour ne pas s'influencer).
create or replace function public.anciennes_reponses(la_carte text, la_fois text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
  ma smallint := public.ma_place();
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  if (select count(*) from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.fois = la_fois) < 2 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('date', f.date, 'moi', f.moi, 'autre', f.autre) order by f.date desc)
    from (
      select max(r.ecrite_le) as date,
             max(r.texte) filter (where r.place = ma) as moi,
             max(r.texte) filter (where r.place <> ma) as autre
      from public.reponses r
      where r.couple_id = le_couple and r.carte = la_carte and r.fois <> la_fois
      group by r.fois
      having count(*) = 2
    ) f
  ), '[]'::jsonb);
end $$;

revoke all on public.reponses from anon, authenticated;
revoke all on function public.signaler_reponses(uuid, text, text) from public, anon, authenticated;
revoke all on function public.lire_reponses(text, text), public.repondre(text, text, text),
  public.effacer_reponses(text, text), public.anciennes_reponses(text, text) from public, anon;
grant execute on function public.lire_reponses(text, text), public.repondre(text, text, text),
  public.effacer_reponses(text, text), public.anciennes_reponses(text, text) to authenticated;

-- ───────────── Étape 7 : notifications ─────────────
-- Chaque téléphone qui active les notifications donne une « adresse d'abonnement » (fournie par son navigateur).
-- La fonction en ligne « notifier » (supabase/functions/notifier) l'utilise pour prévenir l'autre téléphone.
-- Personne ne peut lire ces tables directement : seules les fonctions ci-dessous et « notifier » (côté serveur) y touchent.
create table if not exists public.abonnements (
  user_id uuid primary key references auth.users(id) on delete cascade,   -- un abonnement par téléphone
  couple_id uuid not null references public.couples(id) on delete cascade,
  place smallint not null check (place in (1, 2)),
  endpoint text not null check (char_length(endpoint) between 10 and 1000),
  p256dh text not null check (char_length(p256dh) between 10 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  cree_le timestamptz not null default now()
);
alter table public.abonnements enable row level security;

-- Dernier envoi par type (pour les tirages : heure de la dernière carte tirée, notification envoyée ou non),
-- pour ne pas en envoyer trop : un tirage moins de 30 secondes après le précédent ne prévient pas l'autre
create table if not exists public.notifs_envoyees (
  couple_id uuid not null references public.couples(id) on delete cascade,
  type text not null check (type in ('reponse', 'tirage')),
  le timestamptz not null default now(),
  primary key (couple_id, type)
);
alter table public.notifs_envoyees enable row level security;

-- Activer les notifications sur ce téléphone (ou mettre à jour son adresse)
create or replace function public.s_abonner(adresse text, cle_p256dh text, cle_auth text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  insert into public.abonnements (user_id, couple_id, place, endpoint, p256dh, auth)
    values (auth.uid(), le_couple, public.ma_place(), adresse, cle_p256dh, cle_auth)
    on conflict (user_id) do update set couple_id = excluded.couple_id, place = excluded.place,
      endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth, cree_le = now();
  return true;
end $$;

-- Couper les notifications sur ce téléphone
create or replace function public.se_desabonner() returns boolean
language sql volatile security definer set search_path = '' as $$
  delete from public.abonnements where user_id = auth.uid();
  select true
$$;

revoke all on public.abonnements, public.notifs_envoyees from anon, authenticated;
revoke all on function public.s_abonner(text, text, text), public.se_desabonner() from public, anon;
grant execute on function public.s_abonner(text, text, text), public.se_desabonner() to authenticated;

-- Temps réel : Supabase prévient les téléphones dès qu'une partie change (seulement ceux qui ont le droit de la voir).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'parties') then
    alter publication supabase_realtime add table public.parties;
  end if;
end $$;

-- ───────────── Qui peut lire quoi ─────────────
-- Le projet n'ouvre rien automatiquement (« Automatically expose new tables » décoché) : on ouvre à la main
-- la lecture seule aux téléphones connectés. Les règles RLS plus haut choisissent ensuite les lignes visibles.
-- Aucune permission d'écrire : double verrou avec les règles RLS.

revoke all on public.couples, public.membres, public.codes_relier, public.essais_codes, public.parties from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.couples, public.membres, public.codes_relier, public.parties to authenticated;

-- ───────────── Qui peut appeler quoi ─────────────
-- Les visiteurs non connectés (rôle « anon ») ne peuvent rien appeler.
-- Les outils internes ne sont appelables par personne de l'extérieur.

revoke all on function public.initiale(text), public.prenom_propre(text), public.code_propre(text),
  public.nouveau_code(text, text), public.trop_d_essais(), public.etat_vide(), public.ma_place()
  from public, anon, authenticated;

revoke all on function public.mon_couple_id(), public.creer_couple(text, text), public.apercu_code(text),
  public.utiliser_code(text, text), public.code_relier(), public.jouer(jsonb)
  from public, anon;
grant execute on function public.mon_couple_id(), public.creer_couple(text, text), public.apercu_code(text),
  public.utiliser_code(text, text), public.code_relier(), public.jouer(jsonb)
  to authenticated;

-- ───────────── Réveil ─────────────
-- Appelée tous les 3 jours par GitHub Actions (.github/workflows/garder-supabase-eveille.yml) avec la clé publique,
-- pour que le projet gratuit ne se mette pas en pause. Elle fait une vraie petite lecture (compter les couples)
-- pour que Supabase voie une activité de la base, mais ne renvoie que « true » : aucune donnée ne sort.
-- « security definer » : elle peut compter malgré les règles RLS, sans rien montrer.
create or replace function public.reveil() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.couples) >= 0
$$;
revoke all on function public.reveil() from public;
grant execute on function public.reveil() to anon, authenticated;
